'use strict';
/* Utilidades HTTP compartilhadas pelo servidor: erros, leitura do corpo, respostas e roteador. */

class ErroHttp extends Error {
  constructor(msg, status = 400, extra) { super(msg); this.status = status; this.extra = extra; }
}

const CABECALHOS_SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function responder(res, status, dados, extra = {}) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CABECALHOS_SEGURANCA, ...extra });
  res.end(JSON.stringify(dados));
}

function lerCorpo(req, max = 3 * 1024 * 1024) {
  if (req._corpo) return req._corpo;
  req._corpo = new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', p => { tam += p.length; if (tam > max) { falha(new ErroHttp('Envio grande demais.', 413)); req.destroy(); } else partes.push(p); });
    req.on('end', () => {
      if (!partes.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch (e) { falha(new ErroHttp('JSON inválido.', 400)); }
    });
    req.on('error', falha);
  });
  return req._corpo;
}

function lerCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* cookie malformado */ } }
  });
  return out;
}

/* Roteador simples: rota('GET', '/api/alunos/:id', permissao, async (ctx) => dados) */
function criarRoteador() {
  const rotas = [];
  function rota(metodo, padrao, permissao, fn) {
    const nomes = [];
    const re = new RegExp('^' + padrao.replace(/:(\w+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '$');
    rotas.push({ metodo, re, nomes, permissao, fn });
  }
  function achar(metodo, caminho) {
    let existeCaminho = false;
    for (const r of rotas) {
      const m = caminho.match(r.re);
      if (!m) continue;
      existeCaminho = true;
      if (r.metodo !== metodo) continue;
      const params = {};
      r.nomes.forEach((n, i) => { try { params[n] = decodeURIComponent(m[i + 1]); } catch (e) { params[n] = m[i + 1]; } });
      return { rota: r, params };
    }
    return existeCaminho ? { metodoErrado: true } : null;
  }
  return { rota, achar };
}

/* validações comuns */
const texto = (v, nome, { obrigatorio = false, max = 200 } = {}) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (obrigatorio && !s) throw new ErroHttp(`Preencha ${nome}.`);
  if (s.length > max) throw new ErroHttp(`${nome[0].toUpperCase() + nome.slice(1)} muito longo (máximo ${max} caracteres).`);
  return s;
};
const inteiro = (v, nome, min = 0, max = 1e9) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroHttp(`${nome} inválido.`);
  return n;
};
const dataISO = (v, nome, { obrigatorio = false } = {}) => {
  const s = String(v ?? '').trim();
  if (!s) { if (obrigatorio) throw new ErroHttp(`Preencha ${nome}.`); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T00:00:00Z'))) throw new ErroHttp(`${nome} inválida.`);
  return s;
};
const email = (v, { obrigatorio = false } = {}) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) { if (obrigatorio) throw new ErroHttp('Preencha o e-mail.'); return ''; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 120) throw new ErroHttp('E-mail inválido.');
  return s;
};
const telefone = (v, { obrigatorio = false } = {}) => {
  const s = String(v ?? '').trim();
  if (!s) { if (obrigatorio) throw new ErroHttp('Preencha o telefone.'); return ''; }
  const d = s.replace(/\D/g, '');
  if (d.length < 10 || d.length > 13) throw new ErroHttp('Telefone inválido. Use DDD + número.');
  return s.slice(0, 30);
};
const nota = (v, nome) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) throw new ErroHttp(`${nome}: nota precisa estar entre 0 e 10.`);
  return Math.round(n * 10) / 10;
};

module.exports = { ErroHttp, responder, lerCorpo, lerCookies, criarRoteador, CABECALHOS_SEGURANCA, valida: { texto, inteiro, dataISO, email, telefone, nota } };
