'use strict';
/* =====================================================================
   Comunicados, mensagens, tutoriais e suporte.
   ===================================================================== */
const PUBLICOS = { todos: 'Todos', professores: 'Professores', secretaria: 'Secretaria e coordenação', portaria: 'Portaria' };
const textoComQuebras = t => html`${String(t || '').split('\n').map((l, i) => html`${i ? seguro('<br>') : ''}${l}`)}`;

/* ---------- avisos no topo: mensagens não lidas e comunicados novos ---------- */
let pollAvisos = null;
const lerVisto = () => { try { return Number(localStorage.getItem('comunicado-visto-' + SESSAO.usuario.id)) || 0; } catch (e) { return 0; } };
const marcarVisto = id => { try { localStorage.setItem('comunicado-visto-' + SESSAO.usuario.id, String(id)); } catch (e) { /* sem armazenamento */ } };
async function atualizarAvisos() {
  if (!SESSAO.usuario) return;
  try {
    const r = await api('mensagens/nao-lidas');
    const novoCom = r.ultimoComunicado > lerVisto();
    const top = $('topActions');
    top.innerHTML = html`
      ${pode('mensagens') ? html`<a class="top-btn" href="#caixa" aria-label="Mensagens${r.mensagens ? `, ${r.mensagens} não lidas` : ''}" title="Mensagens">${ic('mail')}${r.mensagens ? html`<span class="badge">${r.mensagens > 99 ? '99+' : r.mensagens}</span>` : ''}</a>` : ''}
      <a class="top-btn" href="#comunicados" aria-label="Comunicados${novoCom ? ', há novos' : ''}" title="Comunicados">${ic('bell')}${novoCom ? html`<span class="badge">!</span>` : ''}</a>
      <button class="top-btn" data-act="sair" title="Sair">${ic('logout')}<span class="lbl-sm">Sair</span></button>`;
    const item = MENU.find(m => m.label === 'Mensagem');
    if (item && item.count !== (r.mensagens || undefined)) { item.count = r.mensagens || undefined; renderMenu(); }
  } catch (e) { /* servidor fora do ar: tenta de novo no próximo ciclo */ }
}
const montarShellBase = montarShell;
montarShell = function () {
  montarShellBase();
  atualizarAvisos();
  clearInterval(pollAvisos);
  pollAvisos = setInterval(atualizarAvisos, 60000);
};

/* ---------- comunicado fixado na tela principal ---------- */
const principalBase = TELAS.principal.fn;
TELAS.principal.fn = () => {
  principalBase();
  const lugar = document.createElement('div'); lugar.id = 'mural'; lugar.hidden = true;
  const titulo = view.querySelector('.page-title');
  if (titulo) titulo.after(lugar); else view.prepend(lugar);
  api('comunicados').then(l => {
    const fix = l.filter(c => c.fixado && !c.vencido).slice(0, 2);
    const el = $('mural'); if (!el || !fix.length) return;
    el.hidden = false; el.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    el.innerHTML = html`${fix.map(c => html`<div class="aviso">${ic('megaphone')}<div><b>${c.titulo}</b><span>${c.texto.length > 220 ? c.texto.slice(0, 220) + '…' : c.texto} <a href="#comunicados">Ver comunicados</a></span></div></div>`)}`;
  }).catch(() => {});
};

