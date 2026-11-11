#!/usr/bin/env node
/*
 * Servidor do Portal Escolar
 * ---------------------------------------------------------------
 * Roda num computador da escola (o mesmo que fica na rede da catraca).
 * - Serve o portal (pasta public) para os computadores da rede da escola.
 * - Guarda os dados no banco SQLite em servidor/dados/escola.db (backup diário em dados/backups).
 * - Fala com a catraca Control iD.
 *
 * Sem dependências: precisa só do Node.js 22.13 ou mais novo (versão LTS).
 *   node servidor/server.js
 */
'use strict';

// fetch e node:sqlite: só existem em versões recentes do Node
const [maior, menor] = process.versions.node.split('.').map(Number);
if (maior < 22 || (maior === 22 && menor < 13) || (maior === 23 && menor < 4)) {
  console.error(`O sistema precisa do Node.js 22.13 ou mais novo (este computador tem o ${process.version}).`);
  console.error('Baixe a versão LTS em https://nodejs.org e abra o sistema de novo.');
  process.exit(1);
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { ErroHttp, responder, lerCorpo, lerCookies, criarRoteador, CABECALHOS_SEGURANCA } = require('./http');
const { abrir } = require('./db');
const semente = require('./semente');
const { criarAuth, pode } = require('./auth');
const { criarEscola } = require('./escola');
const { criarCatraca } = require('./catraca');
const { criarAcademico } = require('./academico');
const { criarMatriculas } = require('./matriculas');
const { criarComunicacao } = require('./comunicacao');
const { criarPedagogico } = require('./pedagogico');
const { criarFinanceiro } = require('./financeiro');
const { criarFamilia } = require('./familia');

/* ---------------- Configuração ---------------- */
const PADRAO = {
  host: '0.0.0.0',           // aceita acesso dos outros computadores da rede da escola
  porta: 8787,
  banco: 'dados/escola.db',  // relativo à pasta servidor; ":memory:" = sem salvar (demonstração online)
  dadosExemplo: false,       // cria turmas, alunos e usuários de teste (só para demonstrações)
  modoDemo: false,           // demonstração online pública: catraca presa ao simulador
  catraca: null              // configuração inicial da catraca; depois ela é editada pela tela e fica no banco
};
const ARQ_CONFIG = path.resolve(__dirname, process.env.CONFIG || process.env.PONTE_CONFIG || 'config.json');
let cfg = { ...PADRAO };
try {
  cfg = { ...PADRAO, ...JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8')) };
} catch (e) {
  if (e.code !== 'ENOENT') { console.error(`${path.basename(ARQ_CONFIG)} inválido:`, e.message); process.exit(1); }
}
if (process.env.PORT) cfg.porta = Number(process.env.PORT);   // o Render define a porta por variável de ambiente

const PASTA_PORTAL = path.join(__dirname, '..', 'public');
const TEM_PORTAL = fs.existsSync(path.join(PASTA_PORTAL, 'index.html'));
const ARQ_BANCO = cfg.banco === ':memory:' ? ':memory:' : path.resolve(__dirname, cfg.banco);

/* ---------------- Banco e módulos ---------------- */
let db;
try { db = abrir(ARQ_BANCO); }
catch (e) { console.error('Não consegui abrir o banco de dados', ARQ_BANCO, '-', e.message); process.exit(1); }
semente.basico(db);

function auditar(usuario, acao, detalhe) {
  try { db.rodar('INSERT INTO auditoria (usuario_id, usuario, acao, detalhe) VALUES (?, ?, ?, ?)', usuario ? usuario.id : null, usuario ? usuario.login : 'sistema', acao, detalhe == null ? null : String(detalhe).slice(0, 500)); }
  catch (e) { console.error('auditoria:', e.message); }
}

const auth = criarAuth(db, { demo: !!cfg.dadosExemplo });
if (cfg.dadosExemplo) { semente.exemplo(db); auth.usuariosDemo(); }
const catraca = criarCatraca(db, { inicial: cfg.catraca, modoDemo: !!cfg.modoDemo, auditarSistema: (a, d) => auditar(null, a, d) });
const escola = criarEscola(db, { alunoSaiu: (mat, d) => catraca.alunoSaiu(mat, d) });

const roteador = criarRoteador();
auth.registrar(roteador.rota);
escola.registrar(roteador.rota);
catraca.registrar(roteador.rota);
criarAcademico(db, escola).registrar(roteador.rota);
criarMatriculas(db, escola).registrar(roteador.rota);
criarComunicacao(db).registrar(roteador.rota);
criarPedagogico(db).registrar(roteador.rota);
const financeiro = criarFinanceiro(db);
financeiro.registrar(roteador.rota);
criarFamilia(db, { auth, catraca, financeiro }).registrar(roteador.rota);

/* download do backup pelo portal (administrador): uma cópia consistente do banco, feita na hora */
roteador.rota('GET', '/api/backup', 'config', ({ res, auditar }) => {
  const tmp = path.join(require('os').tmpdir(), `portal-backup-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const dados = fs.readFileSync(tmp);
    auditar('baixou o backup do banco');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="escola-${new Date().toISOString().slice(0, 10)}.db"`, 'Cache-Control': 'no-store', ...CABECALHOS_SEGURANCA });
    res.end(dados);
  } finally { fs.rmSync(tmp, { force: true }); }
});

