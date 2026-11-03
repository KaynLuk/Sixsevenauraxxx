// Testa a função empacotada (a que vai para o Netlify) com um armazenamento em memória.
import { build } from 'esbuild';
await import('../build.mjs');

const mem = new Map(); let ver = 0;
globalThis.__RPG_STORE__ = {
  async getWithMetadata(k, o) { const r = mem.get(k); if (!r) return null; return { data: o?.type === 'json' ? JSON.parse(r.v) : r.v, etag: r.etag, metadata: r.meta }; },
  async setJSON(k, d, o = {}) { const r = mem.get(k); if (o.onlyIfNew && r) return { modified: false }; if (o.onlyIfMatch && (!r || r.etag !== o.onlyIfMatch)) return { modified: false }; const etag = 'e' + ++ver; mem.set(k, { v: JSON.stringify(d), etag }); return { modified: true, etag }; },
  async set(k, v, o = {}) { mem.set(k, { v: new Uint8Array(v).buffer, etag: 'e' + ++ver, meta: o.metadata }); return { modified: true }; },
  async delete(k) { mem.delete(k); },
};
process.env.LOGIN_MAX = '6';
const { default: h } = await import('../netlify/functions/api.mjs?x=' + Date.now());

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
let ok = 0, falhas = 0;
const t = (n, c, x = '') => { c ? ok++ : falhas++; console.log(`${c ? '  ✔' : '  ✘ FALHOU'} ${n}${c ? '' : ' ' + x}`); };
class Cli {
  constructor(ip = '1.1.1.1', via = false) { this.ck = ''; this.ip = ip; this.via = via; }
  async req(m, p, body, form) {
    const [path, qs] = p.split('?');
    // simula o redirect do netlify.toml (/api/x → função?r=x) em metade dos clientes
    const url = this.via ? `https://s.app/.netlify/functions/api?r=${path.replace(/^\/api\//, '').replace(/^\//, '')}${qs ? '&' + qs : ''}` : `https://s.app${p}`;
    const r = await h(new Request(url, { method: m, headers: { cookie: this.ck, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: form || (body !== undefined ? JSON.stringify(body) : undefined) }), { ip: this.ip });
    const sc = r.headers.get('set-cookie'); if (sc) this.ck = sc.split(';')[0];
    return { s: r.status, d: await r.clone().json().catch(() => null), r };
  }
}
const foto = (buf, tipo = 'image/png') => { const f = new FormData(); f.append('foto', new Blob([buf], { type: tipo }), 'a.png'); return f; };

const M = new Cli('2.2.2.2'), A = new Cli('3.3.3.3', true), B = new Cli('4.4.4.4');
console.log('\nPrimeiro acesso e login');
t('antes de configurar: status mostra mestre não configurado', (await M.req('GET', '/api/status')).d.mestre_configurado === false);
t('rota protegida sem login → 401', (await new Cli().req('GET', '/api/characters')).s === 401);
t('senha curta no primeiro acesso → 400', (await M.req('POST', '/api/login/mestre', { senha: '123' })).s === 400);
t('mestre define a senha e entra', (await M.req('POST', '/api/login/mestre', { senha: 'segredo-mestre' })).s === 200);
t('senha errada do mestre → 401', (await new Cli('9.9.9.9').req('POST', '/api/login/mestre', { senha: 'outra' })).s === 401);
const lista = (await new Cli().req('GET', '/api/public/characters')).d;
t('lista pública com 2 personagens do seed, sem dados sensíveis', lista.length === 2 && !('senha_hash' in lista[0]) && !('vida_atual' in lista[0]));
const ele = lista.find((c) => c.nome === 'Eleanor Voss'), tob = lista.find((c) => c.nome === 'Tobias Crane');
t('jogador senha errada → 401', (await A.req('POST', '/api/login/jogador', { id: ele.id, senha: 'x' })).s === 401);
t('Eleanor entra (via redirect ?r=)', (await A.req('POST', '/api/login/jogador', { id: ele.id, senha: 'eleanor123' })).s === 200);
t('Tobias entra', (await B.req('POST', '/api/login/jogador', { id: tob.id, senha: 'tobias123' })).s === 200);

console.log('\nDano, sync e permissões');
const base = (await A.req('GET', '/api/sync')).d;
t('primeiro sync devolve linha de base sem eventos', base.eventos.length === 0 && base.chars.length === 2);
const r1 = await M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 5, descricao: 'Garra da criatura no ombro' });
t('mestre aplica 5 de dano (18 → 13)', r1.s === 200 && r1.d.personagem.vida_atual === 13 && r1.d.evento.antes === 18 && r1.d.evento.autor === 'mestre');
const sA = (await A.req('GET', `/api/sync?ev=${base.lastEv}`)).d, sB = (await B.req('GET', `/api/sync?ev=${base.lastEv}`)).d, sM = (await M.req('GET', `/api/sync?ev=${base.lastEv}`)).d;
t('dono recebe o evento com valor e descrição no sync', sA.eventos.length === 1 && sA.eventos[0].delta === -5 && sA.eventos[0].descricao === 'Garra da criatura no ombro');
t('outro jogador NÃO recebe o evento alheio, mas vê o novo estado', sB.eventos.length === 0 && sB.chars.find((c) => c.id === ele.id).vida_atual === 13);
t('mestre recebe o evento no feed', sM.eventos.length === 1 && sM.eventos[0].nome === 'Eleanor Voss');
const r2 = await A.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'sanidade', tipo: 'dano', valor: 18, descricao: 'Viu algo impossível' });
t('jogador reduz a própria sanidade (autor=jogador) → ABALADO', r2.s === 200 && r2.d.evento.autor === 'jogador' && r2.d.personagem.estados.includes('abalado'));
t('dano gigante para em 0 → CAÍDO', (await M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 999 })).d.personagem.estados.includes('caido'));
t('dano em quem está com 0 → 400', (await M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 1 })).s === 400);
t('cura não passa do máximo', (await M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'cura', valor: 500 })).d.personagem.vida_atual === 24);
t('valor inválido → 400', (await M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 'abc' })).s === 400);
t('histórico do jogador tem 4 registros', (await A.req('GET', `/api/characters/${ele.id}/historico`)).d.length === 4);
const alheio = `/api/characters/${tob.id}`;
for (const [nome, m, p, b, f] of [
  ['jogador altera vida de OUTRO', 'POST', `${alheio}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 1 }],
  ['jogador troca foto de OUTRO', 'POST', `${alheio}/foto`, undefined, foto(PNG)],
  ['jogador lê histórico de OUTRO', 'GET', `${alheio}/historico`],
  ['jogador edita máximos de OUTRO', 'PATCH', alheio, { vida_max: 999 }],
  ['jogador edita os PRÓPRIOS máximos', 'PATCH', `/api/characters/${ele.id}`, { vida_max: 999 }],
  ['jogador exclui personagem', 'DELETE', alheio],
  ['jogador redefine senha', 'POST', `${alheio}/senha`, { senha: 'hackeado' }],
  ['jogador cria personagem', 'POST', '/api/characters', { nome: 'X', senha: 'abcd', vida_max: 1, sanidade_max: 1 }],
  ['jogador muda configuração', 'PUT', '/api/config', { jogadores_veem_outros: false }],
  ['jogador lê feed global', 'GET', '/api/eventos'],
]) t(`${nome} → 403`, (await A.req(m, p, b, f)).s === 403);
t('Tobias intacto (30/30)', (await M.req('GET', '/api/characters')).d.find((c) => c.id === tob.id).vida_atual === 30);
t('cookie adulterado → 401', (await (() => { const x = new Cli(); x.ck = A.ck.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')); return x.req('GET', '/api/characters'); })()).s === 401);

console.log('\nFotos');
const f1 = await A.req('POST', `/api/characters/${ele.id}/foto`, undefined, foto(PNG));
t('jogador troca a PRÓPRIA foto', f1.s === 200 && /^\/uploads\/[0-9a-f]{32}\.png$/.test(f1.d.foto_url));
const get = await new Cli().req('GET', f1.d.foto_url);
t('foto servida em /uploads com tipo correto', get.s === 200 && get.r.headers.get('content-type') === 'image/png');
t('mestre troca foto de OUTRO', (await M.req('POST', `${alheio}/foto`, undefined, foto(PNG))).s === 200);
t('arquivo não-imagem → 415', (await M.req('POST', `${alheio}/foto`, undefined, foto(Buffer.from('<script>alert(1)</script>')))).s === 415);
t('imagem > 5 MB → 413', (await M.req('POST', `${alheio}/foto`, undefined, foto(Buffer.concat([PNG, Buffer.alloc(5.5 * 1024 * 1024)])))).s === 413);
await A.req('POST', `/api/characters/${ele.id}/foto`, undefined, foto(PNG));
t('foto antiga apagada', (await new Cli().req('GET', f1.d.foto_url)).s === 404);

console.log('\nMestre');
const up = await M.req('PATCH', alheio, { vida_max: 40, sanidade_max: 20, curar_junto: true });
t('subir máximo COM "curar junto" (30→40, 9→13)', up.d.vida_atual === 40 && up.d.sanidade_atual === 13);
t('subir SEM curar junto mantém o atual', (await M.req('PATCH', alheio, { vida_max: 50 })).d.vida_atual === 40);
t('baixar máximo limita o atual', (await M.req('PATCH', alheio, { vida_max: 10 })).d.vida_atual === 10);
await M.req('PUT', '/api/config', { jogadores_veem_outros: false });
const so = (await A.req('GET', '/api/sync')).d;
t('config desligada: jogador vê SÓ o próprio personagem', so.chars.length === 1 && so.chars[0].id === ele.id && so.config.jogadores_veem_outros === false);
await M.req('PUT', '/api/config', { jogadores_veem_outros: true });
t('mestre cria personagem', (await M.req('POST', '/api/characters', { nome: 'Nova Pessoa', senha: 'abcd1', vida_max: 12, sanidade_max: 12, vida_atual: 6 })).d.vida_atual === 6);
t('nome duplicado → 409', (await M.req('POST', '/api/characters', { nome: 'nova pessoa', senha: 'abcd1', vida_max: 1, sanidade_max: 1 })).s === 409);
t('mestre redefine senha de Tobias', (await M.req('POST', `${alheio}/senha`, { senha: 'novasenha' })).s === 200);
t('sessão antiga de Tobias invalidada', (await B.req('GET', '/api/characters')).s === 401);
t('mestre exclui personagem', (await M.req('DELETE', alheio)).s === 200 && (await M.req('GET', '/api/characters')).d.every((c) => c.id !== tob.id));

console.log('\nConcorrência e limite de tentativas');
const R = await Promise.all(Array.from({ length: 6 }, () => M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 1, descricao: 'simultâneo' })));
t('6 danos simultâneos: nenhum se perde', R.every((x) => x.s === 200) && (await M.req('GET', '/api/characters')).d.find((c) => c.id === ele.id).vida_atual === 18);
let cod = 0; const X = new Cli('8.8.8.8');
for (let i = 0; i < 10 && cod !== 429; i++) cod = (await X.req('POST', '/api/login/mestre', { senha: 'errada' + i })).s;
t('tentativas erradas repetidas → 429', cod === 429);
t('outro IP não é afetado', (await new Cli('7.7.7.7').req('POST', '/api/login/mestre', { senha: 'segredo-mestre' })).s === 200);

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
