'use strict';
/* Matrículas do ano, rematrícula (virada de ano) e pré-matrícula. */
const { ErroHttp, valida } = require('./http');

const STATUS_PRE = ['nova', 'contatada', 'aprovada', 'recusada', 'matriculada', 'desistiu'];

function criarMatriculas(db, escola) {
  const anoAtual = () => db.config('escola', {}).anoLetivo;
  const configPre = () => ({ aberta: false, ano: anoAtual() + 1, series: [1, 2, 3, 4, 5, 6, 7, 8, 9], texto: '', ...(db.config('preMatricula') || {}) });

  function dadosPre(c) {
    const cfg = configPre();
    const nome = valida.texto(c.alunoNome, 'o nome do aluno', { obrigatorio: true, max: 150 });
    if (nome.split(' ').length < 2) throw new ErroHttp('Digite o nome completo do aluno.');
    const resp = valida.texto(c.respNome, 'o nome do responsável', { obrigatorio: true, max: 150 });
    if (resp.split(' ').length < 2) throw new ErroHttp('Digite o nome completo do responsável.');
    const serie = valida.inteiro(c.serie, 'Ano/série', 1, 12);
    const nasc = valida.dataISO(c.alunoNascimento, 'Data de nascimento', { obrigatorio: true });
    if (nasc > new Date().toISOString().slice(0, 10)) throw new ErroHttp('A data de nascimento não pode ser no futuro.');
    return {
      ano: c.ano ? valida.inteiro(c.ano, 'Ano', 2000, 2100) : cfg.ano, serie, turno: escola.TURNOS.includes(c.turno) ? c.turno : null,
      alunoNome: nome, alunoNascimento: nasc, escolaAtual: valida.texto(c.escolaAtual, 'a escola atual', { max: 150 }),
      respNome: resp, respParentesco: escola.PARENTESCOS.includes(c.respParentesco) ? c.respParentesco : 'Outro',
      respTel: valida.telefone(c.respTel, { obrigatorio: true }), respEmail: valida.email(c.respEmail),
      respCpf: String(c.respCpf || '').replace(/\D/g, '').slice(0, 11) || null,
      observacoes: valida.texto(c.observacoes, 'as observações', { max: 1000 })
    };
  }
  const inserirPre = (d, origem) => db.rodar(`INSERT INTO pre_matriculas (origem, ano_letivo, serie, turno, aluno_nome, aluno_nascimento, escola_atual, resp_nome, resp_parentesco, resp_tel, resp_email, resp_cpf, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, origem, d.ano, d.serie, d.turno, d.alunoNome, d.alunoNascimento, d.escolaAtual, d.respNome, d.respParentesco, d.respTel, d.respEmail, d.respCpf, d.observacoes).id;

  // formulário público: no máximo 5 envios por hora por endereço
  const envios = new Map();
  function limitePublico(ip) {
    const agora = Date.now(), lista = (envios.get(ip) || []).filter(t => agora - t < 3600000);
    if (lista.length >= 5) throw new ErroHttp('Muitos envios seguidos. Tente de novo mais tarde ou ligue para a escola.', 429);
    lista.push(agora); envios.set(ip, lista);
    if (envios.size > 5000) envios.clear();
  }

  function registrar(rota) {
    /* ----- matrículas do ano ----- */
    rota('GET', '/api/matriculas', 'matriculas', ({ url }) => {
      const ano = Number(url.searchParams.get('ano')) || anoAtual();
      return db.todos(`SELECT m.id, m.ano_letivo ano, m.turma_id turmaId, m.turma_nome turma, m.serie, m.situacao, m.criado_em criadoEm, a.id alunoId, a.matricula, a.nome,
        (SELECT COUNT(*) FROM matriculas x WHERE x.aluno_id = a.id AND x.ano_letivo < m.ano_letivo) anosAntes
        FROM matriculas m JOIN alunos a ON a.id = m.aluno_id WHERE m.ano_letivo = ? ORDER BY a.nome`, ano);
    });

    /* ----- copiar as turmas de um ano para o seguinte (com os professores) ----- */
    rota('POST', '/api/turmas/copiar', 'cadastros', ({ corpo, auditar }) => {
      const de = valida.inteiro(corpo.de, 'Ano de origem', 2000, 2100), para = valida.inteiro(corpo.para, 'Ano de destino', 2000, 2100);
      if (para <= de) throw new ErroHttp('O ano de destino precisa ser depois do ano de origem.');
      const origem = db.todos('SELECT * FROM turmas WHERE ano_letivo = ?', de);
      if (!origem.length) throw new ErroHttp(`Não há turmas em ${de}.`);
      const existentes = new Set(db.todos('SELECT nome FROM turmas WHERE ano_letivo = ?', para).map(t => t.nome.toLowerCase()));
      let criadas = 0;
      db.transacao(() => origem.forEach(t => {
        if (existentes.has(t.nome.toLowerCase())) return;
        const id = db.rodar('INSERT INTO turmas (ano_letivo, serie, nome, turno, nivel, criterio) VALUES (?, ?, ?, ?, ?, ?)', para, t.serie, t.nome, t.turno, t.nivel, t.criterio).id;
        db.todos('SELECT disciplina_id, professor_id FROM turma_disciplinas WHERE turma_id = ?', t.id)
          .forEach(v => db.rodar('INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id) VALUES (?, ?, ?)', id, v.disciplina_id, v.professor_id));
        criadas++;
      }));
      auditar('copiou turmas para o ano seguinte', `${de} → ${para}: ${criadas} turmas`);
      return { criadas, jaExistiam: origem.length - criadas };
    });

    /* ----- rematrícula: leva alunos para uma turma de outro ano ----- */
    rota('POST', '/api/rematricula', 'matriculas', async ({ corpo, auditar }) => {
      const destino = db.um('SELECT * FROM turmas WHERE id = ?', valida.inteiro(corpo.turmaId, 'Turma de destino', 1));
      if (!destino) throw new ErroHttp('Turma de destino não encontrada.');
      const ids = (Array.isArray(corpo.alunos) ? corpo.alunos : []).map(Number).filter(Number.isInteger);
      if (!ids.length) throw new ErroHttp('Marque os alunos que serão rematriculados.');
      const erros = [];
      let feitos = 0;
      db.transacao(() => ids.forEach(id => {
        const a = db.um('SELECT a.id, a.nome, a.situacao, t.ano_letivo ano FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id WHERE a.id = ?', id);
        if (!a) return;
        if (a.ano != null && a.ano >= destino.ano_letivo) { erros.push(`${a.nome} já está numa turma de ${a.ano}.`); return; }
        if (['transferido', 'cancelado', 'concluido'].includes(a.situacao)) { erros.push(`${a.nome} está como ${a.situacao} e não é rematriculado.`); return; }
        // a matrícula do ano que termina fica guardada com a situação final (aprovado/reprovado) para o histórico
        escola.sincronizarMatricula(a.id);
        db.rodar("UPDATE alunos SET turma_id = ?, situacao = 'cursando' WHERE id = ?", destino.id, a.id);
        escola.sincronizarMatricula(a.id);
        feitos++;
      }));
      auditar('rematriculou alunos', `${feitos} aluno(s) para ${destino.nome} (${destino.ano_letivo})`);
      return { feitos, erros };
    });

    /* ----- pré-matrícula: formulário público ----- */
    rota('GET', '/api/pre-matricula/info', null, () => {
      const c = configPre(), e = db.config('escola', {});
      return { aberta: !!c.aberta, ano: c.ano, series: c.series, texto: c.texto, escola: { nome: e.nome, telefone: e.telefone, email: e.email, endereco: e.endereco, cidade: e.cidade }, turnos: escola.TURNOS, parentescos: escola.PARENTESCOS };
    });
    rota('POST', '/api/pre-matricula', null, ({ corpo, ip }) => {
      if (corpo.site) return { ok: true };   // campo escondido: só robôs preenchem
      const c = configPre();
      if (!c.aberta) throw new ErroHttp('A pré-matrícula está fechada no momento. Entre em contato com a escola.', 403);
      limitePublico(ip);
      const d = dadosPre({ ...corpo, ano: c.ano });
      if (!c.series.includes(d.serie)) throw new ErroHttp('Não há vagas abertas para esse ano/série.');
      if (!corpo.aceite) throw new ErroHttp('É preciso concordar com o uso dos dados para a pré-matrícula.');
      const id = inserirPre(d, 'online');
      return { ok: true, protocolo: `${c.ano}-${String(id).padStart(5, '0')}` };
    });

    /* ----- pré-matrícula: secretaria ----- */
    rota('GET', '/api/pre-matriculas', 'matriculas', () => db.todos(`SELECT id, criado_em criadoEm, origem, ano_letivo ano, serie, turno, aluno_nome alunoNome, aluno_nascimento alunoNascimento,
      escola_atual escolaAtual, resp_nome respNome, resp_parentesco respParentesco, resp_tel respTel, resp_email respEmail, resp_cpf respCpf, observacoes, status, anotacao, aluno_id alunoId
      FROM pre_matriculas ORDER BY id DESC`));
    rota('POST', '/api/pre-matriculas', 'matriculas', ({ corpo, auditar }) => {
      const d = dadosPre(corpo);
      const id = inserirPre(d, 'secretaria');
      auditar('registrou pré-matrícula', d.alunoNome);
      return { id };
    });
    rota('PUT', '/api/pre-matriculas/:id', 'matriculas', ({ params, corpo, auditar }) => {
      const p = db.um('SELECT * FROM pre_matriculas WHERE id = ?', valida.inteiro(params.id, 'Pré-matrícula', 1));
      if (!p) throw new ErroHttp('Pré-matrícula não encontrada.', 404);
      const status = corpo.status === undefined ? p.status : String(corpo.status);
      if (!STATUS_PRE.includes(status)) throw new ErroHttp('Situação inválida.');
      const alunoId = corpo.alunoId ? valida.inteiro(corpo.alunoId, 'Aluno', 1) : p.aluno_id;
      db.rodar('UPDATE pre_matriculas SET status = ?, anotacao = ?, aluno_id = ? WHERE id = ?', status, valida.texto(corpo.anotacao ?? p.anotacao, 'a anotação', { max: 1000 }), alunoId, p.id);
      auditar('alterou pré-matrícula', `${p.aluno_nome}: ${status}`);
      return { ok: true };
    });
    rota('DELETE', '/api/pre-matriculas/:id', 'matriculas', ({ params, auditar }) => {
      const p = db.um('SELECT * FROM pre_matriculas WHERE id = ?', valida.inteiro(params.id, 'Pré-matrícula', 1));
      if (!p) throw new ErroHttp('Pré-matrícula não encontrada.', 404);
      db.rodar('DELETE FROM pre_matriculas WHERE id = ?', p.id);
      auditar('apagou pré-matrícula', p.aluno_nome);
      return { ok: true };
    });
    rota('GET', '/api/config/pre-matricula', 'matriculas', () => configPre());
    rota('PUT', '/api/config/pre-matricula', 'matriculas', ({ corpo, auditar }) => {
      const series = (Array.isArray(corpo.series) ? corpo.series : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12);
      const novo = { aberta: !!corpo.aberta, ano: valida.inteiro(corpo.ano, 'Ano', 2000, 2100), series: series.length ? series : configPre().series, texto: valida.texto(corpo.texto, 'o texto', { max: 1000 }) };
      db.salvarConfig('preMatricula', novo);
      auditar(novo.aberta ? 'abriu a pré-matrícula' : 'fechou a pré-matrícula', String(novo.ano));
      return novo;
    });
  }
  return { registrar };
}

module.exports = { criarMatriculas, STATUS_PRE };
