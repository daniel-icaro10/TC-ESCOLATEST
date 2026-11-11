'use strict';
/* Integração com a catraca Control iD (API HTTP do equipamento).
   https://www.controlid.com.br/docs/access-api-pt/
   O navegador nunca fala com a catraca: ela só tem HTTP na rede local e não libera CORS.
   O login da catraca fica no servidor e nunca é devolvido para o navegador. */
const { ErroHttp, valida } = require('./http');

const PADRAO = {
  ip: '', usuario: 'admin', senha: '',
  acaoLiberar: 'catra',          // iDBlock: "catra"; iDFace/iDFlex com SecBox: "sec_box"; iDAccess: "door"
  sentidoEntrada: 'clockwise',   // sentido do giro que é a ENTRADA na escola
  secBoxId: 65793,               // usado só quando acaoLiberar = "sec_box"
  porta_rele: 1,                 // usado só quando acaoLiberar = "door"
  grupoId: 1                     // grupo da catraca em que os alunos entram (regra de acesso)
};
const ACOES = ['catra', 'sec_box', 'door'], SENTIDOS = ['clockwise', 'anticlockwise'];

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
const EVENTOS = { 1: 'Equipamento inválido', 2: 'Identificação inválida', 3: 'Não identificado', 4: 'Identificação pendente', 5: 'Tempo esgotado',
  6: 'Acesso negado', 7: 'Acesso liberado', 8: 'Acesso pendente', 9: 'Não é administrador', 10: 'Liberado pelo sistema', 11: 'Liberado pela botoeira',
  12: 'Liberado pela tela da catraca', 13: 'Desistiu de passar', 14: 'Sem resposta', 15: 'Liberado pela interfonia' };

/* Número do cartão: "123,45678" (área,código impressos no cartão) vira 123 * 2^32 + 45678,
   como manda a documentação. Só dígitos: usa o número como está. */
function valorCartao(entrada) {
  const s = String(entrada).trim().replace(/\s/g, '');
  if (!s) return null;
  const m = s.match(/^(\d{1,3})[,.](\d{1,10})$/);
  if (m) {
    const area = Number(m[1]), codigo = Number(m[2]);
    if (area > 255 || codigo > 4294967295) throw new ErroHttp('Número do cartão fora do formato área,código (ex.: 123,45678).', 400);
    return area * 4294967296 + codigo;
  }
  if (!/^\d{1,15}$/.test(s)) throw new ErroHttp('Número do cartão inválido. Use só números, ou área,código (ex.: 123,45678).', 400);
  return Number(s);
}
function cartaoLegivel(valor) {
  const v = Number(valor);
  const area = Math.floor(v / 4294967296);
  return area ? `${area},${v - area * 4294967296}` : String(v);
}

/**
 * @param db banco
 * @param opcoes.inicial configuração inicial da catraca (vinda do arquivo de configuração), usada se o banco ainda não tiver uma
 * @param opcoes.modoDemo demonstração online: só aceita o IP da catraca simulada
 */
