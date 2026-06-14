// Durable, Map-compatible store backed by Cloud SQL (Postgres).
//
// Cloud Run instances are ephemeral and may be replaced/scaled, so the original
// in-memory Maps (userVPAs, transactions, paymentLinks) lose data on every
// deploy/restart. PersistentMap keeps the same synchronous Map API the rest of
// server/index.js uses, but hydrates from Postgres on startup and writes through
// on every set/delete. Run the node server with --max-instances=1 so the
// write-through cache stays authoritative (see gcp/scripts/12-deploy-node-server.sh).
//
// If DATABASE_URL is not set (e.g. local dev), it falls back to a pure in-memory
// Map so nothing breaks.

const { Pool } = (() => {
  try { return require('pg'); } catch { return {}; }
})();

const DATABASE_URL = process.env.DATABASE_URL || '';
let pool = null;
if (DATABASE_URL && Pool) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    // Cloud SQL private IP over the VPC connector; no TLS needed in-VPC.
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  });
}

class PersistentMap {
  constructor(namespace) {
    this.namespace = namespace;
    this.cache = new Map();
    this.durable = !!pool;
  }

  async init() {
    if (!this.durable) {
      console.log(`[store] ${this.namespace}: in-memory only (no DATABASE_URL)`);
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS server_kv (
        namespace text NOT NULL,
        key       text NOT NULL,
        value     jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (namespace, key)
      )
    `);
    const { rows } = await pool.query(
      'SELECT key, value FROM server_kv WHERE namespace = $1', [this.namespace]);
    for (const r of rows) this.cache.set(r.key, r.value);
    console.log(`[store] ${this.namespace}: loaded ${rows.length} rows from Cloud SQL`);
  }

  get(key) { return this.cache.get(key); }
  has(key) { return this.cache.has(key); }
  values() { return this.cache.values(); }
  keys()   { return this.cache.keys(); }
  get size() { return this.cache.size; }

  set(key, value) {
    this.cache.set(key, value);
    if (this.durable) {
      pool.query(
        `INSERT INTO server_kv (namespace, key, value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (namespace, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [this.namespace, key, value]
      ).catch((e) => console.error(`[store] ${this.namespace} set ${key} failed:`, e.message));
    }
    return this;
  }

  delete(key) {
    const existed = this.cache.delete(key);
    if (this.durable) {
      pool.query('DELETE FROM server_kv WHERE namespace = $1 AND key = $2',
        [this.namespace, key])
        .catch((e) => console.error(`[store] ${this.namespace} delete ${key} failed:`, e.message));
    }
    return existed;
  }
}

async function initStores(maps) {
  await Promise.all(maps.map((m) => (m.init ? m.init() : Promise.resolve())));
}

module.exports = { PersistentMap, initStores };
