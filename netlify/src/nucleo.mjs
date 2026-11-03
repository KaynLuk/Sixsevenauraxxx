// Peças compartilhadas pela API principal e pelas ferramentas do mestre (erros, validação, personagem).
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const erro = (status, msg) => { throw new HttpError(status, msg); };
export const int = (v, min, max) => { const n = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v; return Number.isInteger(n) && n >= min && n <= max ? n : null; };
export const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function estados(c) {
  const e = [];
  if (c.vida_atual === 0) e.push('caido'); else if (c.vida_atual / c.vida_max < 0.3) e.push('ferido');
  if (c.sanidade_atual === 0) e.push('enlouquecido'); else if (c.sanidade_atual / c.sanidade_max < 0.3) e.push('abalado');
  return e;
}
// nunca inclui senha_hash
export const pub = (c) => ({ id: c.id, nome: c.nome, foto_url: c.foto_url, vida_atual: c.vida_atual, vida_max: c.vida_max, sanidade_atual: c.sanidade_atual, sanidade_max: c.sanidade_max, estados: estados(c) });
export const comNome = (db, h) => ({ ...h, nome: db.chars.find((c) => c.id === h.character_id)?.nome || '?' });

// Dano/cura em vida ou sanidade de um personagem, com histórico. "tolerante": sem erro se nada muda (usado nos efeitos por turno).
export function aplicarAjuste(d, id, atributo, tipo, valor, descricao, autor, tolerante = false) {
  const ch = d.chars.find((x) => x.id === id);
  if (!ch) erro(404, 'Personagem não encontrado.');
  const antes = ch[atributo + '_atual'], max = ch[atributo + '_max'];
  const depois = Math.max(0, Math.min(max, antes + (tipo === 'dano' ? -valor : valor)));
  if (depois === antes) {
    if (tolerante) return null;
    const nm = atributo === 'vida' ? 'A vida' : 'A sanidade';
    erro(400, tipo === 'dano' ? `${nm} já está em zero.` : `${nm} já está no máximo.`);
  }
  ch[atributo + '_atual'] = depois;
  const h = { id: ++d.seq.h, character_id: id, atributo, delta: depois - antes, descricao, antes, depois, autor, criado_em: new Date().toISOString() };
  d.hist.push(h); if (d.hist.length > 1500) d.hist.splice(0, d.hist.length - 1500);
  return { personagem: pub(ch), evento: comNome(d, h) };
}
