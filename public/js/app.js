/* Núcleo: utilitários, componentes, telas de entrada, ficha do jogador e atualização periódica.
   O painel do mestre fica em mestre.js e usa o objeto G exposto aqui. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const NOME = { vida: 'Vida', sanidade: 'Sanidade' };
const ROTULO = { caido: 'Caído / Morrendo', ferido: 'Ferido', enlouquecido: 'Enlouquecido', abalado: 'Abalado' };
const S = { me: null, chars: [], combate: null, mesa: null, inv: [], feed: [], hist: [], rev: null, lastEv: null };

// ---------- servidor ----------
async function api(url, opts = {}) {
  const o = { method: 'GET', headers: {}, credentials: 'same-origin', ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.body); }
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 10000); o.signal = ctl.signal;
  let r;
  try { r = await fetch(url, o); } catch { throw new Error('Sem resposta do servidor. Confira sua conexão e tente de novo.'); } finally { clearTimeout(to); }
  const d = await r.json().catch(() => null);
  if (r.ok && o.method !== 'GET' && !/\/api\/(login|logout)/.test(url)) setTimeout(poll, 0); // atualiza na hora após qualquer alteração
  if (d === null) throw new Error('A função do servidor não respondeu. Veja o LEIA-ME para publicar com as funções do Netlify.');
  if (!r.ok) { const e = new Error(d.erro || 'Algo deu errado.'); e.status = r.status; throw e; }
  return d;
}
// desabilita o botão e mostra um indicador enquanto a ação roda
async function comCarga(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="carga" aria-hidden="true"></span> ' + html;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}
function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4500);
}

// ---------- ícones e ornamentos (SVG próprios, sem imagens externas) ----------
const IC = {
  combate: '<path d="M5 19L18 6M8 16l-3 3M14 6h4v4"/><path d="M19 19L6 6M16 16l3 3M10 6H6v4"/>',
  jogadores: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .1 5 2.2 5 5.2"/>',
  dados: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 2l-3.5 11h7zM3 7l5.5 6M21 7l-5.5 6M8.5 13L12 22l3.5-9"/>',
  monstros: '<path d="M12 3c-4.4 0-8 3.1-8 7.2 0 2.4 1.2 4.2 3 5.4V19h10v-3.4c1.8-1.2 3-3 3-5.4C20 6.1 16.4 3 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 19v-2M14 19v-2"/>',
  efeitos: '<path d="M12 2.5l2.4 6.6 6.6 2.4-6.6 2.4L12 20.5l-2.4-6.6L3 11.5l6.6-2.4z"/><path d="M19 3v4M17 5h4"/>',
  itens: '<path d="M8 6c0-2 1.8-3 4-3s4 1 4 3"/><path d="M7 6h10l2.5 13.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M9 11c0 1.7 1.3 3 3 3s3-1.3 3-3"/>',
  biblioteca: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 7h6M9 11h4"/>',
  historico: '<path d="M6 3h11a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 1-1.7z"/><path d="M9 8h7M9 12h7M9 16h4"/>',
  dano: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  cura: '<path d="M12 5v14M5 12h14"/>',
  bonus: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  controle: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  gelo: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
};
const icone = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${IC[n] || ''}</svg>`;
// círculo de alquimia: duas camadas (aneis com 72 marcas + runas, e hexagrama + octograma) que giram em sentidos opostos
function alquimia() {
  const marcas = Array.from({ length: 72 }, (_, i) => `<line x1="0" y1="-96" x2="0" y2="-${i % 6 === 0 ? 88 : 92}" transform="rotate(${i * 5})"/>`).join('');
  const runas = Array.from({ length: 12 }, (_, i) => `<circle cx="0" cy="-80" r="1.8" fill="currentColor" stroke="none" transform="rotate(${i * 30})"/>`).join('');
  const base = 'viewBox="-100 -100 200 200" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true" focusable="false"';
  return `<svg ${base}><circle r="98"/><circle r="94" stroke-dasharray="2 3"/>${marcas}${runas}<circle r="76"/></svg>
  <svg ${base}><polygon points="0,-70 60.6,35 -60.6,35"/><polygon points="0,70 60.6,-35 -60.6,-35"/><rect x="-41" y="-41" width="82" height="82"/><rect x="-41" y="-41" width="82" height="82" transform="rotate(45)"/><circle r="30"/><circle r="5" fill="currentColor"/></svg>`;
}
const SIL = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#2B1A0F"/><circle cx="50" cy="42" r="30" fill="#3D2616"/><path d="M50 14c17 0 27 14 27 30 0 5-3 9-6 12H29c-3-3-6-7-6-12 0-16 10-30 27-30z" fill="#6B4527"/><ellipse cx="50" cy="49" rx="13" ry="12" fill="#120904"/><circle cx="45" cy="48" r="2" fill="#F4D27A"/><circle cx="55" cy="48" r="2" fill="#F4D27A"/><path d="M12 100c2-24 16-38 38-38s36 14 38 38z" fill="#6B4527"/></svg>';
const SIL_MON = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#2B1A0F"/><path d="M50 14c-20 0-34 13-34 31 0 10 5 17 12 22v15h44V67c7-5 12-12 12-22 0-18-14-31-34-31z" fill="#6B4527"/><circle cx="38" cy="46" r="7" fill="#120904"/><circle cx="62" cy="46" r="7" fill="#120904"/><circle cx="38" cy="46" r="2.4" fill="#E0555A"/><circle cx="62" cy="46" r="2.4" fill="#E0555A"/><path d="M42 82V72M50 82V72M58 82V72" stroke="#120904" stroke-width="3"/></svg>';

// ---------- componentes ----------
const token = (c, tam = '') =>
  `<div class="token ${tam} ${(c.estados || []).map((e) => 'st-' + e).join(' ')}"><div class="tk-img">${c.foto_url ? `<img src="${esc(c.foto_url)}" alt="" draggable="false">` : (c.tipo === 'monstro' ? SIL_MON : SIL)}</div><span class="caveira" aria-hidden="true">☠</span></div>`;
const chipsEstado = (c) => `<div class="chips">${(c.estados || []).map((e) => `<span class="chip ${e}">${ROTULO[e]}</span>`).join('')}</div>`;
const chipEfeito = (e, extra = '') => {
  const k = e.dano_tipo === 'gelo' ? 'gelo' : e.tipo, p = e.pilhas > 1 ? ` ×${e.pilhas}` : '';
  return `<span class="chip ${k === 'bonus' ? 'buff' : k}">${icone(k)}${esc(e.nome)}${p}${e.restante != null ? ` · ${e.restante}t` : ''}${extra}</span>`;
};
function barra(tipo, atual, max, estados = [], rot = true) {
  const cls = tipo === 'vida' ? (estados.includes('ferido') ? 'pulsa' : '') : (estados.includes('abalado') || estados.includes('enlouquecido') ? 'treme' : '');
  return `<div class="stat ${tipo}">${rot ? `<div class="stat-top"><span>${NOME[tipo]}</span><b class="num">${atual}<small> / ${max}</small></b></div>` : ''}
  <div class="barra ${cls}${rot ? '' : ' fina'}" role="progressbar" aria-label="${NOME[tipo]}" aria-valuenow="${atual}" aria-valuemin="0" aria-valuemax="${max}"><div class="fill" style="width:${max ? Math.round((atual / max) * 100) : 0}%"></div></div></div>`;
}
const eventoHtml = (e, nome) => {
  const dano = e.delta < 0;
  return `<li class="ev ${dano ? 'dano' : 'cura'} ${e.atributo}"><span class="marca"></span><time datetime="${esc(e.criado_em)}">${fmt(e.criado_em)}</time><div><b>${nome ? esc(e.nome) + ' — ' : ''}${dano ? 'perdeu' : 'recuperou'} ${Math.abs(e.delta)} de ${NOME[e.atributo]}</b> <span class="de">(${e.antes} → ${e.depois}, por ${e.autor})</span><p>${esc(e.descricao || 'Sem descrição')}</p></div></li>`;
};
// folha de pergaminho com moldura, losangos nos cantos e círculos de alquimia ao fundo
const pergaminho = (html, cls = '') => `<div class="pergaminho ${cls}" ${cls.includes('folha') ? '' : 'id="conteudo" role="tabpanel" tabindex="-1"'}>
  <i class="orn a"></i><i class="orn b"></i><i class="orn c"></i><i class="orn d"></i>
  <div class="fundo-alq" aria-hidden="true"><div class="alq" style="width:640px;height:640px;right:-180px;top:-120px">${alquimia()}</div><div class="alq" style="width:520px;height:520px;left:-200px;bottom:-160px">${alquimia()}</div></div>
  <div class="corpo" id="tela">${html}</div></div>`;
const divisor = '<div class="divisor" role="presentation"><i></i></div>';

// ---------- modais ----------
function modal(html, rotulo = '') {
  const el = document.createElement('div'), volta = document.activeElement;
  el.className = 'modal-bg';
  el.innerHTML = `<div class="cartao modal" role="dialog" aria-modal="true" aria-label="${esc(rotulo)}">${html}</div>`;
  el.fechar = () => { el.remove(); if (volta && volta.isConnected) volta.focus(); };
  el.addEventListener('mousedown', (e) => { if (e.target === el) el.fechar(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) el.fechar(); });
  $('#modais').append(el);
  const f = $('input:not([type=radio]):not([type=file]),textarea,select', el); if (f) f.focus();
  return el;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $$('.modal-bg').pop(); if (m) m.fechar(); $('#aviso').classList.remove('on'); } });

const app = $('#app');
const montar = (html) => { app.innerHTML = html; window.__appOk = true; window.scrollTo(0, 0); };

// ---------- telas de entrada ----------
function telaHome() {
  desconectar();
  const marcas = Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="-96" x2="0" y2="-${i % 2 ? 91 : 86}" transform="rotate(${i * 15})"/>`).join('');
  montar(`<section class="centro home fora"><div class="runas"><svg viewBox="-100 -100 200 200" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><circle r="98"/><circle r="84" stroke-dasharray="3 4"/><g stroke-width="1.4">${marcas}</g>
  <polygon points="0,-72 62.4,36 -62.4,36"/><polygon points="0,72 62.4,-36 -62.4,-36"/><circle r="30"/><circle r="6" fill="currentColor"/></svg></div>
  <h1>Grimório da Mesa</h1><p class="sub">Vida &amp; Sanidade dos aventureiros</p>
  <button class="btn perigo grande" data-act="ir-mestre">Entrar como mestre</button>
  <button class="btn grande" data-act="ir-jogador">Entrar como jogador</button></section>`);
}
async function telaLoginMestre() {
  const st = await api('/api/status').catch(() => ({ mestre_configurado: true }));
  montar(`<section class="centro fora"><div class="cartao"><h2>Mestre</h2><form data-form="mestre">
  ${st.mestre_configurado ? '' : '<p class="dica">Primeiro acesso: crie agora a senha do mestre (mínimo 6 caracteres). Guarde-a bem.</p>'}
  <label class="campo"><span>${st.mestre_configurado ? 'Senha do mestre' : 'Crie a senha do mestre'}</span><input id="sm" type="password" autocomplete="${st.mestre_configurado ? 'current-password' : 'new-password'}" required maxlength="100"></label>
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-act="home">Voltar</button><button class="btn perigo">Entrar</button></div></form></div></section>`);
  $('#sm').focus();
}
async function telaEscolher() {
  montar('<p class="carregando">Invocando os personagens…</p>');
  let lista = [];
  try { lista = await api('/api/public/characters'); } catch (e) { toast(e.message, 'erro'); }
  montar(`<section class="fora"><div class="topo-fino"><h2>Quem é você?</h2><button class="btn fantasma peq" data-act="home">Voltar</button></div>
  ${lista.length ? `<div class="lista-escolha">${lista.map((c) => `<button class="cartao escolha" data-act="escolher" data-id="${c.id}" data-nome="${esc(c.nome)}" data-foto="${esc(c.foto_url || '')}">${token(c, 'md')}<h3>${esc(c.nome)}</h3></button>`).join('')}</div>` : '<p class="vazio" style="color:var(--p2)">Nenhum personagem ainda. Peça ao mestre para criar o seu.</p>'}</section>`);
}
function telaSenhaJogador(id, nome, foto) {
  montar(`<section class="centro fora"><div class="cartao">${token({ foto_url: foto || null }, 'md')}<h2>${esc(nome)}</h2><form data-form="jogador" data-id="${id}">
  <label class="campo"><span>Senha do personagem</span><input id="sj" type="password" autocomplete="current-password" required maxlength="100"></label>
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-act="ir-jogador">Voltar</button><button class="btn perigo">Entrar</button></div></form></div></section>`);
  $('#sj').focus();
}

// ---------- ficha do jogador ----------
function ordemJogador(c) {
  const lin = c.ordem.map((x) => {
    const vida = x.vida_atual !== undefined ? barra('vida', x.vida_atual, x.vida_max, [], false) : '';
    return `<li><div class="turno" ${c.atual === x.cid ? 'aria-current="true"' : ''} style="cursor:default">
      <span class="ini num">${x.iniciativa ?? '—'}</span>${token({ foto_url: x.foto_url, tipo: x.tipo }, 'pp')}
      <span><span class="nome">${esc(x.nome)}${x.eu ? ' (você)' : ''}</span>${x.estado ? ` <span class="chip vida-${x.estado.toLowerCase().replace('í', 'i').replace('é', 'e')}">${x.estado}</span>` : ''}
      ${vida ? `<span class="mini-hp">${vida}</span>` : ''}<span class="chips">${x.efeitos.map((e) => chipEfeito(e)).join('')}</span></span></div></li>`;
  }).join('');
  return `<ol class="ordem">${lin}</ol>`;
}
function desenhaFicha() {
  const eu = S.chars.find((c) => c.id === S.me.id); if (!eu) return;
  const outros = S.chars.filter((c) => c.id !== eu.id), cb = S.combate;
  const btn = (a) => `<button class="btn perigo peq" data-act="ajustar" data-id="${eu.id}" data-a="${a}" data-t="dano">Sofrer dano</button><button class="btn verde peq" data-act="ajustar" data-id="${eu.id}" data-a="${a}" data-t="cura">${a === 'vida' ? 'Curar' : 'Recuperar'}</button>`;
  const meuCid = cb?.ordem.find((x) => x.eu)?.cid;
  $('#ficha').innerHTML = `<div class="topo-fino"><h2>Grimório da Mesa</h2><button class="btn fantasma peq" data-act="sair">Sair</button></div>
  ${pergaminho(`<div class="ficha" style="text-align:center">${token(eu, 'gg')}<h2 class="nome" style="margin:10px 0 4px">${esc(eu.nome)}</h2>${chipsEstado(eu)}
  <div style="text-align:left">${barra('vida', eu.vida_atual, eu.vida_max, eu.estados)}</div><div class="grupo-btns">${btn('vida')}</div>
  <div style="text-align:left">${barra('sanidade', eu.sanidade_atual, eu.sanidade_max, eu.estados)}</div><div class="grupo-btns">${btn('sanidade')}</div>
  <div class="acoes" style="justify-content:center"><button class="btn peq" data-act="foto" data-id="${eu.id}">Trocar foto</button></div></div>
  ${cb ? `${divisor}<h2 style="font-size:1.6rem">Combate${cb.ativo ? ` · rodada ${cb.rodada}` : ' (preparando)'}</h2>${cb.ativo && cb.atual === meuCid ? '<p class="sua-vez" role="status">É a sua vez!</p>' : ''}${ordemJogador(cb)}` : ''}
  ${S.inv.length ? `${divisor}<h2 style="font-size:1.6rem">Inventário</h2><div class="inv">${S.inv.map((i) => `<div class="slot"><span class="qtd num">${i.qtd}</span><b>${esc(i.nome)}</b><small>${esc(i.tipo)}${i.dado_dano ? ' · ' + esc(i.dado_dano) : ''}${i.bonus ? ' · ' + esc(i.bonus) : ''}</small>${i.descricao ? `<p style="margin:4px 0 0;font-size:.9rem">${esc(i.descricao)}</p>` : ''}</div>`).join('')}</div>` : ''}
  ${divisor}<h2 style="font-size:1.6rem">Histórico</h2><ul class="hist" style="max-height:340px">${S.hist.length ? S.hist.map((e) => eventoHtml(e, false)).join('') : '<li class="vazio">Nenhum dano ou cura registrado.</li>'}</ul>
  ${S.me.config.jogadores_veem_outros && outros.length ? `${divisor}<h2 style="font-size:1.6rem">Grupo</h2><div class="grade">${outros.map((c) => `<article class="cartao mini">${token(c, 'pp')}<div><h3>${esc(c.nome)}</h3>${chipsEstado(c)}${barra('vida', c.vida_atual, c.vida_max, c.estados, false)}${barra('sanidade', c.sanidade_atual, c.sanidade_max, c.estados, false)}</div></article>`).join('')}</div>` : ''}`, 'folha')}`;
}
async function telaFicha() {
  montar('<div class="ficha" id="ficha" style="max-width:640px"></div>');
  await carregarTudo();
  S.hist = await api(`/api/characters/${S.me.id}/historico`);
  desenhaFicha(); conectar();
}

// ---------- modais de ação ----------
function modalAjuste(c, atributo = 'vida', tipo = 'dano', valor = 1) {
  const seg = (nome, op, atual) => `<div class="seg ${nome === 't' ? 'ouro' : ''}" role="radiogroup">${op.map(([v, r]) => `<label style="margin:0"><input type="radio" name="${nome}" value="${v}" ${v === atual ? 'checked' : ''} class="so-leitor"><span class="btn peq bloco ${v === atual ? '' : 'fantasma'}" data-seg>${r}</span></label>`).join('')}</div>`;
  const m = modal(`<h2>${esc(c.nome)}</h2><form><div class="campo"><span>Atributo</span>${seg('a', [['vida', 'Vida'], ['sanidade', 'Sanidade']], atributo)}</div>
  <div class="campo"><span>Tipo</span>${seg('t', [['dano', 'Dano'], ['cura', 'Cura / Recuperação']], tipo)}</div>
  <div class="campo"><span>Valor</span><div class="valores">${[1, 2, 5, 10].map((v) => `<button type="button" class="btn peq" data-v="${v}">${v}</button>`).join('')}<input type="number" name="v" min="1" max="9999" value="${valor}" inputmode="numeric" required aria-label="Valor"></div></div>
  <label class="campo"><span>Descrição</span><textarea id="ds" name="d" maxlength="300" placeholder="Ex.: Garra da criatura no ombro / Viu algo impossível no porão"></textarea></label>
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn perigo">Aplicar</button></div></form>`, 'Aplicar dano ou cura');
  const f = $('form', m);
  const pinta = () => $('[data-seg]', f).forEach((s) => { const on = s.previousElementSibling.checked; s.classList.toggle('fantasma', !on); s.classList.toggle('ouro', on); });
  f.addEventListener('change', pinta); pinta();
  $('#ds', m).focus();
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) f.v.value = b.dataset.v; });
  $('#ds', m).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await comCarga($('.perigo', f), async () => {
      try { await api(`/api/characters/${c.id}/ajuste`, { method: 'POST', body: { atributo: f.a.value, tipo: f.t.value, valor: f.v.value, descricao: f.d.value } }); m.fechar(); }
      catch (err) { $('.erro', f).textContent = err.message; }
    });
  });
}

// ---------- corte circular da foto ----------
function abrirCorte(file, id) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Use uma imagem JPG, PNG ou WEBP.', 'erro');
  if (file.size > 5 * 1024 * 1024) return toast('A imagem passa de 5 MB.', 'erro');
  const url = URL.createObjectURL(file), img = new Image();
  img.onerror = () => { URL.revokeObjectURL(url); toast('Não foi possível ler essa imagem.', 'erro'); };
  img.onload = () => {
    const m = modal(`<h2>Recortar foto</h2><div class="corte"><canvas width="300" height="300" aria-label="Área de recorte"></canvas></div><label class="campo"><span>Zoom</span><input id="zm" type="range" min="1" max="4" step="0.01" value="1"></label>
    <p class="dica">Arraste a imagem para posicionar dentro do círculo.</p><p class="erro" role="alert"></p>
    <div class="acoes"><button class="btn fantasma" data-x>Cancelar</button><button class="btn perigo" id="salvaFoto">Salvar foto</button></div>`, 'Recortar foto');
    const cv = $('canvas', m), ctx = cv.getContext('2d'), base = Math.max(300 / img.width, 300 / img.height);
    let s = 1, ox = 0, oy = 0;
    const clamp = () => { const mx = Math.max(0, (img.width * base * s - 300) / 2), my = Math.max(0, (img.height * base * s - 300) / 2); ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy)); };
    const pinta = (c, size, mascara) => {
      clamp(); const k = size / 300, w = img.width * base * s * k, h = img.height * base * s * k;
      c.clearRect(0, 0, size, size); c.drawImage(img, (size - w) / 2 + ox * k, (size - h) / 2 + oy * k, w, h);
      if (mascara) {
        c.save(); c.fillStyle = 'rgba(0,0,0,.7)'; c.beginPath(); c.rect(0, 0, size, size); c.arc(size / 2, size / 2, size / 2 - 4, 0, 7); c.fill('evenodd'); c.restore();
        c.strokeStyle = '#E3AE3E'; c.lineWidth = 4; c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 4, 0, 7); c.stroke();
      }
    };
    pinta(ctx, 300, true);
    $('#zm', m).addEventListener('input', (e) => { s = Number(e.target.value); pinta(ctx, 300, true); });
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const k = 300 / cv.getBoundingClientRect().width; ox += (e.clientX - drag.x) * k; oy += (e.clientY - drag.y) * k; drag = { x: e.clientX, y: e.clientY }; pinta(ctx, 300, true); });
    cv.addEventListener('pointerup', () => { drag = null; });
    $('#salvaFoto', m).addEventListener('click', async (e) => {
      e.target.disabled = true;
      const out = document.createElement('canvas'); out.width = out.height = 512; pinta(out.getContext('2d'), 512, false);
      out.toBlob(async (blob) => {
        try { const fd = new FormData(); fd.append('foto', blob, 'token.webp'); await api(`/api/characters/${id}/foto`, { method: 'POST', body: fd }); m.fechar(); toast('Foto atualizada.'); }
        catch (er) { $('.erro', m).textContent = er.message; e.target.disabled = false; }
      }, 'image/webp', 0.9);
    });
    new MutationObserver((_, ob) => { if (!m.isConnected) { URL.revokeObjectURL(url); ob.disconnect(); } }).observe($('#modais'), { childList: true });
  };
  img.src = url;
}

// ---------- avisos de dano ----------
function avisoDano(ev) {
  const san = ev.atributo === 'sanidade', el = $('#aviso');
  el.className = 'on' + (san ? ' san' : '');
  el.innerHTML = `<div><div class="big num">−${Math.abs(ev.delta)}</div><div class="tp">${san ? 'SANIDADE' : 'VIDA'}</div><div class="ds">${esc(ev.descricao || 'Sem descrição')}</div></div>`;
  document.body.classList.remove('flash-vida', 'flash-san'); void document.body.offsetWidth;
  document.body.classList.add(san ? 'flash-san' : 'flash-vida');
  app.classList.remove('tremer'); void app.offsetWidth; app.classList.add('tremer');
  clearTimeout(avisoDano.t); avisoDano.t = setTimeout(() => el.classList.remove('on'), 5000);
  if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
}
$('#aviso').addEventListener('click', () => $('#aviso').classList.remove('on'));

// ---------- atualização periódica (no lugar do tempo real) ----------
let timer = null, buscando = false, repetir = false;
function aplicar(r) {
  S.rev = r.rev; S.lastEv = r.lastEv;
  if (!r.dados) return false;
  const d = r.dados;
  S.chars = d.chars; S.me.config = d.config; S.combate = d.combate;
  if (S.me.papel === 'mestre') S.mesa = d.mesa; else S.inv = d.inventario;
  return true;
}
async function carregarTudo() {
  S.rev = null; S.lastEv = null;
  const r = await api('/api/sync'); aplicar(r);
  // site novo falando com uma função antiga (publicada sem a pasta netlify/functions atualizada): resposta sem "dados"
  if (S.me.papel === 'mestre' && !(S.combate && S.mesa)) throw new Error('A função do servidor está desatualizada. Publique o projeto inteiro de novo, incluindo a pasta netlify/functions.');
  if (S.me.papel === 'mestre') S.feed = await api('/api/eventos');
  S.lastEv = r.lastEv; // linha de base: só avisa o que acontecer daqui para frente
}
function conectar() { if (!timer) timer = setInterval(() => { if (!document.hidden) poll(); }, 2500); }
function desconectar() { clearInterval(timer); timer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) poll(); });
async function poll() {
  if (!S.me || !timer) return;
  if (buscando) { repetir = true; return; }
  buscando = true;
  try {
    const q = new URLSearchParams(); if (S.lastEv != null) q.set('ev', S.lastEv); if (S.rev != null) q.set('rev', S.rev);
    const r = await api('/api/sync?' + q);
    if (!S.me) return;
    const mudou = aplicar(r);
    if (mudou && S.me.papel === 'jogador' && !S.chars.some((c) => c.id === S.me.id)) { toast('Seu personagem foi removido.', 'erro'); return sair(); }
    for (const e of r.eventos.slice().reverse()) {
      if (S.me.papel === 'mestre') { S.feed.unshift(e); S.feed.length = Math.min(S.feed.length, 100); }
      else { S.hist.unshift(e); if (e.delta < 0) avisoDano(e); else toast(`+${e.delta} de ${NOME[e.atributo]}: ${e.descricao || 'recuperação'}`); }
    }
    if (mudou || r.eventos.length) redesenha();
  } catch (e) { if (e.status === 401) { toast('Sua sessão terminou. Entre de novo.', 'erro'); sair(); } } finally { buscando = false; if (repetir) { repetir = false; poll(); } }
}
function redesenha() {
  if (!S.me) return;
  if (S.me.papel === 'mestre') G.redesenhaMestre?.(); else if ($('#ficha')) desenhaFicha();
}
async function sair() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  S.me = null; S.chars = []; telaHome();
}

// ---------- eventos da interface ----------
let fotoAlvo = null;
const acoes = {
  'ir-mestre': telaLoginMestre, 'ir-jogador': telaEscolher, home: telaHome, sair: () => sair(),
  escolher: (t) => telaSenhaJogador(t.dataset.id, t.dataset.nome, t.dataset.foto),
  foto: (t) => { fotoAlvo = Number(t.dataset.id); $('#fileFoto').click(); },
  ajustar: (t) => modalAjuste(S.chars.find((c) => c.id == t.dataset.id), t.dataset.a, t.dataset.t || 'dano', 1),
  rapido: (t) => modalAjuste(S.chars.find((c) => c.id == t.dataset.id), t.dataset.a, t.dataset.t, 1),
};
document.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (t && acoes[t.dataset.act]) acoes[t.dataset.act](t); });
$('#fileFoto').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && fotoAlvo) abrirCorte(f, fotoAlvo); });
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault(); const erro = $('.erro', f); erro.textContent = '';
  await comCarga($('.perigo', f), async () => {
    try {
      const tipo = f.dataset.form, senha = $('input[type=password]', f).value;
      await api(`/api/login/${tipo}`, { method: 'POST', body: tipo === 'mestre' ? { senha } : { id: Number(f.dataset.id), senha } });
      S.me = await api('/api/me'); await entrar();
    } catch (er) { erro.textContent = er.message; }
  });
});
const entrar = () => (S.me.papel === 'mestre' ? G.telaMestre() : telaFicha()).catch((e) => { toast(e.message, 'erro'); sair(); });

// fonte escolhida (Grimório, Gótico, Clássico)
try { const f = localStorage.getItem('fonte'); if (f) document.documentElement.dataset.fonte = f; } catch { /* sem armazenamento */ }

// fagulhas de tocha subindo (decorativo)
(() => {
  const box = $('#fagulhas');
  for (let i = 0; i < 14; i++) {
    const f = document.createElement('i'); f.className = 'fagulha'; const t = 2 + Math.random() * 3;
    f.style.cssText = `left:${Math.random() * 100}%;width:${t}px;height:${t}px;animation-duration:${8 + Math.random() * 9}s;animation-delay:${-Math.random() * 12}s`;
    box.append(f);
  }
})();

const pedirFoto = (id) => { fotoAlvo = id; $('#fileFoto').click(); };
const G = window.G = { pedirFoto, $, $$, esc, fmt, NOME, S, api, comCarga, toast, icone, alquimia, token, chipsEstado, chipEfeito, barra, eventoHtml, pergaminho, divisor, modal, montar, modalAjuste, abrirCorte, carregarTudo, conectar, redesenha, sair, telaHome, SIL };

// início: retoma a sessão, se existir; qualquer falha leva à tela inicial (nunca fica "carregando")
api('/api/me').then((me) => { S.me = me; return entrar(); }).catch(() => telaHome());
})();
