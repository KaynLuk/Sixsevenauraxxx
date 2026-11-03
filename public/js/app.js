(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const NOME = { vida: 'Vida', sanidade: 'Sanidade' };
const ROTULO = { caido: 'CAÍDO / MORRENDO', ferido: 'FERIDO', enlouquecido: 'ENLOUQUECIDO', abalado: 'ABALADO' };
const S = { me: null, chars: [], feed: [], hist: [], socket: null };

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
function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4200);
}

// ---------- componentes ----------
// aventureiro encapuzado (token padrão)
const SIL = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#2a1810"/><circle cx="50" cy="42" r="30" fill="#3d2515"/><path d="M50 14c17 0 27 14 27 30 0 5-3 9-6 12H29c-3-3-6-7-6-12 0-16 10-30 27-30z" fill="#6a4426"/><ellipse cx="50" cy="48" rx="15" ry="14" fill="#14090400" stroke="#14090488" stroke-width="2"/><ellipse cx="50" cy="49" rx="13" ry="12" fill="#120904"/><circle cx="45" cy="48" r="2" fill="#f2cb66"/><circle cx="55" cy="48" r="2" fill="#f2cb66"/><path d="M12 100c2-24 16-38 38-38s36 14 38 38z" fill="#6a4426"/></svg>';
const token = (c, tam = '') =>
  `<div class="token ${tam} ${(c.estados || []).map((e) => 'st-' + e).join(' ')}"><div class="tk-img">${c.foto_url ? `<img src="${esc(c.foto_url)}" alt="" draggable="false">` : SIL}</div><span class="caveira" aria-hidden="true">☠</span></div>`;
const badges = (c) => `<div class="badges">${(c.estados || []).map((e) => `<span class="badge ${e}">${ROTULO[e]}</span>`).join('')}</div>`;
function barra(tipo, c) {
  const cur = c[tipo + '_atual'], max = c[tipo + '_max'], e = c.estados || [];
  const cls = tipo === 'vida' ? (e.includes('ferido') ? 'pulsa' : '') : (e.includes('abalado') || e.includes('enlouquecido') ? 'treme' : '');
  return `<div class="stat ${tipo}"><div class="stat-top"><span>${NOME[tipo].toUpperCase()}</span><b class="num">${cur}<small> / ${max}</small></b></div>
  <div class="barra ${cls}" role="progressbar" aria-label="${NOME[tipo]}" aria-valuenow="${cur}" aria-valuemin="0" aria-valuemax="${max}"><div class="fill" style="width:${max ? Math.round((cur / max) * 100) : 0}%"></div></div></div>`;
}
const eventoHtml = (e, nome) => {
  const dano = e.delta < 0;
  return `<li class="ev ${e.atributo} ${dano ? 'dano' : 'cura'}"><time>${fmt(e.criado_em)}</time><div><b>${nome ? esc(e.nome) + ' — ' : ''}${dano ? 'perdeu' : 'recuperou'} ${Math.abs(e.delta)} de ${NOME[e.atributo]}</b> <span class="de">(${e.antes} → ${e.depois}, por ${e.autor})</span><p>${esc(e.descricao || 'Sem descrição')}</p></div></li>`;
};

function modal(html) {
  const el = document.createElement('div');
  el.className = 'modal-bg';
  el.innerHTML = `<div class="painel modal" role="dialog" aria-modal="true">${html}</div>`;
  el.fechar = () => el.remove();
  el.addEventListener('mousedown', (e) => { if (e.target === el) el.fechar(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) el.fechar(); });
  $('#modais').append(el);
  const f = $('input:not([type=radio]):not([type=file]),textarea', el); if (f) f.focus();
  return el;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = [...document.querySelectorAll('.modal-bg')].pop(); if (m) m.fechar(); $('#aviso').classList.remove('on'); } });

// ---------- telas ----------
const app = $('#app');
const montar = (html) => { app.innerHTML = html; window.__appOk = true; window.scrollTo(0, 0); };

