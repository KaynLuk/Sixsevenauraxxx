// API do Grimório da Mesa como Netlify Function (v2). Dados no Netlify Blobs; sem servidor, sem SQLite.
// Os mesmos controles de permissão da versão Node: validados aqui, no servidor.
import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { HttpError, erro, int, txt, pub, comNome, aplicarAjuste } from './nucleo.mjs';
import { garantir, rotasMesa, dadosMestre, dadosJogador, limparChar } from './mesa.mjs';

const DUMMY = bcrypt.hashSync('x', 10);
// Senha do mestre (hash bcrypt). Para trocar, defina a variável SENHA_MESTRE no Netlify.
const MESTRE_HASH = '$2a$10$LnSvZ6UZU3QVxb3BENuUlOYJRXeZ.5Rzib2LGrdkDpABfjrE6Yf8C';
const KEY = 'banco';
const SESSAO_MS = 12 * 3600 * 1000;
const LOGIN_MAX = () => Number(process.env.LOGIN_MAX) || 10;
const store = () => globalThis.__RPG_STORE__ || getStore({ name: 'grimorio', consistency: 'strong' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- banco (um documento JSON com controle de concorrência por etag) ----------
function novoDb() {
  const mk = (id, nome, senha, va, vm, sa, sm) => ({ id, nome, senha_hash: bcrypt.hashSync(senha, 10), foto_url: null, vida_atual: va, vida_max: vm, sanidade_atual: sa, sanidade_max: sm, criado_em: new Date().toISOString() });
  return {
    segredo: crypto.randomBytes(32).toString('hex'), mestre_hash: null, config: { jogadores_veem_outros: true },
    seq: { c: 2, h: 0 }, rl: {}, hist: [],
    chars: [mk(1, 'Eleanor Voss', 'eleanor123', 18, 24, 20, 20), mk(2, 'Tobias Crane', 'tobias123', 30, 30, 9, 16)],
  };
}
async function load() {
  const s = store();
  let r = await s.getWithMetadata(KEY, { type: 'json' });
  if (!r) { await s.setJSON(KEY, novoDb(), { onlyIfNew: true }); r = await s.getWithMetadata(KEY, { type: 'json' }); }
  garantir(r.data); // bancos antigos ganham os campos das ferramentas do mestre
  return r;
}
async function mutate(fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await load();
    const res = fn(data); // pode lançar HttpError: nada é gravado
    data.rev = (data.rev || 0) + 1; // os clientes só baixam os dados grandes quando a revisão muda
    const w = await store().setJSON(KEY, data, { onlyIfMatch: etag });
    if (w.modified) return res;
    await sleep(30 + Math.random() * 70);
  }
  return erro(503, 'Muita gente ao mesmo tempo. Tente de novo.');
}

// ---------- sessão ----------
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const hmac = (db, b) => crypto.createHmac('sha256', db.segredo).update(b).digest('base64url');
const sign = (db, p) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + hmac(db, b); };
function verify(db, tok) {
  if (!tok) return null;
  const [b, s] = tok.split('.');
  if (!b || !s || !eq(s, hmac(db, b))) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    if (p.r === 'jogador') { const c = db.chars.find((x) => x.id === p.c); if (!c || c.senha_hash.slice(-10) !== p.v) return null; }
    return p;
  } catch { return null; }
}
const cookies = (h = '') => Object.fromEntries(h.split(';').map((s) => s.trim().split(/=(.*)/s).slice(0, 2)).filter((x) => x[0]));

