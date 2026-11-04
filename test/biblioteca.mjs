// Valida a biblioteca do mestre: quantidades, nomes únicos, encontros existentes, dados de ataque e mapas.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['public/js/biblioteca.js', 'public/js/mapas.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
const { monstros, areas } = ctx.window.BIBLIOTECA, mapas = ctx.window.BIBLIOTECA_MAPAS;
const TIPOS = ['chefe', 'goblin', 'morto-vivo', 'besta', 'humanoide', 'elemental', 'demônio', 'dragão', 'construto', 'aberração', 'planta', 'fada', 'outro'];
const DADO = /^(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/;
let erros = 0; const err = (m) => { erros++; console.log('  ✘', m); };
console.log(`monstros: ${monstros.length}, áreas: ${areas.length}, mapas: ${mapas.length}`);
if (monstros.length < 100) err('menos de 100 monstros'); if (areas.length < 100) err('menos de 100 áreas');
const nomes = new Set();
for (const m of monstros) {
  if (nomes.has(m.nome)) err('monstro repetido: ' + m.nome); nomes.add(m.nome);
  if (m.nome.length > 40) err('nome longo: ' + m.nome);
  if (!TIPOS.includes(m.tipo)) err(`tipo inválido (${m.tipo}) em ${m.nome}`);
  if (!DADO.test(m.dado_ataque)) err(`dado inválido em ${m.nome}: ${m.dado_ataque}`);
  if (!(m.vida_max >= 1 && m.armadura >= 0 && m.iniciativa >= -20 && m.iniciativa <= 50 && m.nv >= 1 && m.nv <= 10)) err('números fora da faixa em ' + m.nome);
  if (!m.habilidades || m.habilidades.length > 1000) err('habilidades em ' + m.nome);
}
const an = new Set(), biomas = {};
for (const a of areas) {
  if (an.has(a.nome)) err('área repetida: ' + a.nome); an.add(a.nome);
  biomas[a.bioma] = (biomas[a.bioma] || 0) + 1;
  if (!a.enc.length || !a.desc || !a.gancho) err('área incompleta: ' + a.nome);
  for (const e of a.enc) if (!nomes.has(e)) err(`encontro inexistente em "${a.nome}": ${e}`);
}
console.log('áreas por bioma:', biomas);
const mb = {}; for (const m of mapas) { mb[m.bioma] = (mb[m.bioma] || 0) + 1; if (!fs.existsSync(path.join('public', m.arquivo))) err('arquivo de mapa ausente: ' + m.arquivo); if (!m.licenca || !m.pagina) err('mapa sem crédito: ' + m.id); }
for (const b of Object.keys(biomas)) if (!mb[b]) err('bioma sem mapa: ' + b);
console.log('mapas por bioma:', mb);
console.log(erros ? `${erros} problemas` : 'biblioteca ok');
process.exit(erros ? 1 : 0);
