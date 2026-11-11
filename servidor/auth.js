'use strict';
/* Login, sessões e permissões.
   - Senhas guardadas com scrypt (nunca em texto).
   - Sessão em cookie HttpOnly + SameSite=Strict; no banco fica só o hash do token.
   - Cada tipo de usuário (papel) tem uma lista de permissões, conferida no servidor em toda chamada. */
const crypto = require('crypto');
const { ErroHttp, valida } = require('./http');

const PAPEIS = {
  admin: 'Administrador',
  secretaria: 'Secretaria',
  coordenacao: 'Coordenação',
  professor: 'Professor',
  portaria: 'Portaria',
  financeiro: 'Financeiro'
};

/* O que cada papel pode fazer. 'admin' pode tudo. */
const PERMISSOES = {
  secretaria: ['escola.ver', 'cadastros', 'notas', 'relatorios', 'catraca', 'catraca.acessos', 'matriculas', 'comunicados', 'mensagens', 'pedagogico.ver', 'financeiro.ver'],
  coordenacao: ['escola.ver', 'notas', 'relatorios', 'catraca.acessos', 'comunicados', 'mensagens', 'pedagogico', 'pedagogico.ver'],
  professor: ['notas.proprias', 'mensagens', 'pedagogico.proprio'],
  portaria: ['catraca.acessos', 'mensagens'],
  financeiro: ['escola.ver', 'financeiro', 'financeiro.ver', 'relatorios', 'mensagens']
};
const pode = (usuario, perm) => !!usuario && (usuario.papel === 'admin' || (PERMISSOES[usuario.papel] || []).includes(perm));
const permissoesDe = papel => papel === 'admin' ? ['*'] : (PERMISSOES[papel] || []);

