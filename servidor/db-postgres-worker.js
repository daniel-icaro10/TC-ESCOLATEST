'use strict';
/* Thread que conversa com o Postgres (o driver "pg" só funciona de forma assíncrona).
   O servidor manda { id, sql, params } pela porta, fica esperando, e esta thread responde
   e avisa pelo contador compartilhado. Uma conexão só: as transações (BEGIN/COMMIT) ficam
   sempre na mesma conexão, como no SQLite. */
const { workerData } = require('worker_threads');
const pg = require('pg');

const { porta, sinal, url, fusoHorario } = workerData;
const contador = new Int32Array(sinal);

pg.types.setTypeParser(20, v => v === null ? null : Number(v));     // bigint (COUNT, SUM, matrícula) vira número
pg.types.setTypeParser(1700, v => v === null ? null : Number(v));   // numeric vira número

// o Render (e a maioria dos provedores) exige SSL na conexão de fora; a URL interna do Render não usa
const precisaSsl = /sslmode=(require|verify-ca|verify-full|prefer)/.test(url) || /\.render\.com/.test(url) || process.env.PGSSL === '1';

let cliente = null;
async function conectar() {
  const c = new pg.Client({ connectionString: url, ssl: precisaSsl ? { rejectUnauthorized: false } : undefined });
  c.on('error', () => { if (cliente === c) cliente = null; });   // conexão caiu: reconecta no próximo pedido
  await c.connect();
  await c.query(`SET TIME ZONE '${String(fusoHorario).replace(/'/g, '')}'`);
  cliente = c;
}

function responder(msg) {
  porta.postMessage(msg);
  Atomics.add(contador, 0, 1);
  Atomics.notify(contador, 0);
}

porta.on('message', async ({ id, sql, params }) => {
  if (sql === null) {   // pedido para encerrar
    try { if (cliente) await cliente.end(); } catch (e) { /* já fechada */ }
    return responder({ id, ok: true });
  }
  try {
    if (!cliente) await conectar();
    const r = await cliente.query(sql, params && params.length ? params : undefined);
    const ultimo = Array.isArray(r) ? r[r.length - 1] : r;   // vários comandos de uma vez devolvem uma lista
    responder({ id, rows: ultimo.rows || [], count: ultimo.rowCount || 0 });
  } catch (e) {
    if (!e.code || /^08/.test(e.code) || /terminat|ECONN|closed/i.test(e.message)) { try { cliente && cliente.end().catch(() => {}); } catch (e2) { /* nada */ } cliente = null; }
    responder({ id, erro: { message: e.message, code: e.code, detail: e.detail } });
  }
});
