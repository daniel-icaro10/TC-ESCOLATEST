#!/usr/bin/env node
/*
 * Ponte da catraca Control iD
 * ---------------------------------------------------------------
 * Roda num computador da escola que está na mesma rede da catraca.
 * O portal (no navegador) fala com esta ponte em http://localhost:8787
 * e a ponte fala com a catraca usando a API HTTP da Control iD
 * (https://www.controlid.com.br/docs/access-api-pt/).
 *
 * Por que uma ponte? A catraca só fala HTTP na rede local e não libera
 * CORS, então o navegador não consegue chamar a catraca direto. A ponte
 * também guarda o login da catraca, que assim não fica no navegador.
 *
 * Sem dependências: precisa só do Node.js 18 ou mais novo.
 *   node server.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---------------- Configuração ---------------- */
const PADRAO = {
  host: '127.0.0.1',                // só este computador acessa a ponte
  porta: 8787,
  token: '',                        // se preencher, o portal precisa mandar o mesmo token
  origensPermitidas: ['http://localhost:8787', 'http://127.0.0.1:8787'],
  catraca: { ip: '192.168.0.129', usuario: 'admin', senha: 'admin' },
  acaoLiberar: 'catra',             // iDBlock: "catra"; iDFace/iDFlex com SecBox: "sec_box"; iDAccess: "door"
  sentidoEntrada: 'clockwise',      // sentido do giro que é a ENTRADA na escola
  secBoxId: 65793,                  // usado só quando acaoLiberar = "sec_box"
  porta_rele: 1,                    // usado só quando acaoLiberar = "door"
  grupoId: 1,                       // grupo da catraca em que os alunos entram (regra de acesso)
  servirPortal: true                // abre o portal em http://localhost:8787
};
// PONTE_CONFIG permite usar outro arquivo (o demo.bat usa config.demo.json, que aponta para o simulador)
const ARQ_CONFIG = path.resolve(__dirname, process.env.PONTE_CONFIG || 'config.json');
let cfg = { ...PADRAO };
try {
  const lido = JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8'));
  cfg = { ...PADRAO, ...lido, catraca: { ...PADRAO.catraca, ...(lido.catraca || {}) } };
} catch (e) {
  if (e.code !== 'ENOENT') { console.error('config.json inválido:', e.message); process.exit(1); }
  console.warn('Sem config.json: usando valores padrão. Copie config.exemplo.json para config.json e ajuste o IP da catraca.');
}
const BASE = `http://${cfg.catraca.ip}`;
const PASTA_PORTAL = path.join(__dirname, '..', 'public');

/* ---------------- Cliente da catraca ---------------- */
let sessao = null;

class ErroCatraca extends Error {
  constructor(msg, status = 502, extra) { super(msg); this.status = status; this.extra = extra; }
}

async function bruto(caminho, { corpo, query = {}, tipo = 'application/json', comSessao = true, timeout = 15000 } = {}) {
  const q = new URLSearchParams(query);
  if (comSessao) q.set('session', sessao);
  const url = `${BASE}/${caminho}${q.toString() ? '?' + q : ''}`;
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': tipo },
      body: corpo === undefined ? undefined : (Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo)),
      signal: AbortSignal.timeout(timeout)
    });
  } catch (e) {
    const motivo = e.name === 'TimeoutError' ? 'a catraca demorou demais para responder' : 'não foi possível falar com a catraca';
    throw new ErroCatraca(`${motivo} (${cfg.catraca.ip}). Confira o IP no config.json e se a catraca está ligada na rede.`, 504);
  }
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : {}; } catch (e) { json = { texto }; }
  return { status: r.status, json };
}

async function login() {
  const { status, json } = await bruto('login.fcgi', { corpo: { login: cfg.catraca.usuario, password: cfg.catraca.senha }, comSessao: false });
  if (status !== 200 || !json.session) throw new ErroCatraca('A catraca recusou o login. Confira usuário e senha no config.json.', 502, json);
  sessao = json.session;
}

