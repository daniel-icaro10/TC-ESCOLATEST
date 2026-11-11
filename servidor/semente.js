'use strict';
/* Dados iniciais do banco.
   - basico(): o que toda instalação nova precisa (disciplinas e configurações da escola).
   - exemplo(): turmas, alunos, notas e professores fictícios, só para as demonstrações. */

const DISCIPLINAS = ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia', 'Arte', 'Educação Física', 'Língua Inglesa'];

function basico(db) {
  if (db.um('SELECT 1 FROM disciplinas LIMIT 1')) return;
  db.transacao(() => {
    DISCIPLINAS.forEach((nome, i) => db.rodar('INSERT INTO disciplinas (nome, ordem, carga_horaria) VALUES (?, ?, 100)', nome, i));
    if (db.config('escola') === null) db.salvarConfig('escola', { nome: 'Centro Educacional Futuro', anoLetivo: new Date().getFullYear(), cidade: '', telefone: '', email: '' });
  });
}

function exemplo(db) {
  if (db.um('SELECT 1 FROM turmas LIMIT 1')) return false;
  basico(db);
  const ano = db.config('escola').anoLetivo;
  let seed = 20260;
  const R = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = a => a[Math.floor(R() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const half = v => Math.round(v * 2) / 2;

  const NOMES = ['Ana Clara', 'Miguel', 'Helena', 'Arthur', 'Alice', 'Gael', 'Laura', 'Heitor', 'Manuela', 'Theo', 'Valentina', 'Davi', 'Sophia', 'Bernardo', 'Lívia', 'Lorenzo', 'Isabela', 'Samuel', 'Maria Luísa', 'Gabriel', 'Cecília', 'Pedro Henrique', 'Beatriz', 'Enzo', 'Lara', 'Benício', 'Giovanna', 'Rafael', 'Marina', 'Lucas', 'Yasmin', 'Matheus', 'Clara', 'Joaquim', 'Rebeca', 'Nicolas', 'Júlia', 'Bento', 'Eloá', 'Caio', 'Esther', 'Murilo', 'Antonella', 'Vicente', 'Luna'];
  const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Castro', 'Correia', 'Costa', 'Dias', 'Ferreira', 'Gomes', 'Lima', 'Machado', 'Martins', 'Melo', 'Monteiro', 'Moreira', 'Nascimento', 'Oliveira', 'Pereira', 'Pinto', 'Ramos', 'Ribeiro', 'Rocha', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira', 'Araújo', 'Freitas'];
  const PAIS = ['Adriana', 'Carlos', 'Fabiana', 'Roberto', 'Luciana', 'Marcelo', 'Vanessa', 'André', 'Priscila', 'Fábio', 'Renata', 'Paulo', 'Camila', 'Sérgio', 'Tatiane', 'Daniela', 'Rogério', 'Aline'];
  const PROF_I = ['Rayane Campos', 'Patrícia Leal', 'Fernanda Duarte', 'Juliana Prado', 'Cláudia Rezende'];
  const PROF = { 'Língua Portuguesa': 'Marcos Valente', 'Matemática': 'Renata Siqueira', 'Ciências': 'Tainá Viana', 'História': 'Eduardo Paiva', 'Geografia': 'Simone Fontes', 'Arte': 'Letícia Amaral', 'Educação Física': 'Rodrigo Brandão', 'Língua Inglesa': 'Thaíza Assis' };
  const CONTAGEM = [19, 26, 16, 26, 22, 28, 24, 21, 18];
  const tel = () => `(21) 9${Math.floor(1000 + R() * 8999)}-${Math.floor(1000 + R() * 8999)}`;
  const slug = n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ').filter(Boolean);

  db.transacao(() => {
    const disc = db.todos('SELECT id, nome FROM disciplinas ORDER BY ordem');
    const profId = new Map();
    const professor = nome => {
      if (!profId.has(nome)) { const s = slug(nome); profId.set(nome, db.rodar('INSERT INTO professores (nome, email, tel) VALUES (?, ?, ?)', nome, `${s[0]}.${s[s.length - 1]}@cefuturo.edu.br`, tel()).id); }
      return profId.get(nome);
    };
    let mat = Number(`${ano}001`);
    CONTAGEM.forEach((qtd, i) => {
      const serie = i + 1, fund1 = serie <= 5, regente = PROF_I[i % PROF_I.length];
      const turmaId = db.rodar('INSERT INTO turmas (ano_letivo, serie, nome, turno, criterio) VALUES (?, ?, ?, ?, ?)', ano, serie, `${serie}º Ano de Escolaridade`,
        fund1 ? 'Tarde' : 'Manhã', serie === 1 ? 'Critério Fundamental 1º Ano demais matérias' : 'Critério Fundamental 2º ao 9º Ano').id;
      disc.forEach(d => {
        const nomeProf = (serie === 7 && d.nome === 'Arte') ? null : fund1 && !['Educação Física', 'Língua Inglesa'].includes(d.nome) ? regente : PROF[d.nome];
        db.rodar('INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id, entregue) VALUES (?, ?, ?, ?)', turmaId, d.id, nomeProf ? professor(nomeProf) : null, R() > .3 ? 1 : 0);
      });
      for (let k = 0; k < qtd; k++) {
        const base = R() < .12 ? 3.4 + R() * 2.4 : 6.2 + R() * 3.7;
        const nome = `${pick(NOMES)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
        const nascAno = ano - 6 - serie + (R() < .2 ? -1 : 0);
        const nasc = `${nascAno}-${String(1 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 28)).padStart(2, '0')}`;
        const alunoId = db.rodar('INSERT INTO alunos (matricula, nome, nascimento, turma_id, consentimento_biometria) VALUES (?, ?, ?, ?, 1)', mat++, nome, nasc, turmaId).id;
        disc.forEach(d => {
          const tilt = (R() - .5) * 1.4;
          for (let b = 1; b <= 3; b++) {
            const v = () => clamp(base + tilt + (R() - .5) * 2.4, 0, 10);
            const n = { at: half(v() * .3), tbl: half(v() * .7), te: half(v()), pr: half(v()), rp: null };
            const media = Math.min(10, Math.floor((n.at + n.tbl + n.te + n.pr) / 3 * 10 + 1e-9) / 10);
            if (media < 6 && R() < .5) n.rp = half(clamp(base + 1 + R() * 2, 0, 10));
            db.rodar('INSERT INTO notas (aluno_id, disciplina_id, bimestre, at, tbl, te, pr, rp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', alunoId, d.id, b, n.at, n.tbl, n.te, n.pr, n.rp);
          }
          const f = R() < .6 ? 0 : Math.floor(R() * (base < 6 ? 6 : 3));
          if (f) db.rodar('INSERT INTO faltas (aluno_id, disciplina_id, bimestre, qtd) VALUES (?, ?, 1, ?)', alunoId, d.id, f);
        });
        const nomeResp = `${pick(PAIS)} ${nome.split(' ').slice(-1)[0]}`, s = slug(nomeResp);
        db.rodar('INSERT INTO responsaveis (aluno_id, nome, parentesco, tel, email) VALUES (?, ?, ?, ?, ?)', alunoId, nomeResp, pick(['Mãe', 'Pai', 'Mãe', 'Avó', 'Mãe']), tel(), `${s[0]}.${s[s.length - 1]}@email.com`);
      }
    });
  });
  return true;
}

module.exports = { basico, exemplo, DISCIPLINAS };