// ---------- domínio ----------
const ordem = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const senhaOk = (s) => typeof s === 'string' && s.length >= 4 && s.length <= 72;
const visiveis = (db, u) => (u.r === 'mestre' ? db.chars : db.chars.filter((c) => c.id === u.c || db.config.jogadores_veem_outros)).slice().sort(ordem).map(pub);
const json = (status, obj, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function tipoReal(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
const apagaFoto = (url) => (url && url.startsWith('/uploads/') ? store().delete('foto/' + url.slice(9)).catch(() => {}) : null);

async function corpo(req) { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } }

// ---------- rotas ----------
export default async function handler(req, context = {}) {
  try { return await rotear(req, context); } catch (e) {
    if (e instanceof HttpError) return json(e.status, { erro: e.message });
    console.error(e); return json(500, { erro: 'Erro interno.' });
  }
}

async function rotear(req, context) {
  const url = new URL(req.url), m = req.method;
  let path = url.searchParams.get('r');
  if (path === null) path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '');
  const seg = path.replace(/^\/?(api\/)?/, '').split('/').filter(Boolean);
  const [a, b, c] = seg;
  const https = url.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  const setCookie = (tok, ate = SESSAO_MS) => `sess=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(ate / 1000)}${https ? '; Secure' : ''}`;
  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'x';

  const { data: db } = await load();

  if (a === 'uploads' && m === 'GET') {
    const r = await store().getWithMetadata('foto/' + b, { type: 'arrayBuffer' });
    if (!r) return new Response('Não encontrado', { status: 404 });
    return new Response(r.data, { headers: { 'content-type': r.metadata?.tipo || 'image/png', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  }
  if (a === 'status') return json(200, { mestre_configurado: !!(process.env.SENHA_MESTRE || MESTRE_HASH) });
  if (a === 'public' && b === 'characters') return json(200, db.chars.slice().sort(ordem).map(({ id, nome, foto_url }) => ({ id, nome, foto_url })));

  // ----- login -----
  if (a === 'login' && m === 'POST') {
    const lim = db.rl[ip];
    if (lim && lim.ate > Date.now() && lim.n >= LOGIN_MAX()) return json(429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    const body = await corpo(req);
    const falha = async (msg) => {
      await mutate((d) => {
        const now = Date.now();
        for (const k of Object.keys(d.rl)) if (d.rl[k].ate < now) delete d.rl[k];
        const r = d.rl[ip] && d.rl[ip].ate >= now ? d.rl[ip] : { n: 0, ate: now + 15 * 60 * 1000 };
        r.n++; d.rl[ip] = r;
      });
      return json(401, { erro: msg });
    };
    if (b === 'mestre') {
      const senha = typeof body.senha === 'string' ? body.senha.slice(0, 100) : '';
      let ok = false;
      if (process.env.SENHA_MESTRE) ok = eq(senha, process.env.SENHA_MESTRE);
      else ok = bcrypt.compareSync(senha, MESTRE_HASH);
      if (!ok) return falha('Senha do mestre incorreta.');
      return json(200, { ok: true, papel: 'mestre' }, { 'set-cookie': setCookie(sign(db, { r: 'mestre', exp: Date.now() + SESSAO_MS })) });
    }
    if (b === 'jogador') {
      const ch = db.chars.find((x) => x.id === int(body.id, 1, 1e9));
      const ok = bcrypt.compareSync(typeof body.senha === 'string' ? body.senha.slice(0, 72) : '', ch ? ch.senha_hash : DUMMY);
      if (!ch || !ok) return falha('Senha incorreta.');
      return json(200, { ok: true, papel: 'jogador', id: ch.id }, { 'set-cookie': setCookie(sign(db, { r: 'jogador', c: ch.id, v: ch.senha_hash.slice(-10), exp: Date.now() + SESSAO_MS })) });
    }
  }
  if (a === 'logout' && m === 'POST') return json(200, { ok: true }, { 'set-cookie': setCookie('', 0) });

  // ----- tudo daqui para baixo exige sessão -----
  const u = verify(db, cookies(req.headers.get('cookie') || '').sess);
  if (!u) return json(401, { erro: 'Faça login para continuar.' });
  const soMestre = () => (u.r === 'mestre' ? null : erro(403, 'Apenas o mestre pode fazer isso.'));
  // mestre: qualquer personagem; jogador: somente o próprio
  const alvo = () => {
    const id = Number(b);
    if (!Number.isInteger(id)) erro(400, 'ID inválido.');
    if (u.r !== 'mestre' && u.c !== id) erro(403, 'Você só pode alterar o seu próprio personagem.');
    if (!db.chars.some((x) => x.id === id)) erro(404, 'Personagem não encontrado.');
    return id;
  };

  if (a === 'me' && m === 'GET') return json(200, { papel: u.r, id: u.c || null, config: db.config });
  if (a === 'config') {
    if (m === 'GET') return json(200, db.config);
    if (m === 'PUT') {
      soMestre(); const body = await corpo(req);
      if (typeof body.jogadores_veem_outros !== 'boolean') erro(400, 'Valor inválido.');
      await mutate((d) => { d.config.jogadores_veem_outros = body.jogadores_veem_outros; });
      return json(200, { jogadores_veem_outros: body.jogadores_veem_outros });
    }
  }
  // consulta periódica (substitui o tempo real): estado atual + eventos novos desde "ev"
  if (a === 'sync' && m === 'GET') {
    const ev = url.searchParams.get('ev'), rev = Number(url.searchParams.get('rev'));
    const eventos = ev === null ? [] : db.hist.filter((h) => h.id > Number(ev) && (u.r === 'mestre' || h.character_id === u.c)).slice(-100).reverse().map((h) => comNome(db, h));
    const novo = rev !== db.rev; // só manda o estado completo quando algo mudou
    return json(200, { rev: db.rev, lastEv: db.seq.h, eventos, ...(novo ? { dados: { chars: visiveis(db, u), config: db.config, ...(u.r === 'mestre' ? dadosMestre(db) : dadosJogador(db, u)) } } : {}) });
  }
  if (a === 'eventos' && m === 'GET') { soMestre(); return json(200, db.hist.slice(-100).reverse().map((h) => comNome(db, h))); }
  const mesa = await rotasMesa({ seg, m, u, db, corpo: () => corpo(req), mutate, json });
  if (mesa) return mesa;

  if (a === 'characters') {
    if (!b && m === 'GET') return json(200, visiveis(db, u));
    if (!b && m === 'POST') {
      soMestre(); const body = await corpo(req);
      const nome = txt(body.nome, 40), vm = int(body.vida_max, 1, 9999), sm = int(body.sanidade_max, 1, 9999);
      if (!nome) erro(400, 'Informe o nome.');
      if (!senhaOk(body.senha)) erro(400, 'A senha deve ter de 4 a 72 caracteres.');
      if (vm === null || sm === null) erro(400, 'Vida e sanidade máximas devem ser números de 1 a 9999.');
      const va = body.vida_atual === undefined || body.vida_atual === '' ? vm : int(body.vida_atual, 0, vm);
      const sa = body.sanidade_atual === undefined || body.sanidade_atual === '' ? sm : int(body.sanidade_atual, 0, sm);
      if (va === null || sa === null) erro(400, 'Valores iniciais devem ficar entre 0 e o máximo.');
      const hash = bcrypt.hashSync(body.senha, 10);
      const novo = await mutate((d) => {
        if (d.chars.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) erro(409, 'Já existe um personagem com esse nome.');
        const ch = { id: ++d.seq.c, nome, senha_hash: hash, foto_url: null, vida_atual: va, vida_max: vm, sanidade_atual: sa, sanidade_max: sm, itens: [], criado_em: new Date().toISOString() };
        d.chars.push(ch); return pub(ch);
      });
      return json(201, novo);
    }
    if (b) {
      const id = alvo();
      const find = (d) => d.chars.find((x) => x.id === id);
      if (!c && m === 'PATCH') {
        soMestre(); const body = await corpo(req), cur = find(db);
        const nome = body.nome === undefined ? cur.nome : txt(body.nome, 40);
        const vm = body.vida_max === undefined ? cur.vida_max : int(body.vida_max, 1, 9999);
        const sm = body.sanidade_max === undefined ? cur.sanidade_max : int(body.sanidade_max, 1, 9999);
        if (!nome || vm === null || sm === null) erro(400, 'Dados inválidos.');
        const junto = body.curar_junto === true;
        const aj = (atual, antigo, novo) => Math.max(0, Math.min(novo, junto && novo > antigo ? atual + (novo - antigo) : atual));
        return json(200, await mutate((d) => {
          const ch = find(d); if (!ch) erro(404, 'Personagem não encontrado.');
          if (d.chars.some((x) => x.id !== id && x.nome.toLowerCase() === nome.toLowerCase())) erro(409, 'Já existe um personagem com esse nome.');
          ch.vida_atual = aj(ch.vida_atual, ch.vida_max, vm); ch.sanidade_atual = aj(ch.sanidade_atual, ch.sanidade_max, sm);
          ch.nome = nome; ch.vida_max = vm; ch.sanidade_max = sm; return pub(ch);
        }));
      }
      if (!c && m === 'DELETE') {
        soMestre(); const foto = find(db).foto_url;
        await mutate((d) => { limparChar(d, id); d.chars = d.chars.filter((x) => x.id !== id); d.hist = d.hist.filter((h) => h.character_id !== id); });
        await apagaFoto(foto);
        return json(200, { ok: true });
      }
      if (c === 'senha' && m === 'POST') {
        soMestre(); const body = await corpo(req);
        if (!senhaOk(body.senha)) erro(400, 'A senha deve ter de 4 a 72 caracteres.');
        const hash = bcrypt.hashSync(body.senha, 10);
        await mutate((d) => { find(d).senha_hash = hash; }); // invalida as sessões antigas desse personagem
        return json(200, { ok: true });
      }
      if (c === 'historico' && m === 'GET') return json(200, db.hist.filter((h) => h.character_id === id).slice(-200).reverse());
      if (c === 'ajuste' && m === 'POST') {
        const body = await corpo(req), { atributo, tipo } = body, valor = int(body.valor, 1, 9999);
        if (!['vida', 'sanidade'].includes(atributo)) erro(400, 'Atributo inválido.');
        if (!['dano', 'cura'].includes(tipo)) erro(400, 'Tipo inválido.');
        if (valor === null) erro(400, 'Informe um valor inteiro entre 1 e 9999.');
        const descricao = txt(body.descricao, 300), autor = u.r === 'mestre' ? 'mestre' : 'jogador';
        return json(200, await mutate((d) => aplicarAjuste(d, id, atributo, tipo, valor, descricao, autor)));
      }
      if (c === 'foto' && m === 'POST') {
        let file; try { file = (await req.formData()).get('foto'); } catch { erro(400, 'Falha no envio.'); }
        if (!file || typeof file === 'string') erro(400, 'Envie uma imagem.');
        if (file.size > 5 * 1024 * 1024) erro(413, 'A imagem passa de 5 MB.');
        const buf = Buffer.from(await file.arrayBuffer()), tipo = tipoReal(buf);
        if (!tipo) erro(415, 'Use uma imagem JPG, PNG ou WEBP.');
        const nome = crypto.randomBytes(16).toString('hex') + '.' + EXT[tipo];
        await store().set('foto/' + nome, buf, { metadata: { tipo } });
        let antiga;
        const res = await mutate((d) => { const ch = find(d); if (!ch) erro(404, 'Personagem não encontrado.'); antiga = ch.foto_url; ch.foto_url = '/uploads/' + nome; return pub(ch); });
        await apagaFoto(antiga);
        return json(200, res);
      }
      if (c === 'foto' && m === 'DELETE') {
        let antiga; const res = await mutate((d) => { const ch = find(d); antiga = ch.foto_url; ch.foto_url = null; return pub(ch); });
        await apagaFoto(antiga); return json(200, res);
      }
    }
  }
  return json(404, { erro: 'Rota não encontrada.' });
}

export const config = { path: ['/api/*', '/uploads/*'] };
