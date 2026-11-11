'use strict';
/* Importação de alunos por planilha e histórico escolar. */
const { ErroHttp, valida } = require('./http');
const { pode } = require('./auth');

/* aceita 25/03/2015, 25/3/15, 2015-03-25 e o número de série de data do Excel */
function dataPlanilha(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    let ano = Number(m[3]); if (ano < 100) ano += ano > (new Date().getFullYear() % 100) ? 1900 : 2000;
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4,5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10); }
  throw new ErroHttp(`Data de nascimento "${s}" não reconhecida. Use dia/mês/ano, como 25/03/2015.`);
}
const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function criarAcademico(db, escola) {
  function importar(corpo, auditar) {
    const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : [];
    if (!linhas.length) throw new ErroHttp('A planilha está vazia.');
    if (linhas.length > 5000) throw new ErroHttp('Importe no máximo 5.000 alunos de cada vez.');
    const ano = db.config('escola', {}).anoLetivo;
    const resultado = { criados: 0, atualizados: 0, ignorados: 0, turmasCriadas: [], erros: [] };
    const turmas = new Map(db.todos('SELECT id, nome FROM turmas WHERE ano_letivo = ?', ano).map(t => [normaliza(t.nome), t.id]));
    const disciplinas = db.todos('SELECT id FROM disciplinas');

    db.exec('BEGIN IMMEDIATE');
    try {
      linhas.forEach((l, i) => {
        const n = i + 2;   // número da linha na planilha (linha 1 é o cabeçalho)
        try {
          // turma: acha pelo nome no ano letivo atual, ou cria
          const nomeTurma = valida.texto(l.turma, 'a turma', { obrigatorio: true, max: 100 });
          let turmaId = turmas.get(normaliza(nomeTurma));
          if (!turmaId) {
            if (!corpo.criarTurmas) throw new ErroHttp(`Turma "${nomeTurma}" não existe em ${ano}.`);
            const serie = Number((nomeTurma.match(/\d+/) || [])[0]);
            if (!serie || serie > 12) throw new ErroHttp(`Não consegui descobrir o ano/série da turma "${nomeTurma}". Use nomes como "5º Ano A".`);
            const turno = escola.TURNOS.find(t => normaliza(t) === normaliza(l.turno)) || 'Manhã';
            turmaId = db.rodar('INSERT INTO turmas (ano_letivo, serie, nome, turno) VALUES (?, ?, ?, ?)', ano, serie, nomeTurma, turno).id;
            disciplinas.forEach(d => db.rodar('INSERT INTO turma_disciplinas (turma_id, disciplina_id) VALUES (?, ?)', turmaId, d.id));
            turmas.set(normaliza(nomeTurma), turmaId);
            resultado.turmasCriadas.push(nomeTurma);
          }
          const sexo = /^f/i.test(l.sexo || '') ? 'F' : /^m/i.test(l.sexo || '') ? 'M' : null;
          const consent = /^(s|sim|x|1|true|autorizado)$/i.test(String(l.consentimento || '').trim());
          const dados = escola.dadosAluno({ nome: l.nome, nascimento: dataPlanilha(l.nascimento), turmaId, sexo, cpf: l.cpf, naturalidade: l.naturalidade, endereco: l.endereco, observacoes: l.observacoes, consentimentoBiometria: consent });
          const resp = l.responsavel ? escola.dadosResp({ nome: l.responsavel, parentesco: l.parentesco, tel: l.telefone, email: l.email, cpf: l.cpfResponsavel }) : null;

          const mat = String(l.matricula || '').replace(/\D/g, '');
          let existente = mat ? db.um('SELECT id FROM alunos WHERE matricula = ?', Number(mat)) : null;
          // sem matrícula na planilha: considera repetido quem tem o mesmo nome e nascimento
          if (!existente && !mat) existente = db.um('SELECT id FROM alunos WHERE nome = ? COLLATE NOCASE AND nascimento = ?', dados.nome, dados.nascimento);
          if (existente) {
            if (!corpo.atualizar) { resultado.ignorados++; return; }
            db.rodar('UPDATE alunos SET nome = ?, nascimento = ?, turma_id = ?, sexo = COALESCE(?, sexo), cpf = COALESCE(?, cpf), naturalidade = COALESCE(NULLIF(?, \'\'), naturalidade), endereco = COALESCE(NULLIF(?, \'\'), endereco) WHERE id = ?',
              dados.nome, dados.nascimento, turmaId, dados.sexo, dados.cpf, dados.naturalidade, dados.endereco, existente.id);
            if (resp && !db.um('SELECT 1 FROM responsaveis WHERE aluno_id = ? AND nome = ? COLLATE NOCASE', existente.id, resp.nome))
              db.rodar('INSERT INTO responsaveis (aluno_id, nome, parentesco, tel, email, cpf) VALUES (?, ?, ?, ?, ?, ?)', existente.id, resp.nome, resp.parentesco, resp.tel, resp.email, resp.cpf);
            escola.sincronizarMatricula(existente.id);
            resultado.atualizados++;
            return;
          }
          const matricula = mat ? valida.inteiro(mat, 'Matrícula', 1, 999999999999) : escola.proximaMatricula();
          const id = db.rodar(`INSERT INTO alunos (matricula, nome, nascimento, turma_id, sexo, cpf, naturalidade, endereco, observacoes, consentimento_biometria, consentimento_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, matricula, dados.nome, dados.nascimento, turmaId, dados.sexo, dados.cpf, dados.naturalidade, dados.endereco, dados.observacoes,
            dados.consentimento, dados.consentimento ? new Date().toISOString() : null).id;
          if (resp) db.rodar('INSERT INTO responsaveis (aluno_id, nome, parentesco, tel, email, cpf) VALUES (?, ?, ?, ?, ?, ?)', id, resp.nome, resp.parentesco, resp.tel, resp.email, resp.cpf);
          escola.sincronizarMatricula(id);
          resultado.criados++;
        } catch (e) {
          if (!(e instanceof ErroHttp)) throw e;
          resultado.erros.push({ linha: n, nome: String(l.nome || '').slice(0, 80), erro: e.message });
        }
      });
      // simulação (prévia) ou planilha com erros: nada é gravado
      if (corpo.simular || resultado.erros.length) db.exec('ROLLBACK');
      else db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    resultado.gravado = !corpo.simular && !resultado.erros.length;
    if (resultado.gravado) auditar('importou alunos por planilha', `${resultado.criados} novos, ${resultado.atualizados} atualizados, ${resultado.turmasCriadas.length} turmas criadas`);
    return resultado;
  }

  function historico(alunoId) {
    const aluno = db.um('SELECT id, matricula, nome, nascimento, naturalidade, sexo, situacao FROM alunos WHERE id = ?', alunoId);
    if (!aluno) throw new ErroHttp('Aluno não encontrado.', 404);
    const discs = db.todos('SELECT id, nome, carga_horaria carga, ordem FROM disciplinas ORDER BY ordem, nome');
    const anos = db.todos('SELECT ano_letivo ano, turma_nome turma, serie, situacao FROM matriculas WHERE aluno_id = ? ORDER BY ano_letivo', alunoId).map(m => {
      const notas = db.todos('SELECT disciplina_id d, bimestre b, at, tbl, te, pr, rp FROM notas WHERE aluno_id = ? AND ano_letivo = ?', alunoId, m.ano);
      const faltas = db.todos('SELECT disciplina_id d, SUM(qtd) q FROM faltas WHERE aluno_id = ? AND ano_letivo = ? GROUP BY disciplina_id', alunoId, m.ano);
      const ids = new Set([...notas.map(n => n.d), ...faltas.map(f => f.d)]);
      return {
        ...m, origem: 'escola',
        disciplinas: discs.filter(d => ids.has(d.id)).map(d => ({
          nome: d.nome, carga: d.carga,
          notas: [1, 2, 3, 4].map(b => { const n = notas.find(x => x.d === d.id && x.b === b); return n ? { at: n.at, tbl: n.tbl, te: n.te, pr: n.pr, rp: n.rp } : null; }),
          faltas: (faltas.find(f => f.d === d.id) || {}).q || 0
        }))
      };
    });
    const externo = db.todos('SELECT id, ano_letivo ano, serie, escola, disciplina, media, carga_horaria carga, faltas, resultado FROM historico_externo WHERE aluno_id = ? ORDER BY ano_letivo, disciplina', alunoId);
    return { aluno, anos, externo, escola: db.config('escola', {}) };
  }

  function registrar(rota) {
    rota('POST', '/api/importar/alunos', 'cadastros', ({ corpo, auditar }) => importar(corpo, auditar));

    rota('GET', '/api/alunos/:id/historico', 'escola.ver', ({ params, usuario }) => {
      if (!pode(usuario, 'notas') && !pode(usuario, 'relatorios')) throw new ErroHttp('Você não tem permissão para ver o histórico escolar.', 403);
      return historico(valida.inteiro(params.id, 'Aluno', 1));
    });
    /* notas de anos cursados em outra escola */
    rota('POST', '/api/alunos/:id/historico-externo', 'cadastros', ({ params, corpo, auditar }) => {
      const aluno = db.um('SELECT id, nome FROM alunos WHERE id = ?', valida.inteiro(params.id, 'Aluno', 1));
      if (!aluno) throw new ErroHttp('Aluno não encontrado.', 404);
      const ano = valida.inteiro(corpo.ano, 'Ano', 1950, 2100), serie = valida.inteiro(corpo.serie, 'Ano/série', 1, 12);
      const escolaNome = valida.texto(corpo.escola, 'a escola de origem', { obrigatorio: true, max: 150 });
      const resultadoAno = valida.texto(corpo.resultado, 'o resultado', { max: 40 });
      const linhas = (Array.isArray(corpo.disciplinas) ? corpo.disciplinas : []).filter(d => String(d.disciplina || '').trim());
      if (!linhas.length) throw new ErroHttp('Informe ao menos uma disciplina.');
      db.transacao(() => linhas.forEach(d => db.rodar('INSERT INTO historico_externo (aluno_id, ano_letivo, serie, escola, disciplina, media, carga_horaria, faltas, resultado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        aluno.id, ano, serie, escolaNome, valida.texto(d.disciplina, 'a disciplina', { max: 80 }), valida.nota(d.media, d.disciplina),
        d.carga ? valida.inteiro(d.carga, 'Carga horária', 0, 2000) : null, d.faltas ? valida.inteiro(d.faltas, 'Faltas', 0, 1000) : null, resultadoAno)));
      auditar('lançou histórico de outra escola', `${aluno.nome}: ${ano} (${escolaNome})`);
      return { ok: true };
    });
    rota('DELETE', '/api/alunos/:id/historico-externo/:ano', 'cadastros', ({ params, auditar }) => {
      const id = valida.inteiro(params.id, 'Aluno', 1), ano = valida.inteiro(params.ano, 'Ano', 1950, 2100);
      const r = db.rodar('DELETE FROM historico_externo WHERE aluno_id = ? AND ano_letivo = ?', id, ano);
      auditar('apagou histórico de outra escola', `aluno ${id}, ano ${ano}`);
      return { removidos: r.mudancas };
    });
  }
  return { registrar };
}

module.exports = { criarAcademico, dataPlanilha };