/* backup diário do banco (guarda os últimos 30 dias) */
function fazerBackup() {
  try { const f = db.backup(path.join(path.dirname(ARQ_BANCO), 'backups')); if (f) console.log(new Date().toLocaleString('pt-BR'), 'backup do banco:', f); }
  catch (e) { console.error('Falha no backup do banco:', e.message); }
}
if (ARQ_BANCO !== ':memory:') { fazerBackup(); setInterval(fazerBackup, 3600 * 1000).unref(); }

/* ---------------- Portal (arquivos estáticos) ---------------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webp': 'image/webp', '.csv': 'text/csv; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
  "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

function servirArquivo(req, res, caminhoUrl) {
  if (!TEM_PORTAL) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('O servidor está rodando, mas não achou o portal (pasta "public").\nCopie a pasta do projeto inteira, com as pastas "public" e "servidor" lado a lado.');
  }
  let rel;
  // endereço malformado (ex.: /%E0) faria decodeURIComponent lançar erro
  try { rel = caminhoUrl === '/' ? 'index.html' : decodeURIComponent(caminhoUrl).replace(/^\/+/, ''); }
  catch (e) { res.writeHead(400); return res.end(); }
  const arq = path.resolve(PASTA_PORTAL, rel);
  if (!arq.startsWith(PASTA_PORTAL + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, (e, dados) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      'Content-Security-Policy': CSP, ...CABECALHOS_SEGURANCA });
    res.end(dados);
  });
}

/* ---------------- API ---------------- */
const MUTAVEIS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
function ipDe(req) {
  // Atrás de um proxy o IP real vem no cabeçalho: no Render (modoDemo) e no túnel da Cloudflare, que entrega os
  // pedidos pelo próprio computador (127.0.0.1). Pedidos diretos da rede da escola usam o IP da conexão.
  const direto = req.socket.remoteAddress || '';
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(direto);
  if (!cfg.modoDemo && !local) return direto;
  const cf = req.headers['cf-connecting-ip'], xff = req.headers['x-forwarded-for'];
  if (cf) return String(cf).trim();
  if (xff) return String(xff).split(',')[0].trim();
  return direto;
}