function telaHome() {
  desconectar();
  const marcas = Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="-96" x2="0" y2="-${i % 2 ? 91 : 86}" transform="rotate(${i * 15})"/>`).join('');
  montar(`<section class="centro home"><svg class="runas" viewBox="-100 -100 200 200" aria-hidden="true" fill="none" stroke="#c8962e" stroke-width="1"><circle r="98"/><circle r="84" stroke-dasharray="3 4"/><g stroke-width="1.4">${marcas}</g>
  <polygon points="0,-72 62.4,36 -62.4,36"/><polygon points="0,72 62.4,-36 -62.4,-36"/><circle r="30"/><circle r="6" fill="#c8962e"/></svg>
  <h1>Grimório da Mesa</h1><p class="sub">Vida &amp; Sanidade dos aventureiros</p>
  <button class="btn sangue grande" data-act="ir-mestre">ENTRAR COMO MESTRE</button>
  <button class="btn grande" data-act="ir-jogador">ENTRAR COMO JOGADOR</button></section>`);
}
async function telaLoginMestre() {
  const st = await api('/api/status').catch(() => ({ mestre_configurado: true }));
  montar(`<section class="centro"><div class="painel"><h2 class="titulo">Mestre</h2><form data-form="mestre">
  ${st.mestre_configurado ? '' : '<p class="dica">Primeiro acesso: crie agora a senha do mestre (mínimo 6 caracteres). Guarde-a bem.</p>'}
  <label for="sm">${st.mestre_configurado ? 'Senha do mestre' : 'Crie a senha do mestre'}</label><input id="sm" type="password" autocomplete="current-password" required maxlength="100">
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-act="home">Voltar</button><button class="btn sangue">Entrar</button></div></form></div></section>`);
  $('#sm').focus();
}
async function telaEscolher() {
  montar('<p class="carregando">Invocando os personagens…</p>');
  let lista = [];
  try { lista = await api('/api/public/characters'); } catch (e) { toast(e.message, 'erro'); }
  montar(`<section><div class="topo"><h2 class="titulo">Quem é você?</h2><button class="btn fantasma peq" data-act="home">Voltar</button></div>
  ${lista.length ? `<div class="lista-escolha">${lista.map((c) => `<button class="painel escolha" data-act="escolher" data-id="${c.id}">${token(c, 'md')}<h3>${esc(c.nome)}</h3></button>`).join('')}</div>` : '<p class="vazio">Nenhum personagem ainda. Peça ao mestre para criar o seu.</p>'}</section>`);
}
function telaSenhaJogador(id, nome, foto) {
  montar(`<section class="centro"><div class="painel">${token({ foto_url: foto }, 'md')}<h2 class="titulo">${esc(nome)}</h2><form data-form="jogador" data-id="${id}">
  <label for="sj">Senha do personagem</label><input id="sj" type="password" autocomplete="current-password" required maxlength="100">
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-act="ir-jogador">Voltar</button><button class="btn sangue">Entrar</button></div></form></div></section>`);
  $('#sj').focus();
}

// ---- mestre ----
function cardMestre(c) {
  const rap = (a) => `<div class="rapidos"><button class="btn peq sangue" data-act="rapido" data-id="${c.id}" data-a="${a}" data-t="dano" aria-label="Tirar 1 de ${NOME[a]}">−1</button><button class="btn peq" data-act="rapido" data-id="${c.id}" data-a="${a}" data-t="cura" aria-label="Dar 1 de ${NOME[a]}">+1</button><button class="btn peq fantasma" data-act="ajustar" data-id="${c.id}" data-a="${a}">Ajustar</button></div>`;
  return `<article class="painel card" data-card="${c.id}"><div class="cab">${token(c)}<div><h3>${esc(c.nome)}</h3>${badges(c)}</div></div>
  ${barra('vida', c)}${rap('vida')}${barra('sanidade', c)}${rap('sanidade')}
  <div class="card-foot"><button class="btn peq" data-act="editar" data-id="${c.id}">Editar</button><button class="btn peq" data-act="foto" data-id="${c.id}">Foto</button><button class="btn peq" data-act="hist" data-id="${c.id}">Histórico</button></div></article>`;
}
function desenhaMestre() {
  $('#grade').innerHTML = S.chars.length ? S.chars.map(cardMestre).join('') : '<p class="vazio">Nenhum personagem. Crie o primeiro!</p>';
  $('#feed').innerHTML = S.feed.length ? S.feed.map((e) => eventoHtml(e, true)).join('') : '<li class="vazio">Nada aconteceu ainda…</li>';
}
async function telaMestre() {
  montar(`<div class="topo"><h2 class="titulo">Painel do Mestre</h2><div class="cfg"><button class="btn sangue peq" data-act="novo">+ Personagem</button><button class="btn fantasma peq" data-act="sair">Sair</button></div></div>
  <label class="check"><input type="checkbox" id="cfgVer" ${S.me.config.jogadores_veem_outros ? 'checked' : ''}> Jogadores podem ver a vida e sanidade dos outros</label>
  <div class="mestre-layout" style="margin-top:14px"><div id="grade" class="grade"></div>
  <aside class="feed-col painel"><h2>Feed de eventos</h2><ul class="hist" id="feed" style="max-height:60vh"></ul></aside></div>`);
  [S.chars, S.feed] = await Promise.all([api('/api/characters'), api('/api/eventos')]);
  desenhaMestre(); conectar();
}

// ---- jogador ----
function desenhaFicha() {
  const eu = S.chars.find((c) => c.id === S.me.id); if (!eu) return;
  const outros = S.chars.filter((c) => c.id !== eu.id);
  const btn = (a) => `<button class="btn sangue peq" data-act="ajustar" data-id="${eu.id}" data-a="${a}" data-t="dano">Sofrer dano</button><button class="btn peq" data-act="ajustar" data-id="${eu.id}" data-a="${a}" data-t="cura">${a === 'vida' ? 'Curar' : 'Recuperar'}</button>`;
  $('#ficha').innerHTML = `<div class="painel">${token(eu, 'gg')}<h2 class="nome titulo">${esc(eu.nome)}</h2>${badges(eu)}
  ${barra('vida', eu)}<div class="grupo-btns">${btn('vida')}</div>${barra('sanidade', eu)}<div class="grupo-btns">${btn('sanidade')}</div>
  <div class="acoes" style="justify-content:center"><button class="btn peq" data-act="foto" data-id="${eu.id}">Trocar foto</button><button class="btn fantasma peq" data-act="sair">Sair</button></div></div>
  <section class="secao"><h2>Histórico</h2><div class="painel"><ul class="hist">${S.hist.length ? S.hist.map((e) => eventoHtml(e, false)).join('') : '<li class="vazio">Nenhum dano ou cura registrado.</li>'}</ul></div></section>
  ${S.me.config.jogadores_veem_outros ? `<section class="secao"><h2>Grupo</h2><div class="grade">${outros.length ? outros.map((c) => `<article class="painel mini somente-leitura">${token(c, 'pp')}<div><h3>${esc(c.nome)}</h3>${badges(c)}${barra('vida', c)}${barra('sanidade', c)}</div></article>`).join('') : '<p class="vazio">Você está sozinho… por enquanto.</p>'}</div></section>` : ''}`;
}
async function telaFicha() {
  montar('<div class="ficha" id="ficha"></div>');
  [S.chars, S.hist] = await Promise.all([api('/api/characters'), api(`/api/characters/${S.me.id}/historico`)]);
  desenhaFicha(); conectar();
}

// ---------- modais de ação ----------
function modalAjuste(c, atributo = 'vida', tipo = 'dano', valor = 1) {
  const m = modal(`<h2>${esc(c.nome)}</h2><form><label>Atributo</label><div class="seg">
  <input type="radio" name="a" id="a1" value="vida" ${atributo === 'vida' ? 'checked' : ''}><label for="a1">Vida</label>
  <input type="radio" name="a" id="a2" value="sanidade" ${atributo === 'sanidade' ? 'checked' : ''}><label for="a2">Sanidade</label></div>
  <label>Tipo</label><div class="seg t"><input type="radio" name="t" id="t1" value="dano" ${tipo === 'dano' ? 'checked' : ''}><label for="t1">Dano</label>
  <input type="radio" name="t" id="t2" value="cura" ${tipo === 'cura' ? 'checked' : ''}><label for="t2" class="l-cura">Cura / Recuperação</label></div>
  <label>Valor</label><div class="valores">${[1, 2, 5, 10].map((v) => `<button type="button" class="btn peq" data-v="${v}">${v}</button>`).join('')}<input type="number" name="v" min="1" max="9999" value="${valor}" inputmode="numeric" required aria-label="Valor"></div>
  <label for="ds">Descrição</label><textarea id="ds" name="d" maxlength="300" placeholder="Ex.: Garra da criatura no ombro / Viu algo impossível no porão"></textarea>
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn sangue">Aplicar</button></div></form>`);
  const f = $('form', m);
  $('#ds', m).focus();
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) f.v.value = b.dataset.v; });
  $('#ds', m).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('.sangue', f); btn.disabled = true;
    try {
      await api(`/api/characters/${c.id}/ajuste`, { method: 'POST', body: { atributo: f.a.value, tipo: f.t.value, valor: f.v.value, descricao: f.d.value } });
      m.fechar();
    } catch (err) { $('.erro', f).textContent = err.message; btn.disabled = false; }
  });
}