/* ================= Comunicados ================= */
let COMUNICADOS = [];
tela('comunicados', null, async () => {
  const edita = pode('comunicados');
  view.innerHTML = html`
    <div class="page-title"><div><h1>Página de comunicados</h1></div>${edita ? html`<button class="btn blue" data-act="comunicado-novo">+ Novo comunicado</button>` : ''}</div>
    <div id="lista" style="display:flex;flex-direction:column;gap:16px"><section class="panel vazio">Carregando…</section></div>`;
  try {
    COMUNICADOS = await api('comunicados');
    if (COMUNICADOS[0]) marcarVisto(Math.max(...COMUNICADOS.map(c => c.id)));
    atualizarAvisos();
    if (!$('lista')) return;
    $('lista').innerHTML = html`${COMUNICADOS.length ? COMUNICADOS.map(c => html`<article class="panel" style="${c.vencido ? 'opacity:.6' : ''}">
      <div class="panel-h">${c.fixado ? ic('star') : ic('megaphone')}<h2>${c.titulo}</h2><span class="sp"></span>
        <span class="pill ${c.publico === 'todos' ? 'doing' : 'warn'}">${PUBLICOS[c.publico]}</span>${c.vencido ? html`<span class="pill todo">Encerrado</span>` : ''}</div>
      <div style="padding:16px 22px;line-height:1.6">${textoComQuebras(c.texto)}</div>
      <div class="muted" style="padding:0 22px 16px;font-size:.82rem;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span>${c.autor || 'Escola'} · ${dataHoraBR(c.criadoEm)}${c.ate ? ` · até ${dataBR(c.ate)}` : ''}</span>
        ${edita ? html`<span class="sp" style="flex:1"></span><button class="btn sm" data-act="comunicado-editar" data-id="${c.id}">Editar</button>` : ''}</div>
    </article>`) : html`<section class="panel vazio">Nenhum comunicado publicado.</section>`}`;
  } catch (e) { $('lista').innerHTML = html`<section class="panel"><p class="res bad" style="margin:20px">${e.message}</p></section>`; }
});
function formComunicado(c) {
  openForm({
    title: c ? 'Editar comunicado' : 'Novo comunicado', sub: 'Aparece na Página de comunicados para o público escolhido', submit: c ? 'Salvar' : 'Publicar', largura: 720,
    values: c || { publico: 'todos' },
    fields: [
      { name: 'titulo', label: 'Título', required: true, full: true, placeholder: 'Ex.: Reunião de pais no dia 20/11' },
      { name: 'texto', label: 'Texto', type: 'textarea', required: true, full: true, rows: 7, maxlength: 5000 },
      { name: 'publico', label: 'Para quem', type: 'select', required: true, vazio: false, options: Object.entries(PUBLICOS).map(([v, t]) => ({ v, t })) },
      { name: 'ate', label: 'Mostrar até (opcional)', type: 'date' },
      { name: 'fixado', label: 'Fixar no topo da tela principal', type: 'checkbox', hint: 'Use para avisos importantes, como prazos de entrega de diários.' }
    ],
    extraBotoes: c ? html`<button type="button" class="btn red" id="exclCom" style="margin-right:auto">Apagar</button>` : '',
    onSave: d => api(c ? `comunicados/${c.id}` : 'comunicados', { metodo: c ? 'PUT' : 'POST', corpo: d }).then(() => { route(); toast(c ? 'Comunicado salvo.' : 'Comunicado publicado.'); })
  });
  if (c) $('exclCom').onclick = async () => {
    if (await confirmar('Apagar comunicado?', c.titulo, { botao: 'Apagar', perigo: true })) { await api(`comunicados/${c.id}`, { metodo: 'DELETE' }); route(); toast('Comunicado apagado.'); }
  };
}
acao('comunicado-novo', () => formComunicado());
acao('comunicado-editar', el => formComunicado(COMUNICADOS.find(c => c.id === Number(el.dataset.id))));

