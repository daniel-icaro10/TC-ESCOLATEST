'use strict';
/* API dos dados da escola: turmas, alunos, responsáveis, professores, disciplinas, notas e faltas. */
const { ErroHttp, valida } = require('./http');
const { pode } = require('./auth');

const SITUACOES = ['cursando', 'transferido', 'cancelado', 'aprovado', 'reprovado', 'concluido'];
const ATIVAS = ['cursando', 'aprovado', 'reprovado'];   // situações em que o aluno continua frequentando a escola
const TURNOS = ['Manhã', 'Tarde', 'Integral', 'Noite'];
const PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Responsável legal', 'Outro'];

function criarEscola(db, ganchos = {}) {
  const aluno = id => db.um('SELECT * FROM alunos WHERE id = ?', id);
  const turma = id => db.um('SELECT * FROM turmas WHERE id = ?', id);
  const precisa = (v, msg, status = 404) => { if (!v) throw new ErroHttp(msg, status); return v; };

  /* ---------- leitura: tudo o que o portal precisa, filtrado pelo tipo de usuário ---------- */
  function dados(usuario) {
    const escola = db.config('escola', {});
    const disciplinas = db.todos('SELECT id, nome, ordem, carga_horaria AS carga FROM disciplinas ORDER BY ordem, nome');
    let turmas = db.todos('SELECT id, ano_letivo AS anoLetivo, serie, nome, turno, nivel, criterio, finalizada, bloqueada FROM turmas ORDER BY ano_letivo DESC, serie, nome');
    const vinculos = db.todos('SELECT turma_id AS turmaId, disciplina_id AS disciplinaId, professor_id AS professorId, entregue FROM turma_disciplinas');
    let alunos = db.todos(`SELECT id, matricula, nome, nascimento, turma_id AS turmaId, situacao, sexo, cpf, naturalidade, endereco, observacoes,
      consentimento_biometria AS consentimentoBiometria, consentimento_em AS consentimentoEm FROM alunos ORDER BY nome`);
    let professores = db.todos('SELECT id, nome, email, tel, ativo FROM professores ORDER BY nome');
    let responsaveis = db.todos('SELECT id, aluno_id AS alunoId, nome, parentesco, tel, email, cpf FROM responsaveis ORDER BY nome');
    // só as notas do ano da turma atual de cada aluno; anos anteriores ficam no histórico escolar
    let notas = db.todos('SELECT n.aluno_id a, n.disciplina_id d, n.bimestre b, n.at, n.tbl, n.te, n.pr, n.rp FROM notas n JOIN alunos al ON al.id = n.aluno_id JOIN turmas t ON t.id = al.turma_id WHERE n.ano_letivo = t.ano_letivo').map(n => [n.a, n.d, n.b, n.at, n.tbl, n.te, n.pr, n.rp]);
    let faltas = db.todos('SELECT f.aluno_id a, f.disciplina_id d, f.bimestre b, f.qtd FROM faltas f JOIN alunos al ON al.id = f.aluno_id JOIN turmas t ON t.id = al.turma_id WHERE f.ano_letivo = t.ano_letivo AND f.qtd > 0').map(f => [f.a, f.d, f.b, f.qtd]);

    const porTurma = new Map();
    vinculos.forEach(v => { if (!porTurma.has(v.turmaId)) porTurma.set(v.turmaId, []); porTurma.get(v.turmaId).push({ disciplinaId: v.disciplinaId, professorId: v.professorId, entregue: !!v.entregue }); });
    turmas.forEach(t => { t.disciplinas = porTurma.get(t.id) || []; t.finalizada = !!t.finalizada; t.bloqueada = !!t.bloqueada; });
    alunos.forEach(a => { a.consentimentoBiometria = !!a.consentimentoBiometria; });

    if (usuario.papel === 'familia') {
      // família: só os próprios filhos, e só o que a escola deixou visível
      const cfgF = { mostrarNotas: true, ...(db.config('familia') || {}) };
      const meus = new Set(db.todos('SELECT aluno_id FROM usuario_alunos WHERE usuario_id = ?', usuario.id).map(r => r.aluno_id));
      alunos = alunos.filter(a => meus.has(a.id)).map(({ id, matricula, nome, nascimento, turmaId, situacao }) => ({ id, matricula, nome, nascimento, turmaId, situacao }));
      const turmasIds = new Set(alunos.map(a => a.turmaId));
      turmas = turmas.filter(t => turmasIds.has(t.id));
      notas = cfgF.mostrarNotas ? notas.filter(n => meus.has(n[0])) : [];
      faltas = cfgF.mostrarNotas ? faltas.filter(f => meus.has(f[0])) : [];
      professores = professores.filter(p => turmas.some(t => t.disciplinas.some(d => d.professorId === p.id))).map(({ id, nome }) => ({ id, nome }));
      responsaveis = [];
    } else if (!pode(usuario, 'escola.ver')) {
      if (usuario.papel === 'professor' && pode(usuario, 'notas.proprias')) {
        // professor: só as turmas e disciplinas em que dá aula, sem dados pessoais além do necessário
        const minhas = new Set(vinculos.filter(v => v.professorId === usuario.professorId).map(v => `${v.turmaId}|${v.disciplinaId}`));
        const turmasIds = new Set([...minhas].map(k => Number(k.split('|')[0])));
        turmas = turmas.filter(t => turmasIds.has(t.id));
        alunos = alunos.filter(a => turmasIds.has(a.turmaId)).map(({ id, matricula, nome, nascimento, turmaId, situacao }) => ({ id, matricula, nome, nascimento, turmaId, situacao }));
        const ids = new Set(alunos.map(a => a.id));
        const turmaDoAluno = new Map(alunos.map(a => [a.id, a.turmaId]));
        notas = notas.filter(n => ids.has(n[0]) && minhas.has(`${turmaDoAluno.get(n[0])}|${n[1]}`));
        faltas = faltas.filter(f => ids.has(f[0]) && minhas.has(`${turmaDoAluno.get(f[0])}|${f[1]}`));
        responsaveis = [];
        professores = professores.filter(p => p.id === usuario.professorId || turmas.some(t => t.disciplinas.some(d => d.professorId === p.id))).map(({ id, nome }) => ({ id, nome }));
      } else {
        // portaria e outros: só nome, matrícula e turma (para a lista de acessos da catraca)
        alunos = alunos.map(({ id, matricula, nome, turmaId, situacao }) => ({ id, matricula, nome, turmaId, situacao }));
        turmas = turmas.map(({ id, anoLetivo, serie, nome, turno, nivel }) => ({ id, anoLetivo, serie, nome, turno, nivel, disciplinas: [] }));
        notas = []; faltas = []; responsaveis = []; professores = [];
      }
    } else if (!pode(usuario, 'notas') && !pode(usuario, 'relatorios')) {
      notas = []; faltas = [];
    }
    return { escola, disciplinas, turmas, alunos, responsaveis, professores, notas, faltas, situacoes: SITUACOES, turnos: TURNOS, parentescos: PARENTESCOS };
  }

  /* ---------- validação ---------- */
  function dadosAluno(c, atual = {}) {
    const turmaId = c.turmaId === undefined ? atual.turma_id : (c.turmaId ? valida.inteiro(c.turmaId, 'Turma', 1) : null);
    if (turmaId && !turma(turmaId)) throw new ErroHttp('Turma não encontrada.');
    const situacao = c.situacao === undefined ? (atual.situacao || 'cursando') : String(c.situacao);
    if (!SITUACOES.includes(situacao)) throw new ErroHttp('Situação inválida.');
    const nascimento = c.nascimento === undefined ? atual.nascimento : valida.dataISO(c.nascimento, 'Data de nascimento', { obrigatorio: true });
    if (nascimento && nascimento > new Date().toISOString().slice(0, 10)) throw new ErroHttp('A data de nascimento não pode ser no futuro.');
    const cpf = c.cpf === undefined ? atual.cpf : String(c.cpf || '').replace(/\D/g, '');
    if (cpf && !cpfValido(cpf)) throw new ErroHttp('CPF inválido.');
    const nome = c.nome === undefined ? atual.nome : valida.texto(c.nome, 'o nome do aluno', { obrigatorio: true, max: 150 });
    if (nome.split(' ').length < 2) throw new ErroHttp('Digite o nome completo do aluno.');
    const t = (campo, col, max) => c[campo] === undefined ? (atual[col] ?? null) : valida.texto(c[campo], campo, { max });
    return {
      nome, nascimento, turmaId, situacao, cpf: cpf || null,
      sexo: c.sexo === undefined ? atual.sexo : (['F', 'M'].includes(c.sexo) ? c.sexo : null),
      naturalidade: t('naturalidade', 'naturalidade', 100), endereco: t('endereco', 'endereco', 250), observacoes: t('observacoes', 'observacoes', 1000),
      consentimento: c.consentimentoBiometria === undefined ? !!atual.consentimento_biometria : !!c.consentimentoBiometria
    };
  }
  function dadosResp(c) {
    const nome = valida.texto(c.nome, 'o nome do responsável', { obrigatorio: true, max: 150 });
    if (nome.split(' ').length < 2) throw new ErroHttp('Digite o nome completo do responsável.');
    const parentesco = PARENTESCOS.includes(c.parentesco) ? c.parentesco : 'Outro';
    const cpf = String(c.cpf || '').replace(/\D/g, '');
    if (cpf && !cpfValido(cpf)) throw new ErroHttp('CPF do responsável inválido.');
    return { nome, parentesco, tel: valida.telefone(c.tel, { obrigatorio: true }), email: valida.email(c.email), cpf: cpf || null };
  }
  function dadosProf(c) {
    const nome = valida.texto(c.nome, 'o nome do professor', { obrigatorio: true, max: 150 });
    if (nome.split(' ').length < 2) throw new ErroHttp('Digite o nome completo do professor.');
    return { nome, email: valida.email(c.email), tel: valida.telefone(c.tel), ativo: c.ativo === undefined ? 1 : (c.ativo ? 1 : 0) };
  }
  /* mantém o registro de matrícula do ano da turma atual igual ao cadastro do aluno */
  function sincronizarMatricula(alunoId) {
    const a = db.um('SELECT a.id, a.situacao, t.id tid, t.ano_letivo ano, t.nome, t.serie FROM alunos a JOIN turmas t ON t.id = a.turma_id WHERE a.id = ?', alunoId);
    if (!a) return;
    db.rodar(`INSERT INTO matriculas (aluno_id, ano_letivo, turma_id, turma_nome, serie, situacao) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(aluno_id, ano_letivo) DO UPDATE SET turma_id = excluded.turma_id, turma_nome = excluded.turma_nome, serie = excluded.serie, situacao = excluded.situacao`,
      a.id, a.ano, a.tid, a.nome, a.serie, a.situacao);
  }
  const proximaMatricula = () => {
    const ano = db.config('escola', {}).anoLetivo || new Date().getFullYear();
    const m = db.um('SELECT MAX(matricula) m FROM alunos').m;
    return Math.max(m ? m + 1 : 0, Number(`${ano}001`));
  };

  /* ---------- rotas ---------- */
  function registrar(rota) {
    rota('GET', '/api/dados', 'logado', ({ usuario }) => dados(usuario));
    rota('GET', '/api/alunos/proxima-matricula', 'cadastros', () => ({ matricula: proximaMatricula() }));

    /* ----- alunos ----- */
    rota('POST', '/api/alunos', 'cadastros', ({ corpo, auditar }) => {
      const d = dadosAluno(corpo);
      if (!d.turmaId) throw new ErroHttp('Escolha a turma.');
      const r = corpo.responsavel ? dadosResp(corpo.responsavel) : null;
      return db.transacao(() => {
        const matricula = corpo.matricula ? valida.inteiro(corpo.matricula, 'Matrícula', 1, 999999999999) : proximaMatricula();
        if (db.um('SELECT 1 FROM alunos WHERE matricula = ?', matricula)) throw new ErroHttp(`Já existe aluno com a matrícula ${matricula}.`, 409);
        const id = db.rodar(`INSERT INTO alunos (matricula, nome, nascimento, turma_id, situacao, sexo, cpf, naturalidade, endereco, observacoes, consentimento_biometria, consentimento_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, matricula, d.nome, d.nascimento, d.turmaId, d.situacao, d.sexo, d.cpf, d.naturalidade, d.endereco, d.observacoes,
          d.consentimento, d.consentimento ? new Date().toISOString() : null).id;
        if (r) db.rodar('INSERT INTO responsaveis (aluno_id, nome, parentesco, tel, email, cpf) VALUES (?, ?, ?, ?, ?, ?)', id, r.nome, r.parentesco, r.tel, r.email, r.cpf);
        sincronizarMatricula(id);
        auditar('matriculou aluno', `${d.nome} (matrícula ${matricula})`);
        return { id, matricula };
      });
    });

    rota('PUT', '/api/alunos/:id', 'cadastros', async ({ params, corpo, auditar }) => {
      const atual = precisa(aluno(valida.inteiro(params.id, 'Aluno', 1)), 'Aluno não encontrado.');
      const d = dadosAluno(corpo, atual);
      const consentimentoEm = d.consentimento ? (atual.consentimento_biometria ? atual.consentimento_em : new Date().toISOString()) : null;
      db.rodar(`UPDATE alunos SET nome = ?, nascimento = ?, turma_id = ?, situacao = ?, sexo = ?, cpf = ?, naturalidade = ?, endereco = ?, observacoes = ?,
        consentimento_biometria = ?, consentimento_em = ? WHERE id = ?`, d.nome, d.nascimento, d.turmaId, d.situacao, d.sexo, d.cpf, d.naturalidade, d.endereco,
        d.observacoes, d.consentimento, consentimentoEm, atual.id);
      sincronizarMatricula(atual.id);
      const mudou = [];
      if (atual.situacao !== d.situacao) mudou.push(`situação: ${d.situacao}`);
      if (atual.turma_id !== d.turmaId) mudou.push('turma');
      if (!!atual.consentimento_biometria !== d.consentimento) mudou.push(d.consentimento ? 'consentimento de biometria registrado' : 'consentimento de biometria retirado');
      auditar('alterou aluno', `${d.nome} (matrícula ${atual.matricula})${mudou.length ? ': ' + mudou.join(', ') : ''}`);
      // quem saiu da escola, ou retirou o consentimento, sai da catraca
      const aviso = (!ATIVAS.includes(d.situacao) || !d.consentimento) && ganchos.alunoSaiu ? await ganchos.alunoSaiu(atual.matricula, d) : null;
      return { ok: true, aviso };
    });

    rota('DELETE', '/api/alunos/:id', 'cadastros', async ({ params, auditar }) => {
      const atual = precisa(aluno(valida.inteiro(params.id, 'Aluno', 1)), 'Aluno não encontrado.');
      const aviso = ganchos.alunoSaiu ? await ganchos.alunoSaiu(atual.matricula, { removido: true }) : null;
      db.transacao(() => {
        db.rodar('DELETE FROM alunos WHERE id = ?', atual.id);   // notas, faltas e responsáveis vão junto (ON DELETE CASCADE)
        db.rodar('DELETE FROM catraca_status WHERE matricula = ?', atual.matricula);
      });
      auditar('excluiu aluno e todos os dados dele', `${atual.nome} (matrícula ${atual.matricula})`);
      return { ok: true, aviso };
    });

    /* ----- responsáveis ----- */
    rota('POST', '/api/responsaveis', 'cadastros', ({ corpo, auditar }) => {
      const a = precisa(aluno(valida.inteiro(corpo.alunoId, 'Aluno', 1)), 'Escolha o aluno.', 400);
      const r = dadosResp(corpo);
      const id = db.rodar('INSERT INTO responsaveis (aluno_id, nome, parentesco, tel, email, cpf) VALUES (?, ?, ?, ?, ?, ?)', a.id, r.nome, r.parentesco, r.tel, r.email, r.cpf).id;
      auditar('cadastrou responsável', `${r.nome} (aluno ${a.nome})`);
      return { id };
    });
    rota('PUT', '/api/responsaveis/:id', 'cadastros', ({ params, corpo, auditar }) => {
      const atual = precisa(db.um('SELECT * FROM responsaveis WHERE id = ?', valida.inteiro(params.id, 'Responsável', 1)), 'Responsável não encontrado.');
      const alunoId = corpo.alunoId ? precisa(aluno(valida.inteiro(corpo.alunoId, 'Aluno', 1)), 'Aluno não encontrado.', 400).id : atual.aluno_id;
      const r = dadosResp(corpo);
      db.rodar('UPDATE responsaveis SET aluno_id = ?, nome = ?, parentesco = ?, tel = ?, email = ?, cpf = ? WHERE id = ?', alunoId, r.nome, r.parentesco, r.tel, r.email, r.cpf, atual.id);
      auditar('alterou responsável', r.nome);
      return { ok: true };
    });
    rota('DELETE', '/api/responsaveis/:id', 'cadastros', ({ params, auditar }) => {
      const atual = precisa(db.um('SELECT * FROM responsaveis WHERE id = ?', valida.inteiro(params.id, 'Responsável', 1)), 'Responsável não encontrado.');
      db.rodar('DELETE FROM responsaveis WHERE id = ?', atual.id);
      auditar('excluiu responsável', atual.nome);
      return { ok: true };
    });

    /* ----- professores ----- */
    rota('POST', '/api/professores', 'cadastros', ({ corpo, auditar }) => {
      const p = dadosProf(corpo);
      const discs = (Array.isArray(corpo.disciplinas) ? corpo.disciplinas : []).map(Number).filter(Number.isInteger);
      return db.transacao(() => {
        const id = db.rodar('INSERT INTO professores (nome, email, tel, ativo) VALUES (?, ?, ?, 1)', p.nome, p.email, p.tel).id;
        // vincula às disciplinas marcadas que estão sem professor nas turmas do ano letivo atual
        const ano = db.config('escola', {}).anoLetivo;
        let vinculadas = 0;
        discs.forEach(did => { vinculadas += db.rodar(`UPDATE turma_disciplinas SET professor_id = ? WHERE disciplina_id = ? AND professor_id IS NULL
          AND turma_id IN (SELECT id FROM turmas WHERE ano_letivo = ?)`, id, did, ano).mudancas; });
        auditar('cadastrou professor', p.nome);
        return { id, vinculadas };
      });
    });
    rota('PUT', '/api/professores/:id', 'cadastros', ({ params, corpo, auditar }) => {
      const atual = precisa(db.um('SELECT * FROM professores WHERE id = ?', valida.inteiro(params.id, 'Professor', 1)), 'Professor não encontrado.');
      const p = dadosProf(corpo);
      db.rodar('UPDATE professores SET nome = ?, email = ?, tel = ?, ativo = ? WHERE id = ?', p.nome, p.email, p.tel, p.ativo, atual.id);
      auditar('alterou professor', p.nome);
      return { ok: true };
    });
    rota('DELETE', '/api/professores/:id', 'cadastros', ({ params, auditar }) => {
      const atual = precisa(db.um('SELECT * FROM professores WHERE id = ?', valida.inteiro(params.id, 'Professor', 1)), 'Professor não encontrado.');
      if (db.um('SELECT 1 FROM usuarios WHERE professor_id = ? AND ativo = 1', atual.id)) throw new ErroHttp('Este professor tem um usuário de acesso ativo. Desative o usuário em Configurações > Usuários antes.', 409);
      db.rodar('DELETE FROM professores WHERE id = ?', atual.id);   // as disciplinas dele ficam sem professor
      auditar('excluiu professor', atual.nome);
      return { ok: true };
    });

    /* ----- turmas ----- */
    function dadosTurma(c, atual = {}) {
      const serie = c.serie === undefined ? atual.serie : valida.inteiro(c.serie, 'Ano/série', 1, 12);
      const turno = c.turno === undefined ? atual.turno : (TURNOS.includes(c.turno) ? c.turno : null);
      if (!turno) throw new ErroHttp('Escolha o turno.');
      const nome = valida.texto(c.nome === undefined ? atual.nome : c.nome, 'o nome da turma', { max: 100 }) || `${serie}º Ano de Escolaridade`;
      const anoLetivo = c.anoLetivo === undefined ? (atual.ano_letivo || db.config('escola', {}).anoLetivo) : valida.inteiro(c.anoLetivo, 'Ano letivo', 2000, 2100);
      return { serie, turno, nome, anoLetivo, nivel: valida.texto(c.nivel ?? atual.nivel ?? 'Ensino Fundamental', 'o nível', { max: 60 }), criterio: valida.texto(c.criterio ?? atual.criterio ?? '', 'o critério', { max: 120 }) };
    }
    rota('POST', '/api/turmas', 'cadastros', ({ corpo, auditar }) => {
      const t = dadosTurma(corpo);
      return db.transacao(() => {
        const id = db.rodar('INSERT INTO turmas (ano_letivo, serie, nome, turno, nivel, criterio) VALUES (?, ?, ?, ?, ?, ?)', t.anoLetivo, t.serie, t.nome, t.turno, t.nivel, t.criterio).id;
        db.todos('SELECT id FROM disciplinas').forEach(d => db.rodar('INSERT INTO turma_disciplinas (turma_id, disciplina_id) VALUES (?, ?)', id, d.id));
        auditar('criou turma', `${t.nome} (${t.anoLetivo})`);
        return { id };
      });
    });
    rota('PUT', '/api/turmas/:id', 'cadastros', ({ params, corpo, auditar }) => {
      const atual = precisa(turma(valida.inteiro(params.id, 'Turma', 1)), 'Turma não encontrada.');
      const t = dadosTurma(corpo, atual);
      db.transacao(() => {
        db.rodar('UPDATE turmas SET ano_letivo = ?, serie = ?, nome = ?, turno = ?, nivel = ?, criterio = ? WHERE id = ?', t.anoLetivo, t.serie, t.nome, t.turno, t.nivel, t.criterio, atual.id);
        db.rodar('UPDATE matriculas SET turma_nome = ?, serie = ? WHERE turma_id = ?', t.nome, t.serie, atual.id);
        if (corpo.finalizada !== undefined) db.rodar('UPDATE turmas SET finalizada = ? WHERE id = ?', !!corpo.finalizada, atual.id);
        // professores por disciplina: [{ disciplinaId, professorId }]
        (Array.isArray(corpo.vinculos) ? corpo.vinculos : []).forEach(v => {
          const did = valida.inteiro(v.disciplinaId, 'Disciplina', 1);
          const pid = v.professorId ? valida.inteiro(v.professorId, 'Professor', 1) : null;
          if (pid && !db.um('SELECT 1 FROM professores WHERE id = ?', pid)) throw new ErroHttp('Professor não encontrado.');
          db.rodar(`INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id) VALUES (?, ?, ?)
            ON CONFLICT(turma_id, disciplina_id) DO UPDATE SET professor_id = excluded.professor_id`, atual.id, did, pid);
        });
      });
      auditar('alterou turma', t.nome);
      return { ok: true };
    });
    rota('DELETE', '/api/turmas/:id', 'cadastros', ({ params, auditar }) => {
      const atual = precisa(turma(valida.inteiro(params.id, 'Turma', 1)), 'Turma não encontrada.');
      const n = db.um('SELECT COUNT(*) n FROM alunos WHERE turma_id = ?', atual.id).n;
      if (n) throw new ErroHttp(`A turma tem ${n} aluno(s). Transfira os alunos para outra turma antes de excluir.`, 409);
      db.rodar('DELETE FROM turmas WHERE id = ?', atual.id);
      auditar('excluiu turma', atual.nome);
      return { ok: true };
    });
    rota('PUT', '/api/turmas/:id/bloqueio', 'notas', ({ params, corpo, auditar }) => {
      const atual = precisa(turma(valida.inteiro(params.id, 'Turma', 1)), 'Turma não encontrada.');
      db.rodar('UPDATE turmas SET bloqueada = ? WHERE id = ?', !!corpo.bloqueada, atual.id);
      auditar(corpo.bloqueada ? 'bloqueou lançamentos' : 'liberou lançamentos', atual.nome);
      return { ok: true };
    });

    /* entrega do diário: o professor entrega o próprio; secretaria/coordenação entregam ou reabrem qualquer um */
    rota('PUT', '/api/turmas/:id/diarios/:disciplina', 'logado', ({ params, corpo, usuario, auditar }) => {
      const tid = valida.inteiro(params.id, 'Turma', 1), did = valida.inteiro(params.disciplina, 'Disciplina', 1);
      const v = precisa(db.um('SELECT * FROM turma_disciplinas WHERE turma_id = ? AND disciplina_id = ?', tid, did), 'Diário não encontrado.');
      const dono = pode(usuario, 'notas.proprias') && v.professor_id === usuario.professorId;
      if (!pode(usuario, 'notas') && !(dono && corpo.entregue)) throw new ErroHttp('Você não tem permissão para isso.', 403);
      db.rodar('UPDATE turma_disciplinas SET entregue = ? WHERE turma_id = ? AND disciplina_id = ?', !!corpo.entregue, tid, did);
      const t = turma(tid), d = db.um('SELECT nome FROM disciplinas WHERE id = ?', did);
      auditar(corpo.entregue ? 'entregou diário' : 'reabriu diário', `${d.nome} · ${t.nome}`);
      return { ok: true };
    });

    /* ----- disciplinas ----- */
    rota('POST', '/api/disciplinas', 'cadastros', ({ corpo, auditar }) => {
      const nome = valida.texto(corpo.nome, 'o nome da disciplina', { obrigatorio: true, max: 80 });
      const carga = valida.inteiro(corpo.carga ?? 80, 'Carga horária', 0, 2000);
      if (db.um('SELECT 1 FROM disciplinas WHERE nome = ?', nome)) throw new ErroHttp('Essa disciplina já existe.', 409);
      return db.transacao(() => {
        const ordem = (db.um('SELECT MAX(ordem) m FROM disciplinas').m ?? -1) + 1;
        const id = db.rodar('INSERT INTO disciplinas (nome, ordem, carga_horaria) VALUES (?, ?, ?)', nome, ordem, carga).id;
        const ano = db.config('escola', {}).anoLetivo;
        db.todos('SELECT id FROM turmas WHERE ano_letivo = ?', ano).forEach(t => db.rodar('INSERT INTO turma_disciplinas (turma_id, disciplina_id) VALUES (?, ?)', t.id, id));
        auditar('criou disciplina', nome);
        return { id };
      });
    });
    rota('PUT', '/api/disciplinas/:id', 'cadastros', ({ params, corpo, auditar }) => {
      const atual = precisa(db.um('SELECT * FROM disciplinas WHERE id = ?', valida.inteiro(params.id, 'Disciplina', 1)), 'Disciplina não encontrada.');
      const nome = valida.texto(corpo.nome ?? atual.nome, 'o nome da disciplina', { obrigatorio: true, max: 80 });
      if (db.um('SELECT 1 FROM disciplinas WHERE nome = ? AND id <> ?', nome, atual.id)) throw new ErroHttp('Essa disciplina já existe.', 409);
      db.rodar('UPDATE disciplinas SET nome = ?, carga_horaria = ? WHERE id = ?', nome, valida.inteiro(corpo.carga ?? atual.carga_horaria, 'Carga horária', 0, 2000), atual.id);
      auditar('alterou disciplina', nome);
      return { ok: true };
    });
    rota('DELETE', '/api/disciplinas/:id', 'cadastros', ({ params, auditar }) => {
      const atual = precisa(db.um('SELECT * FROM disciplinas WHERE id = ?', valida.inteiro(params.id, 'Disciplina', 1)), 'Disciplina não encontrada.');
      if (db.um('SELECT 1 FROM notas WHERE disciplina_id = ? LIMIT 1', atual.id)) throw new ErroHttp('Essa disciplina já tem notas lançadas e não pode ser excluída.', 409);
      db.rodar('DELETE FROM disciplinas WHERE id = ?', atual.id);
      auditar('excluiu disciplina', atual.nome);
      return { ok: true };
    });

    /* ----- notas e faltas de uma turma/disciplina/bimestre ----- */
    rota('PUT', '/api/notas', 'logado', ({ corpo, usuario, auditar }) => {
      const tid = valida.inteiro(corpo.turmaId, 'Turma', 1), did = valida.inteiro(corpo.disciplinaId, 'Disciplina', 1), bim = valida.inteiro(corpo.bimestre, 'Bimestre', 1, 4);
      const t = precisa(turma(tid), 'Turma não encontrada.');
      const v = precisa(db.um('SELECT * FROM turma_disciplinas WHERE turma_id = ? AND disciplina_id = ?', tid, did), 'Disciplina não pertence à turma.');
      const geral = pode(usuario, 'notas');
      if (!geral && !(pode(usuario, 'notas.proprias') && v.professor_id === usuario.professorId)) throw new ErroHttp('Você só pode lançar notas das suas disciplinas.', 403);
      if (!geral && (t.bloqueada || t.finalizada)) throw new ErroHttp('Os lançamentos desta turma estão bloqueados pela secretaria.', 423);
      if (!geral && v.entregue) throw new ErroHttp('Este diário já foi entregue. Peça à secretaria para reabrir.', 423);
      const linhas = Array.isArray(corpo.lancamentos) ? corpo.lancamentos : [];
      const daTurma = new Set(db.todos('SELECT id FROM alunos WHERE turma_id = ?', tid).map(a => a.id));
      db.transacao(() => linhas.forEach(l => {
        const aid = valida.inteiro(l.alunoId, 'Aluno', 1);
        if (!daTurma.has(aid)) throw new ErroHttp('Aluno não pertence à turma.');
        const n = ['at', 'tbl', 'te', 'pr', 'rp'].map(k => valida.nota(l[k], k.toUpperCase()));
        if (n.every(x => x === null)) db.rodar('DELETE FROM notas WHERE aluno_id = ? AND disciplina_id = ? AND ano_letivo = ? AND bimestre = ?', aid, did, t.ano_letivo, bim);
        else db.rodar(`INSERT INTO notas (aluno_id, disciplina_id, ano_letivo, bimestre, at, tbl, te, pr, rp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(aluno_id, disciplina_id, ano_letivo, bimestre) DO UPDATE SET at = excluded.at, tbl = excluded.tbl, te = excluded.te, pr = excluded.pr, rp = excluded.rp`, aid, did, t.ano_letivo, bim, ...n);
        const f = l.faltas === '' || l.faltas == null ? 0 : valida.inteiro(l.faltas, 'Faltas', 0, 500);
        db.rodar(`INSERT INTO faltas (aluno_id, disciplina_id, ano_letivo, bimestre, qtd) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(aluno_id, disciplina_id, ano_letivo, bimestre) DO UPDATE SET qtd = excluded.qtd`, aid, did, t.ano_letivo, bim, f);
      }));
      const d = db.um('SELECT nome FROM disciplinas WHERE id = ?', did);
      auditar('lançou notas e faltas', `${d.nome} · ${t.nome} · ${bim}º bimestre (${linhas.length} alunos)`);
      return { ok: true };
    });

    /* ----- dados da escola ----- */
    rota('PUT', '/api/config/escola', 'config', ({ corpo, auditar }) => {
      const atual = db.config('escola', {});
      const novo = {
        ...atual,
        nome: valida.texto(corpo.nome ?? atual.nome, 'o nome da escola', { obrigatorio: true, max: 150 }),
        anoLetivo: valida.inteiro(corpo.anoLetivo ?? atual.anoLetivo, 'Ano letivo', 2000, 2100),
        cidade: valida.texto(corpo.cidade ?? atual.cidade, 'a cidade', { max: 100 }),
        telefone: corpo.telefone === undefined ? atual.telefone : valida.telefone(corpo.telefone),
        email: corpo.email === undefined ? atual.email : valida.email(corpo.email),
        cnpj: valida.texto(corpo.cnpj ?? atual.cnpj ?? '', 'o CNPJ', { max: 20 }),
        endereco: valida.texto(corpo.endereco ?? atual.endereco ?? '', 'o endereço', { max: 250 })
      };
      db.salvarConfig('escola', novo);
      auditar('alterou dados da escola');
      return novo;
    });

    rota('GET', '/api/auditoria', 'config', ({ url }) => {
      const limite = Math.max(1, Math.min(1000, Number(url.searchParams.get('limite')) || 200));
      return db.todos('SELECT id, quando, usuario, acao, detalhe FROM auditoria ORDER BY id DESC LIMIT ?', limite);
    });
  }

  return { registrar, dados, SITUACOES, ATIVAS, sincronizarMatricula, proximaMatricula, dadosAluno, dadosResp, TURNOS, PARENTESCOS };
}

function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

module.exports = { criarEscola, cpfValido, SITUACOES };