/* Chama a catraca; se a sessão caiu, faz login de novo e tenta mais uma vez. */
async function api(caminho, corpo, opcoes = {}) {
  if (!sessao) await login();
  let r = await bruto(caminho, { corpo, ...opcoes });
  if (r.status === 401 || r.status === 403) { await login(); r = await bruto(caminho, { corpo, ...opcoes }); }
  if (r.status >= 400) {
    const msg = r.json && (r.json.error || r.json.message || r.json.texto) || `erro HTTP ${r.status}`;
    throw new ErroCatraca(`A catraca respondeu com erro em ${caminho}: ${msg}`, 502, r.json);
  }
  return r.json;
}

const carregar = (object, extra = {}) => api('load_objects.fcgi', { object, ...extra }).then(r => r[object] || []);
const criar = (object, values) => api('create_objects.fcgi', { object, values }).then(r => r.ids || []);
const alterar = (object, values, where) => api('modify_objects.fcgi', { object, values, where: { [object]: where } });
const apagar = (object, where) => api('destroy_objects.fcgi', { object, where: { [object]: where } });

async function usuarioPorMatricula(mat) {
  const lista = await carregar('users', { where: { users: { registration: String(mat) } } });
  return lista[0] || null;
}

/* Número do cartão: "123,45678" (área,código impressos no cartão) vira 123 * 2^32 + 45678,
   como manda a documentação. Só dígitos: usa o número como está. */
function valorCartao(entrada) {
  const s = String(entrada).trim().replace(/\s/g, '');
  if (!s) return null;
  const m = s.match(/^(\d{1,3})[,.](\d{1,10})$/);
  if (m) {
    const area = Number(m[1]), codigo = Number(m[2]);
    if (area > 255 || codigo > 4294967295) throw new ErroCatraca('Número do cartão fora do formato área,código (ex.: 123,45678).', 400);
    return area * 4294967296 + codigo;
  }
  if (!/^\d{1,15}$/.test(s)) throw new ErroCatraca('Número do cartão inválido. Use só números, ou área,código (ex.: 123,45678).', 400);
  return Number(s);
}
function cartaoLegivel(valor) {
  const v = Number(valor);
  const area = Math.floor(v / 4294967296);
  return area ? `${area},${v - area * 4294967296}` : String(v);
}

const MSG_FACE = {
  1: 'A catraca não reconheceu a imagem. Envie uma foto JPG ou PNG.',
  2: 'Nenhum rosto encontrado na foto.',
  3: 'Este rosto já está cadastrado para outro aluno.',
  4: 'O rosto não está centralizado na foto.',
  5: 'O rosto está muito longe. Aproxime a câmera.',
  6: 'O rosto está muito perto. Afaste um pouco a câmera.',
  7: 'O aluno precisa olhar de frente para a câmera.',
  8: 'A foto está tremida ou sem foco.',
  9: 'O rosto está muito encostado na borda da foto.'
};
function traduzErrosFace(erros = []) {
  return erros.map(e => MSG_FACE[e.code] || e.message || 'Foto recusada pela catraca.');
}

async function garantirGrupo(userId, avisos) {
  if (!cfg.grupoId) return;
  try {
    const ja = await carregar('user_groups', { where: { user_groups: { user_id: userId } } });
    if (!ja.some(g => Number(g.group_id) === Number(cfg.grupoId))) await criar('user_groups', [{ user_id: userId, group_id: Number(cfg.grupoId) }]);
  } catch (e) {
    avisos.push(`Não consegui colocar o aluno no grupo ${cfg.grupoId} da catraca (${e.message}). Confira as regras de acesso na catraca.`);
  }
}

