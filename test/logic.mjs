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
console.log('\nLogin');
t('status mostra mestre configurado (senha fixa)', (await M.req('GET', '/api/status')).d.mestre_configurado === true);
t('rota protegida sem login → 401', (await new Cli().req('GET', '/api/characters')).s === 401);
t('mestre entra com a senha mestre123', (await M.req('POST', '/api/login/mestre', { senha: 'mestre123' })).s === 200);
t('primeiro sync de um banco novo (rev 0) já traz os dados', await (async () => { const f = (await M.req('GET', '/api/sync')).d; return f.rev === 0 && !!f.dados?.combate && !!f.dados?.mesa; })());
t('senha errada do mestre → 401', (await new Cli('9.9.9.9').req('POST', '/api/login/mestre', { senha: 'outra' })).s === 401);
const lista = (await new Cli().req('GET', '/api/public/characters')).d;
t('lista pública com 2 personagens do seed, sem dados sensíveis', lista.length === 2 && !('senha_hash' in lista[0]) && !('vida_atual' in lista[0]));
const ele = lista.find((c) => c.nome === 'Eleanor Voss'), tob = lista.find((c) => c.nome === 'Tobias Crane');
t('jogador senha errada → 401', (await A.req('POST', '/api/login/jogador', { id: ele.id, senha: 'x' })).s === 401);
t('Eleanor entra (via redirect ?r=)', (await A.req('POST', '/api/login/jogador', { id: ele.id, senha: 'eleanor123' })).s === 200);
t('Tobias entra', (await B.req('POST', '/api/login/jogador', { id: tob.id, senha: 'tobias123' })).s === 200);

console.log('\nDano, sync e permissões');
const base = (await A.req('GET', '/api/sync')).d;
t('primeiro sync devolve linha de base sem eventos', base.eventos.length === 0 && base.dados.chars.length === 2);
const r1 = await M.req('POST', `/api/characters/${ele.id}/ajuste`, { atributo: 'vida', tipo: 'dano', valor: 5, descricao: 'Garra da criatura no ombro' });
t('mestre aplica 5 de dano (18 → 13)', r1.s === 200 && r1.d.personagem.vida_atual === 13 && r1.d.evento.antes === 18 && r1.d.evento.autor === 'mestre');
const sA = (await A.req('GET', `/api/sync?ev=${base.lastEv}`)).d, sB = (await B.req('GET', `/api/sync?ev=${base.lastEv}`)).d, sM = (await M.req('GET', `/api/sync?ev=${base.lastEv}`)).d;
t('dono recebe o evento com valor e descrição no sync', sA.eventos.length === 1 && sA.eventos[0].delta === -5 && sA.eventos[0].descricao === 'Garra da criatura no ombro');
t('outro jogador NÃO recebe o evento alheio, mas vê o novo estado', sB.eventos.length === 0 && sB.dados.chars.find((c) => c.id === ele.id).vida_atual === 13);
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
t('config desligada: jogador vê SÓ o próprio personagem', so.dados.chars.length === 1 && so.dados.chars[0].id === ele.id && so.dados.config.jogadores_veem_outros === false);
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
t('outro IP não é afetado', (await new Cli('7.7.7.7').req('POST', '/api/login/mestre', { senha: 'mestre123' })).s === 200);

