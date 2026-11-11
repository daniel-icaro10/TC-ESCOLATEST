'use strict';
/* =====================================================================
   Configurações (administrador): dados da escola, usuários e registro
   de atividades. Minha conta: troca de senha (todos).
   ===================================================================== */
const PAPEIS = { admin: 'Administrador', secretaria: 'Secretaria', coordenacao: 'Coordenação', professor: 'Professor', portaria: 'Portaria', financeiro: 'Financeiro', familia: 'Família' };
const PAPEIS_EQUIPE = Object.fromEntries(Object.entries(PAPEIS).filter(([k]) => k !== 'familia'));
const DESCR_PAPEL = {
  admin: 'Tudo, inclusive usuários, configurações e catraca.',
  secretaria: 'Cadastros, matrículas, notas, boletins, relatórios e cadastro na catraca.',
  coordenacao: 'Consulta de tudo, notas, ocorrências, acompanhamento pedagógico e acessos da catraca.',
  professor: 'Só os próprios diários: notas, faltas e planejamento das suas turmas.',
  portaria: 'Liberação da catraca e lista de acessos.',
  financeiro: 'Mensalidades, inadimplência e consulta dos cadastros.'
};

function abasConfig(ativa) {
  const abas = [['escola', 'Dados da escola'], ['usuarios', 'Usuários'], ['atividade', 'Registro de atividades']];
  return html`<nav class="tabs" aria-label="Seções">${abas.map(([id, t]) => html`<a href="#config${id === 'escola' ? '' : '-' + id}" class="${id === ativa ? 'on' : ''}">${t}</a>`)}</nav>`;
}

tela('config', 'config', () => {
  const e = SESSAO.escola;
  view.innerHTML = html`
    <div class="page-title"><div><h1>Configurações</h1></div></div>
    <section class="panel">${abasConfig('escola')}
      <form id="escForm" novalidate style="padding:18px 22px 22px"><div class="form-grid">
        <label class="field full" for="eNome">Nome da escola *<input id="eNome" value="${e.nome || ''}" required></label>
        <label class="field" for="eAno">Ano letivo atual *<input id="eAno" type="number" min="2000" max="2100" value="${e.anoLetivo || ''}"><small style="text-transform:none;letter-spacing:0;font-weight:400">Turmas, diários e o painel principal usam este ano.</small></label>
        <label class="field" for="eCnpj">CNPJ<input id="eCnpj" value="${e.cnpj || ''}"></label>
        <label class="field full" for="eEnd">Endereço<input id="eEnd" value="${e.endereco || ''}"></label>
        <label class="field" for="eCidade">Cidade / UF<input id="eCidade" value="${e.cidade || ''}"></label>
        <label class="field" for="eTel">Telefone<input id="eTel" type="tel" value="${e.telefone || ''}"></label>
        <label class="field" for="eEmail">E-mail<input id="eEmail" type="email" value="${e.email || ''}"></label>
        <div class="full" id="escRes" role="status"></div>
      </div>
      <div style="display:flex;justify-content:flex-end"><button class="btn blue" type="submit">Salvar</button></div></form>
    </section>
    <section class="panel">
      <div class="panel-h">${ic('download')}<h2>Backup</h2></div>
      <div style="padding:16px 22px 20px;display:flex;flex-direction:column;gap:12px">
        <p style="margin:0">O servidor guarda sozinho uma cópia do banco por dia (os últimos 30 dias) na pasta <code class="k">servidor/dados/backups</code> do computador do sistema.
          Mesmo assim, <b>leve uma cópia para fora desse computador toda semana</b> (pendrive ou nuvem): se o computador quebrar ou for roubado, é com ela que os dados voltam.</p>
        <a class="btn blue" href="/api/backup" download style="align-self:flex-start">${ic('download')} Baixar backup agora</a>
        <p class="muted" style="margin:0;font-size:.84rem">O arquivo tem dados pessoais de alunos e famílias (LGPD): guarde em lugar seguro. Para restaurar, veja o README.</p>
      </div>
    </section>`;
  $('escForm').onsubmit = async ev => {
    ev.preventDefault();
    try {
      SESSAO.escola = await api('config/escola', { metodo: 'PUT', corpo: { nome: $('eNome').value, anoLetivo: Number($('eAno').value), cnpj: $('eCnpj').value, endereco: $('eEnd').value, cidade: $('eCidade').value, telefone: $('eTel').value, email: $('eEmail').value } });
      montarShell();
      $('escRes').innerHTML = html`<p class="res ok">Dados da escola salvos.</p>`;
    } catch (err) { $('escRes').innerHTML = html`<p class="res bad">${err.message}</p>`; }
  };
});

