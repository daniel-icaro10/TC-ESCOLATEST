'use strict';
/* =====================================================================
   Portal da família (o responsável vê só os próprios filhos)
   e as telas da escola que gerenciam esse acesso.
   ===================================================================== */
let FAMILIA_CFG = { mostrarNotas: true, mostrarCatraca: true, mostrarFinanceiro: true };
const meusFilhos = () => [...ALUNOS].sort(sortNome);
let filhoAtual = null;
const escolherFilho = () => {
  const f = meusFilhos();
  if (f.length < 2) return '';
  return html`<section class="panel no-print"><nav class="tabs">${f.map(a => html`<a href="${location.hash || '#principal'}" data-filho="${a.id}" class="${a.id === filhoAtual ? 'on' : ''}">${primeiroNome(a.nome)}</a>`)}</nav></section>`;
};
const ligarFilhos = () => view.querySelectorAll('[data-filho]').forEach(a => a.onclick = e => { e.preventDefault(); filhoAtual = Number(a.dataset.filho); route(); });
const filho = () => { const f = meusFilhos(); if (!f.find(a => a.id === filhoAtual)) filhoAtual = f[0] ? f[0].id : null; return alunoDe(filhoAtual); };

/* o botão flutuante de suporte é da equipe; a família fala com a escola pelas mensagens */
const montarShellFamilia = montarShell;
montarShell = function () {
  montarShellFamilia();
  $('helpBtn').hidden = ehFamilia();
  if (ehFamilia()) api('familia/config').then(c => { FAMILIA_CFG = c; }).catch(() => {});
};

