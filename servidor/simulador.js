#!/usr/bin/env node
/*
 * Simulador da catraca Control iD, para testar o portal e a ponte sem o equipamento.
 * Imita só as chamadas que a ponte usa. Os dados ficam na memória e somem ao fechar.
 *
 *   node simulador.js            (escuta em 127.0.0.1:8790)
 *
 * No config.json da ponte, use:  "catraca": { "ip": "127.0.0.1:8790", "usuario": "admin", "senha": "admin" }
 */
'use strict';
const http = require('http');
const crypto = require('crypto');
const PORTA = Number(process.env.PORTA) || 8790;

const db = { users: [], cards: [], user_groups: [], access_logs: [] };
const seq = { users: 1, cards: 1, user_groups: 1, access_logs: 1 };
const sessoes = new Set();
const agora = () => Math.floor(Date.now() / 1000);

function confere(obj, where, nome) {
  if (!where) return true;
  if (Array.isArray(where)) {
    return where.filter(w => !w.object || w.object === nome).every(w => {
      const v = obj[w.field], x = w.value;
      switch (w.operator) {
        case '=': return v == x; case '!=': return v != x; case '>': return v > x;
        case '>=': return v >= x; case '<': return v < x; case '<=': return v <= x; default: return true;
      }
    });
  }
  const f = where[nome] || {};
  return Object.entries(f).every(([k, x]) => (x && typeof x === 'object') ? Object.entries(x).every(([op, y]) => ({ '!=': obj[k] != y, '>': obj[k] > y, '>=': obj[k] >= y, '<': obj[k] < y, '<=': obj[k] <= y }[op])) : String(obj[k]) === String(x));
}

const LIMITE = 3000;   // a demonstração online é pública: limita a memória usada
function registrar(evento, extra = {}) {
  if (db.access_logs.length >= LIMITE) db.access_logs.splice(0, 500);
  db.access_logs.push({ id: seq.access_logs++, time: agora(), event: evento, device_id: 1, user_id: 0, portal_id: 1, card_value: 0, confidence: 0, pin_value: '', ...extra });
}

const rotas = {
  'login.fcgi': b => {
    if (b.login !== 'admin' || b.password !== 'admin') return [401, { error: 'Invalid login' }];
    const s = crypto.randomBytes(12).toString('base64url');
    if (sessoes.size > 100) sessoes.clear();
    sessoes.add(s); return [200, { session: s }];
  },
  'session_is_valid.fcgi': () => [200, { session_is_valid: true }],
  'load_objects.fcgi': b => {
    let l = (db[b.object] || []).filter(o => confere(o, b.where, b.object));
    if (b.fields) l = l.map(o => Object.fromEntries(b.fields.map(f => [f, o[f]])));
    return [200, { [b.object]: l }];
  },
  'create_objects.fcgi': b => {
    if (!db[b.object]) return [400, { error: 'Unknown object' }];
    if (db[b.object].length + b.values.length > LIMITE) return [400, { error: 'Simulador cheio: reinicie para limpar' }];
    if (b.object === 'cards' && b.values.some(v => db.cards.some(c => c.value === v.value))) return [400, { error: 'UNIQUE constraint failed: cards.value' }];
    const ids = b.values.map(v => { const o = { id: seq[b.object]++, password: '', salt: '', image_timestamp: 0, ...v }; db[b.object].push(o); return o.id; });
    return [200, { ids }];
  },
  'modify_objects.fcgi': b => {
    let n = 0; (db[b.object] || []).forEach(o => { if (confere(o, b.where, b.object)) { Object.assign(o, b.values); n++; } });
    return [200, { changes: n }];
  },
  'destroy_objects.fcgi': b => {
    const antes = (db[b.object] || []).length;
    db[b.object] = (db[b.object] || []).filter(o => !confere(o, b.where, b.object));
    return [200, { changes: antes - db[b.object].length }];
  },
  'user_hash_password.fcgi': b => {
    const salt = crypto.randomBytes(16).toString('hex');
    return [200, { password: crypto.createHash('sha256').update(salt + b.password).digest('hex'), salt }];
  },
  'user_set_image.fcgi': (b, q, bruto) => {
    const u = db.users.find(x => String(x.id) === q.get('user_id'));
    if (!u) return [200, { user_id: Number(q.get('user_id')), success: false, errors: [{ code: 1, message: 'User does not exist' }] }];
    if (bruto.length < 5000) return [200, { user_id: u.id, success: false, errors: [{ code: 2, message: 'Face not detected' }] }];
    u.image_timestamp = Number(q.get('timestamp')) || agora();
    return [200, { user_id: u.id, scores: { bounds_width: 300, sharpness_quality: 600 }, success: true }];
  },
  'user_destroy_image.fcgi': b => { const u = db.users.find(x => String(x.id) === String(b.user_id)); if (u) u.image_timestamp = 0; return [200, {}]; },
  'remote_enroll.fcgi': async b => {
    await new Promise(r => setTimeout(r, 2000));
    const u = db.users.find(x => x.id === b.user_id);
    if (!u) return [200, { success: false, error: { code: 1, message: 'User does not exist' } }];
    if (b.type === 'face') { u.image_timestamp = agora(); return [200, { success: true, user_id: u.id, device_id: 1, user_image: '' }]; }
    const valor = 123 * 4294967296 + Math.floor(10000 + Math.random() * 89999);
    db.cards = db.cards.filter(c => c.user_id !== u.id); db.cards.push({ id: seq.cards++, value: valor, user_id: u.id });
    return [200, { success: true, user_id: u.id, device_id: 1, card_value: valor }];
  },
  'execute_actions.fcgi': b => { console.log('  -> catraca liberada:', JSON.stringify(b.actions)); registrar(10); return [200, {}]; }
};