tela('config-usuarios', 'usuarios', async () => {
  view.innerHTML = html`
    <div class="page-title"><div><h1>Configurações</h1></div><button class="btn blue" data-act="novo-usuario">+ Novo usuário</button></div>
    <section class="panel">${abasConfig('usuarios')}
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Nome</th><th>Usuário</th><th>Tipo de acesso</th><th>Último acesso</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="5" class="vazio">Carregando…</td></tr></tbody>
      </table></div>
    </section>
    <section class="panel"><div class="panel-h">${ic('shield')}<h2>Tipos de acesso</h2></div>
      <ul class="steps">${Object.entries(PAPEIS_EQUIPE).map(([k, v]) => html`<li><span class="st">${ic(k === 'admin' ? 'key' : 'user')}</span><p><b>${v}:</b> ${DESCR_PAPEL[k]}</p><span></span></li>`)}</ul></section>`;
  try {
    USUARIOS = await api('usuarios');
    if (!$('rows')) return;
    $('rows').innerHTML = html`${USUARIOS.map(u => html`<tr>
      <td style="font-weight:700">${u.nome}${u.professor ? html`<div class="muted" style="font-weight:400;font-size:.8rem">Professor(a): ${u.professor}</div>` : ''}</td>
      <td><code class="k">${u.login}</code></td>
      <td>${PAPEIS[u.papel] || u.papel} ${!u.ativo ? html`<span class="pill todo">Desativado</span>` : ''}</td>
      <td class="muted">${u.ultimoAcesso ? dataHoraBR(u.ultimoAcesso) : 'Nunca entrou'}</td>
      <td class="r"><button class="btn sm" data-act="usuario-editar" data-id="${u.id}">Editar</button></td></tr>`)}`;
  } catch (e) { if ($('rows')) $('rows').innerHTML = html`<tr><td colspan="5"><p class="res bad">${e.message}</p></td></tr>`; }
});
let USUARIOS = [];
function formUsuario(u) {
  const form = openForm({
    title: u ? 'Editar usuário' : 'Novo usuário', sub: u ? u.login : 'A pessoa entra no sistema com o usuário e a senha definidos aqui.', submit: 'Salvar',
    values: u ? { ...u, ativo: !!u.ativo } : {},
    fields: [
      { name: 'nome', label: 'Nome da pessoa', required: true, full: true },
      { name: 'login', label: 'Usuário para entrar', required: true, placeholder: 'Ex.: maria.souza', validar: v => /^[a-z0-9._-]{3,40}$/i.test(v) ? '' : 'Use de 3 a 40 letras sem acento, números, ponto ou traço.' },
      { name: 'papel', label: 'Tipo de acesso', type: 'select', required: true, options: Object.entries(PAPEIS_EQUIPE).map(([v, t]) => ({ v, t })), hint: 'Acessos das famílias são criados em Ambiente do aluno > Portal do aluno.' },
      { name: 'professorId', label: 'Professor ligado a este usuário', type: 'select', options: optProfs(), hint: 'Só para o tipo Professor: define quais diários ele vê.' },
      { name: 'senha', label: u ? 'Nova senha (em branco mantém a atual)' : 'Senha inicial', type: 'password', required: !u, autocomplete: 'new-password', hint: 'No mínimo 8 caracteres, com letras e números. Passe para a pessoa e peça para ela trocar em Minha conta.' },
      ...(u ? [{ name: 'ativo', label: 'Usuário ativo', type: 'checkbox', hint: 'Desmarque para bloquear o acesso (por exemplo, quando a pessoa sai da escola).' }] : [])
    ],
    onSave: d => {
      if (d.papel === 'professor' && !d.professorId) throw new Error('Escolha o professor ligado a este usuário.');
      return api(u ? `usuarios/${u.id}` : 'usuarios', { metodo: u ? 'PUT' : 'POST', corpo: { ...d, professorId: d.professorId ? Number(d.professorId) : null } })
        .then(() => { route(); toast(u ? 'Usuário salvo.' : `Usuário ${d.login} criado.`); });
    }
  });
  const papel = form.elements.papel, campoProf = form.elements.professorId.closest('.field');
  const ajusta = () => { campoProf.hidden = papel.value !== 'professor'; };
  papel.onchange = ajusta; ajusta();
}
acao('novo-usuario', () => formUsuario());
acao('usuario-editar', el => formUsuario(USUARIOS.find(u => u.id === Number(el.dataset.id))));

