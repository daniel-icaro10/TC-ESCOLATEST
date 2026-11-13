'use strict';
/* =====================================================================
   Núcleo do portal: HTML seguro, ícones, chamadas à API, janelas,
   formulários, menu, rotas e login.
   ===================================================================== */

/* ---------- HTML seguro ----------
   html`...${valor}...` escapa todo valor (nome de aluno, etc.), a não ser que venha de outro html`` ou de seguro().
   Assim um nome como <script> digitado no cadastro aparece como texto e nunca roda. */
class Seguro { constructor(s) { this.s = s; } toString() { return this.s; } }
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const valHtml = v => v instanceof Seguro ? v.s : Array.isArray(v) ? v.map(valHtml).join('') : (v === false || v === null || v === undefined) ? '' : esc(v);
function html(partes, ...vals) { let s = partes[0]; vals.forEach((v, i) => { s += valHtml(v) + partes[i + 1]; }); return new Seguro(s); }
const seguro = s => new Seguro(String(s));
const $ = id => document.getElementById(id);

/* ---------- Ícones ---------- */
const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  megaphone: '<path d="M3 10v4h4l8 4V6L7 10z"/><path d="M19 9a4 4 0 0 1 0 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4.3-6 8-6s7 2 8 6"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5c.7-3.2 3.2-5 6-5s5.3 1.8 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.3.2 4 1.8 4.5 4.9"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.6 1.6-2.4 3-2.4s2.5.8 3 2.4M14 10h4M14 14h3"/>',
  coffee: '<path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M17 11h1.5a2 2 0 0 1 0 4H17M8 3v3M11 3v3M14 3v3"/>',
  case: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.4-1.2-1.6-2-3-2-1.7 0-3 1-3 2.3 0 3 6 1.6 6 4.6 0 1.3-1.3 2.3-3 2.3-1.5 0-2.7-.8-3.1-2M12 6v1.5M12 16.5V18"/>',
  chart: '<path d="M3 20h18M4 16l5-6 4 4 7-8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><rect x="3.5" y="4.5" width="3" height="3" rx=".5"/><rect x="3.5" y="10.5" width="3" height="3" rx=".5"/><rect x="3.5" y="16.5" width="3" height="3" rx=".5"/>',
  edit: '<path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.8-1.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  face: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="10" r="2.5"/><path d="M8 16.5c1-1.6 2.3-2.4 4-2.4s3 .8 4 2.4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  in: '<path d="M10 4h9v16h-9M3 12h11M10 8l4 4-4 4"/>',
  out: '<path d="M14 4H5v16h9M10 12h11M17 8l4 4-4 4"/>',
  both: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const ic = (n, cls = '') => seguro(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`);

/* ---------- formatos ---------- */
const trunc1 = v => Math.floor(v * 10 + 1e-9) / 10;
const fmt = n => n == null || n === '' ? '' : Number(n).toFixed(1).replace('.', ',');
const dataBR = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const dataHoraBR = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const sortNome = (x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR');
const semParenteses = nome => String(nome || '').replace(/\(.*?\)/g, '').trim();
const iniciais = nome => semParenteses(nome).split(/\s+/).filter(w => /^\p{L}/u.test(w) && (w.length > 2 || /^\p{Lu}/u.test(w))).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const primeiroNome = nome => semParenteses(nome).split(/\s+/)[0] || '';
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- sessão e permissões ---------- */
const SESSAO = { usuario: null, escola: {}, demo: false };
const pode = perm => {
  if (!perm) return true;
  const p = (SESSAO.usuario && SESSAO.usuario.permissoes) || [];
  if (p.includes('*')) return true;
  return (Array.isArray(perm) ? perm : [perm]).some(x => x === 'logado' ? !!SESSAO.usuario : p.includes(x));
};

/* ---------- API ---------- */
async function api(caminho, { metodo = 'GET', corpo } = {}) {
  let r;
  try {
    r = await fetch('/api/' + caminho, {
      method: metodo,
      headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      credentials: 'same-origin'
    });
  } catch (e) { throw new Error('O servidor da escola não respondeu. Confira se o computador do sistema está ligado e com a janela do servidor aberta.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && d.sessao === false) { mostrarLogin('Sua sessão terminou. Entre de novo.'); throw new Error(d.erro); }
  if (!r.ok) throw new Error(d.erro || `Erro ${r.status} no servidor.`);
  return d;
}

/* ---------- avisos, janelas e confirmações ---------- */
const view = $('view'), layer = $('layer');
let tt;
function toast(msg, ms = 3500) {
  clearTimeout(tt);
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  tt = setTimeout(() => el.remove(), ms);
}
const aoFecharLayer = [];
function closeLayer() { aoFecharLayer.splice(0).forEach(f => { try { f(); } catch (e) { /* nada */ } }); layer.innerHTML = ''; }

function modal({ titulo, sub, corpo, rodape, largura = 640, papel = 'dialog' }) {
  layer.innerHTML = html`
    <div class="overlay" data-close>
      <div class="modal" role="${papel}" aria-modal="true" aria-labelledby="mdT" style="width:min(${largura}px,100%)">
        <div class="modal-h"><div><h2 id="mdT">${titulo}</h2>${sub ? html`<p>${sub}</p>` : ''}</div><button type="button" class="x" data-close aria-label="Fechar">${ic('x')}</button></div>
        <div class="modal-b">${corpo}</div>
        ${rodape ? html`<div class="modal-f">${rodape}</div>` : ''}
      </div>
    </div>`;
  return layer.querySelector('.modal');
}

function confirmar(titulo, texto, { botao = 'Confirmar', perigo = false } = {}) {
  return new Promise(ok => {
    const m = modal({
      titulo, sub: texto, papel: 'alertdialog', largura: 460, corpo: '',
      rodape: html`<button type="button" class="btn" data-r="0">Cancelar</button><button type="button" class="btn ${perigo ? 'red' : 'blue'}" data-r="1">${botao}</button>`
    });
    let respondido = false;
    const responder = v => { if (respondido) return; respondido = true; closeLayer(); ok(v); };
    aoFecharLayer.push(() => { if (!respondido) { respondido = true; ok(false); } });
    m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => responder(b.dataset.r === '1'));
    m.querySelector('[data-r="1"]').focus();
  });
}

/* ---------- formulários ----------
   campos: { name, label, type: text|email|tel|date|number|password|select|checks|checkbox|textarea|titulo, required, options:[{v,t}], full, placeholder, hint, max, min, step }
   onSave(dados) pode ser async; se lançar erro, a mensagem aparece no formulário e ele continua aberto. */
function campoHTML(f, valor) {
  const id = 'f_' + f.name, req = f.required ? ' *' : '';
  if (f.type === 'titulo') return html`<div class="form-titulo">${f.label}</div>`;
  if (f.type === 'checks') {
    const marcados = new Set((valor || []).map(String));
    return html`<div class="field full" role="group" aria-labelledby="${id}"><span id="${id}">${f.label}${req}</span>
      <div class="checks">${f.options.map(o => html`<label><input type="checkbox" name="${f.name}" value="${o.v}" ${marcados.has(String(o.v)) ? seguro('checked') : ''}>${o.t}</label>`)}</div>
      <span class="err" data-err="${f.name}" hidden></span></div>`;
  }
  if (f.type === 'checkbox') {
    return html`<label class="field check ${f.full !== false ? 'full' : ''}" for="${id}"><input type="checkbox" id="${id}" name="${f.name}" ${valor ? seguro('checked') : ''}>
      <span>${f.label}${f.hint ? html`<small>${f.hint}</small>` : ''}</span></label>`;
  }
  let ctl;
  const comum = html`id="${id}" name="${f.name}" ${f.required ? seguro('required') : ''} ${f.disabled ? seguro('disabled') : ''}`;
  if (f.type === 'select') {
    ctl = html`<select ${comum}>${f.vazio === false ? '' : html`<option value="">${f.vazio || 'Selecione'}</option>`}${f.options.map(o => html`<option value="${o.v}" ${String(o.v) === String(valor ?? '') ? seguro('selected') : ''}>${o.t}</option>`)}</select>`;
  } else if (f.type === 'textarea') {
    ctl = html`<textarea ${comum} rows="${f.rows || 3}" placeholder="${f.placeholder || ''}" maxlength="${f.maxlength || 2000}">${valor ?? ''}</textarea>`;
  } else {
    ctl = html`<input ${comum} type="${f.type || 'text'}" value="${valor ?? ''}" placeholder="${f.placeholder || ''}" ${f.max != null ? html`max="${f.max}"` : ''} ${f.min != null ? html`min="${f.min}"` : ''} ${f.step ? html`step="${f.step}"` : ''} autocomplete="${f.autocomplete || 'off'}" ${f.inputmode ? html`inputmode="${f.inputmode}"` : ''}>`;
  }
  return html`<label class="field ${f.full ? 'full' : ''}" for="${id}">${f.label}${req}${ctl}${f.hint ? html`<small style="text-transform:none;letter-spacing:0;font-weight:400">${f.hint}</small>` : ''}<span class="err" data-err="${f.name}" hidden></span></label>`;
}

function openForm({ title, sub, fields, values = {}, submit = 'Salvar', note, onSave, extraBotoes, largura = 680 }) {
  layer.innerHTML = html`
    <div class="overlay" data-close>
      <form class="modal" id="cadForm" role="dialog" aria-modal="true" aria-labelledby="fT" novalidate style="width:min(${largura}px,100%)">
        <div class="modal-h"><div><h2 id="fT">${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div><button type="button" class="x" data-close aria-label="Fechar">${ic('x')}</button></div>
        <div class="modal-b"><div class="form-grid">${fields.map(f => campoHTML(f, values[f.name]))}${note ? html`<div class="form-note">${note}</div>` : ''}<div class="form-erro" id="formErro" role="alert"></div></div></div>
        <div class="modal-f">${extraBotoes || ''}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn blue" id="formOk">${submit}</button></div>
      </form>
    </div>`;
  const form = $('cadForm');
  const primeiro = form.querySelector('input:not([type=checkbox]):not([disabled]), select, textarea');
  if (primeiro) primeiro.focus();
  form.onsubmit = async e => {
    e.preventDefault();
    const data = {}; let ok = true;
    fields.forEach(f => {
      if (f.type === 'titulo') return;
      let v, msg = '';
      if (f.type === 'checks') v = [...form.querySelectorAll(`[name="${f.name}"]:checked`)].map(x => x.value);
      else if (f.type === 'checkbox') v = form.elements[f.name].checked;
      else v = form.elements[f.name].value.trim();
      const empty = f.type === 'checkbox' ? false : Array.isArray(v) ? !v.length : !v;
      if (f.required && empty) msg = f.type === 'checks' ? 'Marque ao menos uma opção.' : 'Preencha este campo.';
      else if (!empty && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Digite um e-mail válido, como nome@email.com.';
      else if (!empty && f.type === 'tel' && v.replace(/\D/g, '').length < 10) msg = 'Digite o telefone com DDD, como (21) 99999-0000.';
      else if (!empty && f.type === 'date' && f.max && v > f.max) msg = 'A data não pode ser no futuro.';
      else if (!empty && f.minWords && v.split(/\s+/).length < f.minWords) msg = 'Digite o nome completo.';
      else if (!empty && f.validar) msg = f.validar(v) || '';
      const err = form.querySelector(`[data-err="${f.name}"]`);
      if (err) { err.hidden = !msg; err.textContent = msg; err.parentElement.classList.toggle('invalid', !!msg); }
      if (msg) ok = false;
      data[f.name] = v;
    });
    if (!ok) { const inv = form.querySelector('.invalid input, .invalid select, .invalid textarea, .invalid [type=checkbox]'); if (inv) inv.focus(); return; }
    const btn = $('formOk'), erro = $('formErro');
    btn.disabled = true; erro.innerHTML = '';
    try {
      const fechar = await onSave(data);
      if (fechar !== false) closeLayer();
    } catch (err) {
      erro.innerHTML = html`<p class="res bad">${err.message}</p>`;
      btn.disabled = false;
    }
  };
  return form;
}

/* executa uma ação no servidor, recarrega os dados e redesenha a tela */
async function salvarERecarregar(promessa, msgOk) {
  const r = await promessa;
  await carregarDados();
  route();
  if (msgOk) toast(typeof msgOk === 'function' ? msgOk(r) : msgOk);
  if (r && r.aviso) setTimeout(() => toast(r.aviso, 8000), 3600);
  return r;
}

/* ---------- menu e rotas ---------- */
const TELAS = {};   // id -> { perm, fn }
function tela(id, perm, fn) { TELAS[id] = { perm, fn }; }

const MENU = [
  { id: 'principal', label: 'Principal', icon: 'home', familia: true },
  { id: 'familia-boletim', label: 'Boletim', icon: 'cap', perm: 'familia', soFamilia: true },
  { id: 'familia-entradas', label: 'Entradas e saídas', icon: 'face', perm: 'familia', soFamilia: true },
  { id: 'familia-financeiro', label: 'Mensalidades', icon: 'dollar', perm: 'familia', soFamilia: true },
  { id: 'comunicados', label: 'Página de comunicados', icon: 'megaphone', familia: true },
  { label: 'Central de ajuda', icon: 'info', children: [{ id: 'tutoriais', label: 'Tutoriais' }, { id: 'suporte', label: 'Falar com o suporte' }] },
  { label: 'Mensagem', icon: 'mail', perm: 'mensagens', familia: true, children: [{ id: 'caixa', label: 'Caixa de entrada', familia: true }, { id: 'nova-msg', label: 'Nova mensagem', familia: true }] },
  { label: 'Ambiente do aluno', icon: 'user', perm: 'escola.ver', children: [{ id: 'portal-aluno', label: 'Portal do aluno', perm: 'cadastros' }, { id: 'app-familia', label: 'Aplicativo da família' }] },
  { label: 'Secretaria', icon: 'users', perm: 'escola.ver', children: [
    { label: 'Cadastro', icon: 'user', children: [{ id: 'alunos', label: 'Alunos' }, { id: 'responsaveis', label: 'Responsáveis' }, { id: 'professores', label: 'Professores' }, { id: 'importar', label: 'Importar planilha', perm: 'cadastros' }] },
    { label: 'Turmas', icon: 'pencil', children: [
      { id: 'turmas', label: 'Lista de turmas' }, { id: 'disciplinas', label: 'Disciplinas' }, { id: 'habilidades', label: 'Habilidades por turmas' },
      { id: 'diarios', label: 'Diários' }, { id: 'notas', label: 'Alteração de notas e faltas', perm: 'notas' }, { id: 'boletim', label: 'Boletins', perm: ['notas', 'relatorios'] },
      { id: 'simulados', label: 'Simulados' }, { id: 'historico', label: 'Histórico escolar', perm: ['notas', 'relatorios'] }, { id: 'horarios', label: 'Horários' }] },
    { label: 'Matrículas', icon: 'idcard', perm: 'matriculas', children: [{ id: 'matriculas', label: 'Matrículas' }, { id: 'rematriculas', label: 'Rematrículas' }, { id: 'pre-matricula', label: 'Pré-matrícula' }] }
  ] },
  { label: 'Controle de acesso', icon: 'face', perm: ['catraca', 'catraca.acessos', 'catraca.config'], children: [
    { id: 'catraca-cadastro', label: 'Cadastro facial', perm: 'catraca' }, { id: 'catraca-acessos', label: 'Liberação e acessos', perm: 'catraca.acessos' }, { id: 'catraca-presenca', label: 'Presença por turma', perm: 'catraca.acessos' },
    { id: 'catraca-config', label: 'Conexão com a catraca', perm: 'catraca.config' }] },
  { label: 'Pedagógico', icon: 'cap', perm: ['pedagogico', 'pedagogico.ver', 'pedagogico.proprio', 'notas.proprias'], children: [
    { label: 'Professor', icon: 'coffee', perm: ['notas.proprias', 'pedagogico.proprio'], children: [{ id: 'meus-diarios', label: 'Meus diários', perm: 'notas.proprias' }, { id: 'planejamento', label: 'Planejamento de aulas', perm: 'pedagogico.proprio' },
      { id: 'horarios', label: 'Meu horário', perm: 'notas.proprias' }, { id: 'habilidades', label: 'Habilidades (BNCC)', perm: 'notas.proprias' }, { id: 'ocorrencias', label: 'Ocorrências', perm: 'pedagogico.proprio' }] },
    { label: 'Coordenação', icon: 'case', perm: ['pedagogico', 'pedagogico.ver'], children: [{ id: 'acompanhamento', label: 'Acompanhamento pedagógico' }, { id: 'ocorrencias', label: 'Ocorrências' }, { id: 'planejamento', label: 'Planejamentos dos professores' }] }
  ] },
  { label: 'Financeiro', icon: 'dollar', perm: 'financeiro.ver', children: [{ id: 'mensalidades', label: 'Mensalidades' }, { id: 'inadimplencia', label: 'Inadimplência' }] },
  { id: 'relatorios', label: 'Central de relatórios', icon: 'chart', perm: 'relatorios' },
  { id: 'config', label: 'Configurações', icon: 'settings', perm: 'config' },
  { id: 'minha-conta', label: 'Minha conta', icon: 'key', familia: true },
  { id: 'sair', label: 'Sair', icon: 'logout', familia: true }
];
const abertos = new Set();
const keyOf = p => p.join('>');
// a família vê só os itens marcados para ela; a equipe não vê os itens só da família
const ehFamilia = () => !!SESSAO.usuario && SESSAO.usuario.papel === 'familia';
const visiveis = items => items.filter(it => pode(it.perm) && (ehFamilia() ? it.familia || it.soFamilia : !it.soFamilia)).map(it => it.children ? { ...it, children: visiveis(it.children) } : it).filter(it => !it.children || it.children.length);
function findPath(items, id, path = []) {
  for (const it of items) {
    const p = [...path, it.label];
    if (it.id === id) return p;
    if (it.children) { const r = findPath(it.children, id, p); if (r) return r; }
  }
  return null;
}
function itemDe(items, id) {
  for (const it of items) { if (it.id === id) return it; if (it.children) { const r = itemDe(it.children, id); if (r) return r; } }
  return null;
}
function menuHTML(items, depth, active, path = []) {
  return items.map(it => {
    const p = [...path, it.label], k = keyOf(p), lv = `lv${depth}`;
    if (it.children) {
      const isOpen = abertos.has(k);
      return html`<li class="mi ${lv} ${isOpen ? 'open' : ''}">
        <button data-group="${k}" aria-expanded="${isOpen}">${it.icon ? ic(it.icon, 'i') : ''}<span>${it.label}</span>${it.count ? html`<span class="cnt">${it.count}</span>` : ''}${ic('chev', 'chev')}</button>
        ${isOpen ? html`<ul class="sub">${menuHTML(it.children, depth + 1, active, p)}</ul>` : ''}
      </li>`;
    }
    return html`<li class="mi ${lv}"><a href="#${it.id}" class="${it.id === active ? 'active' : ''}">${it.icon ? ic(it.icon, 'i') : ''}<span>${it.label}</span></a></li>`;
  });
}
let currentActive = 'principal';
const ROTA_EXTRA = [];   // [{ prefixo, ativo, fn }] para rotas com parâmetro, ex.: #turma-12
function rotaComParametro(prefixo, ativo, perm, fn) { ROTA_EXTRA.push({ prefixo, ativo, perm, fn }); }
const aoSairDaTela = [];
function renderMenu() { $('menu').innerHTML = html`${menuHTML(visiveis(MENU), 0, currentActive)}`; }
function openPathTo(id) { const p = findPath(visiveis(MENU), id); if (p) for (let i = 1; i < p.length; i++) abertos.add(keyOf(p.slice(0, i))); }

function semAcesso() {
  view.innerHTML = html`<div class="page-title"><div><h1>Sem acesso</h1></div></div>
    <section class="panel soon"><h2>Você não tem permissão para esta tela</h2><p>Se precisar dela, peça ao administrador do sistema para ajustar o seu tipo de acesso.</p></section>`;
}
function route() {
  if (!SESSAO.usuario) return;
  const h = decodeURIComponent(location.hash.slice(1)) || 'principal';
  document.body.classList.remove('nav-open');
  closeLayer();
  aoSairDaTela.splice(0).forEach(f => { try { f(); } catch (e) { /* nada */ } });
  let active = h;
  const extra = ROTA_EXTRA.find(r => h.startsWith(r.prefixo));
  if (extra) { active = extra.ativo; pode(extra.perm) ? extra.fn(h.slice(extra.prefixo.length)) : semAcesso(); }
  else if (TELAS[h]) { pode(TELAS[h].perm) ? TELAS[h].fn() : semAcesso(); }
  else if (itemDe(MENU, h)) { const it = itemDe(MENU, h); pode(it.perm) ? soon(it.label) : semAcesso(); }
  else { active = 'principal'; TELAS.principal.fn(); }
  currentActive = active;
  openPathTo(active);
  renderMenu();
  window.scrollTo(0, 0);
}
function soon(titulo, texto) {
  view.innerHTML = html`
    <div class="page-title"><div><h1>${titulo}</h1></div></div>
    <section class="panel soon">
      <span class="pill todo">Em construção</span>
      <h2 style="margin-top:12px">${titulo}</h2>
      <p>${texto || 'Esta tela está sendo desenvolvida e entra numa próxima atualização do sistema.'}</p>
    </section>`;
}

/* ---------- ações por clique: data-act="nome" ---------- */
const ACOES = {};
function acao(nome, fn) { ACOES[nome] = fn; }
document.addEventListener('click', e => {
  const g = e.target.closest('[data-group]');
  if (g) { const k = g.dataset.group; abertos.has(k) ? abertos.delete(k) : abertos.add(k); renderMenu(); return; }
  const close = e.target.closest('[data-close]');
  if (close && (close === e.target || close.tagName === 'BUTTON')) { closeLayer(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || !ACOES[el.dataset.act]) return;
  e.preventDefault();
  Promise.resolve(ACOES[el.dataset.act](el, e)).catch(err => toast(err.message, 6000));
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeLayer(); document.body.classList.remove('nav-open'); } });

/* ---------- login ---------- */
const logoSvg = seguro('<svg viewBox="0 0 42 42" aria-hidden="true" style="width:42px;height:42px"><circle cx="21" cy="21" r="20" fill="#e7f1fd"/><circle cx="21" cy="21" r="13" fill="none" stroke="#2f74e0" stroke-width="2"/><path d="M8 21h26M21 8c-5 4-5 22 0 26M21 8c5 4 5 22 0 26" fill="none" stroke="#2f74e0" stroke-width="1.6"/></svg>');

function mostrarLogin(aviso) {
  SESSAO.usuario = null;
  closeLayer();
  $('app').hidden = true; $('carregando').hidden = true;
  const box = $('entrar'); box.hidden = false;
  const nomeEscola = SESSAO.escola.nome || 'Portal escolar';
  box.innerHTML = html`<div class="entrar-wrap">
    <aside class="entrar-arte" aria-hidden="true">
      <div class="logo">${logoSvg}<div><b>${nomeEscola}</b><small>Sistema de gestão escolar</small></div></div>
      <h2>Tudo da escola em um só lugar</h2>
      <p>Secretaria, professores, portaria, financeiro e famílias usando o mesmo sistema.</p>
      <ul>
        <li>${ic('cap')} Notas, diários e boletins</li>
        <li>${ic('unlock')} Entrada e saída pela catraca</li>
        <li>${ic('dollar')} Mensalidades e recibos</li>
        <li>${ic('users')} Portal para as famílias</li>
      </ul>
    </aside>
    <form class="entrar-box" id="loginForm" novalidate>
      <div class="logo">${logoSvg}<div><b>${nomeEscola}</b><small>Sistema de gestão escolar</small></div></div>
      <h1>Entrar no sistema</h1>
      <p class="sub-login">Use o usuário e a senha que a escola forneceu.</p>
      ${aviso ? html`<p class="res info">${aviso}</p>` : ''}
      <label class="field" for="lLogin">Usuário<input id="lLogin" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="field" for="lSenha">Senha<input id="lSenha" type="password" autocomplete="current-password" required></label>
      <div id="lErro" role="alert"></div>
      <button class="btn blue" type="submit">Entrar</button>
      ${SESSAO.demo ? html`<div class="demo-users"><b>Demonstração.</b> Entre com um dos usuários de teste (senha <b>demo1234</b>):<br>
        ${['admin', 'secretaria', 'coordenacao', 'professor', 'portaria', 'financeiro', 'familia'].map((u, i) => html`${i ? ' · ' : ''}<button type="button" data-demo="${u}.demo">${u}.demo</button>`)}</div>` : html`<p>Esqueceu a senha? Peça ao administrador do sistema para criar uma nova.</p>`}
    </form></div>`;
  box.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { $('lLogin').value = b.dataset.demo; $('lSenha').value = 'demo1234'; $('loginForm').requestSubmit(); });
  $('lLogin').focus();
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; $('lErro').innerHTML = '';
    try {
      const r = await api('login', { metodo: 'POST', corpo: { login: $('lLogin').value, senha: $('lSenha').value } });
      await entrou(r.usuario);
    } catch (err) { $('lErro').innerHTML = html`<p class="res bad">${err.message}</p>`; btn.disabled = false; $('lSenha').select(); }
  };
}

function mostrarPrimeiroAcesso() {
  $('app').hidden = true; $('carregando').hidden = true;
  const box = $('entrar'); box.hidden = false;
  box.innerHTML = html`
    <form class="entrar-box" id="paForm" novalidate>
      <div class="logo">${logoSvg}<div><b>Portal escolar</b><small>Primeiro acesso</small></div></div>
      <h1>Bem-vindo! Crie o administrador</h1>
      <p>Este é o primeiro acesso ao sistema. Crie o usuário administrador: ele cadastra os outros usuários e configura a escola e a catraca.</p>
      ${SESSAO.pedeCodigo ? html`<label class="field" for="paCodigo">Código de instalação *<input id="paCodigo" autocapitalize="none" spellcheck="false" autocomplete="off"><small style="text-transform:none;letter-spacing:0;font-weight:400">Fica no painel do Render, em Environment (CODIGO_PRIMEIRO_ACESSO).</small></label>` : ''}
      <label class="field" for="paEscola">Nome da escola<input id="paEscola" value="${SESSAO.escola.nome || ''}"></label>
      <label class="field" for="paNome">Seu nome *<input id="paNome" autocomplete="name"></label>
      <label class="field" for="paLogin">Usuário para entrar *<input id="paLogin" placeholder="Ex.: maria.souza" autocapitalize="none" spellcheck="false" autocomplete="username"></label>
      <label class="field" for="paSenha">Senha * <input id="paSenha" type="password" autocomplete="new-password"><small style="text-transform:none;letter-spacing:0;font-weight:400">No mínimo 8 caracteres, com letras e números.</small></label>
      <label class="field" for="paSenha2">Repita a senha *<input id="paSenha2" type="password" autocomplete="new-password"></label>
      <div id="paErro" role="alert"></div>
      <button class="btn blue" type="submit">Criar administrador e entrar</button>
    </form>`;
  ($('paCodigo') || $('paNome')).focus();
  $('paForm').onsubmit = async e => {
    e.preventDefault();
    const erro = m => { $('paErro').innerHTML = html`<p class="res bad">${m}</p>`; };
    if ($('paSenha').value !== $('paSenha2').value) return erro('As duas senhas não são iguais.');
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api('primeiro-acesso', { metodo: 'POST', corpo: { codigo: $('paCodigo') ? $('paCodigo').value : '', escola: $('paEscola').value, nome: $('paNome').value, login: $('paLogin').value, senha: $('paSenha').value } });
      const s = await api('sessao'); SESSAO.escola = s.escola;
      await entrou(r.usuario);
    } catch (err) { erro(err.message); btn.disabled = false; }
  };
}

async function entrou(usuario) {
  SESSAO.usuario = usuario;
  $('carregando').hidden = false; $('entrar').hidden = true;
  try { await carregarDados(); }
  catch (e) { $('carregando').innerHTML = html`<div class="entrar-box"><p class="res bad">${e.message}</p><a class="btn blue" href="/">Tentar de novo</a></div>`; return; }
  montarShell();
  $('carregando').hidden = true; $('app').hidden = false;
  route();
}

function montarShell() {
  const u = SESSAO.usuario;
  $('escolaNome').textContent = SESSAO.escola.nome || 'Portal escolar';
  document.title = SESSAO.escola.nome ? `${SESSAO.escola.nome} · Portal escolar` : 'Portal escolar';
  $('userAv').textContent = iniciais(u.nome);
  $('userNome').textContent = u.nome;
  $('userPapel').textContent = `${u.papelNome} · Ano letivo ${SESSAO.escola.anoLetivo || ''}`;
  $('menuBtn').innerHTML = html`${ic('menu')}<span class="lbl-sm">Menu</span>`;
  $('helpBtn').innerHTML = ic('chat');
  $('topActions').innerHTML = html`<button class="top-btn" data-act="sair" title="Sair">${ic('logout')}<span class="lbl-sm">Sair</span></button>`;
}

acao('sair', async () => {
  try { await api('logout', { metodo: 'POST', corpo: {} }); } catch (e) { /* já saiu */ }
  location.hash = '';
  mostrarLogin('Você saiu do sistema.');
});
tela('sair', null, () => ACOES.sair());

$('menuBtn').onclick = () => document.body.classList.toggle('nav-open');
$('scrim').onclick = () => document.body.classList.remove('nav-open');
window.addEventListener('hashchange', route);