console.log('\nFerramentas do mestre');
const post = (c, p, b) => c.req('POST', p, b);
const combate = async () => (await M.req('GET', '/api/sync')).d.dados.combate;
const mesa = async () => (await M.req('GET', '/api/sync')).d.dados.mesa;
const vidaDe = async (id) => (await M.req('GET', '/api/characters')).d.find((c) => c.id === id).vida_atual;
// dados
const rd = await post(M, '/api/dados', { expr: '2d6+3' });
t('dados: 2d6+3 dá de 5 a 15 com 2 rolagens', rd.s === 200 && rd.d.total >= 5 && rd.d.total <= 15 && rd.d.partes[0].rolls.length === 2);
t('dados: expressão inválida → 400', (await post(M, '/api/dados', { expr: 'abc' })).s === 400 && (await post(M, '/api/dados', { expr: '101d6' })).s === 400 && (await post(M, '/api/dados', { expr: '1d1' })).s === 400);
const rv = await post(M, '/api/dados', { expr: '1d20', modo: 'vantagem' }), rdv = await post(M, '/api/dados', { expr: '1d20', modo: 'desvantagem' });
t('dados: vantagem fica com o maior, desvantagem com o menor', rv.d.total >= rv.d.descartado && rdv.d.total <= rdv.d.descartado);
t('dados: crítico x3 multiplica o total', (await post(M, '/api/dados', { expr: '1d6', mult: 3 })).d.total % 3 === 0);
t('dados: jogador não rola → 403', (await post(A, '/api/dados', { expr: '1d20' })).s === 403);
// cadastros
let ms = await mesa();
t('bestiário, efeitos e itens de exemplo vêm prontos', ms.monstros.length >= 4 && ms.efeitos.length >= 7 && ms.itens.length >= 4);
const mon = await post(M, '/api/monstros', { nome: 'Troll da Ponte', tipo: 'besta', vida_max: 40, armadura: 14, iniciativa: -1, dado_ataque: '2d6+4', vida_escondida: true });
t('mestre cria monstro', mon.s === 201 && mon.d.id > 0 && mon.d.vida_escondida === true);
t('monstro com dado inválido → 400', (await post(M, '/api/monstros', { nome: 'X', vida_max: 5, dado_ataque: 'xyz' })).s === 400);
t('mestre edita monstro (vida 50)', (await M.req('PATCH', `/api/monstros/${mon.d.id}`, { vida_max: 50 })).d.vida_max === 50);
t('jogador não cria monstro/efeito/item/nota → 403', (await post(A, '/api/monstros', { nome: 'X', vida_max: 5 })).s === 403 && (await post(A, '/api/efeitos', { nome: 'X' })).s === 403 && (await post(A, '/api/notas', { titulo: 'X' })).s === 403);
const efC = await post(M, '/api/efeitos', { nome: 'Maldição', tipo: 'dano', valor: 5, duracao: 2, acumula: true });
t('mestre cria efeito', efC.s === 201 && efC.d.duracao === 2);
const nota = await post(M, '/api/notas', { titulo: 'Gancho', texto: 'A ponte cobra pedágio.', etiquetas: ['Trama', 'NPC'] });
t('mestre cria nota com etiquetas', nota.s === 201 && nota.d.etiquetas.length === 2 && (await M.req('PATCH', `/api/notas/${nota.d.id}`, { texto: 'novo' })).d.texto === 'novo');
// combate
const SEED = (await mesa()).monstros, gob = SEED.find((x) => x.nome.startsWith('Goblin')), gruk = SEED.find((x) => x.nome.startsWith('Gruk'));
const efs = (await mesa()).efeitos, veneno = efs.find((x) => x.nome === 'Veneno'), sangra = efs.find((x) => x.nome === 'Sangramento');
await post(M, '/api/combate', { acao: 'encerrar' });
await post(M, '/api/combate', { acao: 'adicionar', tipo: 'jogador', ref: ele.id });
t('jogador repetido no combate → 409', (await post(M, '/api/combate', { acao: 'adicionar', tipo: 'jogador', ref: ele.id })).s === 409);
await post(M, '/api/combate', { acao: 'adicionar', tipo: 'monstro', ref: gob.id, quantidade: 2 });
let cb = await combate();
t('2 goblins entram numerados', cb.combatentes.map((x) => x.nome).join('|') === `${ele.nome}|${gob.nome} 1|${gob.nome} 2`);
t('iniciar sem rolar também funciona; rolar iniciativa preenche todos', (await post(M, '/api/combate', { acao: 'rolar_iniciativa' })).d.combate.combatentes.every((x) => Number.isInteger(x.iniciativa)));
const [pE, pG1, pG2] = ['Eleanor', 'Goblin Saqueador 1', 'Goblin Saqueador 2'].map((n) => cb.combatentes.find((x) => x.nome.startsWith(n)).cid);
for (const [cid, v] of [[pE, 20], [pG1, 10], [pG2, 5]]) await post(M, '/api/combate', { acao: 'iniciativa', cid, valor: v });
cb = (await post(M, '/api/combate', { acao: 'iniciar' })).d.combate;
t('iniciar ordena por iniciativa (turno 0 = Eleanor)', cb.ativo && cb.rodada === 1 && cb.combatentes[0].cid === pE && cb.turno === 0);
await post(M, '/api/combate', { acao: 'efeito', cid: pG1, efeito_id: veneno.id });
await post(M, '/api/combate', { acao: 'efeito', cid: pG1, efeito_id: veneno.id });
cb = (await post(M, '/api/combate', { acao: 'proximo' })).d.combate;
const g1 = cb.combatentes.find((x) => x.cid === pG1);
t('próximo turno: veneno empilhado (2 pilhas × 3) tira 6 do goblin e gasta 1 turno', cb.turno === 1 && g1.vida_atual === 12 - 6 && g1.efeitos[0].restante === 2 && g1.efeitos[0].pilhas === 2);
await post(M, '/api/combate', { acao: 'efeito', cid: pE, efeito_id: veneno.id, duracao: 1 });
const v0 = await vidaDe(ele.id), sA0 = (await A.req('GET', '/api/sync')).d;
await post(M, '/api/combate', { acao: 'proximo' });
cb = (await post(M, '/api/combate', { acao: 'proximo' })).d.combate; // volta à Eleanor: rodada 2
t('rodada 2 e o veneno de 1 turno acaba no jogador', cb.rodada === 2 && cb.turno === 0 && cb.combatentes[0].efeitos.length === 0);
const sA1 = (await A.req('GET', `/api/sync?ev=${sA0.lastEv}`)).d;
t('dano do efeito vai para o histórico real do jogador e chega como evento', (await vidaDe(ele.id)) === v0 - 3 && sA1.eventos.some((e) => e.descricao === 'Efeito: Veneno' && e.delta === -3));
await post(M, '/api/combate', { acao: 'efeito', cid: pG1, efeito_id: sangra.id });
await post(M, '/api/combate', { acao: 'cura', cid: pG1, valor: 1, descricao: 'curativo' });
t('cura remove efeitos que "terminam ao receber cura"', (await combate()).combatentes.find((x) => x.cid === pG1).efeitos.every((e) => e.nome !== 'Sangramento'));
await post(M, '/api/combate', { acao: 'dano', cid: pG2, valor: 999, descricao: 'golpe' });
t('monstro nunca fica abaixo de 0', (await combate()).combatentes.find((x) => x.cid === pG2).vida_atual === 0);
await post(M, '/api/combate', { acao: 'proximo' }); // G1
cb = (await post(M, '/api/combate', { acao: 'proximo' })).d.combate; // G2 caído é pulado → Eleanor, rodada 3
t('monstro caído perde a vez (vai direto à Eleanor, rodada 3)', cb.turno === 0 && cb.rodada === 3);
await post(M, '/api/combate', { acao: 'adicionar', tipo: 'monstro', ref: gruk.id });
const pub1 = (await A.req('GET', '/api/sync')).d.dados.combate, pg = pub1.ordem.find((x) => x.nome.startsWith('Gruk')), pg1 = pub1.ordem.find((x) => x.nome === 'Goblin Saqueador 1');
t('jogador vê só "Ileso/Ferido/Crítico" do monstro com vida escondida', pg.vida_atual === undefined && pg.estado === 'Ileso' && pg1.vida_atual !== undefined && pub1.atual !== null);
await post(M, '/api/combate', { acao: 'dano', cid: pg.cid, valor: 50 });
t('chefe com 15/65 aparece como Crítico', (await A.req('GET', '/api/sync')).d.dados.combate.ordem.find((x) => x.cid === pg.cid).estado === 'Crítico');
t('jogador não age no combate → 403', (await post(A, '/api/combate', { acao: 'proximo' })).s === 403);
t('remover combatente e encerrar', (await post(M, '/api/combate', { acao: 'remover', cid: pG2 })).d.combate.combatentes.length === 3 && (await post(M, '/api/combate', { acao: 'encerrar' })).d.combate.combatentes.length === 0);
// itens
const espada = (await mesa()).itens.find((x) => x.nome === 'Espada Curta');
const ent = await post(M, '/api/itens/entregar', { char_id: ele.id, item_id: espada.id, qtd: 2 });
t('mestre entrega 2 espadas', ent.s === 200 && ent.d[0].qtd === 2);
t('jogador vê o próprio inventário', (await A.req('GET', '/api/sync')).d.dados.inventario[0]?.qtd === 2);
t('recolher 1 → sobra 1', (await post(M, '/api/itens/recolher', { char_id: ele.id, item_id: espada.id, qtd: 1 })).d[0].qtd === 1);
t('jogador não entrega item → 403', (await post(A, '/api/itens/entregar', { char_id: ele.id, item_id: espada.id })).s === 403);
await M.req('DELETE', `/api/itens/${espada.id}`);
t('apagar o item tira do inventário', (await A.req('GET', '/api/sync')).d.dados.inventario.length === 0);
// histórico e revisão
const hist = (await M.req('GET', '/api/mesa/historico')).d;
t('histórico do mestre junta dano/cura, rolagens e diário', hist.eventos.length > 5 && hist.rolagens.length >= 4 && hist.diario.some((x) => x.tipo === 'combate') && hist.diario.some((x) => x.tipo === 'efeito'));
const s1 = (await M.req('GET', '/api/sync')).d, s2 = (await M.req('GET', `/api/sync?rev=${s1.rev}`)).d;
t('sync sem mudanças não reenvia os dados (rev igual)', s1.dados && !s2.dados);
t('apagar personagem tira ele do combate', await (async () => { const n = (await post(M, '/api/characters', { nome: 'Passageiro', senha: 'abcd1', vida_max: 5, sanidade_max: 5 })).d; await post(M, '/api/combate', { acao: 'adicionar', tipo: 'jogador', ref: n.id }); await M.req('DELETE', `/api/characters/${n.id}`); return (await combate()).combatentes.length === 0; })());

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