tela('config-atividade', 'config', async () => {
  view.innerHTML = html`
    <div class="page-title"><div><h1>Configurações</h1></div></div>
    <section class="panel">${abasConfig('atividade')}
      <p class="muted" style="padding:14px 22px 0;margin:0;font-size:.86rem">Quem fez o quê no sistema (últimos 500 registros). Útil para conferir alterações e para a LGPD.</p>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead>
        <tbody id="rows"><tr><td colspan="4" class="vazio">Carregando…</td></tr></tbody>
      </table></div>
    </section>`;
  try {
    const lista = await api('auditoria?limite=500');
    if ($('rows')) $('rows').innerHTML = html`${lista.length ? lista.map(r => html`<tr><td class="num" style="white-space:nowrap">${dataHoraBR(r.quando)}</td><td><code class="k">${r.usuario}</code></td><td>${r.acao}</td><td class="muted">${r.detalhe || ''}</td></tr>`) : linhaVazia(4, 'Nenhuma atividade registrada.')}`;
  } catch (e) { if ($('rows')) $('rows').innerHTML = html`<tr><td colspan="4"><p class="res bad">${e.message}</p></td></tr>`; }
});

tela('minha-conta', 'logado', () => {
  const u = SESSAO.usuario;
  view.innerHTML = html`
    <div class="page-title"><div><h1>Minha conta</h1><div class="muted">${u.nome} · ${u.papelNome} · usuário <code class="k">${u.login}</code></div></div></div>
    <section class="panel">
      <div class="panel-h">${ic('key')}<h2>Trocar a senha</h2></div>
      <form id="senhaForm" novalidate style="padding:18px 22px 22px"><div class="form-grid">
        <label class="field full" for="sAtual">Senha atual<input id="sAtual" type="password" autocomplete="current-password"></label>
        <label class="field" for="sNova">Nova senha<input id="sNova" type="password" autocomplete="new-password"><small style="text-transform:none;letter-spacing:0;font-weight:400">No mínimo 8 caracteres, com letras e números.</small></label>
        <label class="field" for="sNova2">Repita a nova senha<input id="sNova2" type="password" autocomplete="new-password"></label>
        <div class="full" id="senhaRes" role="status"></div>
      </div>
      <div style="display:flex;justify-content:flex-end"><button class="btn blue" type="submit">Trocar senha</button></div></form>
    </section>`;
  $('senhaForm').onsubmit = async e => {
    e.preventDefault();
    const res = (t, m) => { $('senhaRes').innerHTML = html`<p class="res ${t}">${m}</p>`; };
    if ($('sNova').value !== $('sNova2').value) return res('bad', 'As duas senhas novas não são iguais.');
    try {
      await api('minha-senha', { metodo: 'POST', corpo: { atual: $('sAtual').value, nova: $('sNova').value } });
      e.target.reset(); res('ok', 'Senha trocada. Nos outros computadores em que você estava conectado, será preciso entrar de novo.');
    } catch (err) { res('bad', err.message); }
  };
});
