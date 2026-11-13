'use strict';
/* Portal da família: o responsável vê só os próprios filhos.
   A secretaria cria os acessos e o administrador escolhe o que as famílias veem. */
const { ErroHttp, valida } = require('./http');
const { hashSenha } = require('./auth');

function criarFamilia(db, { auth, catraca, financeiro }) {
  const cfg = () => ({ mostrarNotas: true, mostrarCatraca: true, mostrarFinanceiro: true, ...(db.config('familia') || {}) });
  const meusAlunos = usuario => db.todos('SELECT a.id, a.matricula FROM usuario_alunos ua JOIN alunos a ON a.id = ua.aluno_id WHERE ua.usuario_id = ?', usuario.id);
  const alunoMeu = (usuario, id) => {
    const a = meusAlunos(usuario).find(x => x.id === Number(id));
    if (!a) throw new ErroHttp('Aluno não encontrado.', 404);
    return a;
  };
  const alunosValidos = lista => {
    const ids = [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter(Number.isInteger))];
    if (!ids.length) throw new ErroHttp('Escolha ao menos um aluno.');
    ids.forEach(id => { if (!db.um('SELECT 1 FROM alunos WHERE id = ?', id)) throw new ErroHttp('Aluno não encontrado.'); });
    return ids;
  };

  function registrar(rota) {
    rota('GET', '/api/familia/config', 'logado', () => cfg());
    rota('PUT', '/api/familia/config', 'config', ({ corpo, auditar }) => {
      const n = { mostrarNotas: !!corpo.mostrarNotas, mostrarCatraca: !!corpo.mostrarCatraca, mostrarFinanceiro: !!corpo.mostrarFinanceiro };
      db.salvarConfig('familia', n);
      auditar('alterou o que as famílias veem', JSON.stringify(n));
      return n;
    });

    /* ----- o que a família vê ----- */
    rota('GET', '/api/familia/acessos', 'familia', async ({ usuario, url }) => {
      if (!cfg().mostrarCatraca) return [];
      const a = alunoMeu(usuario, url.searchParams.get('aluno'));
      const dias = Math.max(1, Math.min(30, Number(url.searchParams.get('dias')) || 7));
      return catraca.acessosAluno(a.matricula, dias);
    });
    rota('GET', '/api/familia/cobrancas', 'familia', ({ usuario }) => {
      if (!cfg().mostrarFinanceiro) return [];
      const ids = meusAlunos(usuario).map(a => a.id);
      if (!ids.length) return [];
      return db.todos(`SELECT * FROM cobrancas WHERE cancelada = 0 AND aluno_id IN (${ids.map(() => '?').join(',')}) ORDER BY vencimento DESC, id`, ...ids).map(financeiro.publica);
    });

    /* ----- a secretaria cria e gerencia os acessos ----- */
    rota('GET', '/api/familia/usuarios', 'cadastros', () => {
      const porUsuario = new Map();
      db.todos("SELECT ua.usuario_id u, ua.aluno_id a FROM usuario_alunos ua JOIN usuarios x ON x.id = ua.usuario_id WHERE x.papel = 'familia' ORDER BY ua.aluno_id")
        .forEach(r => { if (!porUsuario.has(r.u)) porUsuario.set(r.u, []); porUsuario.get(r.u).push(r.a); });
      return db.todos("SELECT u.id, u.nome, u.login, u.ativo, u.ultimo_acesso ultimoAcesso FROM usuarios u WHERE u.papel = 'familia' ORDER BY u.nome")
        .map(u => ({ ...u, ativo: !!u.ativo, alunos: porUsuario.get(u.id) || [] }));
    });
    rota('POST', '/api/familia/usuarios', 'cadastros', ({ corpo, auditar }) => {
      const d = auth.dadosUsuario({ ...corpo, papel: 'familia', permitirFamilia: true }, true);
      const alunos = alunosValidos(corpo.alunos);
      const id = db.transacao(() => {
        const id = db.rodar('INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES (?, ?, ?, ?)', d.nome, d.login, hashSenha(d.senha), 'familia').id;
        alunos.forEach(a => db.rodar('INSERT INTO usuario_alunos (usuario_id, aluno_id) VALUES (?, ?)', id, a));
        return id;
      });
      auditar('criou acesso de família', `${d.login} (${alunos.length} aluno(s))`);
      return { id };
    });
    rota('PUT', '/api/familia/usuarios/:id', 'cadastros', ({ params, corpo, auditar }) => {
      const u = db.um("SELECT * FROM usuarios WHERE id = ? AND papel = 'familia'", valida.inteiro(params.id, 'Usuário', 1));
      if (!u) throw new ErroHttp('Acesso de família não encontrado.', 404);
      auth.protegeDemo(u);
      const d =auth.dadosUsuario({ nome: corpo.nome ?? u.nome, login: corpo.login ?? u.login, senha: corpo.senha, papel: 'familia', permitirFamilia: true }, false, u.id);
      const alunos = alunosValidos(corpo.alunos);
      const ativo = corpo.ativo === undefined ? u.ativo : (corpo.ativo ? 1 : 0);
      db.transacao(() => {
        db.rodar('UPDATE usuarios SET nome = ?, login = ?, ativo = ? WHERE id = ?', d.nome, d.login, ativo, u.id);
        if (d.senha) db.rodar('UPDATE usuarios SET senha_hash = ? WHERE id = ?', hashSenha(d.senha), u.id);
        db.rodar('DELETE FROM usuario_alunos WHERE usuario_id = ?', u.id);
        alunos.forEach(a => db.rodar('INSERT INTO usuario_alunos (usuario_id, aluno_id) VALUES (?, ?)', u.id, a));
        if (d.senha || !ativo) db.rodar('DELETE FROM sessoes WHERE usuario_id = ?', u.id);
      });
      auditar('alterou acesso de família', `${d.login}${d.senha ? ' (senha redefinida)' : ''}${!ativo ? ' (desativado)' : ''}`);
      return { ok: true };
    });
  }
  return { registrar };
}

module.exports = { criarFamilia };
