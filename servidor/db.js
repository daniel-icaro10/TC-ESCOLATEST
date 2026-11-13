'use strict';
/* Banco de dados SQLite (embutido no Node.js, sem instalar nada).
   O arquivo fica em servidor/dados/escola.db. Backups diários em servidor/dados/backups. */
const fs = require('fs');
const path = require('path');

// o node:sqlite ainda é marcado como "experimental" e imprime um aviso a cada início; o aviso não tem utilidade para a escola
const emitirOriginal = process.emitWarning;
process.emitWarning = function (aviso, ...resto) {
  const msg = typeof aviso === 'string' ? aviso : aviso && aviso.message;
  if (msg && /SQLite/i.test(msg)) return;
  return emitirOriginal.call(process, aviso, ...resto);
};
const { DatabaseSync } = require('node:sqlite');

/* Cada item é uma versão do banco. Nunca altere um item antigo: acrescente um novo no fim. */
const MIGRACOES = [
  `
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY, nome TEXT NOT NULL, login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT NOT NULL, papel TEXT NOT NULL, professor_id INTEGER REFERENCES professores(id) ON DELETE SET NULL,
    ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ultimo_acesso TEXT
  );
  CREATE TABLE sessoes (hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, expira INTEGER NOT NULL);
  CREATE TABLE disciplinas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, ordem INTEGER NOT NULL DEFAULT 0, carga_horaria INTEGER NOT NULL DEFAULT 80);
  CREATE TABLE professores (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT, tel TEXT, ativo INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE turmas (
    id INTEGER PRIMARY KEY, ano_letivo INTEGER NOT NULL, serie INTEGER NOT NULL, nome TEXT NOT NULL, turno TEXT NOT NULL,
    nivel TEXT NOT NULL DEFAULT 'Ensino Fundamental', criterio TEXT, finalizada INTEGER NOT NULL DEFAULT 0, bloqueada INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE turma_disciplinas (
    turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    professor_id INTEGER REFERENCES professores(id) ON DELETE SET NULL,
    entregue INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (turma_id, disciplina_id)
  );
  CREATE TABLE alunos (
    id INTEGER PRIMARY KEY, matricula INTEGER NOT NULL UNIQUE, nome TEXT NOT NULL, nascimento TEXT,
    turma_id INTEGER REFERENCES turmas(id) ON DELETE SET NULL, situacao TEXT NOT NULL DEFAULT 'cursando',
    sexo TEXT, cpf TEXT, naturalidade TEXT, endereco TEXT, observacoes TEXT,
    consentimento_biometria INTEGER NOT NULL DEFAULT 0, consentimento_em TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX alunos_turma ON alunos(turma_id);
  CREATE TABLE responsaveis (
    id INTEGER PRIMARY KEY, aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL, parentesco TEXT, tel TEXT, email TEXT, cpf TEXT
  );
  CREATE INDEX responsaveis_aluno ON responsaveis(aluno_id);
  CREATE TABLE notas (
    aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    bimestre INTEGER NOT NULL CHECK (bimestre BETWEEN 1 AND 4),
    at REAL, tbl REAL, te REAL, pr REAL, rp REAL,
    PRIMARY KEY (aluno_id, disciplina_id, bimestre)
  );
  CREATE TABLE faltas (
    aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    bimestre INTEGER NOT NULL CHECK (bimestre BETWEEN 1 AND 4),
    qtd INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (aluno_id, disciplina_id, bimestre)
  );
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY, quando TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, usuario_id INTEGER, usuario TEXT, acao TEXT NOT NULL, detalhe TEXT);
  CREATE TABLE catraca_status (matricula INTEGER PRIMARY KEY, facial INTEGER NOT NULL DEFAULT 0, cartao TEXT, senha INTEGER NOT NULL DEFAULT 0, atualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `,
  /* v2: notas e faltas passam a ter o ano letivo (senão, na rematrícula, as notas de anos diferentes se misturam)
     e cada aluno tem um registro de matrícula por ano (base do histórico escolar e da rematrícula). */
  `
  CREATE TABLE matriculas (
    id INTEGER PRIMARY KEY, aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE, ano_letivo INTEGER NOT NULL,
    turma_id INTEGER REFERENCES turmas(id) ON DELETE SET NULL, turma_nome TEXT, serie INTEGER, situacao TEXT NOT NULL DEFAULT 'cursando',
    escola_origem TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (aluno_id, ano_letivo)
  );
  INSERT INTO matriculas (aluno_id, ano_letivo, turma_id, turma_nome, serie, situacao)
    SELECT a.id, t.ano_letivo, t.id, t.nome, t.serie, a.situacao FROM alunos a JOIN turmas t ON t.id = a.turma_id;

  CREATE TABLE notas_v2 (
    aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    ano_letivo INTEGER NOT NULL, bimestre INTEGER NOT NULL CHECK (bimestre BETWEEN 1 AND 4),
    at REAL, tbl REAL, te REAL, pr REAL, rp REAL,
    PRIMARY KEY (aluno_id, disciplina_id, ano_letivo, bimestre)
  );
  INSERT INTO notas_v2 SELECT n.aluno_id, n.disciplina_id,
    COALESCE(t.ano_letivo, (SELECT json_extract(valor, '$.anoLetivo') FROM config WHERE chave = 'escola'), CAST(strftime('%Y', 'now') AS INTEGER)),
    n.bimestre, n.at, n.tbl, n.te, n.pr, n.rp
    FROM notas n JOIN alunos a ON a.id = n.aluno_id LEFT JOIN turmas t ON t.id = a.turma_id;
  DROP TABLE notas;
  ALTER TABLE notas_v2 RENAME TO notas;

  CREATE TABLE faltas_v2 (
    aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    ano_letivo INTEGER NOT NULL, bimestre INTEGER NOT NULL CHECK (bimestre BETWEEN 1 AND 4),
    qtd INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (aluno_id, disciplina_id, ano_letivo, bimestre)
  );
  INSERT INTO faltas_v2 SELECT f.aluno_id, f.disciplina_id,
    COALESCE(t.ano_letivo, (SELECT json_extract(valor, '$.anoLetivo') FROM config WHERE chave = 'escola'), CAST(strftime('%Y', 'now') AS INTEGER)),
    f.bimestre, f.qtd
    FROM faltas f JOIN alunos a ON a.id = f.aluno_id LEFT JOIN turmas t ON t.id = a.turma_id;
  DROP TABLE faltas;
  ALTER TABLE faltas_v2 RENAME TO faltas;

  /* notas de anos cursados em outra escola (aluno transferido): entram no histórico escolar */
  CREATE TABLE historico_externo (
    id INTEGER PRIMARY KEY, aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    ano_letivo INTEGER NOT NULL, serie INTEGER NOT NULL, escola TEXT NOT NULL, disciplina TEXT NOT NULL,
    media REAL, carga_horaria INTEGER, faltas INTEGER, resultado TEXT
  );
  `,
  /* v3: pré-matrícula (pedidos de vaga das famílias) */
  `
  CREATE TABLE pre_matriculas (
    id INTEGER PRIMARY KEY, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, origem TEXT NOT NULL DEFAULT 'online',
    ano_letivo INTEGER NOT NULL, serie INTEGER NOT NULL, turno TEXT,
    aluno_nome TEXT NOT NULL, aluno_nascimento TEXT, escola_atual TEXT,
    resp_nome TEXT NOT NULL, resp_parentesco TEXT, resp_tel TEXT NOT NULL, resp_email TEXT, resp_cpf TEXT,
    observacoes TEXT, status TEXT NOT NULL DEFAULT 'nova', anotacao TEXT,
    aluno_id INTEGER REFERENCES alunos(id) ON DELETE SET NULL
  );
  `,
  /* v4: comunicados e mensagens internas */
  `
  CREATE TABLE comunicados (
    id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, texto TEXT NOT NULL, publico TEXT NOT NULL DEFAULT 'todos',
    fixado INTEGER NOT NULL DEFAULT 0, ate TEXT, autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, autor TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE mensagens (
    id INTEGER PRIMARY KEY, de_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, de_nome TEXT,
    para_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    assunto TEXT NOT NULL, texto TEXT NOT NULL, resposta_a INTEGER, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lida_em TEXT, apagada_de INTEGER NOT NULL DEFAULT 0, apagada_para INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX mensagens_para ON mensagens(para_id, apagada_para);
  CREATE INDEX mensagens_de ON mensagens(de_id, apagada_de);
  `,
  /* v5: pedagógico (horários, ocorrências, planejamento, habilidades e simulados) */
  `
  CREATE TABLE horarios (
    turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE, dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 6),
    aula INTEGER NOT NULL CHECK (aula BETWEEN 1 AND 12), disciplina_id INTEGER REFERENCES disciplinas(id) ON DELETE SET NULL,
    PRIMARY KEY (turma_id, dia, aula)
  );
  CREATE TABLE horario_tempos (turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE, aula INTEGER NOT NULL, inicio TEXT, fim TEXT, PRIMARY KEY (turma_id, aula));
  CREATE TABLE ocorrencias (
    id INTEGER PRIMARY KEY, aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE, data TEXT NOT NULL, tipo TEXT NOT NULL,
    descricao TEXT NOT NULL, providencia TEXT, responsavel_avisado INTEGER NOT NULL DEFAULT 0, resolvida INTEGER NOT NULL DEFAULT 0,
    autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, autor TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX ocorrencias_aluno ON ocorrencias(aluno_id);
  CREATE TABLE planos (
    id INTEGER PRIMARY KEY, professor_id INTEGER REFERENCES professores(id) ON DELETE CASCADE,
    turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE, disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    inicio TEXT NOT NULL, fim TEXT, titulo TEXT NOT NULL, objetivos TEXT, conteudo TEXT, metodologia TEXT, avaliacao TEXT, habilidades TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho', comentario TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, atualizado_em TEXT
  );
  CREATE TABLE habilidades (
    id INTEGER PRIMARY KEY, turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE, codigo TEXT, descricao TEXT NOT NULL,
    bimestre INTEGER, trabalhada INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE simulados (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, data TEXT, ano_letivo INTEGER NOT NULL, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE simulado_turmas (simulado_id INTEGER NOT NULL REFERENCES simulados(id) ON DELETE CASCADE, turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE, PRIMARY KEY (simulado_id, turma_id));
  CREATE TABLE simulado_disciplinas (simulado_id INTEGER NOT NULL REFERENCES simulados(id) ON DELETE CASCADE, disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE, questoes INTEGER NOT NULL, PRIMARY KEY (simulado_id, disciplina_id));
  CREATE TABLE simulado_resultados (
    simulado_id INTEGER NOT NULL REFERENCES simulados(id) ON DELETE CASCADE, aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE, acertos INTEGER NOT NULL,
    PRIMARY KEY (simulado_id, aluno_id, disciplina_id)
  );
  `,
  /* v6: financeiro (mensalidades) */
  `
  CREATE TABLE financeiro_alunos (
    aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE, ano_letivo INTEGER NOT NULL,
    valor REAL, bolsa_pct REAL NOT NULL DEFAULT 0, dia_vencimento INTEGER, observacao TEXT,
    PRIMARY KEY (aluno_id, ano_letivo)
  );
  CREATE TABLE cobrancas (
    id INTEGER PRIMARY KEY, aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE, ano_letivo INTEGER NOT NULL,
    competencia TEXT NOT NULL, descricao TEXT NOT NULL, valor REAL NOT NULL, desconto REAL NOT NULL DEFAULT 0, vencimento TEXT NOT NULL,
    pago_em TEXT, valor_pago REAL, forma TEXT, recebido_por TEXT, observacao TEXT, cancelada INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX cobrancas_aluno ON cobrancas(aluno_id);
  CREATE INDEX cobrancas_venc ON cobrancas(vencimento);
  CREATE UNIQUE INDEX cobrancas_mensalidade ON cobrancas(aluno_id, competencia, descricao) WHERE cancelada = 0;
  `,
  /* v7: acesso das famílias (cada usuário da família vê só os alunos ligados a ele) */
  `
  CREATE TABLE usuario_alunos (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, aluno_id)
  );
  `,
  /* v8: o índice único vale só para as mensalidades geradas (cobranças avulsas podem repetir a descrição no mês) */
  `
  DROP INDEX cobrancas_mensalidade;
  CREATE UNIQUE INDEX cobrancas_mensalidade ON cobrancas(aluno_id, competencia) WHERE cancelada = 0 AND descricao = 'Mensalidade';
  `
];

