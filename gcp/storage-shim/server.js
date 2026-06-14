// Minimal Supabase-Storage-compatible shim backed by Google Cloud Storage.
// Implements only the operations the app uses (see ManualJournals.tsx):
//   POST /storage/v1/object/:bucket/*path        -> upload (supabase .upload())
//   GET  /storage/v1/object/public/:bucket/*path -> serve object (.getPublicUrl target)
//   GET  /storage/v1/object/:bucket/*path        -> serve object (authenticated read)
// The GCS bucket stays private; objects are streamed through this service.
import express from 'express';
import { Storage } from '@google-cloud/storage';

const PORT = process.env.PORT || 8080;
const BUCKET = process.env.GCS_BUCKET;
if (!BUCKET) { console.error('GCS_BUCKET env required'); process.exit(1); }

const storage = new Storage();             // uses Cloud Run service account
const bucket = storage.bucket(BUCKET);
const app = express();

// CORS (browser reaches this cross-origin through the gateway).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-upsert,cache-control');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Capture raw bytes for uploads (any content type).
app.use(express.raw({ type: '*/*', limit: '50mb' }));

const objectPath = (req) => `${req.params.bucket}/${req.params[0]}`;

// Upload — mirrors supabase-js storage.upload()
app.post('/storage/v1/object/:bucket/*', async (req, res) => {
  try {
    const key = objectPath(req);
    const upsert = String(req.header('x-upsert') || 'false') === 'true';
    const file = bucket.file(key);
    if (!upsert) {
      const [exists] = await file.exists();
      if (exists) return res.status(409).json({ error: 'Duplicate', message: 'The resource already exists' });
    }
    await file.save(req.body, {
      contentType: req.header('content-type') || 'application/octet-stream',
      resumable: false,
    });
    return res.status(200).json({ Key: key, Id: key });
  } catch (e) {
    console.error('upload error', e);
    return res.status(500).json({ error: 'upload_failed', message: String(e?.message || e) });
  }
});

const serve = async (req, res) => {
  try {
    const key = objectPath(req);
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ error: 'not_found' });
    const [meta] = await file.getMetadata();
    if (meta.contentType) res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    file.createReadStream()
      .on('error', (e) => { console.error('stream error', e); res.status(500).end(); })
      .pipe(res);
  } catch (e) {
    console.error('serve error', e);
    return res.status(500).json({ error: 'serve_failed' });
  }
};
app.get('/storage/v1/object/public/:bucket/*', serve);
app.get('/storage/v1/object/:bucket/*', serve);

app.get('/', (_req, res) => res.status(200).send('storage shim ok'));
app.listen(PORT, '0.0.0.0', () => console.log(`[storage-shim] on 0.0.0.0:${PORT} bucket=${BUCKET}`));