async function tratarApi(req, res, url) {
  // proteção contra pedidos forjados por outros sites (CSRF): além do cookie SameSite=Strict,
  // pedidos que alteram dados precisam ser JSON e, se vierem com Origin, do mesmo endereço
  if (MUTAVEIS.has(req.method)) {
    const origem = req.headers.origin;
    if (origem) {
      let host = '';
      try { host = new URL(origem).host; } catch (e) { /* origem inválida */ }
      if (host !== req.headers.host) return responder(res, 403, { erro: 'Pedido vindo de outro site foi bloqueado.' });
    }
    const tipo = String(req.headers['content-type'] || '');
    if (req.method !== 'DELETE' && !tipo.startsWith('application/json')) return responder(res, 415, { erro: 'Envie os dados em JSON.' });
  }

  const achado = roteador.achar(req.method, url.pathname);
  if (!achado) return responder(res, 404, { erro: 'Rota não encontrada.' });
  if (achado.metodoErrado) return responder(res, 405, { erro: 'Método não permitido.' });
  const { rota, params } = achado;

  const token = lerCookies(req)[auth.COOKIE];
  const usuario = auth.usuarioDaSessao(token);
  if (rota.permissao) {
    if (!usuario) return responder(res, 401, { erro: 'Sua sessão terminou. Entre de novo.', sessao: false });
    if (rota.permissao !== 'logado' && !pode(usuario, rota.permissao)) return responder(res, 403, { erro: 'Você não tem permissão para fazer isso. Fale com o administrador do sistema.' });
  }

  const corpo = MUTAVEIS.has(req.method) && req.method !== 'DELETE' ? await lerCorpo(req) : {};
  const dados = await rota.fn({ req, res, url, params, corpo, usuario, token, ip: ipDe(req), auditar: (acao, detalhe) => auditar(usuario, acao, detalhe) });
  if (res.headersSent) return;   // a rota já respondeu (ex.: download do backup)
  responder(res, 200, dados);
}

/* Nenhum pedido pode derrubar o servidor: um erro inesperado vira resposta 500 em vez de encerrar o processo. */
const servidor = http.createServer((req, res) => {
  tratar(req, res).catch(e => {
    const status = e instanceof ErroHttp ? e.status : 500;
    if (status >= 500) console.error(new Date().toLocaleString('pt-BR'), req.method, req.url, e && (e.status ? e.message : e.stack) || e, e && e.extra || '');
    try { responder(res, status, { erro: status === 500 ? 'Erro interno no servidor. Tente de novo; se continuar, avise o suporte.' : e.message }); } catch (e2) { /* conexão já fechada */ }
  });
});

async function tratar(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return tratarApi(req, res, url);
  if (req.method === 'GET' || req.method === 'HEAD') return servirArquivo(req, res, url.pathname);
  res.writeHead(405); res.end();
}

servidor.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`A porta ${cfg.porta} já está em uso: o sistema provavelmente já está aberto em outra janela. Feche a outra janela ou use só ela.`);
  else console.error('Não consegui iniciar o servidor:', e.message);
  process.exit(1);
});

function enderecosDaRede() {
  return Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

servidor.listen(cfg.porta, cfg.host, () => {
  console.log('');
  console.log(`Portal escolar rodando. Neste computador: http://localhost:${cfg.porta}`);
  if (cfg.host === '0.0.0.0' && !cfg.modoDemo) enderecosDaRede().forEach(ip => console.log(`Nos outros computadores da escola:  http://${ip}:${cfg.porta}`));
  console.log(`Banco de dados: ${ARQ_BANCO === ':memory:' ? 'só na memória (demonstração)' : ARQ_BANCO}`);
  const c = catraca.configPublica();
  console.log(c.configurada ? `Catraca Control iD em ${c.ip} · ação de liberar: ${c.acaoLiberar}` : 'Catraca ainda não configurada (configure pelo portal).');
  if (cfg.dadosExemplo) console.log('DEMONSTRAÇÃO: dados fictícios. Usuários de teste: admin.demo, secretaria.demo, coordenacao.demo, professor.demo, portaria.demo, financeiro.demo, familia.demo (senha demo1234).');
  if (!TEM_PORTAL) console.warn('ATENÇÃO: não achei o portal (pasta "public" ao lado de "servidor"). Copie a pasta do projeto inteira.');
  console.log('Deixe esta janela aberta enquanto o sistema estiver em uso.');
});

/* fecha o banco direito ao encerrar (Ctrl+C) */
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { try { db.fechar(); } catch (e) { /* já fechado */ } process.exit(0); }));