function modalPersonagem(c) {
  const novo = !c;
  const m = modal(`<h2>${novo ? 'Novo personagem' : 'Editar ' + esc(c.nome)}</h2><form>
  <label for="pn">Nome</label><input id="pn" name="nome" type="text" maxlength="40" required value="${esc(c?.nome)}">
  ${novo ? '<label for="ps">Senha do personagem</label><input id="ps" name="senha" type="text" minlength="4" maxlength="72" required autocomplete="off">' : ''}
  <div class="linha"><div><label for="pv">Vida máxima</label><input id="pv" name="vm" type="number" min="1" max="9999" required value="${c?.vida_max ?? 20}"></div>
  <div><label for="pz">Sanidade máxima</label><input id="pz" name="sm" type="number" min="1" max="9999" required value="${c?.sanidade_max ?? 20}"></div></div>
  ${novo ? `<div class="linha"><div><label for="pva">Vida inicial</label><input id="pva" name="va" type="number" min="0" max="9999" placeholder="= máxima"></div>
  <div><label for="psa">Sanidade inicial</label><input id="psa" name="sa" type="number" min="0" max="9999" placeholder="= máxima"></div></div>
  <label for="pf">Foto (opcional)</label><input id="pf" name="foto" type="file" accept="image/jpeg,image/png,image/webp">`
    : '<label class="check"><input type="checkbox" name="junto"> Curar junto (ao subir o máximo, o valor atual sobe igual)</label><p class="dica">Subir de nível: aumente os máximos. Diminuir apenas limita o valor atual.</p>'}
  <p class="erro" role="alert"></p><div class="acoes">
  ${novo ? '' : '<button type="button" class="btn fantasma" data-act2="senha">Redefinir senha</button><button type="button" class="btn fantasma" data-act2="excluir">Excluir</button>'}
  <button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn sangue">Salvar</button></div></form>`);
  const f = $('form', m), erro = $('.erro', f);
  f.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act2]')?.dataset.act2;
    if (a === 'senha') { m.fechar(); modalSenha(c); }
    if (a === 'excluir' && confirm(`Excluir "${c.nome}" e todo o histórico? Isso não pode ser desfeito.`)) {
      api(`/api/characters/${c.id}`, { method: 'DELETE' }).then(() => { m.fechar(); toast('Personagem excluído.'); }).catch((er) => { erro.textContent = er.message; });
    }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (novo) {
        const r = await api('/api/characters', { method: 'POST', body: { nome: f.nome.value, senha: f.senha.value, vida_max: f.vm.value, sanidade_max: f.sm.value, vida_atual: f.va.value, sanidade_atual: f.sa.value } });
        m.fechar(); if (f.foto.files[0]) abrirCorte(f.foto.files[0], r.id);
      } else {
        await api(`/api/characters/${c.id}`, { method: 'PATCH', body: { nome: f.nome.value, vida_max: f.vm.value, sanidade_max: f.sm.value, curar_junto: f.junto.checked } });
        m.fechar();
      }
    } catch (er) { erro.textContent = er.message; }
  });
}
function modalSenha(c) {
  const m = modal(`<h2>Nova senha — ${esc(c.nome)}</h2><form><label for="ns">Nova senha</label><input id="ns" type="text" minlength="4" maxlength="72" required autocomplete="off">
  <p class="dica">O jogador será desconectado e precisará entrar com a nova senha.</p><p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn sangue">Redefinir</button></div></form>`);
  $('form', m).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/api/characters/${c.id}/senha`, { method: 'POST', body: { senha: $('#ns', m).value } }); m.fechar(); toast('Senha redefinida.'); }
    catch (er) { $('.erro', m).textContent = er.message; }
  });
}
async function modalHistorico(c) {
  const h = await api(`/api/characters/${c.id}/historico`);
  modal(`<h2>Histórico — ${esc(c.nome)}</h2><ul class="hist">${h.length ? h.map((e) => eventoHtml(e, false)).join('') : '<li class="vazio">Sem registros.</li>'}</ul><div class="acoes"><button class="btn" data-x>Fechar</button></div>`);
}

// ---------- corte circular da foto ----------
function abrirCorte(file, id) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Use uma imagem JPG, PNG ou WEBP.', 'erro');
  if (file.size > 5 * 1024 * 1024) return toast('A imagem passa de 5 MB.', 'erro');
  const url = URL.createObjectURL(file), img = new Image();
  img.onerror = () => { URL.revokeObjectURL(url); toast('Não foi possível ler essa imagem.', 'erro'); };
  img.onload = () => {
    const m = modal(`<h2>Recortar foto</h2><div class="corte"><canvas width="300" height="300"></canvas></div><label for="zm">Zoom</label><input id="zm" type="range" min="1" max="4" step="0.01" value="1">
    <p class="dica">Arraste a imagem para posicionar dentro do círculo.</p><p class="erro" role="alert"></p>
    <div class="acoes"><button class="btn fantasma" data-x>Cancelar</button><button class="btn sangue" id="salvaFoto">Salvar foto</button></div>`);
    const cv = $('canvas', m), ctx = cv.getContext('2d'), base = Math.max(300 / img.width, 300 / img.height);
    let s = 1, ox = 0, oy = 0;
    const clamp = () => { const mx = Math.max(0, (img.width * base * s - 300) / 2), my = Math.max(0, (img.height * base * s - 300) / 2); ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy)); };
    const pinta = (c, size, mascara) => {
      clamp(); const k = size / 300, w = img.width * base * s * k, h = img.height * base * s * k;
      c.clearRect(0, 0, size, size); c.drawImage(img, (size - w) / 2 + ox * k, (size - h) / 2 + oy * k, w, h);
      if (mascara) {
        c.save(); c.fillStyle = 'rgba(0,0,0,.7)'; c.beginPath(); c.rect(0, 0, size, size); c.arc(size / 2, size / 2, size / 2 - 4, 0, 7); c.fill('evenodd'); c.restore();
        c.strokeStyle = '#b30000'; c.lineWidth = 4; c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 4, 0, 7); c.stroke();
      }
    };
    pinta(ctx, 300, true);
    $('#zm', m).addEventListener('input', (e) => { s = Number(e.target.value); pinta(ctx, 300, true); });
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return; const k = 300 / cv.getBoundingClientRect().width;
      ox += (e.clientX - drag.x) * k; oy += (e.clientY - drag.y) * k; drag = { x: e.clientX, y: e.clientY }; pinta(ctx, 300, true);
    });
    cv.addEventListener('pointerup', () => { drag = null; });
    $('#salvaFoto', m).addEventListener('click', async (e) => {
      e.target.disabled = true;
      const out = document.createElement('canvas'); out.width = out.height = 512; pinta(out.getContext('2d'), 512, false);
      out.toBlob(async (blob) => {
        try {
          const fd = new FormData(); fd.append('foto', blob, 'token.webp');
          await api(`/api/characters/${id}/foto`, { method: 'POST', body: fd });
          m.fechar(); toast('Foto atualizada.');
        } catch (er) { $('.erro', m).textContent = er.message; e.target.disabled = false; }
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
  el.innerHTML = `<div><div class="big">−${Math.abs(ev.delta)}</div><div class="tp">${san ? 'SANIDADE' : 'VIDA'}</div><div class="ds">${esc(ev.descricao || 'Sem descrição')}</div></div>`;
  document.body.classList.remove('flash-vida', 'flash-san'); void document.body.offsetWidth;
  document.body.classList.add(san ? 'flash-san' : 'flash-vida');
  app.classList.remove('tremer'); void app.offsetWidth; app.classList.add('tremer');
  clearTimeout(avisoDano.t); avisoDano.t = setTimeout(() => el.classList.remove('on'), 5000);
  if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
}
$('#aviso').addEventListener('click', () => $('#aviso').classList.remove('on'));

// ---------- atualização periódica (no lugar do tempo real) ----------
let timer = null, lastEv = null, ultimo = '', buscando = false;
function conectar() { // linha de base = último evento já carregado, para não perder nem repetir avisos
  if (timer) return; lastEv = Math.max(0, ...(S.me.papel === 'mestre' ? S.feed : S.hist).map((e) => e.id)); ultimo = ''; timer = setInterval(() => { if (!document.hidden) poll(); }, 2500); }
function desconectar() { clearInterval(timer); timer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) poll(); });
async function poll() {
  if (!S.me || !timer || buscando) return;
  buscando = true;
  try {
    const r = await api('/api/sync' + (lastEv === null ? '' : '?ev=' + lastEv));
    if (!S.me) return;
    S.me.config = r.config;
    const mudou = JSON.stringify([r.chars, r.config]);
    let redes = r.eventos.length > 0;
    if (mudou !== ultimo) {
      ultimo = mudou; S.chars = r.chars; redes = true;
      if (S.me.papel === 'jogador' && !S.chars.some((c) => c.id === S.me.id)) { toast('Seu personagem foi removido.', 'erro'); return sair(); }
      const cb = $('#cfgVer'); if (cb) cb.checked = r.config.jogadores_veem_outros;
    }
    for (const e of r.eventos.slice().reverse()) {
      if (S.me.papel === 'mestre') { S.feed.unshift(e); S.feed.length = Math.min(S.feed.length, 100); }
      else { S.hist.unshift(e); if (e.delta < 0) avisoDano(e); else toast(`+${e.delta} de ${NOME[e.atributo]}: ${e.descricao || 'recuperação'}`); }
    }
    lastEv = r.lastEv;
    if (redes) redesenha();
  } catch (e) { if (e.status === 401) { toast('Sua sessão terminou. Entre de novo.', 'erro'); sair(); } } finally { buscando = false; }
}
function redesenha() { if (!S.me) return; if (S.me.papel === 'mestre' && $('#grade')) desenhaMestre(); else if (S.me.papel === 'jogador' && $('#ficha')) desenhaFicha(); }
async function sair() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  S.me = null; S.chars = []; telaHome();
}

// ---------- eventos da interface ----------
let fotoAlvo = null;
const acoes = {
  'ir-mestre': telaLoginMestre,
  'ir-jogador': telaEscolher,
  home: telaHome,
  sair: () => sair(),
  novo: () => modalPersonagem(null),
  escolher: (t) => { const c = [...document.querySelectorAll('.escolha')].find((x) => x === t); telaSenhaJogador(t.dataset.id, $('h3', c).textContent, $('img', c)?.getAttribute('src') || null); },
  editar: (t) => modalPersonagem(S.chars.find((c) => c.id == t.dataset.id)),
  hist: (t) => modalHistorico(S.chars.find((c) => c.id == t.dataset.id)),
  foto: (t) => { fotoAlvo = Number(t.dataset.id); $('#fileFoto').click(); },
  ajustar: (t) => modalAjuste(S.chars.find((c) => c.id == t.dataset.id), t.dataset.a, t.dataset.t || 'dano', 1),
  rapido: (t) => modalAjuste(S.chars.find((c) => c.id == t.dataset.id), t.dataset.a, t.dataset.t, 1),
};
document.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (t && acoes[t.dataset.act]) acoes[t.dataset.act](t); });
$('#fileFoto').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && fotoAlvo) abrirCorte(f, fotoAlvo); });
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'cfgVer') return;
  try { S.me.config = await api('/api/config', { method: 'PUT', body: { jogadores_veem_outros: e.target.checked } }); toast(e.target.checked ? 'Jogadores veem os outros.' : 'Jogadores não veem mais os outros.'); }
  catch (er) { toast(er.message, 'erro'); e.target.checked = !e.target.checked; }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault(); const btn = $('.sangue', f), erro = $('.erro', f); btn.disabled = true; erro.textContent = '';
  try {
    const tipo = f.dataset.form, senha = $('input[type=password]', f).value;
    const r = await api(`/api/login/${tipo}`, { method: 'POST', body: tipo === 'mestre' ? { senha } : { id: Number(f.dataset.id), senha } });
    S.me = await api('/api/me'); return entrar(r);
  } catch (er) { erro.textContent = er.message; btn.disabled = false; }
});
const entrar = () => (S.me.papel === 'mestre' ? telaMestre() : telaFicha()).catch((e) => { toast(e.message, 'erro'); sair(); });

// fagulhas de tocha subindo (decorativo)
(() => {
  const box = $('#fagulhas');
  for (let i = 0; i < 16; i++) {
    const f = document.createElement('i'); f.className = 'fagulha';
    const t = 2 + Math.random() * 3;
    f.style.cssText = `left:${Math.random() * 100}%;width:${t}px;height:${t}px;animation-duration:${8 + Math.random() * 9}s;animation-delay:${-Math.random() * 12}s`;
    box.append(f);
  }
})();

// início: retoma a sessão, se existir; qualquer falha leva à tela inicial (nunca fica "carregando")
api('/api/me').then((me) => { S.me = me; return entrar(); }).catch(() => telaHome());
})();