function abrir(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

  // parâmetros: undefined vira NULL e true/false viram 1/0 (o SQLite não aceita os outros)
  const prep = p => p.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const cache = new Map();
  const stmt = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };

  const api = {
    tipo: 'sqlite',
    arquivo,
    todos: (sql, ...p) => stmt(sql).all(...prep(p)),
    um: (sql, ...p) => stmt(sql).get(...prep(p)) || null,
    rodar: (sql, ...p) => { const r = stmt(sql).run(...prep(p)); return { id: Number(r.lastInsertRowid), mudancas: Number(r.changes) }; },
    exec: sql => db.exec(sql),
    transacao(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    config(chave, padrao = null) { const r = api.um('SELECT valor FROM config WHERE chave = ?', chave); return r ? JSON.parse(r.valor) : padrao; },
    salvarConfig(chave, valor) { api.rodar('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', chave, JSON.stringify(valor)); },
    backup(pasta, manter = 30) {
      if (arquivo === ':memory:') return null;
      fs.mkdirSync(pasta, { recursive: true });
      const dia = new Date().toISOString().slice(0, 10);
      const base = path.basename(arquivo, path.extname(arquivo));
      const destino = path.join(pasta, `${base}-${dia}.db`);
      if (fs.existsSync(destino)) return null;
      db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
      const antigos = fs.readdirSync(pasta).filter(f => f.startsWith(base + '-') && /-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
      antigos.slice(0, Math.max(0, antigos.length - manter)).forEach(f => fs.rmSync(path.join(pasta, f), { force: true }));
      return destino;
    },
    fechar: () => db.close()
  };

  const versao = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = versao; v < MIGRACOES.length; v++) {
    api.transacao(() => { db.exec(MIGRACOES[v]); db.exec(`PRAGMA user_version = ${v + 1}`); });
  }
  return api;
}

module.exports = { abrir, MIGRACOES };
