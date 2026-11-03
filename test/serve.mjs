// Servidor local de desenvolvimento: arquivos de public/ + a função da API com armazenamento em memória.
// Uso: node test/serve.mjs [porta]   (os dados somem ao fechar)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = new Map(); let ver = 0;
globalThis.__RPG_STORE__ = {
  async getWithMetadata(k, o) { const r = mem.get(k); return r ? { data: o?.type === 'json' ? JSON.parse(r.v) : r.v, etag: r.etag, metadata: r.meta } : null; },
  async setJSON(k, d, o = {}) { const r = mem.get(k); if ((o.onlyIfNew && r) || (o.onlyIfMatch && (!r || r.etag !== o.onlyIfMatch))) return { modified: false }; mem.set(k, { v: JSON.stringify(d), etag: 'e' + ++ver }); return { modified: true }; },
  async set(k, v, o = {}) { mem.set(k, { v: new Uint8Array(v).buffer, etag: 'e' + ++ver, meta: o.metadata }); return { modified: true }; },
  async delete(k) { mem.delete(k); },
};
const { default: api } = await import('../netlify/functions/api.mjs');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/uploads/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
    const r = await api(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body }), { ip: '127.0.0.1' });
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const f = path.join(raiz, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(path.join(raiz, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(Number(process.argv[2]) || 8899, () => console.log('http://localhost:' + (process.argv[2] || 8899)));
