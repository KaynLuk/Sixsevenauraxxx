// Ferramentas do mestre: combate por turnos, dados, bestiário, efeitos, itens, notas e diário.
// Tudo aqui é exclusivo do mestre (o jogador só recebe as "vistas" públicas montadas no fim do arquivo).
import crypto from 'node:crypto';
import { erro, int, txt, estados, comNome, aplicarAjuste } from './nucleo.mjs';

const agora = () => new Date().toISOString();
const rnd = (lados) => crypto.randomInt(1, lados + 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- dados de exemplo (o mestre pode apagar ou editar) ----------
const MONSTROS = [
  { nome: 'Goblin Saqueador', tipo: 'goblin', vida_max: 12, armadura: 12, iniciativa: 2, dado_ataque: '1d6+2', habilidades: 'Emboscada: ataca com vantagem quem ainda não agiu.', notas: '', vida_escondida: false },
  { nome: 'Esqueleto Guerreiro', tipo: 'morto-vivo', vida_max: 18, armadura: 13, iniciativa: 1, dado_ataque: '1d8+1', habilidades: 'Imune a veneno. Frágil a dano de esmagamento.', notas: '', vida_escondida: false },
  { nome: 'Lobo Cinzento', tipo: 'besta', vida_max: 14, armadura: 12, iniciativa: 3, dado_ataque: '2d4+2', habilidades: 'Derrubar: o alvo faz um teste de Força ou cai.', notas: '', vida_escondida: false },
  { nome: 'Gruk, o Quebra-Ossos', tipo: 'chefe', vida_max: 65, armadura: 16, iniciativa: 1, dado_ataque: '2d8+4', habilidades: 'Fúria: ao chegar a metade da vida, ataca duas vezes.', notas: 'Chefe da emboscada na estrada.', vida_escondida: true },
];
const EFEITOS = [
  { nome: 'Veneno', tipo: 'dano', valor: 3, duracao: 3, dano_tipo: 'veneno', descricao: 'Perde vida no início de cada turno.', acumula: true, termina_cura: false, visivel: true },
  { nome: 'Sangramento', tipo: 'dano', valor: 2, duracao: 4, dano_tipo: 'cortante', descricao: 'Cessa se o alvo receber cura.', acumula: false, termina_cura: true, visivel: true },
  { nome: 'Queimadura', tipo: 'dano', valor: 4, duracao: 2, dano_tipo: 'fogo', descricao: 'Chamas que se apagam sozinhas.', acumula: false, termina_cura: false, visivel: true },
  { nome: 'Gelo', tipo: 'dano', valor: 2, duracao: 2, dano_tipo: 'gelo', descricao: 'Reduz o movimento pela metade.', acumula: false, termina_cura: false, visivel: true },
  { nome: 'Regeneração', tipo: 'cura', valor: 3, duracao: 3, dano_tipo: '', descricao: 'Recupera vida no início de cada turno.', acumula: false, termina_cura: false, visivel: true },
  { nome: 'Bênção', tipo: 'bonus', valor: 0, duracao: 5, dano_tipo: '', descricao: '+1d4 em testes de ataque e resistência.', acumula: false, termina_cura: false, visivel: true },
  { nome: 'Paralisia', tipo: 'controle', valor: 0, duracao: 1, dano_tipo: '', descricao: 'Não pode agir no próprio turno.', acumula: false, termina_cura: false, visivel: true },
];
const ITENS = [
  { nome: 'Espada Curta', tipo: 'arma', dado_dano: '1d6', bonus: '+1', efeitos: '', descricao: 'Lâmina leve e bem balanceada.' },
  { nome: 'Poção de Cura', tipo: 'consumível', dado_dano: '2d4+2', bonus: '', efeitos: 'Recupera vida', descricao: 'Líquido rubro que cheira a ervas.' },
  { nome: 'Escudo de Carvalho', tipo: 'armadura', dado_dano: '', bonus: '+2 armadura', efeitos: '', descricao: 'Madeira reforçada com tiras de ferro.' },
  { nome: 'Anel da Vigília', tipo: 'mágico', dado_dano: '', bonus: '+1 iniciativa', efeitos: 'Brilha perto de mortos-vivos', descricao: 'Um aro de prata fria.' },
];
const novoCombate = () => ({ ativo: false, rodada: 1, turno: 0, combatentes: [] });

// Garante os campos novos em bancos criados antes (ou do zero). Idempotente.
export function garantir(d) {
  if (d.monstros) return d;
  Object.assign(d.seq, { m: MONSTROS.length, e: EFEITOS.length, i: ITENS.length, n: 0, r: 0, d: 0, cb: 0, ef: 0 });
  d.monstros = MONSTROS.map((x, i) => ({ id: i + 1, ...x }));
  d.efeitos = EFEITOS.map((x, i) => ({ id: i + 1, ...x }));
  d.itens = ITENS.map((x, i) => ({ id: i + 1, ...x }));
  Object.assign(d, { notas: [], rolagens: [], diario: [], combate: novoCombate(), rev: 0 });
  for (const c of d.chars) c.itens ||= [];
  return d;
}

const diario = (d, tipo, texto) => {
  d.diario.push({ id: ++d.seq.d, tipo, texto, criado_em: agora() });
  if (d.diario.length > 500) d.diario.splice(0, d.diario.length - 500);
};

// ---------- dados ----------
const RE_DADO = /^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/;
const limpa = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const dadoOk = (s) => { const x = limpa(s); return x.length <= 60 && RE_DADO.test(x); };

export function rolarExpr(expr, mult = 1) {
  const s = limpa(expr);
  if (!s || s.length > 60 || !RE_DADO.test(s)) erro(400, 'Expressão inválida. Exemplos: 1d20, 2d6+3, d8+1d4+2.');
  let total = 0, qtdDados = 0;
  const partes = [];
  for (const t of s.match(/[+-]?(\d*d\d+|\d+)/g)) {
    const sinal = t[0] === '-' ? -1 : 1, corpo = t.replace(/^[+-]/, '');
    if (corpo.includes('d')) {
      const [n, l] = corpo.split('d'), q = n === '' ? 1 : Number(n), lados = Number(l);
      if (q < 1 || q > 100 || lados < 2 || lados > 1000) erro(400, 'Use de 1 a 100 dados, com 2 a 1000 lados.');
      qtdDados += q; if (qtdDados > 200) erro(400, 'Dados demais numa rolagem (máximo 200).');
      const rolls = Array.from({ length: q }, () => rnd(lados)), sub = sinal * rolls.reduce((a, b) => a + b, 0);
      total += sub; partes.push({ termo: t, rolls, sub });
    } else {
      const v = sinal * Number(corpo); if (Math.abs(v) > 99999) erro(400, 'Bônus grande demais.');
      total += v; partes.push({ termo: t, sub: v });
    }
  }
  return { total: total * mult, bruto: total, partes };
}

function rolagem(d, b) {
  const modo = ['normal', 'vantagem', 'desvantagem'].includes(b.modo) ? b.modo : 'normal';
  const mult = int(b.mult ?? 1, 1, 10) ?? erro(400, 'Multiplicador de 1 a 10.');
  const r1 = rolarExpr(b.expr, mult);
  let escolhido = r1, descartado = null;
  if (modo !== 'normal') {
    const r2 = rolarExpr(b.expr, mult), primeiro = modo === 'vantagem' ? r1.total >= r2.total : r1.total <= r2.total;
    escolhido = primeiro ? r1 : r2; descartado = (primeiro ? r2 : r1).total;
  }
  const item = { id: ++d.seq.r, expr: limpa(b.expr), modo, mult, rotulo: txt(b.rotulo, 40), total: escolhido.total, partes: escolhido.partes, descartado, criado_em: agora() };
  d.rolagens.push(item); if (d.rolagens.length > 200) d.rolagens.splice(0, d.rolagens.length - 200);
  return item;
}

// ---------- combate ----------
const ordenar = (cb) => {
  const atual = cb.combatentes[cb.turno]?.cid;
  cb.combatentes.sort((a, b) => (b.iniciativa ?? -1e9) - (a.iniciativa ?? -1e9) || a.cid - b.cid);
  cb.turno = atual ? Math.max(0, cb.combatentes.findIndex((x) => x.cid === atual)) : 0;
};
const renumerar = (cb, base) => {
  const grupo = cb.combatentes.filter((x) => x.tipo === 'monstro' && x.base === base).sort((a, b) => a.cid - b.cid);
  grupo.forEach((x, i) => { x.nome = grupo.length > 1 ? `${base} ${i + 1}` : base; });
};

// dano/cura em um combatente (jogador = personagem real, com histórico; monstro = vida própria)
function ajustar(d, comb, tipo, valor, descricao, atributo = 'vida', tolerante = false) {
  if (comb.tipo === 'jogador') return aplicarAjuste(d, comb.ref, atributo, tipo, valor, descricao, 'mestre', tolerante);
  if (atributo !== 'vida') erro(400, 'Monstros só têm vida.');
  const antes = comb.vida_atual, depois = clamp(antes + (tipo === 'dano' ? -valor : valor), 0, comb.vida_max);
  if (depois === antes) { if (tolerante) return null; erro(400, tipo === 'dano' ? 'A vida já está em zero.' : 'A vida já está no máximo.'); }
  comb.vida_atual = depois;
  diario(d, 'combate', `${comb.nome}: ${tipo === 'dano' ? 'perdeu' : 'recuperou'} ${Math.abs(depois - antes)} de vida (${antes} → ${depois})${descricao ? ` — ${descricao}` : ''}`);
  return true;
}

// início do turno: aplica os efeitos ativos, gasta uma duração e remove o que acabou
function iniciarTurno(d, comb) {
  const fim = [];
  for (const e of comb.efeitos) {
    const v = e.valor * (e.pilhas || 1);
    if (v > 0 && (e.tipo === 'dano' || e.tipo === 'cura')) ajustar(d, comb, e.tipo, v, `Efeito: ${e.nome}`, 'vida', true);
    if (--e.restante <= 0) fim.push(e);
  }
  if (fim.length) {
    comb.efeitos = comb.efeitos.filter((e) => !fim.includes(e));
    diario(d, 'efeito', `${comb.nome}: terminou ${fim.map((e) => e.nome).join(', ')}`);
  }
}

function acaoCombate(d, b) {
  const cb = d.combate;
  const achar = (cid) => cb.combatentes.find((x) => x.cid === Number(cid)) || erro(404, 'Combatente não encontrado.');
  const novoCid = () => ++d.seq.cb;
  switch (b.acao) {
    case 'adicionar': {
      if (b.tipo === 'jogador') {
        const ch = d.chars.find((x) => x.id === Number(b.ref)) || erro(404, 'Personagem não encontrado.');
        if (cb.combatentes.some((x) => x.tipo === 'jogador' && x.ref === ch.id)) erro(409, `${ch.nome} já está no combate.`);
        cb.combatentes.push({ cid: novoCid(), tipo: 'jogador', ref: ch.id, nome: ch.nome, iniciativa: null, bonus_ini: 0, efeitos: [] });
      } else if (b.tipo === 'monstro') {
        const mo = d.monstros.find((x) => x.id === Number(b.ref)) || erro(404, 'Monstro não encontrado.');
        const q = int(b.quantidade ?? 1, 1, 20) ?? erro(400, 'Quantidade de 1 a 20.');
        for (let i = 0; i < q; i++) cb.combatentes.push({ cid: novoCid(), tipo: 'monstro', ref: mo.id, base: mo.nome, nome: mo.nome, iniciativa: null, bonus_ini: mo.iniciativa, vida_atual: mo.vida_max, vida_max: mo.vida_max, armadura: mo.armadura, escondida: mo.vida_escondida, efeitos: [] });
        renumerar(cb, mo.nome);
        diario(d, 'combate', `${q > 1 ? q + '× ' : ''}${mo.nome} entrou no combate`);
      } else erro(400, 'Tipo inválido.');
      break;
    }
    case 'adicionar_jogadores': {
      for (const ch of d.chars) if (!cb.combatentes.some((x) => x.tipo === 'jogador' && x.ref === ch.id)) cb.combatentes.push({ cid: novoCid(), tipo: 'jogador', ref: ch.id, nome: ch.nome, iniciativa: null, bonus_ini: 0, efeitos: [] });
      break;
    }
    case 'iniciativa': {
      achar(b.cid).iniciativa = int(b.valor, -99, 999) ?? erro(400, 'Iniciativa de -99 a 999.');
      if (cb.ativo) ordenar(cb);
      break;
    }
    case 'rolar_iniciativa': {
      for (const x of cb.combatentes) if (x.iniciativa === null || b.todos === true) x.iniciativa = rnd(20) + (x.bonus_ini || 0);
      ordenar(cb); diario(d, 'combate', 'Iniciativa rolada'); break;
    }
    case 'iniciar': {
      if (!cb.combatentes.length) erro(400, 'Adicione combatentes antes de iniciar.');
      Object.assign(cb, { ativo: true, rodada: 1, turno: 0 }); ordenar(cb); cb.turno = 0;
      diario(d, 'combate', `Combate iniciado com ${cb.combatentes.length} combatentes`); break;
    }
    case 'proximo': {
      if (!cb.ativo) erro(400, 'Inicie o combate primeiro.');
      const n = cb.combatentes.length; let tent = 0, cur;
      do {
        cb.turno++;
        if (cb.turno >= n) { cb.turno = 0; cb.rodada++; diario(d, 'combate', `Rodada ${cb.rodada}`); }
        cur = cb.combatentes[cb.turno];
      } while (cur.tipo === 'monstro' && cur.vida_atual === 0 && ++tent < n); // monstros caídos perdem a vez
      iniciarTurno(d, cur); break;
    }
    case 'encerrar': { d.combate = novoCombate(); diario(d, 'combate', `Combate encerrado na rodada ${cb.rodada}`); break; }
    case 'remover': {
      const i = cb.combatentes.findIndex((x) => x.cid === Number(b.cid)); if (i < 0) erro(404, 'Combatente não encontrado.');
      const [x] = cb.combatentes.splice(i, 1); if (x.base) renumerar(cb, x.base);
      if (i < cb.turno) cb.turno--; if (cb.turno >= cb.combatentes.length) cb.turno = 0;
      break;
    }
    case 'vida_escondida': { const x = achar(b.cid); if (x.tipo !== 'monstro') erro(400, 'Só vale para monstros.'); x.escondida = b.valor === true; break; }
    case 'dano': case 'cura': {
      const x = achar(b.cid), v = int(b.valor, 1, 99999) ?? erro(400, 'Informe um valor de 1 a 99999.');
      ajustar(d, x, b.acao, v, txt(b.descricao, 300), x.tipo === 'jogador' && b.atributo === 'sanidade' ? 'sanidade' : 'vida');
      if (b.acao === 'cura') x.efeitos = x.efeitos.filter((e) => !e.termina_cura);
      break;
    }
    case 'efeito': {
      const x = achar(b.cid), ef = d.efeitos.find((e) => e.id === Number(b.efeito_id)) || erro(404, 'Efeito não encontrado.');
      const dur = int(b.duracao ?? ef.duracao, 1, 99) ?? erro(400, 'Duração de 1 a 99 turnos.');
      const ja = x.efeitos.find((e) => e.efeito_id === ef.id);
      if (ja) { ja.restante = dur; if (ef.acumula) ja.pilhas = (ja.pilhas || 1) + 1; }
      else x.efeitos.push({ eid: ++d.seq.ef, efeito_id: ef.id, nome: ef.nome, tipo: ef.tipo, dano_tipo: ef.dano_tipo, valor: ef.valor, restante: dur, pilhas: 1, visivel: ef.visivel, termina_cura: ef.termina_cura });
      diario(d, 'efeito', `${ef.nome} aplicado em ${x.nome} por ${dur} ${dur === 1 ? 'turno' : 'turnos'}`); break;
    }
    case 'tirar_efeito': {
      const x = achar(b.cid); x.efeitos = x.efeitos.filter((e) => e.eid !== Number(b.eid)); break;
    }
    default: erro(400, 'Ação inválida.');
  }
  return vistaMestre(d);
}

// ---------- cadastros (bestiário, efeitos, itens, notas) ----------
const num = (v, min, max, rot) => int(v, min, max) ?? erro(400, `${rot} deve ser um número de ${min} a ${max}.`);
const um = (v, lista, padrao) => (lista.includes(v) ? v : padrao);
const nome = (v, rot = 'o nome') => txt(v, 40) || erro(400, `Informe ${rot}.`);
const dado = (v, rot) => { const s = limpa(v); if (s && !dadoOk(s)) erro(400, `${rot}: use algo como 1d6+2.`); return s; };
const CRUD = {
  monstros: { seq: 'm', valida: (b) => ({ nome: nome(b.nome), tipo: um(b.tipo, ['chefe', 'goblin', 'morto-vivo', 'besta', 'outro'], 'outro'), vida_max: num(b.vida_max, 1, 99999, 'Vida máxima'), armadura: num(b.armadura ?? 0, 0, 99, 'Armadura'), iniciativa: num(b.iniciativa ?? 0, -20, 50, 'Bônus de iniciativa'), dado_ataque: dado(b.dado_ataque, 'Dado de ataque'), habilidades: txt(b.habilidades, 1000), notas: txt(b.notas, 1000), vida_escondida: b.vida_escondida === true }) },
  efeitos: { seq: 'e', valida: (b) => ({ nome: nome(b.nome), tipo: um(b.tipo, ['dano', 'cura', 'bonus', 'controle'], 'dano'), valor: num(b.valor ?? 0, 0, 9999, 'Valor por turno'), duracao: num(b.duracao ?? 1, 1, 99, 'Duração'), dano_tipo: txt(b.dano_tipo, 30), descricao: txt(b.descricao, 300), acumula: b.acumula === true, termina_cura: b.termina_cura === true, visivel: b.visivel !== false }) },
  itens: { seq: 'i', valida: (b) => ({ nome: nome(b.nome), tipo: um(b.tipo, ['arma', 'armadura', 'consumível', 'mágico', 'tesouro', 'outro'], 'outro'), dado_dano: dado(b.dado_dano, 'Dado de dano'), bonus: txt(b.bonus, 30), efeitos: txt(b.efeitos, 200), descricao: txt(b.descricao, 400) }) },
  notas: { seq: 'n', valida: (b) => ({ titulo: txt(b.titulo, 60) || erro(400, 'Informe o título.'), texto: txt(b.texto, 4000), etiquetas: (Array.isArray(b.etiquetas) ? b.etiquetas : []).map((t) => txt(t, 20)).filter(Boolean).slice(0, 6) }) },
};

function inventarioDe(d, ch) {
  return (ch.itens || []).map((s) => { const it = d.itens.find((i) => i.id === s.item_id); return it ? { ...it, qtd: s.qtd } : null; }).filter(Boolean);
}

// ---------- rotas do mestre ----------
const AREAS = ['combate', 'dados', 'monstros', 'efeitos', 'itens', 'notas', 'mesa'];
export async function rotasMesa({ seg, m, u, db, corpo, mutate, json }) {
  const [a, b, c] = seg;
  if (!AREAS.includes(a)) return null;
  if (u.r !== 'mestre') erro(403, 'Apenas o mestre pode fazer isso.');

  if (a === 'mesa' && b === 'historico' && m === 'GET') {
    return json(200, { eventos: db.hist.slice(-300).reverse().map((h) => comNome(db, h)), rolagens: db.rolagens.slice(-200).reverse(), diario: db.diario.slice(-300).reverse() });
  }
  if (a === 'dados' && m === 'POST') { const body = await corpo(); return json(200, await mutate((d) => rolagem(d, body))); }
  if (a === 'combate' && m === 'POST') { const body = await corpo(); return json(200, { combate: await mutate((d) => acaoCombate(d, body)) }); }

  if (a === 'itens' && (b === 'entregar' || b === 'recolher') && m === 'POST') {
    const body = await corpo(), qtd = num(body.qtd ?? 1, 1, 99, 'Quantidade');
    return json(200, await mutate((d) => {
      const ch = d.chars.find((x) => x.id === Number(body.char_id)) || erro(404, 'Personagem não encontrado.');
      const it = d.itens.find((x) => x.id === Number(body.item_id)) || erro(404, 'Item não encontrado.');
      ch.itens ||= [];
      const slot = ch.itens.find((s) => s.item_id === it.id);
      if (b === 'entregar') {
        if (slot) slot.qtd = Math.min(999, slot.qtd + qtd); else ch.itens.push({ item_id: it.id, qtd });
        diario(d, 'item', `${qtd}× ${it.nome} entregue a ${ch.nome}`);
      } else {
        if (!slot) erro(400, `${ch.nome} não tem ${it.nome}.`);
        slot.qtd -= qtd; if (slot.qtd <= 0) ch.itens = ch.itens.filter((s) => s !== slot);
        diario(d, 'item', `${it.nome} recolhido de ${ch.nome}`);
      }
      return inventarioDe(d, ch);
    }));
  }

  const cad = CRUD[a];
  if (!cad) return null;
  const lista = (d) => d[a];
  if (!b && m === 'POST') {
    const body = await corpo(), dados = cad.valida(body);
    return json(201, await mutate((d) => { const x = { id: ++d.seq[cad.seq], ...dados, criado_em: agora() }; lista(d).push(x); return x; }));
  }
  const id = Number(b);
  if (Number.isInteger(id) && m === 'PATCH') {
    const body = await corpo();
    return json(200, await mutate((d) => {
      const x = lista(d).find((y) => y.id === id) || erro(404, 'Não encontrado.');
      Object.assign(x, cad.valida({ ...x, ...body })); return x;
    }));
  }
  if (Number.isInteger(id) && m === 'DELETE') {
    return json(200, await mutate((d) => {
      if (!lista(d).some((y) => y.id === id)) erro(404, 'Não encontrado.');
      d[a] = lista(d).filter((y) => y.id !== id);
      if (a === 'itens') for (const ch of d.chars) ch.itens = (ch.itens || []).filter((s) => s.item_id !== id);
      return { ok: true };
    }));
  }
  return null;
}

// remove um personagem apagado do combate e do banco de itens
export function limparChar(d, id) {
  const cb = d.combate; if (!cb) return;
  const atual = cb.combatentes[cb.turno]?.cid;
  cb.combatentes = cb.combatentes.filter((x) => !(x.tipo === 'jogador' && x.ref === id));
  cb.turno = Math.max(0, cb.combatentes.findIndex((x) => x.cid === atual));
}

// ---------- vistas (o que cada papel recebe no sync) ----------
function vistaMestre(d) {
  const cb = d.combate;
  return {
    ativo: cb.ativo, rodada: cb.rodada, turno: cb.turno,
    combatentes: cb.combatentes.map((x) => {
      if (x.tipo !== 'jogador') return x;
      const ch = d.chars.find((c) => c.id === x.ref);
      return { ...x, nome: ch.nome, foto_url: ch.foto_url, vida_atual: ch.vida_atual, vida_max: ch.vida_max, sanidade_atual: ch.sanidade_atual, sanidade_max: ch.sanidade_max, estados: estados(ch) };
    }),
  };
}
export function dadosMestre(d) {
  return {
    combate: vistaMestre(d),
    mesa: { monstros: d.monstros, efeitos: d.efeitos, itens: d.itens, notas: d.notas, inventarios: Object.fromEntries(d.chars.map((c) => [c.id, inventarioDe(d, c)])) },
  };
}

const estadoMonstro = (x) => (x.vida_atual <= 0 ? 'Caído' : x.vida_atual >= x.vida_max ? 'Ileso' : x.vida_atual / x.vida_max <= 0.3 ? 'Crítico' : 'Ferido');
export function dadosJogador(d, u) {
  const cb = d.combate, ver = d.config.jogadores_veem_outros, eu = d.chars.find((c) => c.id === u.c);
  let combate = null;
  if (cb.combatentes.length) {
    combate = {
      ativo: cb.ativo, rodada: cb.rodada, atual: cb.ativo ? cb.combatentes[cb.turno]?.cid ?? null : null,
      ordem: cb.combatentes.map((x) => {
        const meu = x.tipo === 'jogador' && x.ref === u.c;
        const o = { cid: x.cid, tipo: x.tipo, nome: x.nome, iniciativa: x.iniciativa, eu: meu, efeitos: x.efeitos.filter((e) => e.visivel || meu).map((e) => ({ nome: e.nome, tipo: e.tipo, dano_tipo: e.dano_tipo, restante: e.restante, pilhas: e.pilhas })) };
        if (x.tipo === 'jogador') {
          const ch = d.chars.find((c) => c.id === x.ref);
          o.foto_url = ch.foto_url;
          if (meu || ver) { o.vida_atual = ch.vida_atual; o.vida_max = ch.vida_max; }
        } else if (x.escondida) o.estado = estadoMonstro(x);
        else { o.vida_atual = x.vida_atual; o.vida_max = x.vida_max; o.estado = estadoMonstro(x); }
        return o;
      }),
    };
  }
  return { combate, inventario: eu ? inventarioDe(d, eu) : [] };
}