/* ================= Mensagens ================= */
let pastaMsg = 'entrada';
tela('caixa', 'mensagens', async () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Mensagem</div><h1>Caixa de entrada</h1></div><a class="btn blue" href="#nova-msg">+ Nova mensagem</a></div>
    <section class="panel">
      <nav class="tabs"><a href="#caixa" data-pasta="entrada" class="${pastaMsg === 'entrada' ? 'on' : ''}">Recebidas</a><a href="#caixa" data-pasta="enviadas" class="${pastaMsg === 'enviadas' ? 'on' : ''}">Enviadas</a></nav>
      <div class="table-wrap"><table class="t"><thead><tr><th>${pastaMsg === 'entrada' ? 'De' : 'Para'}</th><th>Assunto</th><th>Data</th></tr></thead><tbody id="rows">${linhaVazia(3, 'Carregando…')}</tbody></table></div>
    </section>`;
  view.querySelectorAll('[data-pasta]').forEach(a => a.onclick = e => { e.preventDefault(); pastaMsg = a.dataset.pasta; route(); });
  try {
    const l = await api(`mensagens?pasta=${pastaMsg}`);
    if (!$('rows')) return;
    $('rows').innerHTML = html`${l.length ? l.map(m => { const nova = pastaMsg === 'entrada' && !m.lidaEm; return html`<tr style="cursor:pointer" data-act="msg-abrir" data-id="${m.id}">
      <td style="${nova ? 'font-weight:800' : ''}">${nova ? html`<span class="dot on" style="margin-right:8px"></span>` : ''}${pastaMsg === 'entrada' ? m.de || 'Sistema' : m.para}</td>
      <td><span style="${nova ? 'font-weight:800' : 'font-weight:600'}">${m.assunto}</span><div class="muted" style="font-size:.82rem">${m.previa}</div></td>
      <td class="num muted" style="white-space:nowrap">${dataHoraBR(m.criadoEm)}${pastaMsg === 'enviadas' ? html`<div style="font-size:.78rem">${m.lidaEm ? 'Lida' : 'Não lida'}</div>` : ''}</td></tr>`; })
      : linhaVazia(3, pastaMsg === 'entrada' ? 'Nenhuma mensagem recebida.' : 'Nenhuma mensagem enviada.')}`;
  } catch (e) { $('rows').innerHTML = html`<tr><td colspan="3"><p class="res bad">${e.message}</p></td></tr>`; }
});
acao('msg-abrir', async el => {
  const m = await api(`mensagens/${el.dataset.id}`);
  const box = modal({
    titulo: m.assunto, sub: `${m.recebida ? `De: ${m.de || 'Sistema'}` : `Para: ${m.para}`} · ${dataHoraBR(m.criadoEm)}`, largura: 680,
    corpo: html`<div style="padding:4px 0 12px;line-height:1.6">${textoComQuebras(m.texto)}</div>`,
    rodape: html`<button class="btn red" id="msgApagar" style="margin-right:auto">Apagar</button><button class="btn" data-close>Fechar</button>${m.recebida && m.deId ? html`<button class="btn blue" id="msgResp">Responder</button>` : ''}`
  });
  box.querySelector('#msgApagar').onclick = async () => { await api(`mensagens/${m.id}`, { metodo: 'DELETE' }); closeLayer(); route(); toast('Mensagem apagada.'); };
  if ($('msgResp')) $('msgResp').onclick = () => novaMensagem({ para: [m.deId], assunto: m.assunto.startsWith('Re: ') ? m.assunto : `Re: ${m.assunto}`, citacao: m, respostaA: m.id });
  atualizarAvisos();
});

async function novaMensagem(pre = {}) {
  const contatos = await api('mensagens/contatos');
  const form = openForm({
    title: pre.respostaA ? 'Responder' : 'Nova mensagem', sub: 'A mensagem chega na Caixa de entrada de cada pessoa', submit: 'Enviar', largura: 720,
    values: { assunto: pre.assunto || '', texto: pre.citacao ? `\n\n--- ${pre.citacao.de} escreveu em ${dataHoraBR(pre.citacao.criadoEm)}:\n${pre.citacao.texto}` : '' },
    fields: [
      ...(pode('comunicados') ? [{ name: 'papeis', label: 'Enviar para todos os', type: 'checks', options: Object.entries(PAPEIS).filter(([k]) => k !== 'admin').map(([v, t]) => ({ v, t })) }] : []),
      { name: 'assunto', label: 'Assunto', required: true, full: true },
      { name: 'texto', label: 'Mensagem', type: 'textarea', required: true, full: true, rows: 8 }
    ],
    note: html`<div class="field full"><span style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Para</span>
      <input id="msgFiltro" type="search" placeholder="Buscar pessoa" style="margin:6px 0;border:1px solid var(--line);border-radius:9px;padding:8px 12px;width:100%">
      <div class="checks" id="msgPara" style="max-height:180px;overflow:auto">${contatos.map(c => html`<label data-nome="${c.nome.toLowerCase()}"><input type="checkbox" value="${c.id}" ${(pre.para || []).includes(c.id) ? seguro('checked') : ''}>${c.nome} <span class="muted">· ${c.papelNome}</span></label>`)}</div></div>`,
    onSave: async d => {
      const para = [...form.querySelectorAll('#msgPara input:checked')].map(i => Number(i.value));
      const r = await api('mensagens', { metodo: 'POST', corpo: { para, papeis: d.papeis || [], assunto: d.assunto, texto: d.texto, respostaA: pre.respostaA } });
      toast(`Mensagem enviada para ${plural(r.enviadas, 'pessoa', 'pessoas')}.`);
      if (location.hash === '#nova-msg') location.hash = '#caixa'; else route();
    }
  });
  $('msgFiltro').oninput = e => { const q = e.target.value.trim().toLowerCase(); form.querySelectorAll('#msgPara label').forEach(l => { l.hidden = q && !l.dataset.nome.includes(q); }); };
  const t = form.querySelector('#f_texto'); if (pre.citacao) { t.focus(); t.setSelectionRange(0, 0); }
}
tela('nova-msg', 'mensagens', () => {
  TELAS.caixa.fn();
  novaMensagem().catch(e => toast(e.message, 6000));
});

/* ================= Tutoriais ================= */
const TUTORIAIS = [
  { perm: 'config', titulo: 'Primeiros passos (administrador)', passos: [
    'Em <b>Configurações &gt; Dados da escola</b>, confira o nome da escola e o ano letivo.',
    'Em <b>Configurações &gt; Usuários</b>, crie um usuário para cada pessoa da secretaria, coordenação, portaria e financeiro. Para professores, cadastre o professor primeiro em <b>Secretaria &gt; Cadastro &gt; Professores</b> e depois crie o usuário do tipo Professor ligado a ele.',
    'Cadastre as turmas em <b>Secretaria &gt; Turmas &gt; Lista de turmas</b>, ou importe os alunos por planilha, que cria as turmas sozinha.',
    'Em <b>Controle de acesso &gt; Conexão com a catraca</b>, preencha o IP, o usuário e a senha da catraca e teste a conexão.',
    'Combine com alguém da escola de copiar a pasta <code class="k">servidor/dados/backups</code> para um pendrive ou para a nuvem toda semana.'] },
  { perm: 'cadastros', titulo: 'Importar os alunos de uma planilha', passos: [
    'No sistema antigo ou no Excel, salve a lista de alunos como <b>CSV</b> (Arquivo &gt; Salvar como &gt; CSV).',
    'Abra <b>Secretaria &gt; Cadastro &gt; Importar planilha</b> e escolha o arquivo. Se quiser, baixe a planilha modelo para ver o formato.',
    'Confira se cada campo do sistema está ligado à coluna certa da planilha e clique em <b>Conferir planilha</b>. Nada é gravado nessa hora.',
    'Se aparecerem erros, corrija as linhas na planilha e escolha o arquivo de novo. Sem erros, clique em <b>Importar</b>.'] },
  { perm: 'cadastros', titulo: 'Matricular um aluno novo', passos: [
    'Abra <b>Secretaria &gt; Cadastro &gt; Alunos</b> e clique em <b>+ Novo aluno</b>.',
    'Preencha os dados do aluno, a turma e o responsável. A matrícula é gerada sozinha.',
    'Se o responsável assinou a autorização de biometria, marque a caixa no fim do formulário. Sem ela, o aluno só passa na catraca por cartão ou senha.'] },
  { perm: ['notas', 'notas.proprias'], titulo: 'Lançar notas e faltas', passos: [
    'Professor: abra <b>Pedagógico &gt; Meus diários</b> e clique em <b>Lançar notas</b>. Secretaria: <b>Secretaria &gt; Turmas &gt; Alteração de notas e faltas</b>.',
    'Escolha o bimestre nas abas. Digite as notas (AT até 3, TBL até 7, Teste e Prova até 10, RP até 10) e as faltas. A média aparece na hora.',
    'Use Enter para descer para o próximo aluno. Clique em <b>Salvar</b> antes de trocar de bimestre.',
    'No fim do período, o professor clica em <b>Entregar diário</b>. Depois disso, só a secretaria pode reabrir.'] },
  { perm: 'catraca', titulo: 'Cadastrar o aluno na catraca', passos: [
    'Abra <b>Controle de acesso &gt; Cadastro facial</b> e clique em <b>Cadastrar</b> na linha do aluno.',
    'Foto do rosto: ligue a câmera e tire a foto com o rosto dentro do oval, ou use <b>Capturar na catraca</b> com o aluno olhando para a câmera da catraca. Só aparece se houver autorização de biometria.',
    'Cartão: digite o número impresso (com a vírgula, se tiver) ou clique em <b>Ler na catraca</b> e aproxime o cartão do leitor.',
    'Senha: de 4 a 8 números. Clique em <b>Salvar na catraca</b>.'] },
  { perm: 'catraca.acessos', titulo: 'Liberar a catraca e ver os acessos', passos: [
    'Abra <b>Controle de acesso &gt; Liberação e acessos</b>.',
    'Para quem esqueceu o cartão: clique em <b>Liberar entrada</b> (ou saída). A catraca libera um giro.',
    'A lista mostra quem passou hoje e atualiza sozinha a cada 10 segundos. Escolha outro dia no campo de data para ver dias anteriores.'] },
  { perm: 'matriculas', titulo: 'Virada do ano (rematrícula)', passos: [
    'Antes do conselho de classe, marque a situação final de cada aluno (Aprovado ou Reprovado) na ficha do aluno.',
    'Em <b>Secretaria &gt; Matrículas &gt; Rematrículas</b>, clique em <b>Copiar turmas</b> para criar as turmas do ano seguinte com os mesmos professores.',
    'Escolha cada turma, confira a turma de destino sugerida para cada aluno e clique em <b>Rematricular marcados</b>.',
    'Por último, em <b>Configurações</b>, mude o ano letivo para o novo ano. As notas do ano anterior ficam no Histórico escolar.'] },
  { perm: 'logado', titulo: 'Trocar a minha senha', passos: ['Abra <b>Minha conta</b> no menu, digite a senha atual e a nova duas vezes. A senha precisa ter 8 caracteres, com letras e números.'] }
];
tela('tutoriais', null, () => {
  const lista = TUTORIAIS.filter(t => pode(t.perm));
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Central de ajuda</div><h1>Tutoriais</h1></div></div>
    ${lista.map((t, i) => html`<details class="panel" ${i === 0 ? seguro('open') : ''}><summary class="panel-h" style="cursor:pointer;list-style:none">${ic('info')}<h2>${t.titulo}</h2></summary>
      <ol class="passos">${t.passos.map(p => html`<li>${seguro(p)}</li>`)}</ol></details>`)}`;
});