const DURACAO = 12 * 3600 * 1000;   // sessão vale 12 horas desde o último uso
const COOKIE = 'sessao';

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64);
  return `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
}
function confereSenha(senha, guardado) {
  const [tipo, sal, h] = String(guardado || '').split('$');
  if (tipo !== 'scrypt' || !sal || !h) return false;
  const esperado = Buffer.from(h, 'base64');
  const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'base64'), esperado.length);
  return crypto.timingSafeEqual(calc, esperado);
}
// usado quando o login não existe, para a resposta demorar o mesmo tempo (não revela quais logins existem)
const HASH_FALSO = hashSenha('senha-que-nao-existe');

function validaSenhaNova(senha) {
  const s = String(senha || '');
  if (s.length < 8) throw new ErroHttp('A senha precisa ter pelo menos 8 caracteres.');
  if (s.length > 200) throw new ErroHttp('Senha longa demais.');
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) throw new ErroHttp('Use letras e números na senha.');
  return s;
}

function criarAuth(db, { demo = false } = {}) {
  const tentativas = new Map();   // chave ip|login -> { n, ate }
  const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

  function limiteTentativas(chave) {
    const agora = Date.now(), t = tentativas.get(chave);
    if (t && t.ate > agora && t.n >= 5) throw new ErroHttp(`Muitas tentativas erradas. Espere ${Math.ceil((t.ate - agora) / 60000)} minuto(s) e tente de novo.`, 429);
  }
  function registraFalha(chave) {
    const agora = Date.now(), t = tentativas.get(chave);
    if (!t || t.ate < agora) tentativas.set(chave, { n: 1, ate: agora + 10 * 60000 });
    else t.n++;
    if (tentativas.size > 5000) tentativas.clear();
  }

  function criarSessao(usuarioId) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.rodar('INSERT INTO sessoes (hash, usuario_id, expira) VALUES (?, ?, ?)', hashToken(token), usuarioId, Date.now() + DURACAO);
    db.rodar("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?", usuarioId);
    db.rodar('DELETE FROM sessoes WHERE expira < ?', Date.now());
    return token;
  }
  function cookie(req, token, maxAge) {
    const https = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
  }

  /* devolve o usuário da sessão (ou null) e renova o prazo */
  function usuarioDaSessao(token) {
    if (!token) return null;
    const h = hashToken(token);
    const u = db.um(`SELECT u.id, u.nome, u.login, u.papel, u.professor_id, u.ativo, s.expira FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.hash = ?`, h);
    if (!u || !u.ativo || u.expira < Date.now()) return null;
    if (u.expira - Date.now() < DURACAO - 5 * 60000) db.rodar('UPDATE sessoes SET expira = ? WHERE hash = ?', Date.now() + DURACAO, h);
    return { id: u.id, nome: u.nome, login: u.login, papel: u.papel, professorId: u.professor_id };
  }

  const publico = u => ({ id: u.id, nome: u.nome, login: u.login, papel: u.papel, papelNome: PAPEIS[u.papel], professorId: u.professorId ?? u.professor_id ?? null, permissoes: permissoesDe(u.papel) });
  const precisaPrimeiroAcesso = () => !db.um('SELECT 1 FROM usuarios LIMIT 1');

  function registrar(rota) {
    /* situação da sessão: o portal chama ao abrir */
    rota('GET', '/api/sessao', null, ({ usuario }) => ({
      usuario: usuario ? publico(usuario) : null,
      primeiroAcesso: precisaPrimeiroAcesso(),
      demo,
      escola: db.config('escola', {})
    }));

    rota('POST', '/api/login', null, async ({ req, res, corpo, ip }) => {
      const login = String(corpo.login || '').trim().toLowerCase(), senha = String(corpo.senha || '');
      if (!login || !senha) throw new ErroHttp('Informe usuário e senha.');
      const chave = `${ip}|${login}`;
      limiteTentativas(chave);
      const u = db.um('SELECT * FROM usuarios WHERE login = ?', login);
      const ok = confereSenha(senha, u ? u.senha_hash : HASH_FALSO) && u && u.ativo;
      if (!ok) { registraFalha(chave); throw new ErroHttp('Usuário ou senha incorretos.', 401); }
      tentativas.delete(chave);
      res.setHeader('Set-Cookie', cookie(req, criarSessao(u.id), DURACAO / 1000));
      return { usuario: publico(u) };
    });

    rota('POST', '/api/logout', null, ({ req, res, token }) => {
      if (token) db.rodar('DELETE FROM sessoes WHERE hash = ?', hashToken(token));
      res.setHeader('Set-Cookie', cookie(req, '', 0));
      return { ok: true };
    });

    /* cria o primeiro administrador; só funciona com o banco sem nenhum usuário */
    rota('POST', '/api/primeiro-acesso', null, ({ req, res, corpo, auditar }) => {
      if (!precisaPrimeiroAcesso()) throw new ErroHttp('O administrador já foi criado. Entre com usuário e senha.', 409);
      const nome = valida.texto(corpo.nome, 'o seu nome', { obrigatorio: true, max: 120 });
      const login = validaLogin(corpo.login);
      const senha = validaSenhaNova(corpo.senha);
      const id = db.rodar('INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES (?, ?, ?, ?)', nome, login, hashSenha(senha), 'admin').id;
      const escolaNome = valida.texto(corpo.escola, 'o nome da escola', { max: 150 });
      if (escolaNome) db.salvarConfig('escola', { ...db.config('escola', {}), nome: escolaNome });
      auditar('primeiro acesso: administrador criado', login, { id, nome });
      res.setHeader('Set-Cookie', cookie(req, criarSessao(id), DURACAO / 1000));
      return { usuario: publico({ id, nome, login, papel: 'admin' }) };
    });

    rota('POST', '/api/minha-senha', 'logado', ({ usuario, corpo, auditar, token }) => {
      const u = db.um('SELECT senha_hash FROM usuarios WHERE id = ?', usuario.id);
      if (!confereSenha(corpo.atual || '', u.senha_hash)) throw new ErroHttp('A senha atual está incorreta.', 400);
      if (demo && usuario.login.endsWith('.demo')) throw new ErroHttp('Na demonstração as senhas dos usuários de teste não podem ser trocadas.', 403);
      db.rodar('UPDATE usuarios SET senha_hash = ? WHERE id = ?', hashSenha(validaSenhaNova(corpo.nova)), usuario.id);
      // derruba as outras sessões desse usuário
      db.rodar('DELETE FROM sessoes WHERE usuario_id = ? AND hash <> ?', usuario.id, hashToken(token));
      auditar('trocou a própria senha');
      return { ok: true };
    });

    /* ----- gestão de usuários (só administrador) ----- */
    rota('GET', '/api/usuarios', 'usuarios', () => db.todos(`SELECT u.id, u.nome, u.login, u.papel, u.ativo, u.professor_id AS professorId, u.ultimo_acesso AS ultimoAcesso, p.nome AS professor
      FROM usuarios u LEFT JOIN professores p ON p.id = u.professor_id ORDER BY u.ativo DESC, u.nome`));

    rota('POST', '/api/usuarios', 'usuarios', ({ corpo, auditar }) => {
      const d = dadosUsuario(corpo, true);
      const id = db.rodar('INSERT INTO usuarios (nome, login, senha_hash, papel, professor_id) VALUES (?, ?, ?, ?, ?)', d.nome, d.login, hashSenha(d.senha), d.papel, d.professorId).id;
      auditar('criou usuário', `${d.login} (${PAPEIS[d.papel]})`);
      return { id };
    });

    rota('PUT', '/api/usuarios/:id', 'usuarios', ({ params, corpo, usuario, auditar }) => {
      const id = valida.inteiro(params.id, 'Usuário', 1);
      const atual = db.um('SELECT * FROM usuarios WHERE id = ?', id);
      if (!atual) throw new ErroHttp('Usuário não encontrado.', 404);
      const d = dadosUsuario({ ...corpo, login: corpo.login ?? atual.login }, false, id);
      const ativo = corpo.ativo === undefined ? atual.ativo : (corpo.ativo ? 1 : 0);
      if (id === usuario.id && (d.papel !== 'admin' || !ativo)) throw new ErroHttp('Você não pode tirar o seu próprio acesso de administrador.');
      if (atual.papel === 'admin' && (d.papel !== 'admin' || !ativo) && db.um("SELECT COUNT(*) n FROM usuarios WHERE papel = 'admin' AND ativo = 1").n <= 1)
        throw new ErroHttp('Precisa existir pelo menos um administrador ativo.');
      db.rodar('UPDATE usuarios SET nome = ?, login = ?, papel = ?, professor_id = ?, ativo = ? WHERE id = ?', d.nome, d.login, d.papel, d.professorId, ativo, id);
      if (d.senha) db.rodar('UPDATE usuarios SET senha_hash = ? WHERE id = ?', hashSenha(d.senha), id);
      if (d.senha || !ativo) db.rodar('DELETE FROM sessoes WHERE usuario_id = ?', id);
      auditar('alterou usuário', `${d.login}${d.senha ? ' (senha redefinida)' : ''}${!ativo ? ' (desativado)' : ''}`);
      return { ok: true };
    });
  }

  function validaLogin(v) {
    const login = String(v || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new ErroHttp('O usuário precisa ter de 3 a 40 letras sem acento, números, ponto ou traço. Ex.: maria.souza');
    return login;
  }
  function dadosUsuario(c, nova, id) {
    const nome = valida.texto(c.nome, 'o nome', { obrigatorio: true, max: 120 });
    const login = validaLogin(c.login);
    if (db.um('SELECT 1 FROM usuarios WHERE login = ? AND id <> ?', login, id || 0)) throw new ErroHttp('Já existe um usuário com esse login.', 409);
    if (!PAPEIS[c.papel]) throw new ErroHttp('Escolha o tipo de acesso.');
    let professorId = null;
    if (c.papel === 'professor') {
      professorId = valida.inteiro(c.professorId, 'Professor', 1);
      if (!db.um('SELECT 1 FROM professores WHERE id = ?', professorId)) throw new ErroHttp('Escolha o professor ligado a este usuário.');
    }
    const senha = c.senha ? validaSenhaNova(c.senha) : null;
    if (nova && !senha) throw new ErroHttp('Defina uma senha inicial.');
    return { nome, login, papel: c.papel, professorId, senha };
  }

  /* usuários de teste das demonstrações */
  function usuariosDemo() {
    const lista = [['Administrador (demo)', 'admin.demo', 'admin'], ['Secretaria (demo)', 'secretaria.demo', 'secretaria'], ['Coordenação (demo)', 'coordenacao.demo', 'coordenacao'],
      ['Portaria (demo)', 'portaria.demo', 'portaria'], ['Financeiro (demo)', 'financeiro.demo', 'financeiro']];
    lista.forEach(([nome, login, papel]) => { if (!db.um('SELECT 1 FROM usuarios WHERE login = ?', login)) db.rodar('INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES (?, ?, ?, ?)', nome, login, hashSenha('demo1234'), papel); });
    const prof = db.um("SELECT id, nome FROM professores WHERE nome = 'Renata Siqueira'") || db.um('SELECT id, nome FROM professores LIMIT 1');
    if (prof && !db.um("SELECT 1 FROM usuarios WHERE login = 'professor.demo'")) db.rodar('INSERT INTO usuarios (nome, login, senha_hash, papel, professor_id) VALUES (?, ?, ?, ?, ?)', `${prof.nome} (demo)`, 'professor.demo', hashSenha('demo1234'), 'professor', prof.id);
  }

  return { registrar, usuarioDaSessao, pode, COOKIE, usuariosDemo };
}

module.exports = { criarAuth, PAPEIS, PERMISSOES, pode, hashSenha, confereSenha };