/* ---------------- Ações do portal ---------------- */
async function salvarAluno(mat, d) {
  const avisos = [];
  const nome = String(d.nome || '').trim().slice(0, 120);
  if (!/^\d{1,12}$/.test(String(mat))) throw new ErroCatraca('Matrícula inválida.', 400);
  if (d.senha && !/^\d{4,8}$/.test(String(d.senha))) throw new ErroCatraca('A senha precisa ter de 4 a 8 números.', 400);

  // confere o cartão antes de mexer em qualquer coisa na catraca
  const trocarCartao = d.cartao !== undefined && d.cartao !== null;
  const valor = trocarCartao && d.cartao !== '' ? valorCartao(d.cartao) : null;
  if (valor !== null) {
    const dono = await carregar('cards', { where: { cards: { value: valor } } });
    if (dono.length) {
      const outro = (await carregar('users', { where: { users: { id: dono[0].user_id } } }))[0];
      if (!outro || outro.registration !== String(mat)) throw new ErroCatraca(`Este cartão já pertence a ${outro ? outro.name : 'outro usuário'} na catraca.`, 409);
    }
  }

  let u = await usuarioPorMatricula(mat);
  if (!u) {
    if (!nome) throw new ErroCatraca('Informe o nome do aluno.', 400);
    const [id] = await criar('users', [{ registration: String(mat), name: nome }]);
    if (!id) throw new ErroCatraca('A catraca não devolveu o código do novo usuário.');
    u = { id, name: nome, registration: String(mat) };
  } else if (nome && nome !== u.name) {
    await alterar('users', { name: nome }, { id: u.id });
  }
  await garantirGrupo(u.id, avisos);

  const res = { userId: u.id, avisos };

  if (d.senha) {
    const h = await api('user_hash_password.fcgi', { password: String(d.senha) });
    await alterar('users', { password: h.password, salt: h.salt }, { id: u.id });
    res.senha = true;
  } else if (d.removerSenha) {
    await alterar('users', { password: '', salt: '' }, { id: u.id });
    res.senha = false;
  }

  if (trocarCartao) {
    await apagar('cards', { user_id: u.id });
    if (valor !== null) await criar('cards', [{ value: valor, user_id: u.id }]);
    res.cartao = valor === null ? null : cartaoLegivel(valor);
  }

  if (d.foto) {
    const base64 = String(d.foto).replace(/^data:image\/\w+;base64,/, '');
    const img = Buffer.from(base64, 'base64');
    if (img.length > 1024 * 1024) throw new ErroCatraca('A foto passou de 1 MB. Tire outra foto ou use uma imagem menor.', 400);
    const r = await api('user_set_image.fcgi', img, {
      query: { user_id: u.id, timestamp: Math.floor(Date.now() / 1000), match: 1 },
      tipo: 'application/octet-stream', timeout: 30000
    });
    // alguns firmwares devolvem o resultado da análise, outros não devolvem nada
    if (r && r.success === false) res.foto = { ok: false, erros: traduzErrosFace(r.errors) };
    else res.foto = { ok: true };
  }
  return res;
}

async function removerAluno(mat) {
  const u = await usuarioPorMatricula(mat);
  if (!u) return { removido: false };
  await apagar('cards', { user_id: u.id });
  await apagar('user_groups', { user_id: u.id }).catch(() => {});
  await api('user_destroy_image.fcgi', { user_id: u.id }).catch(() => {});
  await apagar('users', { id: u.id });
  return { removido: true };
}

/* Cadastro feito na própria catraca: o aluno olha para a câmera dela ou passa o cartão no leitor. */
async function cadastroRemoto(mat, tipo, nome) {
  let u = await usuarioPorMatricula(mat);
  if (!u) { await salvarAluno(mat, { nome }); u = await usuarioPorMatricula(mat); }
  const r = await api('remote_enroll.fcgi', {
    type: tipo, user_id: u.id, save: true, sync: true,
    ...(tipo === 'face' ? { auto: true, countdown: 3 } : {}),
    msg: tipo === 'face' ? 'Olhe para a câmera' : 'Aproxime o cartão'
  }, { timeout: 60000 });
  if (r.success === false || r.error) {
    const e = r.error || {};
    const msg = tipo === 'face' ? (MSG_FACE[e.code] || e.message || 'Não foi possível cadastrar o rosto.') : (e.message || 'Nenhum cartão lido.');
    throw new ErroCatraca(msg, 422, r);
  }
  return tipo === 'card' ? { ok: true, cartao: r.card_value ? cartaoLegivel(r.card_value) : null } : { ok: true };
}

