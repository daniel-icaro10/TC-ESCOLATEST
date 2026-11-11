'use strict';
/* =====================================================================
   Dados da escola vindos do servidor (/api/dados), já organizados para as telas.
   ===================================================================== */
let DISC = [], TURMAS = [], ALUNOS = [], RESP = [], PROFS = [], LISTAS = { situacoes: [], turnos: [], parentescos: [] };

const discDe = id => DISC.find(d => d.id === Number(id));
const turmaDe = id => TURMAS.find(t => t.id === Number(id));
const alunoDe = id => ALUNOS.find(a => a.id === Number(id));
const alunoPorMat = m => ALUNOS.find(a => String(a.mat) === String(m));
const profDe = id => PROFS.find(p => p.id === Number(id));

const SITUACAO = { cursando: 'Cursando', transferido: 'Transferido', cancelado: 'Cancelado', aprovado: 'Aprovado', reprovado: 'Reprovado', concluido: 'Concluído' };
const SIT_PILL = { cursando: 'ok', transferido: 'todo', cancelado: 'todo', aprovado: 'ok', reprovado: 'bad', concluido: 'doing' };
const ATIVO = a => ['cursando', 'aprovado', 'reprovado'].includes(a.situacao);
const pillSituacao = s => html`<span class="pill ${SIT_PILL[s] || 'todo'}">${SITUACAO[s] || s}</span>`;

/* média do bimestre: (AT + TBL + TESTE + PROVA) / 3, com AT + TBL valendo uma nota.
   A recuperação paralela (RP), se maior que a média, faz a média com ela. */
function mediaBim(n) {
  if (!n) return null;
  const v = [n.at, n.tbl, n.te, n.pr];
  if (v.every(x => x == null)) return n.rp ?? null;
  let m = Math.min(10, trunc1(v.reduce((s, x) => s + (x || 0), 0) / 3));
  if (n.rp != null && n.rp > m) m = trunc1((m + n.rp) / 2);
  return m;
}
function mediaAnual(a, discId) {
  const ms = (a.notas[discId] || []).map(mediaBim).filter(m => m != null);
  return ms.length ? trunc1(ms.reduce((s, m) => s + m, 0) / ms.length) : null;
}
const faltasDisc = (a, discId) => (a.faltasBim[discId] || []).reduce((s, x) => s + (x || 0), 0);
const faltasAluno = a => DISC.reduce((s, d) => s + faltasDisc(a, d.id), 0);
const cargaTotal = () => DISC.reduce((s, d) => s + (d.carga || 0), 0) || 800;

async function carregarDados() {
  const d = await api('dados');
  SESSAO.escola = d.escola || SESSAO.escola;
  LISTAS = { situacoes: d.situacoes, turnos: d.turnos, parentescos: d.parentescos };
  DISC = d.disciplinas;
  PROFS = d.professores;
  TURMAS = d.turmas.map(t => ({
    ...t, etapa: `${t.serie}º Ano`,
    disciplinas: t.disciplinas.map(v => { const di = discDe(v.disciplinaId); const p = profDe(v.professorId); return { id: v.disciplinaId, nome: di ? di.nome : '?', profId: v.professorId, prof: p ? p.nome : null, entregue: v.entregue }; })
      .sort((x, y) => (discDe(x.id)?.ordem ?? 0) - (discDe(y.id)?.ordem ?? 0)),
    alunos: []
  }));
  ALUNOS = d.alunos.map(a => ({ ...a, mat: a.matricula, turma: a.turmaId, nasc: dataBR(a.nascimento), notas: {}, faltasBim: {} }));
  const porId = new Map(ALUNOS.map(a => [a.id, a]));
  (d.notas || []).forEach(([aid, did, b, at, tbl, te, pr, rp]) => {
    const a = porId.get(aid); if (!a) return;
    (a.notas[did] = a.notas[did] || [null, null, null, null])[b - 1] = { at, tbl, te, pr, rp };
  });
  (d.faltas || []).forEach(([aid, did, b, q]) => {
    const a = porId.get(aid); if (!a) return;
    (a.faltasBim[did] = a.faltasBim[did] || [0, 0, 0, 0])[b - 1] = q;
  });
  ALUNOS.forEach(a => { const t = turmaDe(a.turma); if (t) t.alunos.push(a); });
  TURMAS.forEach(t => t.alunos.sort(sortNome));
  RESP = d.responsaveis;
  // professores: disciplinas e turmas em que dão aula
  PROFS.forEach(p => { p.disc = new Set(); p.turmas = new Set(); });
  TURMAS.forEach(t => t.disciplinas.forEach(v => { const p = profDe(v.profId); if (p) { p.disc.add(v.nome); p.turmas.add(t.etapa); } }));
  PROFS.forEach(p => { p.disc = [...p.disc]; p.turmas = [...p.turmas]; });
}

const pendentes = () => TURMAS.flatMap(t => t.disciplinas.filter(d => d.prof && !d.entregue).map(d => ({ ...d, turma: t })));
const semVinculo = t => t.disciplinas.filter(d => !d.prof).map(d => d.nome);
const optTurmas = () => TURMAS.map(t => ({ v: t.id, t: `${t.nome} · ${t.turno}${t.anoLetivo !== SESSAO.escola.anoLetivo ? ` (${t.anoLetivo})` : ''}` }));
const optProfs = () => [...PROFS].filter(p => p.ativo !== 0).sort(sortNome).map(p => ({ v: p.id, t: p.nome }));
