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