async function listarAlunos() {
  const [users, cards] = await Promise.all([
    carregar('users', { fields: ['id', 'name', 'registration', 'password', 'image_timestamp'] }).catch(() => carregar('users')),
    carregar('cards')
  ]);
  const cartoes = new Map();
  cards.forEach(c => cartoes.set(Number(c.user_id), cartaoLegivel(c.value)));
  return users.map(u => ({
    id: u.id, nome: u.name, matricula: u.registration,
    senha: !!u.password, facial: !!u.image_timestamp, cartao: cartoes.get(Number(u.id)) || null
  }));
}

async function liberar(sentido) {
  const oposto = cfg.sentidoEntrada === 'clockwise' ? 'anticlockwise' : 'clockwise';
  const giro = sentido === 'saida' ? oposto : sentido === 'ambos' ? 'both' : cfg.sentidoEntrada;
  let parametros;
  if (cfg.acaoLiberar === 'catra') parametros = `allow=${giro}`;
  else if (cfg.acaoLiberar === 'sec_box') parametros = `id=${cfg.secBoxId}, reason=3`;
  else parametros = `door=${cfg.porta_rele}`;
  await api('execute_actions.fcgi', { actions: [{ action: cfg.acaoLiberar, parameters: parametros }] });
  console.log(new Date().toLocaleString('pt-BR'), `liberação manual pelo portal: ${sentido || 'entrada'} (${parametros})`);
  return { ok: true, giro };
}

const EVENTOS = { 1: 'Equipamento inválido', 2: 'Identificação inválida', 3: 'Não identificado', 4: 'Identificação pendente', 5: 'Tempo esgotado',
  6: 'Acesso negado', 7: 'Acesso liberado', 8: 'Acesso pendente', 9: 'Não é administrador', 10: 'Liberado pelo sistema', 11: 'Liberado pela botoeira',
  12: 'Liberado pela tela da catraca', 13: 'Desistiu de passar', 14: 'Sem resposta', 15: 'Liberado pela interfonia' };

async function acessos(desde, limite) {
  const where = [{ object: 'access_logs', field: 'time', operator: '>=', value: desde }];
  const [logs, users] = await Promise.all([carregar('access_logs', { where }), carregar('users', { fields: ['id', 'name', 'registration'] }).catch(() => carregar('users'))]);
  const porId = new Map(users.map(u => [Number(u.id), u]));
  return logs.sort((a, b) => b.time - a.time || b.id - a.id).slice(0, limite).map(l => {
    const u = porId.get(Number(l.user_id));
    const meio = l.card_value ? 'Cartão' : l.confidence ? 'Facial' : l.pin_value ? 'PIN' : (l.user_id && l.event === 7) ? 'Senha' : '';
    return { id: l.id, hora: l.time, evento: l.event, descricao: EVENTOS[l.event] || `Evento ${l.event}`, meio,
      matricula: u ? u.registration : null, nome: u ? u.name : null };
  });
}

