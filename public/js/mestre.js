/* Painel do Mestre: Combate, Jogadores, Dados, Monstros, Efeitos, Itens, Histórico e Notas. */
(() => {
'use strict';
const { $, $$, esc, fmt, S, api, comCarga, toast, icone, alquimia, token, chipsEstado, chipEfeito, barra, eventoHtml, pergaminho, divisor, modal, modalAjuste, abrirCorte, carregarTudo, conectar, montar } = window.G;

const ABAS = [['combate', 'Combate'], ['jogadores', 'Jogadores'], ['dados', 'Dados'], ['monstros', 'Monstros'], ['efeitos', 'Efeitos'], ['itens', 'Itens'], ['biblioteca', 'Biblioteca'], ['historico', 'Histórico e Notas']];
const U = { aba: 'combate', alvo: null, qtd: 1, calc: { expr: '1d20', mult: 1, modo: 'normal', res: null }, rolagens: [], sel: {}, filtro: { monstros: 'todos', efeitos: 'todos', itens: 'todos' }, busca: { monstros: '', efeitos: '', itens: '' }, hist: null, histFiltro: 'tudo', notaTag: '', invChar: null, bib: { modo: 'areas', filtro: { areas: 'todos', monstros: 'todos' }, nv: { areas: 0, monstros: 0 }, busca: { areas: '', monstros: '' }, sel: { areas: null, monstros: null }, mapa: {} } };
const MODOS = [['normal', 'Normal'], ['vantagem', 'Vantagem'], ['desvantagem', 'Desvantagem']];
const cartao = (tit, html, id = '') => `<section class="cartao" ${id ? `aria-labelledby="${id}"` : ''}><h3 ${id ? `id="${id}"` : ''}>${tit}</h3>${html}</section>`;
const cab = (t, sub, acoes = '') => `<header class="cab-tela"><div><h2 id="titulo-tela" tabindex="-1">${t}</h2><p>${sub}</p></div><div class="cab-acoes">${acoes}</div></header>${divisor}`;
const vazio = (t) => `<p class="vazio">${t}</p>`;
const sw = (rot, on, attrs, sub = '') => `<button type="button" class="interruptor" role="switch" aria-checked="${!!on}" ${attrs}><span class="trilho"></span><span>${rot}${sub ? `<br><small class="mudo">${sub}</small>` : ''}</span></button>`;
const seg = (lista, atual, m, extra = '') => lista.map(([v, r]) => `<button type="button" data-m="${m}" data-v="${v}" ${extra} aria-pressed="${v === atual}">${r}</button>`).join('');

// ---------- estrutura da janela ----------
async function telaMestre() {
  montar('<p class="carregando">Acendendo as tochas…</p>');
  await carregarTudo();
  const h = location.hash.slice(1); U.aba = ABAS.some((a) => a[0] === h) ? h : 'combate';
  const fontes = [['grimorio', 'Grimório'], ['gotico', 'Gótico'], ['classico', 'Clássico']], fAtual = document.documentElement.dataset.fonte || 'grimorio';
  montar(`<a class="pular" href="#conteudo" data-m="pular">Pular para o conteúdo</a>
  <div class="janela"><i class="prego a"></i><i class="prego b"></i><i class="prego c"></i><i class="prego d"></i>
    <aside class="menu"><div class="alq alq-titulo" style="width:250px;height:250px">${alquimia()}</div><h1>Mesa do Mestre</h1><p class="sub">Painel de comando</p>
      <nav aria-label="Seções do painel"><div class="abas" role="tablist" aria-orientation="vertical">${ABAS.map(([id, n]) => `<button class="aba" role="tab" id="aba-${id}" data-aba="${id}" aria-controls="conteudo">${icone(id === 'historico' ? 'historico' : id)}<span>${n}</span>${id === 'combate' ? '<span class="selo num" id="selo-combate" hidden></span>' : ''}</button>`).join('')}</div></nav>
      <div class="menu-rodape"><div class="interruptor-fonte"><div class="rot" id="rot-fonte">Fonte</div><div class="menu-fontes" role="group" aria-labelledby="rot-fonte">${fontes.map(([v, r]) => `<button data-m="fonte" data-v="${v}" aria-pressed="${v === fAtual}">${r}</button>`).join('')}</div></div>
        <button class="btn fantasma peq" data-m="sair">Sair</button></div></aside>
    ${pergaminho('')}</div>`);
  desenhaAbas(); desenhaTela(); conectar();
}
function desenhaAbas() {
  $$('.aba').forEach((b) => { const on = b.dataset.aba === U.aba; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  const cb = S.combate, selo = $('#selo-combate');
  if (selo && cb) { selo.hidden = !cb.combatentes.length; selo.textContent = cb.ativo ? 'R' + cb.rodada : cb.combatentes.length; }
  const c = $('#conteudo'); if (c) c.setAttribute('aria-labelledby', 'aba-' + U.aba);
}
const assinatura = (el) => {
  if (!el || !el.dataset) return null;
  const p = ['m', 'cid', 'id', 'eid', 'k', 'v', 'a', 'aba'].filter((k) => el.dataset[k] !== undefined).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
  return el.id ? '#' + CSS.escape(el.id) : p ? el.tagName.toLowerCase() + p : null;
};
function desenhaTela(foco = false) {
  const t = $('#tela'); if (!t) return;
  const ativo = document.activeElement, sig = t.contains(ativo) ? assinatura(ativo) : null, ini = ativo?.selectionStart, fim = ativo?.selectionEnd;
  t.innerHTML = TELAS[U.aba]();
  if (foco) { const c = $('#titulo-tela'); if (c) c.focus({ preventScroll: true }); }
  else if (sig) { const el = $(sig, t); if (el) { el.focus({ preventScroll: true }); if (ini != null && el.setSelectionRange) try { el.setSelectionRange(ini, fim); } catch { /* tipo sem seleção */ } } }
  if ((U.aba === 'dados' || U.aba === 'historico') && !U.hist) carregaHist();
}
async function carregaHist() {
  try { U.hist = await api('/api/mesa/historico'); U.rolagens = U.hist.rolagens; if (U.aba === 'dados' || U.aba === 'historico') desenhaTela(); } catch (e) { toast(e.message, 'erro'); }
}
const formEmFoco = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#tela')?.contains(a); };
function redesenhaMestre() { if (!$('#tela')) return; desenhaAbas(); if (!formEmFoco()) desenhaTela(); }
function trocar(aba) { U.aba = aba; if (aba === 'historico') U.hist = null; desenhaAbas(); desenhaTela(true); window.scrollTo({ top: 0 }); }
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if ($('#tela') && ABAS.some((a) => a[0] === h) && h !== U.aba) trocar(h); });

// ---------- Combate ----------
const CHIP_VIDA = (x) => x.vida_atual === 0 ? 'Caído' : x.vida_atual >= x.vida_max ? 'Ileso' : x.vida_atual / x.vida_max <= 0.3 ? 'Crítico' : 'Ferido';
function telaCombate() {
  const cb = S.combate, cs = cb.combatentes;
  const alvo = cs.find((x) => x.cid === U.alvo) || (cb.ativo ? cs[cb.turno] : cs[0]) || null;
  U.alvo = alvo ? alvo.cid : null;
  const acoes = cb.ativo
    ? '<button class="btn ouro" data-m="cb" data-a="proximo">Próximo turno</button><button class="btn perigo" data-m="encerrar">Encerrar combate</button>'
    : `<button class="btn ouro" data-m="cb" data-a="iniciar" ${cs.length ? '' : 'disabled'}>Iniciar combate</button>${cs.length ? '<button class="btn perigo" data-m="encerrar">Limpar</button>' : ''}`;
  const sub = cb.ativo ? `Rodada ${cb.rodada} · vez de ${esc(cs[cb.turno]?.nome || '')}` : 'Monte a ordem dos turnos e comece a luta';
  return cab('Combate', sub, acoes) + `<div class="cols c3">${cartaoOrdem(cb, alvo)}${cartaoAlvo(alvo)}${cartaoCalc(alvo)}</div>`;
}
function cartaoOrdem(cb, alvo) {
  const linhas = cb.combatentes.map((x, i) => {
    const hp = x.vida_atual != null ? barra('vida', x.vida_atual, x.vida_max, x.estados || [], false) : '';
    return `<li><button class="turno ${x.tipo === 'monstro' && x.vida_atual === 0 ? 'morto' : ''}" data-m="alvo" data-cid="${x.cid}" ${cb.ativo && i === cb.turno ? 'aria-current="true"' : ''} aria-pressed="${x.cid === alvo?.cid}">
      <span class="ini num" title="Iniciativa">${x.iniciativa ?? '—'}</span>${token({ foto_url: x.foto_url, tipo: x.tipo, estados: x.estados }, 'pp')}
      <span><span class="nome">${esc(x.nome)}</span><br><span class="tipo">${x.tipo === 'jogador' ? 'Jogador' : 'Monstro'}${x.armadura != null ? ` · armadura ${x.armadura}` : ''}${x.vida_atual != null ? ` · ${x.vida_atual}/${x.vida_max}` : ''}${cb.ativo && i === cb.turno ? ' · <b>vez dele</b>' : ''}</span>
      <span class="mini-hp">${hp}</span>${x.efeitos.length ? `<span class="chips">${x.efeitos.map((e) => chipEfeito(e)).join('')}</span>` : ''}</span></button></li>`;
  }).join('');
  return cartao(`Ordem dos turnos ${cb.ativo ? `<span class="rodada num">Rodada ${cb.rodada}</span>` : ''}`,
    `<div class="cab-acoes" style="margin-bottom:10px"><button class="btn peq" data-m="add">+ Adicionar</button><button class="btn peq" data-m="cb" data-a="rolar_iniciativa">Rolar iniciativa</button></div>
    ${cb.combatentes.length ? `<ol class="ordem">${linhas}</ol>` : vazio('Ninguém na luta ainda. Use “Adicionar” para trazer jogadores e monstros.')}`, 'h-ordem');
}
function cartaoAlvo(x) {
  if (!x) return cartao('Alvo selecionado', vazio('Escolha um combatente na ordem dos turnos.'), 'h-alvo');
  const j = x.tipo === 'jogador';
  const efs = x.efeitos.length ? x.efeitos.map((e) => `<div class="efeito-linha"><span>${chipEfeito(e)}<small class="mudo"> ${e.tipo === 'dano' || e.tipo === 'cura' ? `${e.valor * (e.pilhas || 1)} por turno` : ''}</small></span><button class="btn peq fantasma" data-m="efeito-tirar" data-cid="${x.cid}" data-eid="${e.eid}" aria-label="Remover ${esc(e.nome)}">Remover</button></div>`).join('') : '<p class="mudo">Nenhum efeito ativo.</p>';
  return cartao('Alvo selecionado', `
    <div class="chips" aria-label="Efeitos ativos">${x.efeitos.map((e) => chipEfeito(e)).join('')}</div>
    <div class="alvo-cab">${token({ foto_url: x.foto_url, tipo: x.tipo, estados: x.estados }, 'md')}<div><h4>${esc(x.nome)}</h4><div class="mudo">${j ? 'Jogador' : 'Monstro'}${x.armadura != null ? ` · armadura ${x.armadura}` : ''}</div>${j ? chipsEstado(x) : `<span class="chip vida-${CHIP_VIDA(x).toLowerCase().replace('í', 'i')}">${CHIP_VIDA(x)}</span>`}</div></div>
    ${barra('vida', x.vida_atual, x.vida_max, x.estados || [])}${j ? barra('sanidade', x.sanidade_atual, x.sanidade_max, x.estados || []) : ''}
    <div class="linha"><label class="campo"><span>Quantidade</span><input id="qtd" type="number" min="1" max="99999" value="${U.qtd}" inputmode="numeric"></label>
      ${j ? '<label class="campo"><span>Atributo</span><select id="atr"><option value="vida">Vida</option><option value="sanidade">Sanidade</option></select></label>' : ''}</div>
    <label class="campo"><span>Descrição (opcional)</span><input id="desc" type="text" maxlength="300" placeholder="Ex.: Garra da criatura no ombro" autocomplete="off"></label>
    <div class="acoes esq"><button class="btn perigo" data-m="golpe" data-t="dano">Sofrer dano</button><button class="btn verde" data-m="golpe" data-t="cura">Curar</button></div>
    <div class="linha" style="align-items:end"><label class="campo"><span>Iniciativa</span><input id="ini" type="number" min="-99" max="999" value="${x.iniciativa ?? ''}" inputmode="numeric" placeholder="—"></label><button class="btn peq fantasma" data-m="ini-set" style="flex:0 0 auto">Definir</button></div>
    ${j ? '' : sw('Vida escondida dos jogadores', x.escondida, `data-m="escondida" data-cid="${x.cid}"`, 'Eles veem só Ileso, Ferido ou Crítico')}
    <p class="tit-menor">Efeitos ativos</p>${efs}
    <div class="linha" style="align-items:end"><label class="campo"><span>Aplicar efeito</span><select id="efeito-sel">${S.mesa.efeitos.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select></label>
      <button class="btn peq azul" data-m="efeito-aplicar" style="flex:0 0 auto" ${S.mesa.efeitos.length ? '' : 'disabled'}>Aplicar</button></div>
    <div class="acoes esq"><button class="btn peq fantasma" data-m="remover" data-cid="${x.cid}">Remover do combate</button></div>`, 'h-alvo');
}
function resultadoHtml() {
  const r = U.calc.res;
  if (!r) return `<div class="resultado"><div class="alq">${alquimia()}</div><div class="detalhe">Role os dados para ver o resultado. <b>Só você vê.</b></div></div>`;
  const det = r.partes.map((p) => `${esc(p.termo)}${p.rolls ? ` [${p.rolls.join(', ')}]` : ''}`).join('  ') + (r.mult > 1 ? ` × ${r.mult}` : '') + (r.descartado != null ? ` · descartado ${r.descartado}` : '');
  return `<div class="resultado" aria-live="polite"><div class="alq">${alquimia()}</div><div class="total num ${r.mult > 1 ? 'critico' : ''}">${r.total}</div><div class="detalhe">${esc(r.expr)}${r.modo !== 'normal' ? ' · ' + r.modo : ''} — ${det}</div></div>`;
}
function ataquesProntos() {
  return [...S.mesa.monstros.filter((m) => m.dado_ataque).map((m) => [m.nome, m.dado_ataque]), ...S.mesa.itens.filter((i) => i.dado_dano).map((i) => [i.nome, i.dado_dano])];
}
function controlesDado() {
  return `<div class="linha"><label class="campo"><span>Dado ou expressão</span><input id="expr" type="text" value="${esc(U.calc.expr)}" placeholder="2d6+3" maxlength="60" autocomplete="off" spellcheck="false"></label>
    <div class="campo"><span>Crítico</span><div class="seg ouro" role="group" aria-label="Multiplicador de crítico">${seg([[1, 'Não'], [2, '×2'], [3, '×3']], U.calc.mult, 'mult')}</div></div></div>
    <div class="campo"><span>Rolagem</span><div class="seg ouro" role="group" aria-label="Modo da rolagem">${seg(MODOS, U.calc.modo, 'modo')}</div></div>`;
}
function cartaoCalc(alvo) {
  const hist = U.rolagens.slice(0, 6).map((r) => `<li><span>${esc(r.rotulo || r.expr)}${r.mult > 1 ? ' ×' + r.mult : ''}</span><b class="num">${r.total}</b></li>`).join('');
  return cartao('Calculadora de dano', `<label class="campo"><span>Arma ou habilidade</span><select id="atq"><option value="">Personalizado</option>${ataquesProntos().map(([n, e]) => `<option value="${esc(e)}">${esc(n)} — ${esc(e)}</option>`).join('')}</select></label>
    ${controlesDado()}${resultadoHtml()}
    <div class="acoes esq"><button class="btn ouro" data-m="rolar">Rolar</button><button class="btn perigo" data-m="aplicar-dano" ${U.calc.res && alvo ? '' : 'disabled'}>Aplicar no alvo</button></div>
    <p class="tit-menor">Histórico da rodada</p>${hist ? `<ul class="rol-hist">${hist}</ul>` : '<p class="mudo">Nenhuma rolagem ainda.</p>'}`, 'h-calc');
}

// ---------- Jogadores ----------
function telaJogadores() {
  const cards = S.chars.map((c) => {
    const rap = (a) => `<div class="rapidos"><button class="btn peq perigo" data-m="rapido" data-id="${c.id}" data-a="${a}" data-t="dano" aria-label="Tirar 1 de ${a}">−1</button><button class="btn peq verde" data-m="rapido" data-id="${c.id}" data-a="${a}" data-t="cura" aria-label="Dar 1 de ${a}">+1</button><button class="btn peq fantasma" data-m="ajustar" data-id="${c.id}" data-a="${a}">Ajustar</button></div>`;
    const qi = (S.mesa.inventarios[c.id] || []).reduce((s, i) => s + i.qtd, 0);
    return `<article class="cartao card"><div class="cab">${token(c)}<div><h3>${esc(c.nome)}</h3>${chipsEstado(c)}<small class="mudo">${qi} ${qi === 1 ? 'item' : 'itens'}</small></div></div>
    ${barra('vida', c.vida_atual, c.vida_max, c.estados)}${rap('vida')}${barra('sanidade', c.sanidade_atual, c.sanidade_max, c.estados)}${rap('sanidade')}
    <div class="card-foot"><button class="btn peq" data-m="editar-char" data-id="${c.id}">Editar</button><button class="btn peq" data-m="foto" data-id="${c.id}">Foto</button><button class="btn peq" data-m="hist-char" data-id="${c.id}">Histórico</button><button class="btn peq azul" data-m="add-combate-char" data-id="${c.id}">Combate</button><button class="btn peq ouro" data-m="itens-de" data-id="${c.id}">Itens</button></div></article>`;
  }).join('');
  return cab('Jogadores', 'A mesa, as fichas e as contas dos aventureiros', '<button class="btn ouro" data-m="novo-char">+ Personagem</button>')
    + sw('Jogadores podem ver a vida e a sanidade dos outros', S.me.config.jogadores_veem_outros, 'data-m="cfg-ver"')
    + `<div class="grade" style="margin-top:14px">${cards || vazio('Nenhum personagem. Crie o primeiro!')}</div>`;
}

// ---------- Dados ----------
function telaDados() {
  const prontos = ataquesProntos();
  const hist = U.rolagens.slice(0, 40).map((r) => `<li><span>${esc(r.rotulo ? r.rotulo + ' · ' : '')}${esc(r.expr)}${r.mult > 1 ? ' ×' + r.mult : ''}${r.modo !== 'normal' ? ' (' + r.modo + ')' : ''}<br><small class="mudo">${fmt(r.criado_em)}</small></span><b class="num">${r.total}</b></li>`).join('');
  return cab('Dados', 'Rolagens que só o mestre vê', '')
    + `<div class="cols c2">${cartao('Rolar', `<div class="dados-atalhos" role="group" aria-label="Dados rápidos">${[4, 6, 8, 10, 12, 20, 100].map((n) => `<button class="btn" data-m="dado" data-v="${n}">d${n}</button>`).join('')}</div>${controlesDado()}${resultadoHtml()}
      <div class="acoes esq"><button class="btn ouro" data-m="rolar">Rolar</button></div>`, 'h-rolar')}
    <div style="display:grid;gap:18px">${cartao('Ataques prontos', prontos.length ? `<ul class="rol-hist">${prontos.map(([n, e]) => `<li><span>${esc(n)}<br><small class="mudo">${esc(e)}</small></span><button class="btn peq ouro" data-m="rolar-expr" data-v="${esc(e)}" data-k="${esc(n)}">Rolar</button></li>`).join('')}</ul>` : vazio('Cadastre monstros e itens com dado de dano.'), 'h-prontos')}
    ${cartao('Histórico de rolagens', hist ? `<ul class="rol-hist" style="max-height:340px">${hist}</ul>` : vazio('Nenhuma rolagem ainda.'), 'h-rh')}</div></div>`;
}

// ---------- catálogos: Monstros, Efeitos, Itens (lista + editor) ----------
const TIPOS_MON = [['chefe', 'Chefe'], ['goblin', 'Goblin'], ['morto-vivo', 'Morto-vivo'], ['besta', 'Besta'], ['humanoide', 'Humanoide'], ['elemental', 'Elemental'], ['demônio', 'Demônio'], ['dragão', 'Dragão'], ['construto', 'Construto'], ['aberração', 'Aberração'], ['planta', 'Planta'], ['fada', 'Fada'], ['outro', 'Outro']];
const CAT = {
  monstros: {
    titulo: 'Monstros', sub: 'Bestiário do mestre', um: 'monstro', filtroK: 'tipo', filtros: [['todos', 'Todos'], ...TIPOS_MON],
    linha: (x) => `<b>${esc(x.nome)}</b><small>${esc(TIPOS_MON.find((t) => t[0] === x.tipo)?.[1] || x.tipo)} · vida ${x.vida_max} · armadura ${x.armadura}${x.dado_ataque ? ' · ' + esc(x.dado_ataque) : ''}</small>`,
    novo: { nome: '', tipo: 'goblin', vida_max: 10, armadura: 10, iniciativa: 0, dado_ataque: '', habilidades: '', notas: '', vida_escondida: false },
    campos: [['nome', 'Nome', 'texto', { max: 40 }], ['tipo', 'Tipo', 'sel', { op: TIPOS_MON }], ['vida_max', 'Vida máxima', 'num', { min: 1, max: 99999 }], ['armadura', 'Armadura', 'num', { min: 0, max: 99 }], ['iniciativa', 'Bônus de iniciativa', 'num', { min: -20, max: 50 }], ['dado_ataque', 'Dado de ataque', 'texto', { ph: 'Ex.: 1d6+3', max: 60 }], ['habilidades', 'Habilidades', 'area', { max: 1000 }], ['notas', 'Notas do mestre', 'area', { max: 1000 }], ['vida_escondida', 'Vida escondida dos jogadores', 'sw']],
  },
  efeitos: {
    titulo: 'Efeitos', sub: 'Criador de status: venenos, bênçãos, maldições', um: 'efeito', filtroK: 'tipo', filtros: [['todos', 'Todos'], ['dano', 'Dano'], ['cura', 'Cura'], ['bonus', 'Buff'], ['controle', 'Controle']],
    linha: (x) => `<b>${esc(x.nome)}</b><small>${{ dano: 'Dano', cura: 'Cura', bonus: 'Buff', controle: 'Controle' }[x.tipo]}${x.valor ? ' · ' + x.valor + ' por turno' : ''} · ${x.duracao} ${x.duracao === 1 ? 'turno' : 'turnos'}</small>`,
    novo: { nome: '', tipo: 'dano', valor: 2, duracao: 3, dano_tipo: '', descricao: '', acumula: false, termina_cura: false, visivel: true },
    campos: [['nome', 'Nome', 'texto', { max: 40 }], ['tipo', 'Tipo', 'sel', { op: [['dano', 'Dano por turno'], ['cura', 'Cura por turno'], ['bonus', 'Bônus (buff)'], ['controle', 'Controle']] }], ['valor', 'Valor por turno', 'num', { min: 0, max: 9999 }], ['duracao', 'Duração (turnos)', 'num', { min: 1, max: 99 }], ['dano_tipo', 'Tipo de dano', 'texto', { ph: 'Ex.: fogo, gelo, veneno', max: 30 }], ['descricao', 'Descrição', 'area', { max: 300 }], ['acumula', 'Acumula (empilha)', 'sw'], ['termina_cura', 'Termina ao receber cura', 'sw'], ['visivel', 'Visível para os jogadores', 'sw']],
  },
  itens: {
    titulo: 'Itens', sub: 'Tesouros, armas e poções da campanha', um: 'item', filtroK: 'tipo', filtros: [['todos', 'Todos'], ['arma', 'Armas'], ['armadura', 'Armaduras'], ['consumível', 'Consumíveis'], ['mágico', 'Mágicos'], ['tesouro', 'Tesouros']],
    linha: (x) => `<b>${esc(x.nome)}</b><small>${esc(x.tipo)}${x.dado_dano ? ' · ' + esc(x.dado_dano) : ''}${x.bonus ? ' · ' + esc(x.bonus) : ''}</small>`,
    novo: { nome: '', tipo: 'arma', dado_dano: '', bonus: '', efeitos: '', descricao: '' },
    campos: [['nome', 'Nome', 'texto', { max: 40 }], ['tipo', 'Tipo', 'sel', { op: [['arma', 'Arma'], ['armadura', 'Armadura'], ['consumível', 'Consumível'], ['mágico', 'Mágico'], ['tesouro', 'Tesouro'], ['outro', 'Outro']] }], ['dado_dano', 'Dado de dano', 'texto', { ph: 'Ex.: 1d8', max: 60 }], ['bonus', 'Bônus', 'texto', { ph: 'Ex.: +1 armadura', max: 30 }], ['efeitos', 'Efeitos', 'texto', { max: 200 }], ['descricao', 'Descrição', 'area', { max: 400 }]],
  },
};
function campoHtml([k, rot, t, o = {}], v) {
  const id = 'f-' + k;
  if (t === 'sw') return sw(rot, v, `data-m="sw" data-k="${k}"`);
  const ent = t === 'texto' ? `<input id="${id}" type="text" name="${k}" value="${esc(v)}" maxlength="${o.max || 60}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} autocomplete="off">`
    : t === 'num' ? `<input id="${id}" type="number" name="${k}" value="${esc(v)}" min="${o.min}" max="${o.max}" inputmode="numeric">`
    : t === 'area' ? `<textarea id="${id}" name="${k}" maxlength="${o.max || 500}">${esc(v)}</textarea>`
    : `<select id="${id}" name="${k}">${o.op.map(([a, b]) => `<option value="${esc(a)}" ${a === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  return `<label class="campo" for="${id}"><span>${rot}</span>${ent}</label>`;
}
function telaCatalogo(kind) {
  const C = CAT[kind], lista = S.mesa[kind], f = U.filtro[kind], b = U.busca[kind].toLowerCase();
  const vis = lista.filter((x) => (f === 'todos' || x[C.filtroK] === f) && (!b || x.nome.toLowerCase().includes(b)));
  let sel = U.sel[kind]; if (sel == null) sel = lista[0]?.id ?? 'novo';
  const atual = sel === 'novo' ? null : lista.find((x) => x.id === sel); if (!atual) sel = 'novo';
  U.sel[kind] = sel;
  const dados = atual || C.novo;
  const esq = cartao(C.titulo, `<label class="so-leitor" for="busca-${kind}">Buscar</label><input class="busca" id="busca-${kind}" type="search" value="${esc(U.busca[kind])}" placeholder="Buscar…" autocomplete="off">
    <div class="filtros" role="group" aria-label="Filtros">${C.filtros.map(([v, r]) => `<button data-m="cat-filtro" data-k="${kind}" data-v="${v}" aria-pressed="${v === f}">${r}</button>`).join('')}</div>
    <ul class="lista">${vis.map((x) => `<li><button class="item" data-m="cat-sel" data-k="${kind}" data-id="${x.id}" aria-current="${x.id === sel}">${C.linha(x)}</button></li>`).join('') || `<li class="vazio">Nada encontrado.</li>`}</ul>
    <div class="acoes esq"><button class="btn ouro" data-m="cat-novo" data-k="${kind}">+ Novo ${C.um}</button></div>`, 'h-lista');
  const dir = cartao(atual ? `Editar: ${esc(atual.nome)}` : `Novo ${C.um}`, `<form data-cat="${kind}" novalidate>${C.campos.map((c) => campoHtml(c, dados[c[0]])).join('')}<p class="erro" role="alert"></p>
    <div class="acoes"><button type="submit" class="btn ouro">${atual ? 'Salvar alterações' : 'Criar'}</button>${atual ? `<button type="button" class="btn perigo" data-m="cat-excluir" data-k="${kind}" data-id="${atual.id}">Excluir</button>` : ''}</div></form>${atual ? extras(kind, atual) : ''}`, 'h-editor');
  return cab(C.titulo, C.sub) + `<div class="cols c2">${esq}${dir}</div>` + (kind === 'itens' ? inventarioCartao() : '');
}
function extras(kind, x) {
  const cs = S.combate.combatentes;
  if (kind === 'monstros') return `${divisor}<p class="tit-menor">Invocar</p><div class="linha" style="align-items:end"><label class="campo"><span>Quantidade</span><input id="inv-q" type="number" min="1" max="20" value="1" inputmode="numeric"></label><button class="btn azul" data-m="invocar" data-id="${x.id}" style="flex:0 0 auto">Invocar no combate</button></div>`;
  if (kind === 'efeitos') {
    const k = x.dano_tipo === 'gelo' ? 'gelo' : x.tipo;
    return `${divisor}<p class="tit-menor">Prévia (acima do nome do monstro)</p><div class="previa"><div class="chips" style="justify-content:center"><span class="chip ${k === 'bonus' ? 'buff' : k}">${icone(k)}${esc(x.nome)} · ${x.duracao}t</span></div><div class="nm">Goblin 1</div></div>
      <p class="tit-menor">Aplicar em</p><div class="linha" style="align-items:end"><label class="campo"><span>Combatente</span><select id="ap-alvo">${cs.map((c) => `<option value="${c.cid}" ${c.cid === U.alvo ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <button class="btn azul" data-m="aplicar-efeito-cat" data-id="${x.id}" style="flex:0 0 auto" ${cs.length ? '' : 'disabled'}>Aplicar</button></div>${cs.length ? '' : '<p class="dica">Adicione combatentes na aba Combate.</p>'}`;
  }
  return `${divisor}<p class="tit-menor">Entregar a um jogador</p><div class="linha" style="align-items:end"><label class="campo"><span>Jogador</span><select id="ent-char">${S.chars.map((c) => `<option value="${c.id}" ${c.id === U.invChar ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
    <label class="campo" style="flex:0 0 90px"><span>Qtd</span><input id="ent-q" type="number" min="1" max="99" value="1" inputmode="numeric"></label><button class="btn ouro" data-m="entregar" data-id="${x.id}" style="flex:0 0 auto" ${S.chars.length ? '' : 'disabled'}>Entregar</button></div>`;
}
function inventarioCartao() {
  if (!S.chars.length) return '';
  const id = S.chars.some((c) => c.id === U.invChar) ? U.invChar : S.chars[0].id, inv = S.mesa.inventarios[id] || [];
  return `<div style="margin-top:18px">${cartao('Inventário dos jogadores', `<label class="campo"><span>Jogador</span><select id="inv-char">${S.chars.map((c) => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
    ${inv.length ? `<div class="inv" style="margin-top:12px">${inv.map((i) => `<div class="slot"><span class="qtd num">${i.qtd}</span><b>${esc(i.nome)}</b><small>${esc(i.tipo)}${i.dado_dano ? ' · ' + esc(i.dado_dano) : ''}${i.bonus ? ' · ' + esc(i.bonus) : ''}</small><button class="btn peq fantasma bloco" data-m="recolher" data-id="${i.id}" data-k="${id}">Recolher 1</button></div>`).join('')}</div>` : vazio('Inventário vazio.')}`, 'h-inv')}</div>`;
}

// ---------- Histórico e Notas ----------
const FILTROS_H = [['tudo', 'Tudo'], ['dano', 'Dano'], ['cura', 'Cura'], ['rolagem', 'Rolagens'], ['combate', 'Combate']];
function itensHistorico() {
  const h = U.hist; if (!h) return [];
  const fmtR = (r) => `<li class="ev rolagem"><span class="marca"></span><time datetime="${esc(r.criado_em)}">${fmt(r.criado_em)}</time><div><b>${esc(r.rotulo ? r.rotulo + ' · ' : '')}${esc(r.expr)}${r.mult > 1 ? ' ×' + r.mult : ''} = ${r.total}</b>${r.modo !== 'normal' ? ` <span class="de">(${r.modo})</span>` : ''}</div></li>`;
  const fmtD = (d) => `<li class="ev ${d.tipo}"><span class="marca"></span><time datetime="${esc(d.criado_em)}">${fmt(d.criado_em)}</time><div>${esc(d.texto)}</div></li>`;
  return [...h.eventos.map((e) => ({ k: e.delta < 0 ? 'dano' : 'cura', t: e.criado_em, html: eventoHtml(e, true) })), ...h.rolagens.map((r) => ({ k: 'rolagem', t: r.criado_em, html: fmtR(r) })), ...h.diario.map((d) => ({ k: 'combate', t: d.criado_em, html: fmtD(d) }))]
    .sort((a, b) => (a.t < b.t ? 1 : -1));
}
function telaHistorico() {
  const itens = itensHistorico().filter((x) => U.histFiltro === 'tudo' || x.k === U.histFiltro).slice(0, 150);
  const notas = S.mesa.notas, tags = [...new Set(notas.flatMap((n) => n.etiquetas))];
  const vis = notas.filter((n) => !U.notaTag || n.etiquetas.includes(U.notaTag)).slice().reverse();
  return cab('Histórico e Notas', 'O registro da sessão e as anotações do mestre', '<button class="btn ouro" data-m="nota-nova">+ Nota</button>')
    + `<div class="cols c2">${cartao('Histórico da sessão', `<div class="filtros" role="group" aria-label="Filtrar histórico">${FILTROS_H.map(([v, r]) => `<button data-m="hist-filtro" data-v="${v}" aria-pressed="${v === U.histFiltro}">${r}</button>`).join('')}</div>
      ${U.hist ? `<ul class="hist">${itens.map((x) => x.html).join('') || '<li class="vazio">Nada registrado ainda.</li>'}</ul>` : '<p class="vazio">Carregando o registro…</p>'}`, 'h-hist')}
    ${cartao('Notas do mestre', `${tags.length ? `<div class="filtros" role="group" aria-label="Filtrar por etiqueta"><button data-m="nota-tag" data-v="" aria-pressed="${!U.notaTag}">Todas</button>${tags.map((t) => `<button data-m="nota-tag" data-v="${esc(t)}" aria-pressed="${t === U.notaTag}">${esc(t)}</button>`).join('')}</div>` : ''}
      ${vis.length ? vis.map((n) => `<article class="nota cartao" style="margin-bottom:10px"><h4>${esc(n.titulo)}</h4><div class="chips">${n.etiquetas.map((t) => `<span class="chip estado">${esc(t)}</span>`).join('')}</div><p>${esc(n.texto)}</p>
        <div class="acoes esq"><button class="btn peq" data-m="nota-edit" data-id="${n.id}">Editar</button><button class="btn peq fantasma" data-m="nota-del" data-id="${n.id}">Apagar</button></div></article>`).join('') : vazio('Nenhuma nota. Anote ganchos, nomes e segredos da campanha.')}`, 'h-notas')}</div>`;
}

// ---------- Biblioteca: áreas e monstros prontos, com mapas ----------
const BIB = () => window.BIBLIOTECA;
const mapasDe = (bioma) => (window.BIBLIOTECA_MAPAS || []).filter((m) => m.bioma === bioma);
const rotBib = (v) => (v === 'todos' ? 'Todos' : v.charAt(0).toUpperCase() + v.slice(1));
const sinal = (n) => (n > 0 ? '+' + n : String(n));
function mapaDaArea(a) {
  const ms = mapasDe(a.bioma); if (!ms.length) return null;
  const i = BIB().areas.filter((x) => x.bioma === a.bioma).findIndex((x) => x.nome === a.nome);
  return ms.find((m) => m.id === U.bib.mapa[a.nome]) || ms[i % ms.length]; // cada área começa com um mapa do seu tipo de lugar; dá para trocar
}
function bibVisiveis() {
  const b = U.bib, m = b.modo, lista = BIB()[m], chave = m === 'areas' ? 'bioma' : 'tipo', f = b.filtro[m], nv = b.nv[m], q = b.busca[m].toLowerCase();
  return { lista, chave, vis: lista.filter((x) => (f === 'todos' || x[chave] === f) && (!nv || x.nv === nv) && (!q || x.nome.toLowerCase().includes(q))) };
}
// traz um monstro da biblioteca para o bestiário (se ainda não estiver) e devolve o id dele
async function garantirMonstro(nome) {
  const lib = window.BIBLIOTECA.monstros.find((x) => x.nome === nome); if (!lib) throw new Error(`“${nome}” não está na biblioteca.`);
  const ja = S.mesa.monstros.find((x) => x.nome.toLowerCase() === nome.toLowerCase()); if (ja) return ja.id;
  const r = await cadastro('POST', 'monstros', null, { nome: lib.nome, tipo: lib.tipo, vida_max: lib.vida_max, armadura: lib.armadura, iniciativa: lib.iniciativa, dado_ataque: lib.dado_ataque, habilidades: lib.habilidades, notas: `Ameaça ${lib.nv} (biblioteca)`, vida_escondida: lib.vida_escondida });
  return r.id;
}
async function usarNoCombate(nome, qtd, btn) {
  try { const id = await comCarga(btn, () => garantirMonstro(nome)); const r = await cmb('adicionar', { tipo: 'monstro', ref: id, quantidade: qtd }); if (r) toast(`${nome} entrou no combate.`); } catch (e) { toast(e.message, 'erro'); }
}
function detalheMonstroBib(x) {
  const ja = S.mesa.monstros.some((y) => y.nome.toLowerCase() === x.nome.toLowerCase());
  return cartao(esc(x.nome), `<div class="chips"><span class="chip estado">${esc(rotBib(x.tipo))}</span><span class="chip buff">Ameaça ${x.nv}</span>${x.vida_escondida ? '<span class="chip controle">Vida escondida</span>' : ''}</div>
    <div class="stats4"><div><b class="num">${x.vida_max}</b><span>Vida</span></div><div><b class="num">${x.armadura}</b><span>Armadura</span></div><div><b class="num">${sinal(x.iniciativa)}</b><span>Iniciativa</span></div><div><b>${esc(x.dado_ataque)}</b><span>Ataque</span></div></div>
    <p class="tit-menor">Habilidades</p><p>${esc(x.habilidades)}</p>
    <div class="linha" style="align-items:end"><label class="campo"><span>Quantidade</span><input id="bib-qtd" type="number" min="1" max="20" value="1" inputmode="numeric"></label><button class="btn perigo" data-m="bib-usar" data-id="${esc(x.nome)}" style="flex:0 0 auto">Usar no combate</button></div>
    <div class="acoes esq"><button class="btn peq ${ja ? 'fantasma' : 'ouro'}" data-m="bib-add" data-id="${esc(x.nome)}" ${ja ? 'disabled' : ''}>${ja ? 'Já está no seu bestiário' : 'Adicionar ao meu bestiário'}</button></div>`, 'h-bibd');
}
function detalheAreaBib(a) {
  const mapa = mapaDaArea(a), ms = mapasDe(a.bioma);
  const encs = a.enc.map((n) => { const m = BIB().monstros.find((x) => x.nome === n); return `<li class="efeito-linha"><span><b>${esc(n)}</b>${m ? ` <small class="mudo">ameaça ${m.nv} · vida ${m.vida_max}</small>` : ''}</span><button class="btn peq azul" data-m="bib-usar" data-id="${esc(n)}">Usar</button></li>`; }).join('');
  return cartao(esc(a.nome), `<div class="chips"><span class="chip estado">${esc(a.bioma)}</span><span class="chip buff">Nível ${a.nv}</span></div>
    ${mapa ? `<figure class="mapa"><a href="${esc(mapa.arquivo)}" target="_blank" rel="noopener" aria-label="Abrir o mapa em tamanho grande"><img src="${esc(mapa.arquivo)}" alt="Mapa de referência: ${esc(mapa.titulo)}" loading="lazy"></a>
      <figcaption>${esc(mapa.titulo)} — ${esc(mapa.autor)}, ${esc(mapa.licenca)}. <a href="${esc(mapa.pagina)}" target="_blank" rel="noopener">Fonte</a></figcaption></figure>
      ${ms.length > 1 ? `<div class="miniaturas" role="group" aria-label="Outros mapas deste tipo de lugar">${ms.map((x) => `<button data-m="bib-mapa" data-id="${esc(a.nome)}" data-k="${esc(x.id)}" aria-pressed="${x.id === mapa.id}" aria-label="${esc(x.titulo)}"><img src="${esc(x.arquivo)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}` : ''}
    <p>${esc(a.desc)}</p><p class="tit-menor">Encontros sugeridos</p><ul class="lista-simples">${encs}</ul>
    <div class="acoes esq"><button class="btn perigo" data-m="bib-encontro" data-id="${esc(a.nome)}">Invocar encontro completo</button><button class="btn peq" data-m="bib-nota" data-id="${esc(a.nome)}">Salvar como nota</button></div>
    <p class="tit-menor">Gancho de aventura</p><p>${esc(a.gancho)}</p>
    <p class="dica">Quer um mapa de batalha? <a href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent('battle map ' + a.nome)}" target="_blank" rel="noopener">Procurar na internet</a></p>`, 'h-bibd');
}
function telaBiblioteca() {
  const b = U.bib, m = b.modo, { lista, chave, vis } = bibVisiveis(), f = b.filtro[m];
  const sel = vis.find((x) => x.nome === b.sel[m]) || vis[0] || null; b.sel[m] = sel ? sel.nome : null;
  const opcoes = ['todos', ...new Set(lista.map((x) => x[chave]))];
  const esq = cartao(m === 'areas' ? 'Áreas' : 'Monstros', `<div class="seg ouro" role="group" aria-label="Tipo de biblioteca" style="margin-bottom:10px">${seg([['areas', 'Áreas'], ['monstros', 'Monstros']], m, 'bib-modo')}</div>
    <label class="so-leitor" for="bib-busca">Buscar</label><input class="busca" id="bib-busca" type="search" value="${esc(b.busca[m])}" placeholder="Buscar…" autocomplete="off">
    <label class="campo" style="margin:0 0 8px"><span>${m === 'areas' ? 'Nível sugerido' : 'Ameaça'}</span><select id="bib-nv"><option value="0">Todos</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${b.nv[m] === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
    <div class="filtros" role="group" aria-label="Filtros">${opcoes.map((v) => `<button data-m="bib-filtro" data-v="${esc(v)}" aria-pressed="${v === f}">${esc(rotBib(v))}</button>`).join('')}</div>
    <p class="mudo" style="margin:0 0 6px">${vis.length} de ${lista.length}</p>
    <ul class="lista">${vis.map((x) => `<li><button class="item" data-m="bib-sel" data-id="${esc(x.nome)}" aria-current="${!!sel && x.nome === sel.nome}"><b>${esc(x.nome)}</b><small>${m === 'areas' ? `${esc(x.bioma)} · nível ${x.nv}` : `${esc(rotBib(x.tipo))} · ameaça ${x.nv} · vida ${x.vida_max}`}</small></button></li>`).join('') || '<li class="vazio">Nada encontrado.</li>'}</ul>`, 'h-bib');
  const dir = sel ? (m === 'areas' ? detalheAreaBib(sel) : detalheMonstroBib(sel)) : cartao('Detalhes', vazio('Escolha um item da lista.'), 'h-bibd');
  return cab('Biblioteca', `${BIB().areas.length} áreas e ${BIB().monstros.length} monstros prontos para usar, com mapas de referência`, `<button class="btn ouro" data-m="bib-sortear">Sortear ${m === 'areas' ? 'área' : 'monstro'}</button>`) + `<div class="cols c2">${esq}${dir}</div>`;
}

const TELAS = { biblioteca: telaBiblioteca, combate: telaCombate, jogadores: telaJogadores, dados: telaDados, monstros: () => telaCatalogo('monstros'), efeitos: () => telaCatalogo('efeitos'), itens: () => telaCatalogo('itens'), historico: telaHistorico };

// ---------- ações ----------
async function cmb(acao, extra = {}, btn) {
  try { const r = await comCarga(btn, () => api('/api/combate', { method: 'POST', body: { acao, ...extra } })); S.combate = r.combate; desenhaAbas(); desenhaTela(); return r; } catch (e) { toast(e.message, 'erro'); return null; }
}
const alvoAtual = () => S.combate.combatentes.find((x) => x.cid === U.alvo);
async function rolar(expr, rotulo, btn) {
  try {
    const r = await comCarga(btn, () => api('/api/dados', { method: 'POST', body: { expr, mult: U.calc.mult, modo: U.calc.modo, rotulo } }));
    U.calc.res = r; U.rolagens.unshift(r); desenhaTela();
  } catch (e) { toast(e.message, 'erro'); }
}
async function cadastro(metodo, kind, id, body) {
  const r = await api(`/api/${kind}${id ? '/' + id : ''}`, { method: metodo, body });
  const lista = S.mesa[kind];
  if (metodo === 'POST') lista.push(r); else if (metodo === 'PATCH') Object.assign(lista.find((x) => x.id === id), r); else S.mesa[kind] = lista.filter((x) => x.id !== id);
  return r;
}
function lerForm(f, kind) {
  const o = {};
  for (const [k, , t] of CAT[kind].campos) o[k] = t === 'sw' ? $(`[data-k="${k}"]`, f).getAttribute('aria-checked') === 'true' : f.elements[k].value;
  return o;
}

const A = {
  'bib-modo': (t) => { U.bib.modo = t.dataset.v; desenhaTela(); },
  'bib-filtro': (t) => { U.bib.filtro[U.bib.modo] = t.dataset.v; desenhaTela(); },
  'bib-sel': (t) => { U.bib.sel[U.bib.modo] = t.dataset.id; desenhaTela(); },
  'bib-mapa': (t) => { U.bib.mapa[t.dataset.id] = t.dataset.k; desenhaTela(); },
  'bib-sortear': () => { const { vis } = bibVisiveis(); if (vis.length) { U.bib.sel[U.bib.modo] = vis[Math.floor(Math.random() * vis.length)].nome; desenhaTela(); } },
  'bib-add': async (t) => { try { await comCarga(t, () => garantirMonstro(t.dataset.id)); desenhaTela(); toast('Adicionado ao seu bestiário.'); } catch (e) { toast(e.message, 'erro'); } },
  'bib-usar': (t) => usarNoCombate(t.dataset.id, Number($('#bib-qtd')?.value) || 1, t),
  'bib-encontro': async (t) => {
    const a = BIB().areas.find((x) => x.nome === t.dataset.id);
    try { await comCarga(t, async () => { for (const n of a.enc) { const id = await garantirMonstro(n); const r = await api('/api/combate', { method: 'POST', body: { acao: 'adicionar', tipo: 'monstro', ref: id, quantidade: 1 } }); S.combate = r.combate; } }); desenhaAbas(); toast(`Encontro de “${a.nome}” no combate.`); } catch (e) { toast(e.message, 'erro'); }
  },
  'bib-nota': async (t) => {
    const a = BIB().areas.find((x) => x.nome === t.dataset.id);
    try { await comCarga(t, () => cadastro('POST', 'notas', null, { titulo: a.nome, texto: `${a.desc}\n\nEncontros: ${a.enc.join(', ')}\nGancho: ${a.gancho}`, etiquetas: [a.bioma, 'Área'] })); toast('Salvo nas suas notas.'); } catch (e) { toast(e.message, 'erro'); }
  },
  pular: () => { const c = $('#titulo-tela'); if (c) c.focus(); },
  sair: () => window.G.sair(),
  fonte: (t) => { document.documentElement.dataset.fonte = t.dataset.v; try { localStorage.setItem('fonte', t.dataset.v); } catch { /* sem armazenamento */ } $$('[data-m=fonte]').forEach((b) => b.setAttribute('aria-pressed', b === t)); },
  cb: (t) => cmb(t.dataset.a, {}, t),
  encerrar: (t) => { if (confirm('Encerrar o combate? A ordem dos turnos será limpa.')) cmb('encerrar', {}, t); },
  alvo: (t) => { U.alvo = Number(t.dataset.cid); desenhaTela(); },
  add: () => modalAddCombate(),
  golpe: (t) => {
    const x = alvoAtual(); if (!x) return;
    const v = Number($('#qtd').value); if (!Number.isInteger(v) || v < 1) return toast('Informe uma quantidade de 1 ou mais.', 'erro');
    U.qtd = v; cmb(t.dataset.t, { cid: x.cid, valor: v, descricao: $('#desc').value, atributo: $('#atr')?.value }, t);
  },
  'ini-set': (t) => { const x = alvoAtual(); if (x) cmb('iniciativa', { cid: x.cid, valor: $('#ini').value }, t); },
  escondida: (t) => cmb('vida_escondida', { cid: Number(t.dataset.cid), valor: t.getAttribute('aria-checked') !== 'true' }),
  remover: (t) => cmb('remover', { cid: Number(t.dataset.cid) }, t),
  'efeito-aplicar': (t) => { const x = alvoAtual(); if (x) cmb('efeito', { cid: x.cid, efeito_id: Number($('#efeito-sel').value) }, t); },
  'efeito-tirar': (t) => cmb('tirar_efeito', { cid: Number(t.dataset.cid), eid: Number(t.dataset.eid) }, t),
  mult: (t) => { U.calc.mult = Number(t.dataset.v); desenhaTela(); },
  modo: (t) => { U.calc.modo = t.dataset.v; desenhaTela(); },
  rolar: (t) => { U.calc.expr = $('#expr').value; rolar(U.calc.expr, alvoAtual()?.nome || '', t); },
  dado: (t) => { U.calc.expr = '1d' + t.dataset.v; rolar(U.calc.expr, '', t); },
  'rolar-expr': (t) => { U.calc.expr = t.dataset.v; rolar(t.dataset.v, t.dataset.k, t); },
  'aplicar-dano': (t) => { const x = alvoAtual(), r = U.calc.res; if (!x || !r) return; if (r.total < 1) return toast('O resultado precisa ser 1 ou mais.', 'erro'); cmb('dano', { cid: x.cid, valor: r.total, descricao: `${r.rotulo ? r.rotulo + ' · ' : ''}${r.expr}` }, t); },
  'cfg-ver': async (t) => {
    const novo = t.getAttribute('aria-checked') !== 'true';
    try { S.me.config = await api('/api/config', { method: 'PUT', body: { jogadores_veem_outros: novo } }); desenhaTela(); toast(novo ? 'Jogadores veem os outros.' : 'Jogadores não veem mais os outros.'); } catch (e) { toast(e.message, 'erro'); }
  },
  'novo-char': () => modalPersonagem(null),
  'editar-char': (t) => modalPersonagem(S.chars.find((c) => c.id == t.dataset.id)),
  'hist-char': (t) => modalHistChar(S.chars.find((c) => c.id == t.dataset.id)),
  'add-combate-char': (t) => cmb('adicionar', { tipo: 'jogador', ref: Number(t.dataset.id) }, t).then((r) => { if (r) toast('Adicionado ao combate.'); }),
  'itens-de': (t) => { U.invChar = Number(t.dataset.id); location.hash = 'itens'; },
  rapido: (t) => modalAjuste(S.chars.find((c) => c.id == t.dataset.id), t.dataset.a, t.dataset.t, 1),
  ajustar: (t) => modalAjuste(S.chars.find((c) => c.id == t.dataset.id), t.dataset.a, 'dano', 1),
  foto: (t) => window.G.pedirFoto(Number(t.dataset.id)),
  sw: (t) => t.setAttribute('aria-checked', t.getAttribute('aria-checked') !== 'true'),
  'cat-filtro': (t) => { U.filtro[t.dataset.k] = t.dataset.v; desenhaTela(); },
  'cat-sel': (t) => { U.sel[t.dataset.k] = Number(t.dataset.id); desenhaTela(); },
  'cat-novo': (t) => { U.sel[t.dataset.k] = 'novo'; desenhaTela(); const i = $('#f-nome'); if (i) i.focus(); },
  'cat-excluir': async (t) => {
    const k = t.dataset.k, id = Number(t.dataset.id), x = S.mesa[k].find((y) => y.id === id);
    if (!confirm(`Excluir “${x.nome}”? Isso não pode ser desfeito.`)) return;
    try { await comCarga(t, () => cadastro('DELETE', k, id)); U.sel[k] = null; desenhaTela(); toast('Excluído.'); } catch (e) { toast(e.message, 'erro'); }
  },
  invocar: (t) => cmb('adicionar', { tipo: 'monstro', ref: Number(t.dataset.id), quantidade: $('#inv-q').value }, t).then((r) => { if (r) { toast('Monstro invocado no combate.'); } }),
  'aplicar-efeito-cat': (t) => cmb('efeito', { cid: Number($('#ap-alvo').value), efeito_id: Number(t.dataset.id) }, t).then((r) => { if (r) toast('Efeito aplicado.'); }),
  entregar: async (t) => {
    try { const cid = Number($('#ent-char').value); const inv = await comCarga(t, () => api('/api/itens/entregar', { method: 'POST', body: { char_id: cid, item_id: Number(t.dataset.id), qtd: $('#ent-q').value } })); S.mesa.inventarios[cid] = inv; U.invChar = cid; desenhaTela(); toast('Item entregue.'); } catch (e) { toast(e.message, 'erro'); }
  },
  recolher: async (t) => {
    try { const cid = Number(t.dataset.k); S.mesa.inventarios[cid] = await comCarga(t, () => api('/api/itens/recolher', { method: 'POST', body: { char_id: cid, item_id: Number(t.dataset.id), qtd: 1 } })); desenhaTela(); } catch (e) { toast(e.message, 'erro'); }
  },
  'hist-filtro': (t) => { U.histFiltro = t.dataset.v; desenhaTela(); },
  'nota-tag': (t) => { U.notaTag = t.dataset.v; desenhaTela(); },
  'nota-nova': () => modalNota(null),
  'nota-edit': (t) => modalNota(S.mesa.notas.find((n) => n.id == t.dataset.id)),
  'nota-del': async (t) => { if (!confirm('Apagar esta nota?')) return; try { await cadastro('DELETE', 'notas', Number(t.dataset.id)); desenhaTela(); } catch (e) { toast(e.message, 'erro'); } },
};

// ---------- modais do mestre ----------
function modalAddCombate() {
  const m = modal(`<h2>Adicionar ao combate</h2>
  <p class="tit-menor">Jogador</p><div class="linha" style="align-items:end"><label class="campo"><span>Personagem</span><select id="mj">${S.chars.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label><button class="btn azul" data-go="j" style="flex:0 0 auto" ${S.chars.length ? '' : 'disabled'}>Adicionar</button></div>
  <div class="acoes esq"><button class="btn peq fantasma" data-go="todos">Adicionar todos os jogadores</button></div>
  <p class="tit-menor">Monstro</p><div class="linha" style="align-items:end"><label class="campo"><span>Do bestiário</span><select id="mm">${S.mesa.monstros.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
  <label class="campo" style="flex:0 0 90px"><span>Qtd</span><input id="mq" type="number" min="1" max="20" value="1" inputmode="numeric"></label><button class="btn perigo" data-go="m" style="flex:0 0 auto" ${S.mesa.monstros.length ? '' : 'disabled'}>Adicionar</button></div>
  <div class="acoes"><button class="btn fantasma" data-x>Fechar</button></div>`, 'Adicionar ao combate');
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    const go = b.dataset.go;
    const r = go === 'j' ? await cmb('adicionar', { tipo: 'jogador', ref: Number($('#mj', m).value) }, b)
      : go === 'todos' ? await cmb('adicionar_jogadores', {}, b) : await cmb('adicionar', { tipo: 'monstro', ref: Number($('#mm', m).value), quantidade: $('#mq', m).value }, b);
    if (r) toast('Adicionado ao combate.');
  });
}
function modalNota(n) {
  const m = modal(`<h2>${n ? 'Editar nota' : 'Nova nota'}</h2><form><label class="campo"><span>Título</span><input name="titulo" type="text" maxlength="60" required value="${esc(n?.titulo)}"></label>
  <label class="campo"><span>Texto</span><textarea name="texto" maxlength="4000" style="min-height:160px">${esc(n?.texto)}</textarea></label>
  <label class="campo"><span>Etiquetas (separe por vírgula)</span><input name="tags" type="text" value="${esc((n?.etiquetas || []).join(', '))}" placeholder="Trama, NPC, Segredo"></label>
  <p class="erro" role="alert"></p><div class="acoes"><button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn ouro">Salvar</button></div></form>`, 'Nota');
  $('form', m).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    await comCarga($('.ouro', f), async () => {
      try { await cadastro(n ? 'PATCH' : 'POST', 'notas', n?.id, { titulo: f.titulo.value, texto: f.texto.value, etiquetas: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean) }); m.fechar(); desenhaTela(); }
      catch (er) { $('.erro', f).textContent = er.message; }
    });
  });
}
function modalPersonagem(c) {
  const novo = !c;
  const m = modal(`<h2>${novo ? 'Novo personagem' : 'Editar ' + esc(c.nome)}</h2><form>
  <label class="campo"><span>Nome</span><input name="nome" type="text" maxlength="40" required value="${esc(c?.nome)}"></label>
  ${novo ? '<label class="campo"><span>Senha do personagem</span><input name="senha" type="text" minlength="4" maxlength="72" required autocomplete="off"></label>' : ''}
  <div class="linha"><label class="campo"><span>Vida máxima</span><input name="vm" type="number" min="1" max="9999" required value="${c?.vida_max ?? 20}"></label><label class="campo"><span>Sanidade máxima</span><input name="sm" type="number" min="1" max="9999" required value="${c?.sanidade_max ?? 20}"></label></div>
  ${novo ? `<div class="linha"><label class="campo"><span>Vida inicial</span><input name="va" type="number" min="0" max="9999" placeholder="= máxima"></label><label class="campo"><span>Sanidade inicial</span><input name="sa" type="number" min="0" max="9999" placeholder="= máxima"></label></div>
  <label class="campo"><span>Foto (opcional)</span><input name="foto" type="file" accept="image/jpeg,image/png,image/webp"></label>`
    : `${sw('Curar junto', false, 'data-m="sw" data-k="junto" id="sw-junto"', 'Ao subir o máximo, o valor atual sobe na mesma quantidade')}<p class="dica">Subir de nível: aumente os máximos. Diminuir apenas limita o valor atual.</p>`}
  <p class="erro" role="alert"></p><div class="acoes">${novo ? '' : '<button type="button" class="btn fantasma" data-d="senha">Redefinir senha</button><button type="button" class="btn perigo" data-d="excluir">Excluir</button>'}
  <button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn ouro">Salvar</button></div></form>`, novo ? 'Novo personagem' : 'Editar personagem');
  const f = $('form', m), erro = $('.erro', f);
  f.addEventListener('click', (e) => {
    const a = e.target.closest('[data-d]')?.dataset.d;
    if (a === 'senha') { m.fechar(); modalSenha(c); }
    if (a === 'excluir' && confirm(`Excluir "${c.nome}" e todo o histórico? Isso não pode ser desfeito.`)) api(`/api/characters/${c.id}`, { method: 'DELETE' }).then(() => { m.fechar(); toast('Personagem excluído.'); }).catch((er) => { erro.textContent = er.message; });
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await comCarga($('.ouro', f), async () => {
      try {
        if (novo) {
          const r = await api('/api/characters', { method: 'POST', body: { nome: f.nome.value, senha: f.senha.value, vida_max: f.vm.value, sanidade_max: f.sm.value, vida_atual: f.va.value, sanidade_atual: f.sa.value } });
          m.fechar(); if (f.foto.files[0]) abrirCorte(f.foto.files[0], r.id);
        } else {
          await api(`/api/characters/${c.id}`, { method: 'PATCH', body: { nome: f.nome.value, vida_max: f.vm.value, sanidade_max: f.sm.value, curar_junto: $('#sw-junto', f).getAttribute('aria-checked') === 'true' } });
          m.fechar();
        }
      } catch (er) { erro.textContent = er.message; }
    });
  });
}
function modalSenha(c) {
  const m = modal(`<h2>Nova senha — ${esc(c.nome)}</h2><form><label class="campo"><span>Nova senha</span><input id="ns" type="text" minlength="4" maxlength="72" required autocomplete="off"></label>
  <p class="dica">O jogador será desconectado e precisará entrar com a nova senha.</p><p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="btn fantasma" data-x>Cancelar</button><button class="btn perigo">Redefinir</button></div></form>`, 'Redefinir senha');
  $('form', m).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/api/characters/${c.id}/senha`, { method: 'POST', body: { senha: $('#ns', m).value } }); m.fechar(); toast('Senha redefinida.'); } catch (er) { $('.erro', m).textContent = er.message; }
  });
}
async function modalHistChar(c) {
  try {
    const h = await api(`/api/characters/${c.id}/historico`);
    modal(`<h2>Histórico — ${esc(c.nome)}</h2><ul class="hist" style="max-height:60vh">${h.length ? h.map((e) => eventoHtml(e, false)).join('') : '<li class="vazio">Sem registros.</li>'}</ul><div class="acoes"><button class="btn" data-x>Fechar</button></div>`, 'Histórico');
  } catch (e) { toast(e.message, 'erro'); }
}

// ---------- eventos ----------
document.addEventListener('click', (e) => {
  if (!$('#tela')) return;
  const aba = e.target.closest('[data-aba]');
  if (aba) { const id = aba.dataset.aba; if (location.hash.slice(1) !== id) location.hash = id; else trocar(id); return; }
  const t = e.target.closest('[data-m]');
  if (!t) return;
  if (t.dataset.m === 'pular') e.preventDefault();
  if (t.closest('.modal-bg') && t.dataset.m !== 'sw') return; // os modais tratam os próprios botões
  const fn = A[t.dataset.m]; if (fn) fn(t);
});
document.addEventListener('keydown', (e) => { // setas navegam entre as abas (padrão WAI-ARIA)
  const aba = e.target.closest?.('.aba'); if (!aba) return;
  const lista = $$('.aba'), i = lista.indexOf(aba);
  const j = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: lista.length - 1 }[e.key];
  if (j === undefined) return;
  e.preventDefault(); const alvo = lista[(j + lista.length) % lista.length]; alvo.focus(); alvo.click();
});
document.addEventListener('input', (e) => {
  const t = e.target; if (!$('#tela')?.contains(t)) return;
  if (t.id === 'qtd') U.qtd = Number(t.value) || 1;
  else if (t.id === 'expr') U.calc.expr = t.value;
  else if (t.id?.startsWith('busca-')) { U.busca[t.id.slice(6)] = t.value; desenhaTela(); }
  else if (t.id === 'bib-busca') { U.bib.busca[U.bib.modo] = t.value; desenhaTela(); }
});
document.addEventListener('change', (e) => {
  const t = e.target; if (!$('#tela')?.contains(t)) return;
  if (t.id === 'atq' && t.value) { U.calc.expr = t.value; $('#expr').value = t.value; }
  else if (t.id === 'inv-char') { U.invChar = Number(t.value); desenhaTela(); }
  else if (t.id === 'bib-nv') { U.bib.nv[U.bib.modo] = Number(t.value); desenhaTela(); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-cat]'); if (!f) return;
  e.preventDefault(); const kind = f.dataset.cat, erro = $('.erro', f); erro.textContent = '';
  const atual = U.sel[kind] === 'novo' ? null : S.mesa[kind].find((x) => x.id === U.sel[kind]);
  await comCarga($('[type=submit]', f), async () => {
    try { const r = await cadastro(atual ? 'PATCH' : 'POST', kind, atual?.id, lerForm(f, kind)); U.sel[kind] = r.id; desenhaTela(); toast(atual ? 'Alterações salvas.' : 'Criado.'); }
    catch (er) { erro.textContent = er.message; }
  });
});

Object.assign(window.G, { telaMestre, redesenhaMestre });
})();