/* ---------- início da família ---------- */
async function principalFamilia() {
  const filhos = meusFilhos();
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">${SESSAO.escola.nome}</div><h1>Olá, ${primeiroNome(SESSAO.usuario.nome)}</h1></div></div>
    ${filhos.length ? html`<div class="home" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${filhos.map(a => {
      const t = turmaDe(a.turma);
      const baixas = t ? t.disciplinas.map(d => mediaAnual(a, d.id)).filter(m => m != null && m < 6).length : 0;
      return html`<section class="panel">
        <div class="panel-h"><div class="av" style="width:38px;height:38px;border-radius:50%;background:var(--teal);color:#fff;display:grid;place-items:center;font-weight:800">${iniciais(a.nome)}</div><div><h2>${a.nome}</h2><div class="muted" style="font-size:.84rem">${t ? `${t.nome} · ${t.turno}` : ''} · Matrícula ${a.mat}</div></div></div>
        <ul class="steps">
          ${FAMILIA_CFG.mostrarCatraca ? html`<li><span class="st">${ic('face')}</span><p><b>Hoje:</b> <span id="ent-${a.id}">consultando a catraca…</span></p><a class="btn sm" href="#familia-entradas" data-filho-link="${a.id}">Ver</a></li>` : ''}
          ${FAMILIA_CFG.mostrarNotas ? html`<li><span class="st">${ic('cap')}</span><p><b>Boletim:</b> ${baixas ? html`<span style="color:var(--red)">${plural(baixas, 'disciplina', 'disciplinas')} abaixo da média</span>` : 'nenhuma disciplina abaixo da média'} · ${faltasAluno(a)} falta(s)</p><a class="btn sm" href="#familia-boletim" data-filho-link="${a.id}">Ver</a></li>` : ''}
          ${FAMILIA_CFG.mostrarFinanceiro ? html`<li><span class="st">${ic('dollar')}</span><p><b>Mensalidades:</b> <span id="fin-${a.id}">…</span></p><a class="btn sm" href="#familia-financeiro">Ver</a></li>` : ''}
        </ul></section>`;
    })}</div>` : html`<section class="panel vazio">Nenhum aluno ligado ao seu acesso. Fale com a secretaria da escola.</section>`}`;
  view.querySelectorAll('[data-filho-link]').forEach(l => l.addEventListener('click', () => { filhoAtual = Number(l.dataset.filhoLink); }));
  const cfg = await api('familia/config').catch(() => FAMILIA_CFG);
  FAMILIA_CFG = cfg;
  if (cfg.mostrarCatraca) filhos.forEach(a => api(`familia/acessos?aluno=${a.id}&dias=1`).then(l => {
    const el = $(`ent-${a.id}`); if (!el) return;
    const ord = [...l].sort((x, y) => x.hora - y.hora);
    el.textContent = ord.length ? `entrou às ${hora(ord[0].hora).slice(0, 5)}${ord.length > 1 ? `, última passagem às ${hora(ord[ord.length - 1].hora).slice(0, 5)}` : ''}` : 'ainda não passou pela catraca';
  }).catch(() => { const el = $(`ent-${a.id}`); if (el) el.textContent = 'catraca indisponível no momento'; }));
  if (cfg.mostrarFinanceiro) api('familia/cobrancas').then(l => filhos.forEach(a => {
    const el = $(`fin-${a.id}`); if (!el) return;
    const venc = l.filter(c => c.alunoId === a.id && c.situacao === 'vencida'), prox = l.filter(c => c.alunoId === a.id && c.situacao === 'aberta').sort((x, y) => x.vencimento.localeCompare(y.vencimento))[0];
    el.innerHTML = html`${venc.length ? html`<span style="color:var(--red)">${plural(venc.length, 'parcela vencida', 'parcelas vencidas')}</span>` : 'em dia'}${prox ? ` · próxima ${dataBR(prox.vencimento)} (${reais(prox.liquido)})` : ''}`;
  })).catch(() => {});
}

tela('familia-boletim', 'familia', () => {
  const a = filho();
  if (!a) { view.innerHTML = html`<section class="panel vazio">Nenhum aluno ligado ao seu acesso.</section>`; return; }
  view.innerHTML = html`<div class="page-title"><div><h1>Boletim</h1></div><button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div>${escolherFilho()}
    ${FAMILIA_CFG.mostrarNotas && turmaDe(a.turma) ? boletimHTML(a, turmaDe(a.turma)) : html`<section class="panel vazio">O boletim não está disponível pelo portal. Fale com a secretaria.</section>`}`;
  ligarFilhos();
});

tela('familia-entradas', 'familia', async () => {
  const a = filho();
  if (!a) { view.innerHTML = html`<section class="panel vazio">Nenhum aluno ligado ao seu acesso.</section>`; return; }
  view.innerHTML = html`<div class="page-title"><div><h1>Entradas e saídas</h1><div class="muted">${a.nome} · últimos 7 dias</div></div></div>${escolherFilho()}
    <section class="panel"><div class="table-wrap"><table class="t"><thead><tr><th>Dia</th><th>Hora</th><th>Como passou</th></tr></thead><tbody id="rows">${linhaVazia(3, 'Consultando a catraca…')}</tbody></table></div></section>`;
  ligarFilhos();
  try {
    const l = await api(`familia/acessos?aluno=${a.id}&dias=7`);
    if (!$('rows')) return;
    $('rows').innerHTML = html`${!FAMILIA_CFG.mostrarCatraca ? linhaVazia(3, 'As entradas e saídas não estão disponíveis pelo portal.') : l.length ? l.map(x => html`<tr>
      <td>${new Date(x.hora * 1000).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</td><td class="num" style="font-weight:700">${hora(x.hora).slice(0, 5)}</td><td>${x.meio || (x.evento === 7 ? 'Catraca' : 'Liberado pela escola')}</td></tr>`)
      : linhaVazia(3, 'Nenhuma passagem pela catraca nos últimos 7 dias.')}`;
  } catch (e) { $('rows').innerHTML = html`<tr><td colspan="3"><p class="res bad">${e.message}</p></td></tr>`; }
});

tela('familia-financeiro', 'familia', async () => {
  view.innerHTML = html`<div class="page-title"><div><h1>Mensalidades</h1></div></div>
    <section class="panel"><div class="table-wrap"><table class="t"><thead><tr><th>Aluno</th><th>Cobrança</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead><tbody id="rows">${linhaVazia(6, 'Carregando…')}</tbody></table></div></section>
    <p class="muted" style="font-size:.84rem">Para pagar ou tirar dúvidas, fale com a secretaria pela Caixa de mensagens.</p>`;
  try {
    const l = await api('familia/cobrancas');
    if (!$('rows')) return;
    FAMILIA_COBS = l;
    $('rows').innerHTML = html`${!FAMILIA_CFG.mostrarFinanceiro ? linhaVazia(6, 'As mensalidades não estão disponíveis pelo portal.') : l.length ? l.map(c => html`<tr><td>${primeiroNome(alunoDe(c.alunoId)?.nome)}</td>
      <td>${c.descricao}<div class="muted" style="font-size:.8rem">${compBR(c.competencia)}</div></td><td class="num">${dataBR(c.vencimento)}</td>
      <td class="r num">${reais(c.situacao === 'vencida' ? c.total : c.pagoEm ? c.valorPago : c.liquido)}</td><td><span class="pill ${SIT_COB[c.situacao][1]}">${SIT_COB[c.situacao][0]}</span></td>
      <td class="r">${c.pagoEm ? html`<button class="btn sm" data-act="familia-recibo" data-id="${c.id}">Recibo</button>` : ''}</td></tr>`) : linhaVazia(6, 'Nenhuma cobrança.')}`;
  } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; }
});
let FAMILIA_COBS = [];
acao('familia-recibo', el => {
  const c = FAMILIA_COBS.find(x => x.id === Number(el.dataset.id)), a = alunoDe(c.alunoId), e = SESSAO.escola;
  modal({ titulo: `Recibo nº ${String(c.id).padStart(6, '0')}`, sub: e.nome, largura: 620,
    corpo: html`<p style="line-height:1.7">Recebemos a importância de <b>${reais(c.valorPago)}</b> (${valorPorExtenso(c.valorPago)}), referente a <b>${c.descricao} de ${compBR(c.competencia)}</b> do(a) aluno(a) <b>${a.nome}</b>, matrícula ${a.mat}.</p>
      <p class="muted">Pago em ${dataBR(c.pagoEm)} · ${c.forma}</p>`,
    rodape: html`<button class="btn" data-act="imprimir">${ic('print')} Imprimir</button><button class="btn blue" data-close>Fechar</button>` });
});

/* ================= Escola: acessos das famílias ================= */
let ACESSOS_FAMILIA = [];
const senhaAleatoria = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; const r = crypto.getRandomValues(new Uint32Array(8)); let s = [...r].map(n => c[n % c.length]).join(''); return /\d/.test(s) ? s : s.slice(0, 7) + '7'; };
const loginSugerido = nome => { const p = semAcento(nome).split(' ').filter(Boolean); return p.length > 1 ? `${p[0]}.${p[p.length - 1]}` : p[0] || ''; };

tela('portal-aluno', 'cadastros', async () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Ambiente do aluno</div><h1>Portal do aluno e da família</h1></div><button class="btn blue" data-act="familia-novo">+ Criar acesso para família</button></div>
    <div class="aviso">${ic('info')}<div><b>Como funciona</b><span>Cada responsável recebe um usuário e uma senha e vê só os próprios filhos: boletim, entradas e saídas pela catraca, mensalidades e comunicados para as famílias. Veja o que fica visível em <a href="#app-familia">Aplicativo da família</a>.</span></div></div>
    <section class="panel">
      <div class="filters"><label class="field" for="faBusca" style="flex:1;max-width:340px">Responsável ou aluno<input id="faBusca" type="search"></label>
        <span class="muted" id="faResumo" style="font-size:.86rem;padding-bottom:9px"></span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Responsável</th><th>Usuário</th><th>Alunos</th><th>Último acesso</th><th></th></tr></thead><tbody id="rows">${linhaVazia(5, 'Carregando…')}</tbody></table></div>
    </section>`;
  const draw = () => {
    const q = $('faBusca').value.trim().toLowerCase();
    const l = ACESSOS_FAMILIA.filter(u => !q || u.nome.toLowerCase().includes(q) || u.alunos.some(id => (alunoDe(id)?.nome || '').toLowerCase().includes(q)));
    $('rows').innerHTML = html`${l.length ? l.map(u => html`<tr><td style="font-weight:700">${u.nome}${!u.ativo ? html` <span class="pill todo">Desativado</span>` : ''}</td><td><code class="k">${u.login}</code></td>
      <td>${u.alunos.map((id, i) => html`${i ? ', ' : ''}${alunoDe(id)?.nome || '?'}`)}</td><td class="muted">${u.ultimoAcesso ? dataHoraBR(u.ultimoAcesso) : 'Nunca entrou'}</td>
      <td class="r"><button class="btn sm" data-act="familia-editar" data-id="${u.id}">Editar</button></td></tr>`) : linhaVazia(5, 'Nenhum acesso de família criado ainda.')}`;
    const comAcesso = new Set(ACESSOS_FAMILIA.filter(u => u.ativo).flatMap(u => u.alunos));
    $('faResumo').textContent = `${comAcesso.size} de ${ALUNOS.filter(ATIVO).length} alunos ativos com família no portal`;
  };
  $('faBusca').oninput = draw;
  try { ACESSOS_FAMILIA = await api('familia/usuarios'); if ($('rows')) draw(); } catch (e) { $('rows').innerHTML = html`<tr><td colspan="5"><p class="res bad">${e.message}</p></td></tr>`; }
});
function formAcessoFamilia(u) {
  const alunos = ALUNOS.filter(a => ATIVO(a) || (u && u.alunos.includes(a.id))).sort(sortNome);
  const marcados = new Set(u ? u.alunos : []);
  const form = openForm({
    title: u ? 'Acesso da família' : 'Criar acesso para família', sub: u ? u.login : 'Escolha o responsável cadastrado ou digite o nome', submit: 'Salvar', largura: 720,
    values: u ? { nome: u.nome, login: u.login, ativo: u.ativo } : { senha: senhaAleatoria() },
    fields: [
      ...(u ? [] : [{ name: 'resp', label: 'Responsável cadastrado', type: 'select', full: true, vazio: 'Digitar à mão', options: [...RESP].sort(sortNome).map(r => ({ v: r.id, t: `${r.nome} · ${r.parentesco} de ${alunoDe(r.alunoId)?.nome || '?'}` })) }]),
      { name: 'nome', label: 'Nome do responsável', required: true, full: true },
      { name: 'login', label: 'Usuário para entrar', required: true, validar: v => /^[a-z0-9._-]{3,40}$/i.test(v) ? '' : 'Use de 3 a 40 letras sem acento, números, ponto ou traço.' },
      { name: 'senha', label: u ? 'Nova senha (em branco mantém)' : 'Senha inicial', required: !u, hint: 'Entregue ao responsável e peça para trocar em Minha conta.' },
      ...(u ? [{ name: 'ativo', label: 'Acesso ativo', type: 'checkbox' }] : [])
    ],
    note: html`<div class="field full"><span style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Alunos que esta pessoa vai ver</span>
      <input id="faFiltro" type="search" placeholder="Buscar aluno" style="margin:6px 0;border:1px solid var(--line);border-radius:9px;padding:8px 12px;width:100%">
      <div class="checks" id="faAlunos" style="max-height:200px;overflow:auto">${alunos.map(a => html`<label data-nome="${a.nome.toLowerCase()}" ${marcados.has(a.id) ? '' : seguro('hidden')}><input type="checkbox" value="${a.id}" ${marcados.has(a.id) ? seguro('checked') : ''}>${a.nome} <span class="muted">· ${turmaDe(a.turma)?.nome || ''}</span></label>`)}</div>
      <span class="muted" style="font-size:.8rem;text-transform:none;letter-spacing:0;font-weight:400">Digite para encontrar e marcar irmãos.</span></div>`,
    onSave: async d => {
      const ids = [...form.querySelectorAll('#faAlunos input:checked')].map(i => Number(i.value));
      if (!ids.length) throw new Error('Marque ao menos um aluno.');
      await api(u ? `familia/usuarios/${u.id}` : 'familia/usuarios', { metodo: u ? 'PUT' : 'POST', corpo: { nome: d.nome, login: d.login, senha: d.senha, ativo: d.ativo, alunos: ids } });
      route();
      if (!u || d.senha) setTimeout(() => modal({ titulo: 'Dados para entregar ao responsável', sub: d.nome, largura: 520,
        corpo: html`<div style="line-height:2;font-size:1.05rem">Endereço: <b>${location.origin}</b><br>Usuário: <b>${d.login}</b><br>Senha: <b>${d.senha}</b></div><p class="muted">No primeiro acesso, troque a senha em Minha conta.</p>`,
        rodape: html`<button class="btn" data-act="imprimir">${ic('print')} Imprimir</button><button class="btn blue" data-close>Pronto</button>` }), 100);
      else toast('Acesso salvo.');
      return false;
    }
  });
  const filtro = $('faFiltro');
  filtro.oninput = () => { const q = filtro.value.trim().toLowerCase(); form.querySelectorAll('#faAlunos label').forEach(l => { l.hidden = !l.querySelector('input').checked && (q.length < 2 || !l.dataset.nome.includes(q)); }); };
  if (!u) form.elements.resp.onchange = e => {
    const r = RESP.find(x => x.id === Number(e.target.value)); if (!r) return;
    form.elements.nome.value = r.nome; form.elements.login.value = (r.email && r.email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase()) || loginSugerido(r.nome);
    // marca todos os alunos com o mesmo responsável (irmãos)
    RESP.filter(x => x.nome.toLowerCase() === r.nome.toLowerCase() || (r.cpf && x.cpf === r.cpf)).forEach(x => { const c = form.querySelector(`#faAlunos input[value="${x.alunoId}"]`); if (c) { c.checked = true; c.closest('label').hidden = false; } });
  };
}
acao('familia-novo', () => formAcessoFamilia());
acao('familia-editar', el => formAcessoFamilia(ACESSOS_FAMILIA.find(u => u.id === Number(el.dataset.id))));