function criarCatraca(db, { inicial = null, modoDemo = false, auditarSistema = () => {} } = {}) {
  let cfg = { ...PADRAO, ...(inicial || {}), ...(db.config('catraca') || {}) };
  const IP_DEMO = modoDemo ? cfg.ip : null;
  const configurada = () => !!cfg.ip;
  let sessao = null;

  /* ---------- cliente HTTP da catraca ---------- */
  async function bruto(caminho, { corpo, query = {}, tipo = 'application/json', comSessao = true, timeout = 15000, ip = cfg.ip } = {}) {
    if (!ip) throw new ErroHttp('A catraca ainda não foi configurada. Peça ao administrador para preencher em Controle de acesso > Conexão com a catraca.', 503);
    const q = new URLSearchParams(query);
    if (comSessao) q.set('session', sessao);
    const url = `http://${ip}/${caminho}${q.toString() ? '?' + q : ''}`;
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
      throw new ErroHttp(`${motivo[0].toUpperCase() + motivo.slice(1)} (${modoDemo ? 'simulada' : ip}). Confira se ela está ligada na rede e o IP em Conexão com a catraca.`, 504);
    }
    const texto = await r.text();
    let json;
    try { json = texto ? JSON.parse(texto) : {}; } catch (e) { json = { texto }; }
    return { status: r.status, json };
  }
  async function login() {
    const { status, json } = await bruto('login.fcgi', { corpo: { login: cfg.usuario, password: cfg.senha }, comSessao: false });
    if (status !== 200 || !json.session) throw new ErroHttp('A catraca recusou o login. Confira usuário e senha em Conexão com a catraca.', 502, json);
    sessao = json.session;
  }
  /* chama a catraca; se a sessão caiu, faz login de novo e tenta mais uma vez */
  async function api(caminho, corpo, opcoes = {}) {
    if (!sessao) await login();
    let r = await bruto(caminho, { corpo, ...opcoes });
    if (r.status === 401 || r.status === 403) { await login(); r = await bruto(caminho, { corpo, ...opcoes }); }
    if (r.status >= 400) {
      const msg = r.json && (r.json.error || r.json.message || r.json.texto) || `erro HTTP ${r.status}`;
      throw new ErroHttp(`A catraca respondeu com erro em ${caminho}: ${msg}`, 502, r.json);
    }
    return r.json;
  }
  const carregar = (object, extra = {}) => api('load_objects.fcgi', { object, ...extra }).then(r => r[object] || []);
  const criar = (object, values) => api('create_objects.fcgi', { object, values }).then(r => r.ids || []);
  const alterar = (object, values, where) => api('modify_objects.fcgi', { object, values, where: { [object]: where } });
  const apagar = (object, where) => api('destroy_objects.fcgi', { object, where: { [object]: where } });
  const usuarioPorMatricula = async mat => (await carregar('users', { where: { users: { registration: String(mat) } } }))[0] || null;

  function lembrar(mat, parcial) {
    const atual = db.um('SELECT facial, cartao, senha FROM catraca_status WHERE matricula = ?', mat) || { facial: 0, cartao: null, senha: 0 };
    const n = { ...atual, ...parcial };
    db.rodar(`INSERT INTO catraca_status (matricula, facial, cartao, senha, atualizado) VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(matricula) DO UPDATE SET facial = excluded.facial, cartao = excluded.cartao, senha = excluded.senha, atualizado = excluded.atualizado`, mat, !!n.facial, n.cartao, !!n.senha);
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

  function alunoDoBanco(mat) {
    const a = db.um('SELECT id, matricula, nome, situacao, consentimento_biometria FROM alunos WHERE matricula = ?', mat);
    if (!a) throw new ErroHttp('Aluno não encontrado no cadastro da escola.', 404);
    return a;
  }
  const exigeConsentimento = a => {
    if (!a.consentimento_biometria) throw new ErroHttp('Falta o consentimento do responsável para o uso da biometria facial (LGPD). Marque o consentimento no cadastro do aluno antes de cadastrar o rosto. Cartão e senha podem ser cadastrados sem ele.', 422);
  };

  /* ---------- ações ---------- */
  async function salvarAluno(mat, d) {
    const a = alunoDoBanco(mat);
    if (!['cursando', 'aprovado', 'reprovado'].includes(a.situacao)) throw new ErroHttp(`O aluno está com situação "${a.situacao}" e não pode ser cadastrado na catraca.`, 409);
    if (d.foto) exigeConsentimento(a);
    const avisos = [];
    if (d.senha && !/^\d{4,8}$/.test(String(d.senha))) throw new ErroHttp('A senha precisa ter de 4 a 8 números.', 400);

    // confere o cartão antes de mexer em qualquer coisa na catraca
    const trocarCartao = d.cartao !== undefined && d.cartao !== null;
    const valor = trocarCartao && d.cartao !== '' ? valorCartao(d.cartao) : null;
    if (valor !== null) {
      const dono = await carregar('cards', { where: { cards: { value: valor } } });
      if (dono.length) {
        const outro = (await carregar('users', { where: { users: { id: dono[0].user_id } } }))[0];
        if (!outro || outro.registration !== String(mat)) throw new ErroHttp(`Este cartão já pertence a ${outro ? outro.name : 'outro usuário'} na catraca.`, 409);
      }
    }

    const nome = a.nome.slice(0, 120);
    let u = await usuarioPorMatricula(mat);
    if (!u) {
      const [id] = await criar('users', [{ registration: String(mat), name: nome }]);
      if (!id) throw new ErroHttp('A catraca não devolveu o código do novo usuário.', 502);
      u = { id, name: nome, registration: String(mat) };
    } else if (nome !== u.name) {
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
      if (img.length > 1024 * 1024) throw new ErroHttp('A foto passou de 1 MB. Tire outra foto ou use uma imagem menor.', 400);
      const r = await api('user_set_image.fcgi', img, {
        query: { user_id: u.id, timestamp: Math.floor(Date.now() / 1000), match: 1 },
        tipo: 'application/octet-stream', timeout: 30000
      });
      // alguns firmwares devolvem o resultado da análise, outros não devolvem nada
      if (r && r.success === false) res.foto = { ok: false, erros: (r.errors || []).map(e => MSG_FACE[e.code] || e.message || 'Foto recusada pela catraca.') };
      else res.foto = { ok: true };
    }
    const parcial = {};
    if (res.senha !== undefined) parcial.senha = res.senha;
    if (res.cartao !== undefined) parcial.cartao = res.cartao;
    if (res.foto && res.foto.ok) parcial.facial = true;
    lembrar(mat, parcial);
    return res;
  }

  async function removerAluno(mat) {
    const u = await usuarioPorMatricula(mat);
    db.rodar('DELETE FROM catraca_status WHERE matricula = ?', mat);
    if (!u) return { removido: false };
    await apagar('cards', { user_id: u.id });
    await apagar('user_groups', { user_id: u.id }).catch(() => {});
    await api('user_destroy_image.fcgi', { user_id: u.id }).catch(() => {});
    await apagar('users', { id: u.id });
    return { removido: true };
  }

  /* só tira a foto (usado quando o consentimento é retirado): cartão e senha continuam */
  async function removerFacial(mat) {
    const u = await usuarioPorMatricula(mat);
    if (u) await api('user_destroy_image.fcgi', { user_id: u.id });
    lembrar(mat, { facial: false });
  }

  /* cadastro feito na própria catraca: o aluno olha para a câmera dela ou passa o cartão no leitor */
  async function cadastroRemoto(mat, tipo) {
    const a = alunoDoBanco(mat);
    if (tipo === 'face') exigeConsentimento(a);
    let u = await usuarioPorMatricula(mat);
    if (!u) { await salvarAluno(mat, {}); u = await usuarioPorMatricula(mat); }
    const r = await api('remote_enroll.fcgi', {
      type: tipo, user_id: u.id, save: true, sync: true,
      ...(tipo === 'face' ? { auto: true, countdown: 3 } : {}),
      msg: tipo === 'face' ? 'Olhe para a câmera' : 'Aproxime o cartão'
    }, { timeout: 60000 });
    if (r.success === false || r.error) {
      const e = r.error || {};
      const msg = tipo === 'face' ? (MSG_FACE[e.code] || e.message || 'Não foi possível cadastrar o rosto.') : (e.message || 'Nenhum cartão lido.');
      throw new ErroHttp(msg, 422, r);
    }
    if (tipo !== 'card') { lembrar(mat, { facial: true }); return { ok: true }; }
    // alguns firmwares não devolvem o número lido: busca o cartão que a catraca gravou para o aluno
    let valor = r.card_value;
    if (!valor) valor = ((await carregar('cards', { where: { cards: { user_id: u.id } } }).catch(() => []))[0] || {}).value;
    const cartao = valor ? cartaoLegivel(valor) : null;
    lembrar(mat, { cartao });
    return { ok: true, cartao };
  }

  async function listarAlunos() {
    const [users, cards] = await Promise.all([
      carregar('users', { fields: ['id', 'name', 'registration', 'password', 'image_timestamp'] }).catch(() => carregar('users')),
      carregar('cards')
    ]);
    const cartoes = new Map();
    cards.forEach(c => cartoes.set(Number(c.user_id), cartaoLegivel(c.value)));
    const lista = users.map(u => ({ id: u.id, nome: u.name, matricula: u.registration, senha: !!u.password, facial: !!u.image_timestamp, cartao: cartoes.get(Number(u.id)) || null }));
    // a catraca é a fonte da verdade: atualiza o que o sistema lembra
    db.transacao(() => {
      db.rodar('DELETE FROM catraca_status');
      lista.forEach(u => { if (/^\d+$/.test(String(u.matricula))) db.rodar('INSERT OR REPLACE INTO catraca_status (matricula, facial, cartao, senha) VALUES (?, ?, ?, ?)', Number(u.matricula), u.facial, u.cartao, u.senha); });
    });
    return lista;
  }

  async function liberar(sentido) {
    const oposto = cfg.sentidoEntrada === 'clockwise' ? 'anticlockwise' : 'clockwise';
    const giro = sentido === 'saida' ? oposto : sentido === 'ambos' ? 'both' : cfg.sentidoEntrada;
    let parametros;
    if (cfg.acaoLiberar === 'catra') parametros = `allow=${giro}`;
    else if (cfg.acaoLiberar === 'sec_box') parametros = `id=${cfg.secBoxId}, reason=3`;
    else parametros = `door=${cfg.porta_rele}`;
    await api('execute_actions.fcgi', { actions: [{ action: cfg.acaoLiberar, parameters: parametros }] });
    return { ok: true, giro };
  }

  async function acessos(desde, ate, limite) {
    const where = [{ object: 'access_logs', field: 'time', operator: '>=', value: desde }];
    if (ate) where.push({ object: 'access_logs', field: 'time', operator: '<', value: ate });
    const [logs, users] = await Promise.all([carregar('access_logs', { where }), carregar('users', { fields: ['id', 'name', 'registration'] }).catch(() => carregar('users'))]);
    const porId = new Map(users.map(u => [Number(u.id), u]));
    return logs.sort((a, b) => b.time - a.time || b.id - a.id).slice(0, limite).map(l => {
      const u = porId.get(Number(l.user_id));
      const meio = l.card_value ? 'Cartão' : l.confidence ? 'Facial' : l.pin_value ? 'PIN' : (l.user_id && l.event === 7) ? 'Senha' : '';
      return { id: l.id, hora: l.time, evento: l.event, descricao: EVENTOS[l.event] || `Evento ${l.event}`, meio, matricula: u ? u.registration : null, nome: u ? u.name : null };
    });
  }

  /* ---------- configuração ---------- */
  const configPublica = () => ({
    ip: cfg.ip, usuario: cfg.usuario, senhaDefinida: !!cfg.senha, acaoLiberar: cfg.acaoLiberar, sentidoEntrada: cfg.sentidoEntrada,
    grupoId: cfg.grupoId, secBoxId: cfg.secBoxId, porta_rele: cfg.porta_rele, demo: modoDemo, configurada: configurada()
  });
  function validarConfig(d) {
    const ip = String(d.ip || '').trim();
    if (!/^[a-zA-Z0-9.-]{1,253}(:\d{1,5})?$/.test(ip)) throw new ErroHttp('IP da catraca inválido. Exemplo: 192.168.0.129', 400);
    if (modoDemo && ip !== IP_DEMO) throw new ErroHttp(`Na demonstração online só existe a catraca simulada, no IP ${IP_DEMO}. Na escola, coloque aqui o IP da catraca de verdade.`, 400);
    const usuario = String(d.usuario || '').trim();
    if (!usuario || usuario.length > 64) throw new ErroHttp('Informe o usuário de administrador da catraca.', 400);
    const senha = d.senha ? String(d.senha) : cfg.senha;   // em branco mantém a senha atual
    if (!ACOES.includes(d.acaoLiberar)) throw new ErroHttp('Escolha o modelo da catraca.', 400);
    if (!SENTIDOS.includes(d.sentidoEntrada)) throw new ErroHttp('Escolha o sentido da entrada.', 400);
    return {
      ip, usuario, senha, acaoLiberar: d.acaoLiberar, sentidoEntrada: d.sentidoEntrada,
      grupoId: valida.inteiro(d.grupoId ?? cfg.grupoId, 'Grupo de acesso', 0, 1e9),
      secBoxId: valida.inteiro(d.secBoxId ?? cfg.secBoxId, 'Número da SecBox', 0, 1e12),
      porta_rele: valida.inteiro(d.porta_rele ?? cfg.porta_rele, 'Número do relé', 1, 8)
    };
  }
  async function testarConfig(d) {
    const c = validarConfig(d);
    const { status, json } = await bruto('login.fcgi', { corpo: { login: c.usuario, password: c.senha }, comSessao: false, ip: c.ip, timeout: 8000 });
    if (status !== 200 || !json.session) throw new ErroHttp('A catraca respondeu, mas recusou o usuário ou a senha.', 422);
    await bruto('logout.fcgi', { query: { session: json.session }, comSessao: false, ip: c.ip }).catch(() => {});
    return { ok: true };
  }

  const matriculaDe = p => valida.inteiro(p.mat, 'Matrícula', 1, 999999999999);

  function registrar(rota) {
    rota('GET', '/api/catraca/status', 'catraca.acessos', async () => {
      if (!configurada()) return { ok: false, configurada: false, demo: modoDemo };
      let v = await api('session_is_valid.fcgi');
      if (v.session_is_valid === false) { await login(); v = await api('session_is_valid.fcgi'); }
      return { ok: true, configurada: true, catraca: modoDemo ? 'simulada' : cfg.ip, acao: cfg.acaoLiberar, demo: modoDemo };
    });
    rota('GET', '/api/catraca/config', 'catraca.config', () => configPublica());
    rota('PUT', '/api/catraca/config', 'catraca.config', async ({ corpo, auditar }) => {
      const novo = validarConfig(corpo);
      // a demonstração online é compartilhada: só salva dados que funcionam, para ninguém derrubar a demo dos outros
      if (modoDemo) await testarConfig(corpo);
      cfg = { ...cfg, ...novo };
      sessao = null;
      db.salvarConfig('catraca', cfg);
      auditar('alterou a configuração da catraca', `IP ${cfg.ip}, ação ${cfg.acaoLiberar}`);
      return configPublica();
    });
    rota('POST', '/api/catraca/config/testar', 'catraca.config', ({ corpo }) => testarConfig(corpo));

    rota('GET', '/api/catraca/alunos', 'catraca', () => listarAlunos());
    rota('GET', '/api/catraca/lembrados', 'catraca', () => db.todos('SELECT matricula, facial, cartao, senha FROM catraca_status')
      .map(r => ({ matricula: r.matricula, facial: !!r.facial, cartao: r.cartao, senha: !!r.senha })));
    rota('PUT', '/api/catraca/alunos/:mat', 'catraca', async ({ params, corpo, auditar }) => {
      const mat = matriculaDe(params), r = await salvarAluno(mat, corpo);
      const o = [r.senha !== undefined && 'senha', r.cartao !== undefined && 'cartão', r.foto && r.foto.ok && 'foto do rosto'].filter(Boolean);
      auditar('cadastrou na catraca', `matrícula ${mat}${o.length ? ': ' + o.join(', ') : ''}`);
      return r;
    });
    rota('DELETE', '/api/catraca/alunos/:mat', 'catraca', async ({ params, auditar }) => {
      const mat = matriculaDe(params), r = await removerAluno(mat);
      auditar('removeu da catraca', `matrícula ${mat}`);
      return r;
    });
    rota('POST', '/api/catraca/alunos/:mat/facial-na-catraca', 'catraca', async ({ params, auditar }) => {
      const mat = matriculaDe(params), r = await cadastroRemoto(mat, 'face');
      auditar('cadastrou rosto pela catraca', `matrícula ${mat}`);
      return r;
    });
    rota('POST', '/api/catraca/alunos/:mat/cartao-na-catraca', 'catraca', async ({ params, auditar }) => {
      const mat = matriculaDe(params), r = await cadastroRemoto(mat, 'card');
      auditar('cadastrou cartão pela catraca', `matrícula ${mat}`);
      return r;
    });
    rota('POST', '/api/catraca/liberar', 'catraca.acessos', async ({ corpo, auditar }) => {
      const sentido = ['entrada', 'saida', 'ambos'].includes(corpo.sentido) ? corpo.sentido : 'entrada';
      const r = await liberar(sentido);
      auditar('liberou a catraca manualmente', sentido);
      return r;
    });
    rota('GET', '/api/catraca/acessos', 'catraca.acessos', ({ url }) => {
      // ?data=AAAA-MM-DD mostra um dia; sem data, o dia de hoje
      const data = url.searchParams.get('data');
      let inicio;
      if (data) { valida.dataISO(data, 'Data'); inicio = new Date(data + 'T00:00:00'); }
      else { inicio = new Date(); inicio.setHours(0, 0, 0, 0); }
      const desde = Math.floor(inicio / 1000), ate = desde + 86400;
      const limite = Math.max(1, Math.min(2000, Math.floor(Number(url.searchParams.get('limite'))) || 200));
      return acessos(desde, ate, limite);
    });
  }

  /* chamado quando o aluno sai da escola, é excluído ou o consentimento é retirado.
     Devolve um aviso (texto) se não deu para atualizar a catraca agora. */
  async function alunoSaiu(mat, d) {
    if (!configurada()) return null;
    const saiu = d.removido || !['cursando', 'aprovado', 'reprovado'].includes(d.situacao);
    try {
      if (saiu) await removerAluno(mat);
      else if (d.consentimento === false) await removerFacial(mat);
      return null;
    } catch (e) {
      auditarSistema('falha ao atualizar a catraca', `matrícula ${mat}: ${e.message}`);
      return `Não consegui atualizar a catraca agora (${e.message}). Remova o aluno dela em Controle de acesso > Cadastro facial quando a catraca voltar.`;
    }
  }

  /* entradas e saídas de um aluno nos últimos dias (portal da família) */
  async function acessosAluno(mat, dias = 7) {
    if (!configurada()) return [];
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0); inicio.setDate(inicio.getDate() - (dias - 1));
    return (await acessos(Math.floor(inicio / 1000), null, 5000)).filter(l => String(l.matricula) === String(mat) && [7, 10, 11, 12, 15].includes(l.evento));
  }

  return { registrar, alunoSaiu, configPublica, acessosAluno };
}

module.exports = { criarCatraca, valorCartao, cartaoLegivel };