/* ---------------- Servidor HTTP ---------------- */
function cabecalhosCors(req) {
  const origem = req.headers.origin;
  if (!origem || !cfg.origensPermitidas.includes(origem)) return {};
  return {
    'Access-Control-Allow-Origin': origem,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Token',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600'
  };
}
function responder(req, res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabecalhosCors(req) });
  res.end(JSON.stringify(dados));
}
function lerCorpo(req, max = 3 * 1024 * 1024) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', p => { tam += p.length; if (tam > max) { falha(new ErroCatraca('Envio grande demais.', 413)); req.destroy(); } else partes.push(p); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch (e) { falha(new ErroCatraca('JSON inválido.', 400)); } });
    req.on('error', falha);
  });
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function servirArquivo(req, res, caminhoUrl) {
  const rel = caminhoUrl === '/' ? 'index.html' : decodeURIComponent(caminhoUrl).replace(/^\/+/, '');
  const arq = path.resolve(PASTA_PORTAL, rel);
  if (!arq.startsWith(PASTA_PORTAL + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, (e, dados) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(dados);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rota = url.pathname;

  if (req.method === 'OPTIONS') { res.writeHead(204, cabecalhosCors(req)); return res.end(); }

  if (!rota.startsWith('/api/')) {
    if (cfg.servirPortal && req.method === 'GET') return servirArquivo(req, res, rota);
    res.writeHead(404); return res.end();
  }

  // pedidos vindos de outro site que não está na lista são recusados
  const origem = req.headers.origin;
  if (origem && !cfg.origensPermitidas.includes(origem)) return responder(req, res, 403, { erro: `Origem ${origem} não autorizada. Inclua em origensPermitidas no config.json.` });
  if (cfg.token && req.headers['x-token'] !== cfg.token) return responder(req, res, 401, { erro: 'Token da ponte incorreto.' });

  try {
    const m = rota.match(/^\/api\/alunos\/(\d{1,12})(\/[\w-]+)?$/);
    let dados;
    if (req.method === 'GET' && rota === '/api/status') {
      // reaproveita a sessão aberta; só faz login de novo se a catraca disser que ela venceu
      let v = await api('session_is_valid.fcgi');
      if (v.session_is_valid === false) { await login(); v = await api('session_is_valid.fcgi'); }
      dados = { ok: true, catraca: cfg.catraca.ip, sessao: v.session_is_valid !== false, acao: cfg.acaoLiberar };
    } else if (req.method === 'GET' && rota === '/api/alunos') {
      dados = await listarAlunos();
    } else if (m && req.method === 'PUT' && !m[2]) {
      dados = await salvarAluno(m[1], await lerCorpo(req));
    } else if (m && req.method === 'DELETE' && !m[2]) {
      dados = await removerAluno(m[1]);
    } else if (m && req.method === 'POST' && m[2] === '/facial-na-catraca') {
      dados = await cadastroRemoto(m[1], 'face', (await lerCorpo(req)).nome);
    } else if (m && req.method === 'POST' && m[2] === '/cartao-na-catraca') {
      dados = await cadastroRemoto(m[1], 'card', (await lerCorpo(req)).nome);
    } else if (req.method === 'POST' && rota === '/api/liberar') {
      dados = await liberar((await lerCorpo(req)).sentido);
    } else if (req.method === 'GET' && rota === '/api/acessos') {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const desde = Number(url.searchParams.get('desde')) || Math.floor(hoje / 1000);
      const limite = Math.min(500, Number(url.searchParams.get('limite')) || 100);
      dados = await acessos(desde, limite);
    } else {
      return responder(req, res, 404, { erro: 'Rota não encontrada.' });
    }
    responder(req, res, 200, dados);
  } catch (e) {
    const status = e instanceof ErroCatraca ? e.status : 500;
    if (status >= 500) console.error(new Date().toLocaleString('pt-BR'), rota, e.message, e.extra || '');
    responder(req, res, status, { erro: e.message });
  }
});

servidor.listen(cfg.porta, cfg.host, () => {
  console.log(`Ponte da catraca rodando em http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.porta}`);
  console.log(`Catraca Control iD em ${BASE} · ação de liberar: ${cfg.acaoLiberar}`);
  if (cfg.servirPortal) console.log(`Portal disponível em http://localhost:${cfg.porta}`);
});