/* de vez em quando um aluno cadastrado "passa" pela catraca, para a tela de acessos ter movimento */
setInterval(() => {
  if (!db.users.length || Math.random() < .5) return;
  const u = db.users[Math.floor(Math.random() * db.users.length)];
  const card = db.cards.find(c => c.user_id === u.id);
  if (Math.random() < .1) return registrar(3);
  if (card && Math.random() < .5) registrar(7, { user_id: u.id, card_value: card.value });
  else if (u.image_timestamp) registrar(7, { user_id: u.id, confidence: 1500 });
  else if (u.password) registrar(7, { user_id: u.id });
}, 8000);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const nome = url.pathname.slice(1);
  const partes = [];
  req.on('data', p => partes.push(p));
  req.on('end', async () => {
    const bruto = Buffer.concat(partes);
    let corpo = {};
    if ((req.headers['content-type'] || '').includes('json') && bruto.length) { try { corpo = JSON.parse(bruto); } catch (e) { res.writeHead(400); return res.end('{"error":"bad json"}'); } }
    const fn = rotas[nome];
    if (!fn) { res.writeHead(404); return res.end('{"error":"not found"}'); }
    if (nome !== 'login.fcgi' && nome !== 'session_is_valid.fcgi' && !sessoes.has(url.searchParams.get('session'))) { res.writeHead(401); return res.end('{"error":"Invalid session"}'); }
    let st, dados;
    // pedido fora do formato não pode derrubar o simulador (na demonstração online ele divide o processo com a ponte)
    try { [st, dados] = await fn(corpo, url.searchParams, bruto); }
    catch (e) { [st, dados] = [400, { error: 'Invalid request: ' + e.message }]; }
    console.log(new Date().toLocaleTimeString('pt-BR'), nome, st);
    res.writeHead(st, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dados));
  });
}).on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `A porta ${PORTA} já está em uso: o simulador provavelmente já está aberto em outra janela.` : 'Não consegui iniciar o simulador: ' + e.message);
  process.exit(1);
}).listen(PORTA, '127.0.0.1', () => console.log(`Simulador da catraca Control iD em http://127.0.0.1:${PORTA} (login admin / admin)`));