/* ================= Suporte ================= */
tela('suporte', null, async () => {
  const s = await api('suporte').catch(() => ({}));
  const temContato = s.nome || s.telefone || s.email || s.whatsapp;
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Central de ajuda</div><h1>Falar com o suporte</h1></div></div>
    <div class="home">
      <section class="panel">
        <div class="panel-h">${ic('chat')}<h2>Enviar mensagem</h2></div>
        <form id="supForm" novalidate style="padding:16px 22px 20px"><div class="form-grid" style="grid-template-columns:minmax(0,1fr)">
          <label class="field" for="supAssunto">Assunto<input id="supAssunto" placeholder="Ex.: catraca não libera a entrada"></label>
          <label class="field" for="supTexto">O que aconteceu?<textarea id="supTexto" rows="6" placeholder="Conte o que estava fazendo, em qual tela e o que apareceu."></textarea></label>
          <div id="supRes" role="status"></div>
        </div><div style="display:flex;justify-content:flex-end"><button class="btn blue" type="submit">Enviar para o administrador</button></div></form>
      </section>
      <section class="panel">
        <div class="panel-h">${ic('info')}<h2>Suporte técnico</h2>${pode('config') ? html`<span class="sp"></span><button class="btn sm" data-act="suporte-editar">Editar</button>` : ''}</div>
        <div style="padding:16px 22px;line-height:1.8">${temContato ? html`${s.nome ? html`<b>${s.nome}</b><br>` : ''}${s.telefone ? html`Telefone: ${s.telefone}<br>` : ''}${s.whatsapp ? html`WhatsApp: ${s.whatsapp}<br>` : ''}${s.email ? html`E-mail: ${s.email}` : ''}`
          : html`<span class="muted">O contato do suporte técnico ainda não foi cadastrado.${pode('config') ? ' Clique em Editar.' : ''}</span>`}</div>
        <p class="muted" style="padding:0 22px 16px;margin:0;font-size:.84rem">Antes de ligar, veja os <a href="#tutoriais">tutoriais</a>. Se o sistema não abrir em nenhum computador, confira se o computador do servidor está ligado e com a janela do servidor aberta.</p>
      </section>
    </div>`;
  $('supForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('suporte', { metodo: 'POST', corpo: { assunto: $('supAssunto').value, texto: $('supTexto').value } });
      e.target.reset(); $('supRes').innerHTML = html`<p class="res ok">Mensagem enviada para ${plural(r.enviadas, 'administrador', 'administradores')}. A resposta chega na sua Caixa de entrada.</p>`;
    } catch (err) { $('supRes').innerHTML = html`<p class="res bad">${err.message}</p>`; }
  };
});
acao('suporte-editar', async () => {
  const s = await api('suporte');
  openForm({
    title: 'Contato do suporte técnico', sub: 'Aparece em Falar com o suporte para todos os usuários', submit: 'Salvar', values: s,
    fields: [
      { name: 'nome', label: 'Empresa ou pessoa', full: true }, { name: 'telefone', label: 'Telefone' }, { name: 'whatsapp', label: 'WhatsApp' },
      { name: 'email', label: 'E-mail', type: 'email', full: true }
    ],
    onSave: d => api('suporte', { metodo: 'PUT', corpo: d }).then(() => { route(); toast('Contato do suporte salvo.'); })
  });
});