tela('app-familia', 'escola.ver', async () => {
  const c = await api('familia/config').catch(() => FAMILIA_CFG), edita = pode('config');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Ambiente do aluno</div><h1>Aplicativo da família</h1></div></div>
    <div class="home">
      <section class="panel"><div class="panel-h">${ic('user')}<h2>Como a família entra</h2></div>
        <ol class="passos">
          <li>A secretaria cria o acesso em <a href="#portal-aluno">Portal do aluno</a> e entrega usuário e senha ao responsável.</li>
          <li>O responsável abre <b>${location.origin}</b> no celular ou computador e entra.</li>
          <li>No celular, use "Adicionar à tela inicial" no menu do navegador: o portal fica como um aplicativo.</li>
          <li>Comunicados com público <b>Famílias</b> ou <b>Equipe e famílias</b> aparecem para os responsáveis. Para avisar todas as famílias de uma vez, use Mensagem &gt; Nova mensagem &gt; "Enviar para todos os: Família".</li>
        </ol>
        <p class="aviso" style="margin:0 22px 20px"><span><b>Fora da escola:</b> o endereço só abre de casa se o servidor estiver publicado na internet (por exemplo, com um túnel seguro como o Cloudflare Tunnel e um endereço https). Dentro da rede da escola funciona direto. Veja o README.</span></p>
      </section>
      <section class="panel"><div class="panel-h">${ic('shield')}<h2>O que as famílias veem</h2></div>
        <form id="faCfg" style="padding:16px 22px 20px;display:flex;flex-direction:column;gap:12px">
          <label class="field check" for="cN"><input type="checkbox" id="cN" ${c.mostrarNotas ? seguro('checked') : ''} ${edita ? '' : seguro('disabled')}><span>Boletim (notas e faltas)</span></label>
          <label class="field check" for="cC"><input type="checkbox" id="cC" ${c.mostrarCatraca ? seguro('checked') : ''} ${edita ? '' : seguro('disabled')}><span>Entradas e saídas pela catraca</span></label>
          <label class="field check" for="cF"><input type="checkbox" id="cF" ${c.mostrarFinanceiro ? seguro('checked') : ''} ${edita ? '' : seguro('disabled')}><span>Mensalidades e recibos</span></label>
          ${edita ? html`<div style="display:flex;justify-content:flex-end"><button class="btn blue" type="submit">Salvar</button></div>` : html`<p class="muted" style="margin:0">Só o administrador altera.</p>`}
        </form></section>
    </div>`;
  if (edita) $('faCfg').onsubmit = async e => {
    e.preventDefault();
    try { FAMILIA_CFG = await api('familia/config', { metodo: 'PUT', corpo: { mostrarNotas: $('cN').checked, mostrarCatraca: $('cC').checked, mostrarFinanceiro: $('cF').checked } }); toast('Salvo.'); }
    catch (err) { toast(err.message, 6000); }
  };
});
