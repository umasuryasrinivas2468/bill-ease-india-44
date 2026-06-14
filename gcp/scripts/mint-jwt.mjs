#!/usr/bin/env node
// Mint Supabase-compatible HS256 JWTs (service_role / anon) using the shared
// PGRST_JWT_SECRET. These replace Supabase's service-role and anon API keys.
//
// Usage:
//   PGRST_JWT_SECRET=... node mint-jwt.mjs service_role
//   PGRST_JWT_SECRET=... node mint-jwt.mjs anon
//
// Prints the token to stdout. Zero dependencies (uses node:crypto).
import crypto from 'node:crypto';

const role = process.argv[2];
if (!['service_role', 'anon', 'authenticated'].includes(role)) {
  console.error('Usage: mint-jwt.mjs <service_role|anon|authenticated> [sub]');
  process.exit(1);
}
const secret = process.env.PGRST_JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error('PGRST_JWT_SECRET must be set and >= 32 chars.');
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  role,
  iss: 'aczen-gcp',
  iat: now,
  // 10 years - these are long-lived backend keys kept in Secret Manager only.
  exp: now + 60 * 60 * 24 * 365 * 10,
};
if (process.argv[3]) payload.sub = process.argv[3];

const head = b64url(JSON.stringify(header));
const body = b64url(JSON.stringify(payload));
const sig = b64url(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
process.stdout.write(`${head}.${body}.${sig}\n`);
