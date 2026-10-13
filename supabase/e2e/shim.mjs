// Finto Supabase per le prove: parla come GoTrue (accesso) e PostgREST (funzioni rpc), ma sopra un PostgreSQL locale.
// Serve solo a verificare che l'app (src/lib/remote.ts) e lo schema SQL si capiscano. Non è per la produzione.
//
// Variabili: SHIM_PORT, PGHOST, PGPORT, PGUSER, PGDATABASE. Ogni richiesta è eseguita con psql.
// Rotte di prova (non esistono su Supabase): POST /__confirm {email}, POST /__expire, POST /__sql {sql} -> righe.
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SHIM_PORT ?? 54330);
const PG = ['-h', process.env.PGHOST ?? '127.0.0.1', '-p', process.env.PGPORT ?? '54329', '-U', process.env.PGUSER ?? 'postgres', '-d', process.env.PGDATABASE ?? 'kuko'];
const CONFIRM = process.env.SHIM_CONFIRM !== '0'; // come Supabase con "Confirm email" attivo

const passwords = new Map(); // email -> password
let seq = 0;
let epoch = 0; // /__expire alza il numero: i token di prima non valgono più

/** Esegue SQL con psql. Restituisce { out, err } (err = messaggio d'errore di PostgreSQL, se c'è). */
function psql(sql) {
  return new Promise((resolve) => {
    const p = spawn('psql', [...PG, '-At', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse', '-f', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ out: out.trim(), err: code === 0 ? '' : (err.match(/ERROR:\s+(.*)/)?.[1] ?? err).trim() }));
    p.stdin.end(sql);
  });
}
const lit = (v) => `$kuko$${v}$kuko$`;

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => { try { r(s ? JSON.parse(s) : {}); } catch { r({}); } }); });

const session = (uid) => ({
  access_token: `shim.${epoch}.${uid}.${++seq}`, refresh_token: `refresh.${uid}.${++seq}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
});
const uidOf = (bearer) => {
  const m = /^shim\.(\d+)\.([0-9a-f-]{36})\./.exec(bearer ?? '');
  return m && Number(m[1]) === epoch ? m[2] : null;
};

async function auth(req, res, path, query, body) {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (path === '/auth/v1/signup') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email || String(body.password ?? '').length < 6) return send(res, 422, { error_code: 'weak_password', msg: 'Password too short' });
    if (passwords.has(email)) return send(res, 422, { error_code: 'user_already_exists', msg: 'User already registered' });
    const meta = JSON.stringify(body.data ?? {});
    const r = await psql(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values (${lit(email)}, ${lit(meta)}::jsonb, ${CONFIRM ? 'null' : 'now()'}) returning id;`);
    if (r.err) return send(res, 500, { msg: r.err });
    passwords.set(email, String(body.password));
    return send(res, 200, CONFIRM ? { id: r.out, email, confirmation_sent_at: new Date().toISOString() } : { ...session(r.out), user: { id: r.out, email } });
  }
  if (path === '/auth/v1/token' && query.get('grant_type') === 'password') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!passwords.has(email) || passwords.get(email) !== body.password) return send(res, 400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    const r = await psql(`select id, email_confirmed_at is not null from auth.users where email = ${lit(email)};`);
    const [id, ok] = r.out.split('|');
    if (ok !== 't') return send(res, 400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
    return send(res, 200, { ...session(id), user: { id, email } });
  }
  if (path === '/auth/v1/token' && query.get('grant_type') === 'refresh_token') {
    const m = /^refresh\.([0-9a-f-]{36})\./.exec(body.refresh_token ?? '');
    if (!m) return send(res, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    return send(res, 200, session(m[1]));
  }
  if (path === '/auth/v1/user' && req.method === 'PUT') {
    const uid = uidOf(bearer);
    if (!uid) return send(res, 401, { msg: 'invalid JWT' });
    if (String(body.password ?? '').length < 6) return send(res, 422, { error_code: 'weak_password', msg: 'Password too short' });
    const r = await psql(`select email from auth.users where id = '${uid}';`);
    passwords.set(r.out, String(body.password));
    return send(res, 200, { id: uid });
  }
  if (path === '/auth/v1/recover') return send(res, 200, {});
  if (path === '/auth/v1/logout') return send(res, 204);
  return send(res, 404, { msg: 'not found' });
}

async function rpc(req, res, fn, body) {
  if (!/^[a-z_]+$/.test(fn)) return send(res, 404, { message: 'not found' });
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const uid = uidOf(bearer);
  const role = bearer === 'anon-key' ? 'anon' : uid ? 'authenticated' : null;
  if (!role) return send(res, 401, { code: 'PGRST301', message: 'JWT expired' });
  const args = Object.entries(body ?? {}).map(([k, v]) => {
    if (!/^[a-z_]+$/.test(k)) throw new Error('bad arg');
    return `${k} => ${v === null || v === undefined ? 'null' : lit(typeof v === 'object' ? JSON.stringify(v) : String(v))}`;
  });
  const r = await psql(`set test.uid = '${uid ?? ''}'; set role ${role}; select public.${fn}(${args.join(', ')});`);
  if (r.err) {
    const denied = /^permission denied|^function .* does not exist/.test(r.err);
    return send(res, denied ? 403 : 400, { code: denied ? '42501' : 'P0001', details: null, hint: null, message: r.err });
  }
  if (!r.out) return send(res, 204);
  try { return send(res, 200, JSON.parse(r.out)); } catch { return send(res, 200, r.out); }
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
    const url = new URL(req.url, 'http://x');
    const body = req.method === 'GET' ? {} : await readBody(req);
    if (url.pathname === '/__expire') { epoch += 1; return send(res, 200, { epoch }); }
    if (url.pathname === '/__confirm') { await psql(`update auth.users set email_confirmed_at = now() where email = ${lit(String(body.email).toLowerCase())};`); return send(res, 200, {}); }
    if (url.pathname === '/__sql') { const r = await psql(String(body.sql)); return send(res, r.err ? 400 : 200, r.err ? { message: r.err } : { out: r.out }); }
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url.pathname, url.searchParams, body);
    const m = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
    if (m) return await rpc(req, res, m[1], body);
    return send(res, 404, { message: 'not found' });
  } catch (e) {
    return send(res, 500, { message: String(e) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`finto Supabase su http://127.0.0.1:${PORT}`));
