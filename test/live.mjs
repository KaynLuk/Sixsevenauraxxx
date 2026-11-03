// Teste contra o Netlify Dev (emulação real: redirects + Blobs). Uso: node test/live.mjs http://localhost:8888
const B = process.argv[2] || 'http://localhost:8888';
let ck = '';
const call = async (m, p, body, form) => {
  const r = await fetch(B + p, { method: m, headers: { cookie: ck, ...(body ? { 'content-type': 'application/json' } : {}) }, body: form || (body ? JSON.stringify(body) : undefined) });
  const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0];
  return { s: r.status, d: await r.clone().json().catch(() => null), r };
};
const ok = (n, c, x) => console.log(`${c ? '  ✔' : '  ✘ FALHOU'} ${n}${c ? '' : ' ' + JSON.stringify(x)}`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
let r = await call('GET', '/api/status'); ok('GET /api/status via redirect', r.s === 200, r);
r = await call('POST', '/api/login/mestre', { senha: 'segredo-mestre' }); ok('mestre entra / define senha', r.s === 200, r);
r = await call('GET', '/api/characters'); ok('lista personagens', r.s === 200 && r.d.length >= 2, r);
const id = r.d[0].id, vida = r.d[0].vida_atual;
r = await call('POST', `/api/characters/${id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 1, descricao: 'teste ao vivo' }); ok('dano com descrição', r.s === 200 && r.d.personagem.vida_atual === vida - 1, r);
r = await call('GET', '/api/sync?ev=0'); ok('sync com query string (?ev=)', r.s === 200 && r.d.eventos.length >= 1, r);
const f = new FormData(); f.append('foto', new Blob([PNG], { type: 'image/png' }), 'a.png');
r = await call('POST', `/api/characters/${id}/foto`, undefined, f); ok('upload de foto (Blobs)', r.s === 200 && /^\/uploads\//.test(r.d?.foto_url), r);
const img = await fetch(B + r.d.foto_url); ok('foto servida em /uploads', img.status === 200 && img.headers.get('content-type') === 'image/png', img.status);
const h = await Promise.all([1, 2, 3, 4].map(() => call('POST', `/api/characters/${id}/ajuste`, { atributo: 'vida', tipo: 'cura', valor: 1, descricao: 'simultâneo' })));
console.log('  simultâneos:', h.map((x) => x.s).join(','));
