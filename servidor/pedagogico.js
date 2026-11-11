'use strict';
/* Pedagógico: horários, ocorrências, planejamento de aulas, habilidades (BNCC) e simulados. */
const { ErroHttp, valida } = require('./http');
const { pode } = require('./auth');

const TIPOS_OCORRENCIA = ['Advertência', 'Indisciplina', 'Atraso', 'Falta sem justificativa', 'Tarefa não entregue', 'Saúde', 'Elogio', 'Conversa com responsável', 'Outro'];
const STATUS_PLANO = ['rascunho', 'enviado', 'aprovado', 'devolvido'];

function criarPedagogico(db) {
  // turmas/disciplinas em que o professor do usuário dá aula
  const vinculosProf = usuario => usuario.professorId ? db.todos('SELECT turma_id t, disciplina_id d FROM turma_disciplinas WHERE professor_id = ?', usuario.professorId) : [];
  const turmasProf = usuario => new Set(vinculosProf(usuario).map(v => v.t));
  const ehDoProf = (usuario, t, d) => vinculosProf(usuario).some(v => v.t === t && (d == null || v.d === d));
  const precisa = (v, msg) => { if (!v) throw new ErroHttp(msg, 404); return v; };
  const veEscola = u => pode(u, 'escola.ver');
  const texto = (v, nome, max = 4000) => valida.texto(v, nome, { max }).replace(/ {2,}/g, ' ');
  const textoLongo = (v, max = 8000) => String(v ?? '').trim().slice(0, max);

  function registrar(rota) {
    /* ================= Horários ================= */
    rota('GET', '/api/horarios', 'logado', ({ usuario, url }) => {
      const ano = Number(url.searchParams.get('ano')) || db.config('escola', {}).anoLetivo;
      let aulas = db.todos(`SELECT h.turma_id turmaId, h.dia, h.aula, h.disciplina_id disciplinaId, td.professor_id professorId
        FROM horarios h JOIN turmas t ON t.id = h.turma_id LEFT JOIN turma_disciplinas td ON td.turma_id = h.turma_id AND td.disciplina_id = h.disciplina_id WHERE t.ano_letivo = ?`, ano);
      let tempos = db.todos('SELECT ht.turma_id turmaId, ht.aula, ht.inicio, ht.fim FROM horario_tempos ht JOIN turmas t ON t.id = ht.turma_id WHERE t.ano_letivo = ?', ano);
      if (!veEscola(usuario)) {
        const minhas = turmasProf(usuario);
        aulas = aulas.filter(a => minhas.has(a.turmaId)); tempos = tempos.filter(t => minhas.has(t.turmaId));
      }
      return { aulas, tempos };
    });
    rota('PUT', '/api/horarios/:turma', 'cadastros', ({ params, corpo, auditar }) => {
      const t = precisa(db.um('SELECT * FROM turmas WHERE id = ?', valida.inteiro(params.turma, 'Turma', 1)), 'Turma não encontrada.');
      const aulas = Array.isArray(corpo.aulas) ? corpo.aulas : [], tempos = Array.isArray(corpo.tempos) ? corpo.tempos : [];
      const hora = v => { const s = String(v || '').trim(); if (s && !/^\d{1,2}:\d{2}$/.test(s)) throw new ErroHttp(`Horário "${s}" inválido. Use o formato 07:30.`); return s || null; };
      db.transacao(() => {
        db.rodar('DELETE FROM horarios WHERE turma_id = ?', t.id);
        db.rodar('DELETE FROM horario_tempos WHERE turma_id = ?', t.id);
        aulas.forEach(a => {
          const dia = valida.inteiro(a.dia, 'Dia', 1, 6), aula = valida.inteiro(a.aula, 'Aula', 1, 12);
          if (!a.disciplinaId) return;
          db.rodar('INSERT INTO horarios (turma_id, dia, aula, disciplina_id) VALUES (?, ?, ?, ?)', t.id, dia, aula, valida.inteiro(a.disciplinaId, 'Disciplina', 1));
        });
        tempos.forEach(x => db.rodar('INSERT INTO horario_tempos (turma_id, aula, inicio, fim) VALUES (?, ?, ?, ?)', t.id, valida.inteiro(x.aula, 'Aula', 1, 12), hora(x.inicio), hora(x.fim)));
      });
      // choque: o mesmo professor em duas turmas no mesmo dia e aula
      const choques = db.todos(`SELECT p.nome professor, h.dia, h.aula, t2.nome outra FROM horarios h
        JOIN turma_disciplinas td ON td.turma_id = h.turma_id AND td.disciplina_id = h.disciplina_id
        JOIN horarios h2 ON h2.dia = h.dia AND h2.aula = h.aula AND h2.turma_id <> h.turma_id
        JOIN turma_disciplinas td2 ON td2.turma_id = h2.turma_id AND td2.disciplina_id = h2.disciplina_id AND td2.professor_id = td.professor_id
        JOIN turmas t2 ON t2.id = h2.turma_id AND t2.ano_letivo = ? JOIN professores p ON p.id = td.professor_id
        WHERE h.turma_id = ? AND td.professor_id IS NOT NULL`, t.ano_letivo, t.id);
      auditar('alterou horário', t.nome);
      return { ok: true, choques };
    });

    /* ================= Ocorrências ================= */
    rota('GET', '/api/ocorrencias', 'logado', ({ usuario, url }) => {
      const aluno = Number(url.searchParams.get('aluno')) || null;
      let lista = db.todos(`SELECT o.id, o.aluno_id alunoId, a.nome aluno, a.turma_id turmaId, o.data, o.tipo, o.descricao, o.providencia, o.responsavel_avisado responsavelAvisado,
        o.resolvida, o.autor_id autorId, o.autor, o.criado_em criadoEm FROM ocorrencias o JOIN alunos a ON a.id = o.aluno_id
        ${aluno ? 'WHERE o.aluno_id = ?' : ''} ORDER BY o.data DESC, o.id DESC LIMIT 1000`, ...(aluno ? [aluno] : []));
      if (!pode(usuario, 'pedagogico.ver')) {
        if (!pode(usuario, 'pedagogico.proprio')) throw new ErroHttp('Você não tem permissão para ver ocorrências.', 403);
        lista = lista.filter(o => o.autorId === usuario.id);   // professor vê as que registrou
      }
      return lista.map(o => ({ ...o, responsavelAvisado: !!o.responsavelAvisado, resolvida: !!o.resolvida }));
    });
    const dadosOcorrencia = (c, usuario) => {
      const aluno = precisa(db.um('SELECT id, nome, turma_id FROM alunos WHERE id = ?', valida.inteiro(c.alunoId, 'Aluno', 1)), 'Aluno não encontrado.');
      if (!pode(usuario, 'pedagogico') && !pode(usuario, 'cadastros') && !turmasProf(usuario).has(aluno.turma_id)) throw new ErroHttp('Você só pode registrar ocorrências de alunos das suas turmas.', 403);
      if (!TIPOS_OCORRENCIA.includes(c.tipo)) throw new ErroHttp('Escolha o tipo da ocorrência.');
      const desc = textoLongo(c.descricao, 4000); if (!desc) throw new ErroHttp('Descreva o que aconteceu.');
      return { aluno, data: valida.dataISO(c.data, 'Data', { obrigatorio: true }), tipo: c.tipo, descricao: desc, providencia: textoLongo(c.providencia, 2000), avisado: !!c.responsavelAvisado, resolvida: !!c.resolvida };
    };
    const podeOcorrencia = u => pode(u, 'pedagogico') || pode(u, 'cadastros') || pode(u, 'pedagogico.proprio');
    rota('POST', '/api/ocorrencias', 'logado', ({ corpo, usuario, auditar }) => {
      if (!podeOcorrencia(usuario)) throw new ErroHttp('Você não tem permissão para registrar ocorrências.', 403);
      const d = dadosOcorrencia(corpo, usuario);
      const id = db.rodar('INSERT INTO ocorrencias (aluno_id, data, tipo, descricao, providencia, responsavel_avisado, resolvida, autor_id, autor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        d.aluno.id, d.data, d.tipo, d.descricao, d.providencia, d.avisado, d.resolvida, usuario.id, usuario.nome).id;
      auditar('registrou ocorrência', `${d.tipo}: ${d.aluno.nome}`);
      return { id };
    });
    const ocorrenciaEditavel = (id, usuario) => {
      const o = precisa(db.um('SELECT * FROM ocorrencias WHERE id = ?', valida.inteiro(id, 'Ocorrência', 1)), 'Ocorrência não encontrada.');
      if (!pode(usuario, 'pedagogico') && !pode(usuario, 'cadastros') && o.autor_id !== usuario.id) throw new ErroHttp('Só quem registrou ou a coordenação pode alterar esta ocorrência.', 403);
      return o;
    };
    rota('PUT', '/api/ocorrencias/:id', 'logado', ({ params, corpo, usuario, auditar }) => {
      const o = ocorrenciaEditavel(params.id, usuario), d = dadosOcorrencia({ alunoId: o.aluno_id, ...corpo }, usuario);
      db.rodar('UPDATE ocorrencias SET data = ?, tipo = ?, descricao = ?, providencia = ?, responsavel_avisado = ?, resolvida = ? WHERE id = ?', d.data, d.tipo, d.descricao, d.providencia, d.avisado, d.resolvida, o.id);
      auditar('alterou ocorrência', `${d.tipo}: ${d.aluno.nome}`);
      return { ok: true };
    });
    rota('DELETE', '/api/ocorrencias/:id', 'logado', ({ params, usuario, auditar }) => {
      const o = ocorrenciaEditavel(params.id, usuario);
      db.rodar('DELETE FROM ocorrencias WHERE id = ?', o.id);
      auditar('apagou ocorrência', `id ${o.id}`);
      return { ok: true };
    });

    /* ================= Planejamento de aulas ================= */
    rota('GET', '/api/planos', 'logado', ({ usuario }) => {
      const geral = pode(usuario, 'pedagogico.ver');
      if (!geral && !pode(usuario, 'pedagogico.proprio')) throw new ErroHttp('Você não tem permissão para ver planejamentos.', 403);
      return db.todos(`SELECT pl.id, pl.professor_id professorId, p.nome professor, pl.turma_id turmaId, pl.disciplina_id disciplinaId, pl.inicio, pl.fim, pl.titulo, pl.objetivos,
        pl.conteudo, pl.metodologia, pl.avaliacao, pl.habilidades, pl.status, pl.comentario, pl.criado_em criadoEm, pl.atualizado_em atualizadoEm
        FROM planos pl LEFT JOIN professores p ON p.id = pl.professor_id ${geral ? '' : 'WHERE pl.professor_id = ?'} ORDER BY pl.inicio DESC, pl.id DESC LIMIT 1000`, ...(geral ? [] : [usuario.professorId || 0]))
        .filter(p => geral || p.status !== undefined);
    });
    const dadosPlano = (c, usuario, atual) => {
      const t = valida.inteiro(c.turmaId ?? atual?.turma_id, 'Turma', 1), d = valida.inteiro(c.disciplinaId ?? atual?.disciplina_id, 'Disciplina', 1);
      if (!ehDoProf(usuario, t, d)) throw new ErroHttp('Escolha uma turma e disciplina sua.', 403);
      const inicio = valida.dataISO(c.inicio, 'Data de início', { obrigatorio: true }), fim = valida.dataISO(c.fim, 'Data final');
      if (fim && fim < inicio) throw new ErroHttp('A data final é antes da data de início.');
      return { t, d, inicio, fim, titulo: texto(c.titulo, 'o tema', 200) || (() => { throw new ErroHttp('Preencha o tema da aula.'); })(),
        objetivos: textoLongo(c.objetivos), conteudo: textoLongo(c.conteudo), metodologia: textoLongo(c.metodologia), avaliacao: textoLongo(c.avaliacao), habilidades: textoLongo(c.habilidades, 2000),
        status: c.enviar ? 'enviado' : (atual && atual.status === 'aprovado' ? 'enviado' : 'rascunho') };
    };
    rota('POST', '/api/planos', 'pedagogico.proprio', ({ corpo, usuario, auditar }) => {
      const d = dadosPlano(corpo, usuario);
      const id = db.rodar(`INSERT INTO planos (professor_id, turma_id, disciplina_id, inicio, fim, titulo, objetivos, conteudo, metodologia, avaliacao, habilidades, status, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, usuario.professorId, d.t, d.d, d.inicio, d.fim, d.titulo, d.objetivos, d.conteudo, d.metodologia, d.avaliacao, d.habilidades, d.status).id;
      auditar('criou planejamento', d.titulo);
      return { id };
    });
    rota('PUT', '/api/planos/:id', 'logado', ({ params, corpo, usuario, auditar }) => {
      const p = precisa(db.um('SELECT * FROM planos WHERE id = ?', valida.inteiro(params.id, 'Plano', 1)), 'Planejamento não encontrado.');
      if (corpo.revisao) {   // coordenação aprova ou devolve com comentário
        if (!pode(usuario, 'pedagogico')) throw new ErroHttp('Só a coordenação revisa planejamentos.', 403);
        if (!['aprovado', 'devolvido'].includes(corpo.status)) throw new ErroHttp('Escolha aprovar ou devolver.');
        db.rodar("UPDATE planos SET status = ?, comentario = ?, atualizado_em = datetime('now') WHERE id = ?", corpo.status, textoLongo(corpo.comentario, 2000), p.id);
        auditar(corpo.status === 'aprovado' ? 'aprovou planejamento' : 'devolveu planejamento', p.titulo);
        return { ok: true };
      }
      if (p.professor_id !== usuario.professorId) throw new ErroHttp('Só o professor que escreveu pode alterar este planejamento.', 403);
      const d = dadosPlano(corpo, usuario, p);
      db.rodar(`UPDATE planos SET turma_id = ?, disciplina_id = ?, inicio = ?, fim = ?, titulo = ?, objetivos = ?, conteudo = ?, metodologia = ?, avaliacao = ?, habilidades = ?, status = ?, atualizado_em = datetime('now') WHERE id = ?`,
        d.t, d.d, d.inicio, d.fim, d.titulo, d.objetivos, d.conteudo, d.metodologia, d.avaliacao, d.habilidades, d.status, p.id);
      auditar('alterou planejamento', d.titulo);
      return { ok: true };
    });
    rota('DELETE', '/api/planos/:id', 'logado', ({ params, usuario, auditar }) => {
      const p = precisa(db.um('SELECT * FROM planos WHERE id = ?', valida.inteiro(params.id, 'Plano', 1)), 'Planejamento não encontrado.');
      if (p.professor_id !== usuario.professorId && usuario.papel !== 'admin') throw new ErroHttp('Só o professor que escreveu pode apagar.', 403);
      db.rodar('DELETE FROM planos WHERE id = ?', p.id);
      auditar('apagou planejamento', p.titulo);
      return { ok: true };
    });

    /* ================= Habilidades (BNCC) ================= */
    rota('GET', '/api/habilidades', 'logado', ({ usuario, url }) => {
      const t = valida.inteiro(url.searchParams.get('turma'), 'Turma', 1);
      if (!veEscola(usuario) && !turmasProf(usuario).has(t)) throw new ErroHttp('Turma não é sua.', 403);
      return db.todos('SELECT id, disciplina_id disciplinaId, codigo, descricao, bimestre, trabalhada FROM habilidades WHERE turma_id = ? ORDER BY disciplina_id, bimestre, codigo, id', t)
        .map(h => ({ ...h, trabalhada: !!h.trabalhada }));
    });
    const editaHab = (u, t, d) => pode(u, 'pedagogico') || pode(u, 'cadastros') || ehDoProf(u, t, d);
    rota('POST', '/api/habilidades', 'logado', ({ corpo, usuario, auditar }) => {
      const t = valida.inteiro(corpo.turmaId, 'Turma', 1), d = valida.inteiro(corpo.disciplinaId, 'Disciplina', 1);
      if (!editaHab(usuario, t, d)) throw new ErroHttp('Você não pode alterar as habilidades desta disciplina.', 403);
      const bim = corpo.bimestre ? valida.inteiro(corpo.bimestre, 'Bimestre', 1, 4) : null;
      // aceita várias linhas: "EF05MA01 - descrição" ou só a descrição
      const linhas = String(corpo.texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!linhas.length) throw new ErroHttp('Escreva ao menos uma habilidade.');
      if (linhas.length > 300) throw new ErroHttp('No máximo 300 habilidades de cada vez.');
      db.transacao(() => linhas.forEach(l => {
        const m = l.match(/^\(?([A-Z]{2}\d{2}[A-Z]{2}\d{2,3}[A-Z]?)\)?\s*[-–:.]?\s*(.*)$/);
        db.rodar('INSERT INTO habilidades (turma_id, disciplina_id, codigo, descricao, bimestre) VALUES (?, ?, ?, ?, ?)', t, d, m ? m[1] : null, (m ? m[2] : l).slice(0, 1000) || l.slice(0, 1000), bim);
      }));
      auditar('cadastrou habilidades', `${linhas.length} na turma ${t}`);
      return { criadas: linhas.length };
    });
    rota('PUT', '/api/habilidades/:id', 'logado', ({ params, corpo, usuario }) => {
      const h = precisa(db.um('SELECT * FROM habilidades WHERE id = ?', valida.inteiro(params.id, 'Habilidade', 1)), 'Habilidade não encontrada.');
      if (!editaHab(usuario, h.turma_id, h.disciplina_id)) throw new ErroHttp('Você não pode alterar esta habilidade.', 403);
      db.rodar('UPDATE habilidades SET trabalhada = ?, bimestre = ? WHERE id = ?', corpo.trabalhada === undefined ? h.trabalhada : !!corpo.trabalhada,
        corpo.bimestre === undefined ? h.bimestre : (corpo.bimestre ? valida.inteiro(corpo.bimestre, 'Bimestre', 1, 4) : null), h.id);
      return { ok: true };
    });
    rota('DELETE', '/api/habilidades/:id', 'logado', ({ params, usuario }) => {
      const h = precisa(db.um('SELECT * FROM habilidades WHERE id = ?', valida.inteiro(params.id, 'Habilidade', 1)), 'Habilidade não encontrada.');
      if (!editaHab(usuario, h.turma_id, h.disciplina_id)) throw new ErroHttp('Você não pode apagar esta habilidade.', 403);
      db.rodar('DELETE FROM habilidades WHERE id = ?', h.id);
      return { ok: true };
    });

    /* ================= Simulados ================= */
    const veSim = u => pode(u, 'notas') || pode(u, 'relatorios');
    rota('GET', '/api/simulados', 'logado', ({ usuario }) => {
      if (!veSim(usuario)) throw new ErroHttp('Você não tem permissão para ver simulados.', 403);
      return db.todos('SELECT id, nome, data, ano_letivo ano FROM simulados ORDER BY COALESCE(data, criado_em) DESC').map(s => ({
        ...s,
        turmas: db.todos('SELECT turma_id FROM simulado_turmas WHERE simulado_id = ?', s.id).map(r => r.turma_id),
        disciplinas: db.todos('SELECT disciplina_id disciplinaId, questoes FROM simulado_disciplinas WHERE simulado_id = ?', s.id),
        lancados: db.um('SELECT COUNT(DISTINCT aluno_id) n FROM simulado_resultados WHERE simulado_id = ?', s.id).n
      }));
    });
    rota('GET', '/api/simulados/:id/resultados', 'logado', ({ params, usuario }) => {
      if (!veSim(usuario)) throw new ErroHttp('Você não tem permissão para ver simulados.', 403);
      return db.todos('SELECT aluno_id alunoId, disciplina_id disciplinaId, acertos FROM simulado_resultados WHERE simulado_id = ?', valida.inteiro(params.id, 'Simulado', 1));
    });
    const dadosSim = c => {
      const turmas = (Array.isArray(c.turmas) ? c.turmas : []).map(Number).filter(Number.isInteger);
      const discs = (Array.isArray(c.disciplinas) ? c.disciplinas : []).map(d => ({ id: valida.inteiro(d.disciplinaId, 'Disciplina', 1), q: valida.inteiro(d.questoes, 'Número de questões', 1, 500) }));
      if (!turmas.length) throw new ErroHttp('Marque as turmas que fazem o simulado.');
      if (!discs.length) throw new ErroHttp('Informe as disciplinas e o número de questões.');
      return { nome: texto(c.nome, 'o nome', 150) || (() => { throw new ErroHttp('Dê um nome ao simulado.'); })(), data: valida.dataISO(c.data, 'Data'), turmas, discs };
    };
    const gravarSim = (id, d) => {
      db.rodar('DELETE FROM simulado_turmas WHERE simulado_id = ?', id);
      db.rodar('DELETE FROM simulado_disciplinas WHERE simulado_id = ? ', id);
      d.turmas.forEach(t => db.rodar('INSERT INTO simulado_turmas (simulado_id, turma_id) VALUES (?, ?)', id, t));
      d.discs.forEach(x => db.rodar('INSERT INTO simulado_disciplinas (simulado_id, disciplina_id, questoes) VALUES (?, ?, ?)', id, x.id, x.q));
    };
    rota('POST', '/api/simulados', 'notas', ({ corpo, auditar }) => {
      const d = dadosSim(corpo);
      const id = db.transacao(() => { const id = db.rodar('INSERT INTO simulados (nome, data, ano_letivo) VALUES (?, ?, ?)', d.nome, d.data, db.config('escola', {}).anoLetivo).id; gravarSim(id, d); return id; });
      auditar('criou simulado', d.nome);
      return { id };
    });
    rota('PUT', '/api/simulados/:id', 'notas', ({ params, corpo, auditar }) => {
      const s = precisa(db.um('SELECT * FROM simulados WHERE id = ?', valida.inteiro(params.id, 'Simulado', 1)), 'Simulado não encontrado.');
      const d = dadosSim(corpo);
      db.transacao(() => { db.rodar('UPDATE simulados SET nome = ?, data = ? WHERE id = ?', d.nome, d.data, s.id); gravarSim(s.id, d); });
      auditar('alterou simulado', d.nome);
      return { ok: true };
    });
    rota('DELETE', '/api/simulados/:id', 'notas', ({ params, auditar }) => {
      const s = precisa(db.um('SELECT * FROM simulados WHERE id = ?', valida.inteiro(params.id, 'Simulado', 1)), 'Simulado não encontrado.');
      db.rodar('DELETE FROM simulados WHERE id = ?', s.id);
      auditar('apagou simulado', s.nome);
      return { ok: true };
    });
    rota('PUT', '/api/simulados/:id/resultados', 'notas', ({ params, corpo, auditar }) => {
      const s = precisa(db.um('SELECT * FROM simulados WHERE id = ?', valida.inteiro(params.id, 'Simulado', 1)), 'Simulado não encontrado.');
      const qs = new Map(db.todos('SELECT disciplina_id, questoes FROM simulado_disciplinas WHERE simulado_id = ?', s.id).map(r => [r.disciplina_id, r.questoes]));
      const linhas = Array.isArray(corpo.resultados) ? corpo.resultados : [];
      db.transacao(() => linhas.forEach(r => {
        const aid = valida.inteiro(r.alunoId, 'Aluno', 1), did = valida.inteiro(r.disciplinaId, 'Disciplina', 1);
        if (!qs.has(did)) throw new ErroHttp('Disciplina fora do simulado.');
        if (r.acertos === null || r.acertos === '' || r.acertos === undefined) { db.rodar('DELETE FROM simulado_resultados WHERE simulado_id = ? AND aluno_id = ? AND disciplina_id = ?', s.id, aid, did); return; }
        const ac = valida.inteiro(r.acertos, 'Acertos', 0, qs.get(did));
        db.rodar(`INSERT INTO simulado_resultados (simulado_id, aluno_id, disciplina_id, acertos) VALUES (?, ?, ?, ?)
          ON CONFLICT(simulado_id, aluno_id, disciplina_id) DO UPDATE SET acertos = excluded.acertos`, s.id, aid, did, ac);
      }));
      auditar('lançou resultados do simulado', s.nome);
      return { ok: true };
    });
  }
  return { registrar };
}

module.exports = { criarPedagogico, TIPOS_OCORRENCIA, STATUS_PLANO };
