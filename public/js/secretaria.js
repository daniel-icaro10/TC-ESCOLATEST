'use strict';
/* =====================================================================
   Secretaria: principal, turmas, alunos, responsáveis, professores,
   disciplinas, diários e boletins.
   ===================================================================== */
const spinner = seguro(`<svg viewBox="0 0 28 28" aria-hidden="true">${[...Array(8)].map((_, i) => { const a = i / 8 * Math.PI * 2; return `<circle cx="${14 + Math.cos(a) * 10}" cy="${14 + Math.sin(a) * 10}" r="${1.4 + i * .25}" fill="var(--teal)"/>`; }).join('')}</svg>`);
const doneIco = seguro('<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="var(--green)"/><path d="m8.5 14.5 3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
const todoIco = seguro('<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="var(--line)" stroke-width="2.5"/></svg>');
const avisoDemo = () => SESSAO.demo ? html`<div class="aviso">${ic('info')}<div><b>Demonstração com dados fictícios</b><span>Alunos, notas e professores são inventados. A catraca é simulada. Tudo pode ser testado à vontade.</span></div></div>` : '';
const linhaVazia = (cols, txt) => html`<tr><td colspan="${cols}" class="vazio">${txt}</td></tr>`;
const anoAtual = () => SESSAO.escola.anoLetivo;

/* ================= Principal ================= */
tela('principal', null, () => {
  const u = SESSAO.usuario;
  if (ehFamilia()) return principalFamilia();
  if (!pode('escola.ver')) {
    // professor e portaria: atalhos do dia a dia
    const atalhos = [
      pode('notas.proprias') && ['#meus-diarios', 'coffee', 'Meus diários', 'Lançar notas e faltas e entregar os diários'],
      pode('catraca.acessos') && ['#catraca-acessos', 'unlock', 'Liberação e acessos', 'Liberar a catraca e ver quem passou hoje'],
      pode('mensagens') && ['#caixa', 'mail', 'Mensagens', 'Recados da secretaria e da coordenação'],
      ['#comunicados', 'megaphone', 'Comunicados', 'Avisos da escola']
    ].filter(Boolean);
    view.innerHTML = html`
      <div class="page-title"><div><h1>Olá, ${primeiroNome(u.nome)}</h1><div class="muted">${SESSAO.escola.nome}</div></div></div>
      ${avisoDemo()}
      <section class="panel"><ul class="steps">${atalhos.map(([href, icon, t, d]) => html`<li><span class="st">${ic(icon)}</span><p><b>${t}:</b> ${d}</p><a class="btn" href="${href}">Abrir</a></li>`)}</ul></section>`;
    return;
  }
  const ano = anoAtual();
  const turmasAno = TURMAS.filter(t => t.anoLetivo === ano);
  const pend = pendentes().filter(d => d.turma.anoLetivo === ano);
  const totalD = turmasAno.reduce((s, t) => s + t.disciplinas.filter(d => d.prof).length, 0);
  const ativos = ALUNOS.filter(ATIVO);
  const semProf = turmasAno.reduce((s, t) => s + semVinculo(t).length, 0);
  const alunosAno = ALUNOS.filter(a => turmasAno.some(t => t.id === a.turma));
  const comSituacao = alunosAno.filter(a => a.situacao !== 'cursando').length;
  const finalizadas = turmasAno.filter(t => t.finalizada).length;
  const proxAno = TURMAS.filter(t => t.anoLetivo === ano + 1).length;
  const est = (feito, total) => total && feito >= total ? 'done' : feito ? 'doing' : 'todo';
  const passos = [
    [est(totalD - pend.length, totalD), 'Entregar diários', `os professores preenchem as avaliações, notas e faltas e entregam o diário. ${totalD - pend.length} de ${totalD} entregues.`, '#diarios'],
    [est(comSituacao, alunosAno.length), 'Situação', `alterar a situação dos alunos para APROVADO(A) ou REPROVADO(A). ${comSituacao} de ${alunosAno.length} definidos.`, '#alunos'],
    [est(finalizadas, turmasAno.length), 'Encerrar turmas', `finalizar as turmas de ${ano} após o conselho de classe. ${finalizadas} de ${turmasAno.length} finalizadas.`, '#turmas'],
    [proxAno ? 'done' : 'todo', 'Turmas do próximo ano', `cadastrar as turmas de ${ano + 1}. ${plural(proxAno, 'turma cadastrada', 'turmas cadastradas')}.`, '#turmas']
  ];
  const ico = { doing: spinner, done: doneIco, todo: todoIco };
  const tag = { doing: html`<span class="pill doing">Em andamento</span>`, done: html`<span class="pill ok">Concluído</span>`, todo: html`<span class="pill todo">Pendente</span>` };
  const mes = new Date().getMonth() + 1;
  const aniver = ativos.filter(a => a.nascimento && Number(a.nascimento.slice(5, 7)) === mes).sort((x, y) => x.nascimento.slice(8) - y.nascimento.slice(8));
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">${SESSAO.escola.nome}</div><h1>Olá, ${primeiroNome(u.nome)}</h1></div></div>
    ${avisoDemo()}
    <section class="panel"><div class="kpis">
      <div class="kpi"><span>Alunos ativos</span><b>${ativos.length}</b></div>
      <div class="kpi"><span>Turmas ${ano}</span><b>${turmasAno.length}</b></div>
      <div class="kpi"><span>Diários entregues</span><b>${totalD - pend.length}/${totalD}</b></div>
      <div class="kpi"><span>Disciplinas sem professor</span><b style="${semProf ? 'color:var(--red)' : ''}">${semProf}</b></div>
    </div></section>
    <div class="home">
      <section class="panel">
        <div class="panel-h blue"><h2>Passos para o fechamento do ano letivo</h2></div>
        <ul class="steps">${passos.map(([s, t, d, href]) => html`<li><span class="st">${ico[s]}</span><p><b><a href="${href}" style="color:inherit">${t}</a>:</b> ${d}</p>${tag[s]}</li>`)}</ul>
      </section>
      <div style="display:flex;flex-direction:column;gap:22px;min-width:0">
        <section class="panel">
          <div class="panel-h"><h2>Diários para devolver</h2><span class="sp"></span><a class="btn blue sm" href="#diarios">${ic('check')} Ver diários</a></div>
          ${pend.slice(0, 6).map(d => html`<div class="diario"><div class="g"><div><b>Professor:</b> ${d.prof}</div><div><b>Disciplina:</b> ${d.nome} · ${d.turma.nome}</div></div><span class="pill warn">Pendente</span></div>`)}
          ${pend.length ? html`<div class="diario" style="justify-content:center"><a href="#diarios" style="color:var(--blue);font-weight:700;text-decoration:none">Ver todos os ${pend.length} diários pendentes</a></div>` : html`<div class="vazio">Todos os diários foram entregues.</div>`}
        </section>
        <section class="panel">
          <div class="panel-h">${ic('calendar')}<h2>Aniversariantes do mês</h2></div>
          ${aniver.length ? aniver.slice(0, 8).map(a => html`<div class="diario"><div class="g"><b>${a.nome}</b><div class="muted" style="font-size:.82rem">${turmaDe(a.turma)?.nome || ''}</div></div><span class="num muted">${a.nasc.slice(0, 5)}</span></div>`) : html`<div class="vazio">Nenhum aniversariante este mês.</div>`}
          ${aniver.length > 8 ? html`<div class="diario muted" style="justify-content:center">e mais ${aniver.length - 8}</div>` : ''}
        </section>
      </div>
    </div>`;
});

/* ================= Turmas ================= */
function turmaRow(t) {
  const sv = semVinculo(t), ativos = t.alunos.filter(ATIVO).length;
  return html`<tr>
    <td class="full" data-l="">
      <div class="turma-nome">${t.nome}</div>
      <div class="turma-links"><a href="#turma-${t.id}">${t.disciplinas.length} disciplinas</a><a href="#turma-${t.id}">${t.alunos.length} alunos | ${ativos} ativos</a></div>
      ${t.criterio ? html`<span class="criterio">${t.criterio}</span>` : ''}
    </td>
    <td class="etapa" data-l="Etapa"><b>${t.etapa.toUpperCase()}</b><small>${t.nivel}</small></td>
    <td data-l="Turno">${t.turno.toUpperCase()}</td>
    <td data-l="Finalizada">${t.finalizada ? 'SIM' : 'NÃO'}${t.bloqueada ? html` <span class="pill warn">Bloqueada</span>` : ''}</td>
    <td data-l="Disciplinas sem vínculo">${sv.length ? html`<span class="pill bad">${sv.length > 2 ? `${sv.length} disciplinas` : sv.join(', ')}</span>` : html`<span class="muted">–</span>`}</td>
    <td class="cmd-cell"><div class="cmd">
      <button data-act="turma-abrir" data-turma="${t.id}" title="Abrir turma" aria-label="Abrir ${t.nome}">${ic('edit')}</button>
      <button data-act="reports" data-turma="${t.id}" title="Relatórios da turma" aria-label="Relatórios do ${t.nome}">${ic('search')}</button>
      ${pode('notas') ? html`<button class="gold ${t.bloqueada ? '' : 'off'}" data-act="lock" data-turma="${t.id}" title="${t.bloqueada ? 'Desbloquear' : 'Bloquear'} lançamentos" aria-label="${t.bloqueada ? 'Desbloquear' : 'Bloquear'} lançamentos" aria-pressed="${t.bloqueada}">${ic(t.bloqueada ? 'lock' : 'unlock')}</button>` : ''}
      ${pode('cadastros') ? html`<button class="red" data-act="turma-excluir" data-turma="${t.id}" title="Excluir turma" aria-label="Excluir ${t.nome}">${ic('trash')}</button>` : ''}
    </div></td>
  </tr>`;
}
tela('turmas', 'escola.ver', () => {
  const anos = [...new Set(TURMAS.map(t => t.anoLetivo))].sort((a, b) => b - a);
  if (!anos.includes(anoAtual())) anos.unshift(anoAtual());
  view.innerHTML = html`
    <div class="page-title">
      <div><div class="crumb">Secretaria / Turmas</div><h1>Lista de turmas</h1></div>
      ${pode('cadastros') ? html`<button class="btn blue" data-act="nova-turma">+ Nova turma</button>` : ''}
    </div>
    <section class="panel">
      <div class="panel-h">${ic('list')}
        <label class="field" for="fAno" style="flex-direction:row;align-items:center;gap:8px">Ano letivo<select id="fAno">${anos.map(a => html`<option value="${a}" ${a === anoAtual() ? seguro('selected') : ''}>${a}</option>`)}</select></label>
        <span class="sp"></span>
        <input id="fBusca" type="search" placeholder="Buscar turma" aria-label="Buscar turma" style="width:200px;border:1px solid var(--line);border-radius:9px;padding:8px 12px">
      </div>
      <div class="table-wrap"><table class="t resp">
        <thead><tr><th>Turma</th><th>Etapa</th><th>Turno</th><th>Finalizada</th><th>Disciplinas sem vínculo</th><th>Comando</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
    </section>`;
  const draw = () => {
    const q = $('fBusca').value.trim().toLowerCase(), ano = Number($('fAno').value);
    const lista = TURMAS.filter(t => t.anoLetivo === ano && (!q || t.nome.toLowerCase().includes(q)));
    $('rows').innerHTML = html`${lista.length ? lista.map(turmaRow) : linhaVazia(6, `Nenhuma turma em ${ano}.`)}`;
  };
  $('fBusca').oninput = draw; $('fAno').onchange = draw;
  draw();
});
acao('turma-abrir', el => { location.hash = '#turma-' + el.dataset.turma; });
acao('lock', async el => {
  const t = turmaDe(el.dataset.turma);
  await salvarERecarregar(api(`turmas/${t.id}/bloqueio`, { metodo: 'PUT', corpo: { bloqueada: !t.bloqueada } }), !t.bloqueada ? `Lançamentos do ${t.nome} bloqueados.` : `Lançamentos do ${t.nome} liberados.`);
});
acao('turma-excluir', async el => {
  const t = turmaDe(el.dataset.turma);
  if (t.alunos.length) { toast(`O ${t.nome} tem ${plural(t.alunos.length, 'aluno', 'alunos')}. Transfira os alunos para outra turma antes de excluir.`, 6000); return; }
  if (!await confirmar('Excluir turma?', `${t.nome} (${t.anoLetivo}) será excluída. Isso não pode ser desfeito.`, { botao: 'Excluir', perigo: true })) return;
  await salvarERecarregar(api(`turmas/${t.id}`, { metodo: 'DELETE' }), 'Turma excluída.');
});

const CRITERIOS = ['Critério Fundamental 1º Ano demais matérias', 'Critério Fundamental 2º ao 9º Ano'];
function formTurma(t) {
  openForm({
    title: t ? 'Editar turma' : 'Nova turma', sub: t ? t.nome : 'A turma é criada com todas as disciplinas cadastradas.', submit: t ? 'Salvar' : 'Criar turma',
    values: t ? { serie: t.serie, turno: t.turno, nome: t.nome, criterio: t.criterio, nivel: t.nivel, anoLetivo: t.anoLetivo, finalizada: t.finalizada } : { anoLetivo: anoAtual(), nivel: 'Ensino Fundamental', criterio: CRITERIOS[1] },
    fields: [
      { name: 'serie', label: 'Ano / série', type: 'select', required: true, options: [...Array(12)].map((_, i) => ({ v: i + 1, t: `${i + 1}º Ano` })) },
      { name: 'turno', label: 'Turno', type: 'select', required: true, options: LISTAS.turnos.map(v => ({ v, t: v })) },
      { name: 'nome', label: 'Nome da turma', full: true, placeholder: 'Ex.: 5º Ano B. Em branco: "5º Ano de Escolaridade"' },
      { name: 'anoLetivo', label: 'Ano letivo', type: 'number', required: true, min: 2000, max: 2100 },
      { name: 'nivel', label: 'Nível', type: 'select', required: true, vazio: false, options: ['Educação Infantil', 'Ensino Fundamental', 'Ensino Médio'].map(v => ({ v, t: v })) },
      { name: 'criterio', label: 'Critério de avaliação', type: 'select', full: true, options: CRITERIOS.map(v => ({ v, t: v })) },
      ...(t ? [{ name: 'finalizada', label: 'Turma finalizada', type: 'checkbox', hint: 'Marque depois do conselho de classe, quando as notas do ano estiverem fechadas.' }] : [])
    ],
    onSave: d => salvarERecarregar(api(t ? `turmas/${t.id}` : 'turmas', { metodo: t ? 'PUT' : 'POST', corpo: d }), t ? 'Turma salva.' : `Turma criada.`)
  });
}
acao('nova-turma', () => formTurma());
acao('turma-editar', el => formTurma(turmaDe(el.dataset.turma)));

rotaComParametro('turma-', 'turmas', 'escola.ver', id => {
  const t = turmaDe(id);
  if (!t) { location.hash = '#turmas'; return; }
  const cad = pode('cadastros'), notas = pode('notas');
  view.innerHTML = html`
    <div class="page-title">
      <div><div class="crumb"><a href="#turmas">Lista de turmas</a> / ${t.etapa}</div><h1>${t.nome}</h1>
        <div class="muted" style="font-size:.9rem;margin-top:4px">${t.nivel} · ${t.turno} · ${t.anoLetivo} · ${plural(t.alunos.length, 'aluno', 'alunos')}${t.finalizada ? ' · Finalizada' : ''}${t.bloqueada ? ' · Lançamentos bloqueados' : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${cad ? html`<button class="btn" data-act="turma-editar" data-turma="${t.id}">${ic('edit')} Editar turma</button>` : ''}
        <button class="btn" data-act="reports" data-turma="${t.id}">${ic('search')} Relatórios</button>
        ${cad ? html`<button class="btn" data-act="novo-aluno" data-turma="${t.id}">+ Matricular aluno</button>` : ''}
        ${pode(['notas', 'relatorios']) ? html`<a class="btn blue" href="#boletim-${t.id}">Boletins da turma</a>` : ''}
      </div>
    </div>
    <div class="home">
      <section class="panel">
        <div class="panel-h">${ic('users')}<h2>Alunos</h2></div>
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Nº</th><th>Aluno</th><th>Nascimento</th><th>Situação</th><th></th></tr></thead>
          <tbody>${t.alunos.length ? t.alunos.map((a, i) => html`<tr>
            <td class="num muted">${String(i + 1).padStart(2, '0')}</td>
            <td style="font-weight:700;text-transform:uppercase;font-size:.86rem">${a.nome}<div class="muted" style="font-weight:400;text-transform:none;font-size:.78rem">Matrícula ${a.mat}</div></td>
            <td class="num">${a.nasc}</td><td>${pillSituacao(a.situacao)}</td>
            <td class="r"><div class="acoes">${cad ? html`<button class="btn sm" data-act="aluno-ficha" data-aluno="${a.id}">Ficha</button>` : ''}${pode(['notas', 'relatorios']) ? html`<a class="btn sm" href="#boletim-${t.id}-${a.id}">Boletim</a>` : ''}</div></td></tr>`) : linhaVazia(5, 'Nenhum aluno nesta turma.')}</tbody>
        </table></div>
      </section>
      <section class="panel">
        <div class="panel-h">${ic('list')}<h2>Disciplinas</h2>${cad ? html`<span class="sp"></span><span class="muted" style="font-size:.8rem">Escolha o professor de cada disciplina</span>` : ''}</div>
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Disciplina</th><th>Professor</th><th>Diário</th></tr></thead>
          <tbody>${t.disciplinas.map(d => html`<tr><td style="font-weight:700">${d.nome}</td>
            <td>${cad ? html`<select class="mini" data-vinculo="${d.id}" aria-label="Professor de ${d.nome}"><option value="">Sem professor</option>${optProfs().map(o => html`<option value="${o.v}" ${o.v === d.profId ? seguro('selected') : ''}>${o.t}</option>`)}</select>`
              : d.prof || html`<span class="pill bad">Sem vínculo</span>`}</td>
            <td>${!d.prof ? '–' : d.entregue ? html`<span class="pill ok">Entregue</span>` : html`<span class="pill warn">Pendente</span>`}
              ${notas && d.prof ? html` <button class="btn sm" data-act="diario-alternar" data-turma="${t.id}" data-disc="${d.id}">${d.entregue ? 'Reabrir' : 'Marcar entregue'}</button>` : ''}</td></tr>`)}</tbody>
        </table></div>
      </section>
    </div>`;
  view.querySelectorAll('[data-vinculo]').forEach(sel => sel.onchange = () => {
    salvarERecarregar(api(`turmas/${t.id}`, { metodo: 'PUT', corpo: { vinculos: [{ disciplinaId: Number(sel.dataset.vinculo), professorId: sel.value ? Number(sel.value) : null }] } }), 'Professor da disciplina atualizado.')
      .catch(e => toast(e.message, 6000));
  });
});
acao('diario-alternar', async el => {
  const t = turmaDe(el.dataset.turma), d = t.disciplinas.find(x => x.id === Number(el.dataset.disc));
  await salvarERecarregar(api(`turmas/${t.id}/diarios/${d.id}`, { metodo: 'PUT', corpo: { entregue: !d.entregue } }), d.entregue ? `Diário de ${d.nome} reaberto.` : `Diário de ${d.nome} marcado como entregue.`);
});

/* ================= Alunos ================= */
const filtroAlunos = { q: '', tu: '', si: 'ativos' };
tela('alunos', 'escola.ver', () => {
  const cad = pode('cadastros');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Cadastro</div><h1>Alunos</h1></div>
      ${cad ? html`<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="#importar">${ic('upload')} Importar planilha</a><button class="btn blue" data-act="novo-aluno">+ Novo aluno</button></div>` : ''}</div>
    <section class="panel">
      <div class="filters">
        <label class="field" for="aNome" style="flex:1;max-width:360px">Nome ou matrícula<input id="aNome" type="search" autocomplete="off"></label>
        <label class="field" for="aTurma">Turma<select id="aTurma"><option value="">Todas</option>${TURMAS.map(t => html`<option value="${t.id}">${t.nome}${t.anoLetivo !== anoAtual() ? ` (${t.anoLetivo})` : ''}</option>`)}</select></label>
        <label class="field" for="aSit">Situação<select id="aSit"><option value="ativos">Ativos</option><option value="">Todas</option>${LISTAS.situacoes.map(s => html`<option value="${s}">${SITUACAO[s]}</option>`)}</select></label>
      </div>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Matrícula</th><th>Aluno</th><th>Turma</th><th>Nascimento</th><th>Situação</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
      <div id="cnt" class="muted" style="padding:12px 16px;font-size:.85rem;border-top:1px solid var(--line)"></div>
    </section>`;
  let limite = 50;
  // os filtros continuam iguais depois de salvar uma ficha (a tela é redesenhada)
  $('aNome').value = filtroAlunos.q; $('aTurma').value = filtroAlunos.tu; $('aSit').value = filtroAlunos.si;
  const draw = () => {
    const q = $('aNome').value.trim().toLowerCase(), tu = $('aTurma').value, si = $('aSit').value;
    Object.assign(filtroAlunos, { q: $('aNome').value, tu, si });
    const list = ALUNOS.filter(a => (!q || a.nome.toLowerCase().includes(q) || String(a.mat).includes(q)) && (!tu || a.turma === Number(tu))
      && (si === 'ativos' ? ATIVO(a) : !si || a.situacao === si)).sort(sortNome);
    $('rows').innerHTML = html`${list.length ? list.slice(0, limite).map(a => html`<tr>
      <td class="num muted">${a.mat}</td><td style="font-weight:700;text-transform:uppercase;font-size:.86rem">${a.nome}</td>
      <td>${turmaDe(a.turma)?.nome || html`<span class="muted">Sem turma</span>`}</td><td class="num">${a.nasc}</td><td>${pillSituacao(a.situacao)}</td>
      <td class="r"><div class="acoes">${cad ? html`<button class="btn sm" data-act="aluno-ficha" data-aluno="${a.id}">Ficha</button>` : ''}${a.turma && pode(['notas', 'relatorios']) ? html`<a class="btn sm" href="#boletim-${a.turma}-${a.id}">Boletim</a>` : ''}</div></td></tr>`) : linhaVazia(6, 'Nenhum aluno encontrado.')}`;
    $('cnt').innerHTML = html`Mostrando ${Math.min(limite, list.length)} de ${list.length} alunos ${list.length > limite ? html` · <button class="btn sm" id="maisAl">Mostrar mais</button>` : ''}`;
    if ($('maisAl')) $('maisAl').onclick = () => { limite += 100; draw(); };
  };
  ['aNome', 'aTurma', 'aSit'].forEach(id => $(id).addEventListener('input', () => { limite = 50; draw(); }));
  draw();
});

const camposAluno = () => [
  { name: 'nome', label: 'Nome completo do aluno', required: true, full: true, minWords: 2, placeholder: 'Ex.: Maria Eduarda Souza Lima' },
  { name: 'nascimento', label: 'Data de nascimento', type: 'date', required: true, max: hojeISO() },
  { name: 'turmaId', label: 'Turma', type: 'select', required: true, options: optTurmas() },
  { name: 'sexo', label: 'Sexo', type: 'select', options: [{ v: 'F', t: 'Feminino' }, { v: 'M', t: 'Masculino' }], vazio: 'Não informado' },
  { name: 'cpf', label: 'CPF do aluno', placeholder: '000.000.000-00', inputmode: 'numeric' },
  { name: 'naturalidade', label: 'Naturalidade', placeholder: 'Cidade / UF' },
  { name: 'endereco', label: 'Endereço', full: true },
  { name: 'observacoes', label: 'Observações (saúde, alergias, autorizações)', type: 'textarea', full: true }
];
const campoConsentimento = { name: 'consentimentoBiometria', label: 'O responsável autorizou o uso da foto do rosto do aluno na catraca (biometria facial)', type: 'checkbox',
  hint: 'Exigência da LGPD para dados biométricos de menores. Guarde o termo assinado pelo responsável. Sem a autorização, o aluno entra só por cartão ou senha.' };

function formAluno(turmaId, depois, inicial = {}) {
  openForm({
    title: 'Novo aluno', sub: `Ano letivo ${anoAtual()} · a matrícula é gerada automaticamente`, submit: 'Matricular aluno', largura: 760,
    values: { turmaId, ...inicial },
    fields: [
      ...camposAluno(),
      { type: 'titulo', name: '_r', label: 'Responsável' },
      { name: 'rNome', label: 'Nome do responsável', required: true, full: true, minWords: 2 },
      { name: 'rParentesco', label: 'Parentesco', type: 'select', required: true, options: LISTAS.parentescos.map(v => ({ v, t: v })) },
      { name: 'rTel', label: 'Telefone', type: 'tel', required: true, placeholder: '(21) 99999-0000' },
      { name: 'rEmail', label: 'E-mail do responsável', type: 'email', placeholder: 'nome@email.com' },
      { name: 'rCpf', label: 'CPF do responsável', placeholder: '000.000.000-00', inputmode: 'numeric' },
      campoConsentimento
    ],
    onSave: async d => {
      const r = await api('alunos', { metodo: 'POST', corpo: {
        nome: d.nome, nascimento: d.nascimento, turmaId: d.turmaId, sexo: d.sexo, cpf: d.cpf, naturalidade: d.naturalidade, endereco: d.endereco, observacoes: d.observacoes,
        consentimentoBiometria: d.consentimentoBiometria, responsavel: { nome: d.rNome, parentesco: d.rParentesco, tel: d.rTel, email: d.rEmail, cpf: d.rCpf }
      } });
      await carregarDados(); route();
      toast(`${d.nome} matriculado(a). Matrícula ${r.matricula}.`);
      if (depois) setTimeout(() => depois(alunoDe(r.id)));
    }
  });
}
acao('novo-aluno', el => formAluno(el.dataset.turma ? Number(el.dataset.turma) : ''));

function fichaAluno(a) {
  const resps = RESP.filter(r => r.alunoId === a.id);
  const form = openForm({
    title: 'Ficha do aluno', sub: `Matrícula ${a.mat}${a.consentimentoEm ? ` · biometria autorizada em ${dataHoraBR(a.consentimentoEm)}` : ''}`, submit: 'Salvar', largura: 760,
    values: { ...a, turmaId: a.turma },
    fields: [
      ...camposAluno(),
      { name: 'situacao', label: 'Situação', type: 'select', required: true, vazio: false, options: LISTAS.situacoes.map(s => ({ v: s, t: SITUACAO[s] })),
        hint: 'Transferido ou cancelado: o aluno sai automaticamente da catraca.' },
      campoConsentimento
    ],
    note: html`<b>Responsáveis:</b> ${resps.length ? resps.map((r, i) => html`${i ? ', ' : ''}${r.nome} (${r.parentesco}, ${r.tel})`) : 'nenhum'} · <a href="#responsaveis" data-close>gerenciar responsáveis</a>`,
    extraBotoes: html`<button type="button" class="btn red" id="exclAluno" style="margin-right:auto">Excluir aluno</button>`,
    onSave: d => salvarERecarregar(api(`alunos/${a.id}`, { metodo: 'PUT', corpo: d }), 'Ficha do aluno salva.')
  });
  form.querySelector('#exclAluno').onclick = async () => {
    const ok = await confirmar('Excluir o aluno e todos os dados dele?', `${a.nome} (matrícula ${a.mat}): notas, faltas, responsáveis e cadastro na catraca serão apagados para sempre. Se o aluno só saiu da escola, prefira mudar a situação para "Transferido".`, { botao: 'Excluir para sempre', perigo: true });
    if (ok) await salvarERecarregar(api(`alunos/${a.id}`, { metodo: 'DELETE' }), `${a.nome} excluído(a).`).catch(e => toast(e.message, 6000));
  };
}
acao('aluno-ficha', el => fichaAluno(alunoDe(el.dataset.aluno)));

/* ================= Responsáveis ================= */
tela('responsaveis', 'escola.ver', () => {
  const cad = pode('cadastros');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Cadastro</div><h1>Responsáveis</h1></div>
      ${cad ? html`<button class="btn blue" data-act="novo-resp">+ Novo responsável</button>` : ''}</div>
    <section class="panel">
      <div class="filters"><label class="field" for="rNome" style="flex:1;max-width:360px">Nome do responsável ou do aluno<input id="rNome" type="search" autocomplete="off"></label></div>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Responsável</th><th>Parentesco</th><th>Aluno</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
      <div id="cnt" class="muted" style="padding:12px 16px;font-size:.85rem;border-top:1px solid var(--line)"></div>
    </section>`;
  const draw = () => {
    const q = $('rNome').value.trim().toLowerCase();
    const list = RESP.map(r => ({ ...r, al: alunoDe(r.alunoId) })).filter(r => r.al && (!q || r.nome.toLowerCase().includes(q) || r.al.nome.toLowerCase().includes(q))).sort(sortNome);
    $('rows').innerHTML = html`${list.length ? list.slice(0, 60).map(r => html`<tr>
      <td style="font-weight:700">${r.nome}</td><td>${r.parentesco}</td>
      <td>${r.al.nome}<div class="muted" style="font-size:.78rem">${turmaDe(r.al.turma)?.nome || ''}</div></td>
      <td class="num">${r.tel}</td><td class="muted">${r.email || '–'}</td>
      <td class="r">${cad ? html`<button class="btn sm" data-act="resp-editar" data-id="${r.id}">Editar</button>` : ''}</td></tr>`) : linhaVazia(6, 'Nenhum responsável encontrado.')}`;
    $('cnt').textContent = `Mostrando ${Math.min(60, list.length)} de ${list.length} responsáveis`;
  };
  $('rNome').oninput = draw;
  draw();
});
function formResp(r) {
  openForm({
    title: r ? 'Editar responsável' : 'Novo responsável', sub: r ? r.nome : 'Vincule o responsável a um aluno já matriculado', submit: 'Salvar',
    values: r || {},
    fields: [
      { name: 'nome', label: 'Nome completo', required: true, full: true, minWords: 2 },
      { name: 'alunoId', label: 'Aluno', type: 'select', required: true, full: true, options: [...ALUNOS].filter(a => ATIVO(a) || (r && a.id === r.alunoId)).sort(sortNome).map(a => ({ v: a.id, t: `${a.nome} · ${turmaDe(a.turma)?.nome || 'sem turma'}` })) },
      { name: 'parentesco', label: 'Parentesco', type: 'select', required: true, options: LISTAS.parentescos.map(v => ({ v, t: v })) },
      { name: 'tel', label: 'Telefone', type: 'tel', required: true, placeholder: '(21) 99999-0000' },
      { name: 'email', label: 'E-mail', type: 'email', placeholder: 'nome@email.com' },
      { name: 'cpf', label: 'CPF', placeholder: '000.000.000-00', inputmode: 'numeric' }
    ],
    extraBotoes: r ? html`<button type="button" class="btn red" id="exclResp" style="margin-right:auto">Excluir</button>` : '',
    onSave: d => salvarERecarregar(api(r ? `responsaveis/${r.id}` : 'responsaveis', { metodo: r ? 'PUT' : 'POST', corpo: d }), r ? 'Responsável salvo.' : `Responsável ${d.nome} cadastrado(a).`)
  });
  if (r) $('exclResp').onclick = async () => {
    if (await confirmar('Excluir responsável?', `${r.nome} deixa de estar vinculado ao aluno.`, { botao: 'Excluir', perigo: true }))
      await salvarERecarregar(api(`responsaveis/${r.id}`, { metodo: 'DELETE' }), 'Responsável excluído.').catch(e => toast(e.message, 6000));
  };
}
acao('novo-resp', () => formResp());
acao('resp-editar', el => formResp(RESP.find(r => r.id === Number(el.dataset.id))));

/* ================= Professores ================= */
tela('professores', 'escola.ver', () => {
  const cad = pode('cadastros');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Cadastro</div><h1>Professores</h1></div>
      ${cad ? html`<button class="btn blue" data-act="novo-prof">+ Novo professor</button>` : ''}</div>
    <section class="panel"><div class="table-wrap"><table class="t">
      <thead><tr><th>Professor</th><th>Disciplinas</th><th>Turmas</th><th>Contato</th><th></th></tr></thead>
      <tbody>${PROFS.length ? [...PROFS].sort(sortNome).map(p => html`<tr>
        <td style="font-weight:700">${p.nome}${p.ativo === 0 ? html` <span class="pill todo">Inativo</span>` : ''}</td>
        <td>${p.disc.join(', ') || html`<span class="muted">–</span>`}</td>
        <td class="muted">${p.turmas.length > 3 ? `${p.turmas.length} turmas` : p.turmas.join(', ') || '–'}</td>
        <td><div>${p.email || ''}</div><div class="muted num" style="font-size:.82rem">${p.tel || ''}</div></td>
        <td class="r">${cad ? html`<button class="btn sm" data-act="prof-editar" data-id="${p.id}">Editar</button>` : ''}</td></tr>`) : linhaVazia(5, 'Nenhum professor cadastrado.')}</tbody>
    </table></div></section>`;
});
function formProf(p) {
  const ano = anoAtual();
  const semProf = [...new Set(TURMAS.filter(t => t.anoLetivo === ano).flatMap(t => t.disciplinas.filter(d => !d.prof).map(d => d.nome)))];
  openForm({
    title: p ? 'Editar professor' : 'Novo professor', sub: p ? p.nome : 'Dados de contato e disciplinas que leciona', submit: 'Salvar',
    values: p ? { ...p, ativo: p.ativo !== 0 } : {},
    fields: [
      { name: 'nome', label: 'Nome completo', required: true, full: true, minWords: 2 },
      { name: 'email', label: 'E-mail', type: 'email', placeholder: 'nome@escola.com.br' },
      { name: 'tel', label: 'Telefone', type: 'tel', placeholder: '(21) 99999-0000' },
      ...(p ? [{ name: 'ativo', label: 'Professor ativo', type: 'checkbox', hint: 'Desmarque se o professor saiu da escola. O histórico dele continua guardado.' }]
        : [{ name: 'disciplinas', label: 'Disciplinas', type: 'checks', options: DISC.map(d => ({ v: d.id, t: d.nome })) }])
    ],
    note: p ? 'Para trocar as turmas e disciplinas do professor, abra a turma em Lista de turmas e escolha o professor de cada disciplina.'
      : semProf.length ? `Disciplinas sem professor hoje: ${semProf.join(', ')}. Se marcar alguma delas, o professor é vinculado automaticamente às turmas que estão sem professor.` : '',
    extraBotoes: p ? html`<button type="button" class="btn red" id="exclProf" style="margin-right:auto">Excluir</button>` : '',
    onSave: d => salvarERecarregar(api(p ? `professores/${p.id}` : 'professores', { metodo: p ? 'PUT' : 'POST', corpo: { ...d, disciplinas: (d.disciplinas || []).map(Number) } }),
      r => p ? 'Professor salvo.' : `Professor(a) ${d.nome} cadastrado(a)${r.vinculadas ? ` e vinculado(a) a ${plural(r.vinculadas, 'disciplina', 'disciplinas')}` : ''}.`)
  });
  if (p) $('exclProf').onclick = async () => {
    if (await confirmar('Excluir professor?', `${p.nome} será excluído e as disciplinas dele ficam sem professor. Se ele só saiu da escola, prefira desmarcar "Professor ativo".`, { botao: 'Excluir', perigo: true }))
      await salvarERecarregar(api(`professores/${p.id}`, { metodo: 'DELETE' }), 'Professor excluído.').catch(e => toast(e.message, 6000));
  };
}
acao('novo-prof', () => formProf());
acao('prof-editar', el => formProf(profDe(el.dataset.id)));

/* ================= Disciplinas ================= */
tela('disciplinas', 'escola.ver', () => {
  const cad = pode('cadastros'), ano = anoAtual();
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Disciplinas</h1></div>
      ${cad ? html`<button class="btn blue" data-act="nova-disc">+ Nova disciplina</button>` : ''}</div>
    <section class="panel"><div class="table-wrap"><table class="t">
      <thead><tr><th>Disciplina</th><th>Carga horária anual</th><th>Turmas ${ano}</th><th>Professores</th><th></th></tr></thead>
      <tbody>${DISC.map(d => {
        const ts = TURMAS.filter(t => t.anoLetivo === ano && t.disciplinas.some(x => x.id === d.id));
        const profs = [...new Set(ts.map(t => t.disciplinas.find(x => x.id === d.id).prof).filter(Boolean))];
        return html`<tr><td style="font-weight:700">${d.nome}</td><td class="num">${d.carga} h</td><td>${ts.length}</td><td class="muted">${profs.join(', ') || '–'}</td>
          <td class="r">${cad ? html`<button class="btn sm" data-act="disc-editar" data-id="${d.id}">Editar</button>` : ''}</td></tr>`;
      })}</tbody>
    </table></div></section>`;
});
function formDisc(d) {
  openForm({
    title: d ? 'Editar disciplina' : 'Nova disciplina', sub: d ? d.nome : 'A disciplina é incluída em todas as turmas do ano letivo atual.', submit: 'Salvar',
    values: d || { carga: 80 },
    fields: [
      { name: 'nome', label: 'Nome da disciplina', required: true, full: true },
      { name: 'carga', label: 'Carga horária anual (horas)', type: 'number', required: true, min: 0, max: 2000 }
    ],
    extraBotoes: d ? html`<button type="button" class="btn red" id="exclDisc" style="margin-right:auto">Excluir</button>` : '',
    onSave: v => salvarERecarregar(api(d ? `disciplinas/${d.id}` : 'disciplinas', { metodo: d ? 'PUT' : 'POST', corpo: { nome: v.nome, carga: Number(v.carga) } }), 'Disciplina salva.')
  });
  if (d) $('exclDisc').onclick = async () => {
    if (await confirmar('Excluir disciplina?', `${d.nome} sai de todas as turmas. Só é possível se ainda não houver notas lançadas.`, { botao: 'Excluir', perigo: true }))
      await salvarERecarregar(api(`disciplinas/${d.id}`, { metodo: 'DELETE' }), 'Disciplina excluída.').catch(e => toast(e.message, 6000));
  };
}
acao('nova-disc', () => formDisc());
acao('disc-editar', el => formDisc(discDe(el.dataset.id)));

/* ================= Diários ================= */
tela('diarios', 'escola.ver', () => {
  const ano = anoAtual(), notas = pode('notas');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Diários ${ano}</h1></div></div>
    <section class="panel">
      <div class="filters"><label class="field" for="dSit">Situação<select id="dSit"><option value="">Todos</option><option value="p">Pendentes</option><option value="e">Entregues</option></select></label>
        <label class="field" for="dTurma">Turma<select id="dTurma"><option value="">Todas</option>${TURMAS.filter(t => t.anoLetivo === ano).map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label></div>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Professor</th><th>Disciplina</th><th>Turma</th><th>Situação</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
    </section>`;
  const draw = () => {
    const s = $('dSit').value, tu = Number($('dTurma').value);
    const lista = TURMAS.filter(t => t.anoLetivo === ano && (!tu || t.id === tu)).flatMap(t => t.disciplinas.filter(d => d.prof).map(d => ({ ...d, t })))
      .filter(d => !s || (s === 'p' ? !d.entregue : d.entregue)).sort((a, b) => a.entregue - b.entregue || a.prof.localeCompare(b.prof, 'pt-BR'));
    $('rows').innerHTML = html`${lista.length ? lista.map(d => html`<tr><td style="font-weight:700">${d.prof}</td><td>${d.nome}</td><td>${d.t.nome}</td>
      <td>${d.entregue ? html`<span class="pill ok">Entregue</span>` : html`<span class="pill warn">Pendente</span>`}</td>
      <td class="r"><div class="acoes">${notas ? html`<a class="btn sm" href="#notas-${d.t.id}-${d.id}">Notas</a><button class="btn sm" data-act="diario-alternar" data-turma="${d.t.id}" data-disc="${d.id}">${d.entregue ? 'Reabrir' : 'Marcar entregue'}</button>` : ''}</div></td></tr>`)
      : linhaVazia(5, 'Nenhum diário encontrado.')}`;
  };
  ['dSit', 'dTurma'].forEach(id => $(id).onchange = draw);
  draw();
});

/* Meus diários (professor) */
tela('meus-diarios', 'notas.proprias', () => {
  const pid = SESSAO.usuario.professorId;
  const lista = TURMAS.flatMap(t => t.disciplinas.filter(d => d.profId === pid).map(d => ({ ...d, t })));
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Pedagógico / Professor</div><h1>Meus diários</h1></div></div>
    <section class="panel"><div class="table-wrap"><table class="t">
      <thead><tr><th>Turma</th><th>Disciplina</th><th>Alunos</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.length ? lista.map(d => html`<tr><td style="font-weight:700">${d.t.nome}<div class="muted" style="font-weight:400;font-size:.8rem">${d.t.turno} · ${d.t.anoLetivo}</div></td><td>${d.nome}</td><td>${d.t.alunos.filter(ATIVO).length}</td>
        <td>${d.entregue ? html`<span class="pill ok">Entregue</span>` : d.t.bloqueada || d.t.finalizada ? html`<span class="pill todo">Bloqueado</span>` : html`<span class="pill warn">Em aberto</span>`}</td>
        <td class="r"><div class="acoes"><a class="btn sm" href="#notas-${d.t.id}-${d.id}">${d.entregue || d.t.bloqueada ? 'Ver notas' : 'Lançar notas'}</a>
          ${!d.entregue && !d.t.bloqueada && !d.t.finalizada ? html`<button class="btn sm blue" data-act="diario-entregar" data-turma="${d.t.id}" data-disc="${d.id}">Entregar diário</button>` : ''}</div></td></tr>`)
        : linhaVazia(5, 'Nenhuma disciplina vinculada a você. Peça à secretaria para vincular suas turmas.')}</tbody>
    </table></div></section>`;
});
acao('diario-entregar', async el => {
  const t = turmaDe(el.dataset.turma), d = t.disciplinas.find(x => x.id === Number(el.dataset.disc));
  if (!await confirmar('Entregar o diário?', `${d.nome} · ${t.nome}. Depois de entregue, só a secretaria pode reabrir para alterar notas e faltas.`, { botao: 'Entregar' })) return;
  await salvarERecarregar(api(`turmas/${t.id}/diarios/${d.id}`, { metodo: 'PUT', corpo: { entregue: true } }), 'Diário entregue.');
});

/* ================= Boletim ================= */
function boletimHTML(a, t) {
  const tf = faltasAluno(a), carga = cargaTotal();
  const bimHead = [1, 2, 3, 4].map((n, i) => html`<th colspan="6" class="${i % 2 ? 'bim-alt' : ''}">${n}º BIM</th>`);
  const sub = [0, 1, 2, 3].map(i => html`${['AT', 'TBL', 'TESTE', 'PRO', 'RP'].map(s => html`<th class="${i % 2 ? 'bim-alt' : ''}">${s}</th>`)}<th class="med">Média</th>`);
  const cell = (v, alt, med) => html`<td class="${alt ? 'bim-alt' : ''} ${med ? 'med' : ''} ${med && v != null && v < 6 ? 'low' : ''}">${fmt(v)}</td>`;
  return html`
  <article class="bol">
    <div class="bol-title">Boletim ${t.anoLetivo} · ${t.nivel} · ${t.etapa} · Turma: ${t.nome}</div>
    <div class="bol-aluno"><span>Aluno: <b>${a.nome}</b></span><span>Matrícula: <b class="num">${a.mat}</b></span><span>Data de nasc.: <b class="num">${a.nasc}</b></span></div>
    <div class="table-wrap"><table class="b">
      <thead>
        <tr><th rowspan="2" class="dis">Disciplina</th>${bimHead}<th rowspan="2" class="med">Média<br>anual</th><th rowspan="2" class="med">Média<br>final</th><th rowspan="2">Total<br>faltas</th></tr>
        <tr>${sub}</tr>
      </thead>
      <tbody>${t.disciplinas.map(d => {
        const bs = a.notas[d.id] || [], ma = mediaAnual(a, d.id);
        return html`<tr>
          <td class="dis"><b>${d.nome}</b><small>${d.prof || 'sem professor'}</small></td>
          ${[0, 1, 2, 3].map(i => { const b = bs[i] || {}; return html`${cell(b.at, i % 2)}${cell(b.tbl, i % 2)}${cell(b.te, i % 2)}${cell(b.pr, i % 2)}${cell(b.rp, i % 2)}${cell(mediaBim(bs[i]), i % 2, true)}`; })}
          <td class="med ${ma != null && ma < 6 ? 'low' : ''}">${fmt(ma)}</td>
          <td class="med fin ${ma != null && ma < 6 ? 'low' : ''}">${fmt(ma)}</td><td>${faltasDisc(a, d.id)}</td>
        </tr>`; })}</tbody>
    </table></div>
    <div class="bol-foot">
      <div class="sit">Situação atual: <b>${(SITUACAO[a.situacao] || a.situacao).toUpperCase()}</b><br>Data de impressão: ${new Date().toLocaleDateString('pt-BR')}</div>
      <div class="mid">Porcentagem de faltas em relação à carga horária: <b>${(tf / carga * 100).toFixed(1).replace('.', ',')}%</b> (máximo permitido: 25%)</div>
      <div><b>Total de faltas: ${tf || '–'}</b></div>
    </div>
  </article>`;
}
function telaBoletim(arg) {
  const [tid, aid] = (arg || '').split('-');
  const t = turmaDe(tid) || TURMAS.find(x => x.anoLetivo === anoAtual()) || TURMAS[0];
  if (!t) { soon('Boletins', 'Cadastre turmas e alunos para ver os boletins.'); return; }
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb"><a href="#turmas">Lista de turmas</a> / Boletins</div><h1>Boletim de notas por turma</h1></div>
      <button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div>
    <section class="panel no-print"><div class="filters">
      <label class="field" for="bTurma">Turma<select id="bTurma">${TURMAS.map(x => html`<option value="${x.id}" ${x === t ? seguro('selected') : ''}>${x.nome} (${x.anoLetivo})</option>`)}</select></label>
      <label class="field" for="bAluno">Aluno<select id="bAluno" style="max-width:300px"><option value="">Todos os alunos (${t.alunos.length})</option>${t.alunos.map(x => html`<option value="${x.id}" ${String(x.id) === aid ? seguro('selected') : ''}>${x.nome}</option>`)}</select></label>
      <label class="field" for="bStatus">Situação<select id="bStatus"><option value="">Todas</option><option value="ativos">Só ativos</option></select></label>
      <span class="muted" style="font-size:.84rem;padding-bottom:9px">Notas abaixo de 6,0 aparecem em vermelho.</span>
    </div></section>
    <div id="bols" style="display:flex;flex-direction:column;gap:22px"></div>`;
  const draw = () => {
    const sel = $('bAluno').value, st = $('bStatus').value;
    const list = sel ? [alunoDe(sel)] : t.alunos.filter(a => !st || ATIVO(a));
    $('bols').innerHTML = html`${list.length ? list.map(a => boletimHTML(a, t)) : html`<section class="panel vazio">Nenhum aluno nesta turma.</section>`}`;
  };
  $('bTurma').onchange = e => { location.hash = '#boletim-' + e.target.value; };
  $('bAluno').onchange = draw; $('bStatus').onchange = draw;
  draw();
}
rotaComParametro('boletim', 'boletim', ['notas', 'relatorios'], arg => telaBoletim(arg.replace(/^-/, '')));
acao('imprimir', () => window.print());

/* ================= Central de relatórios ================= */
let favs = new Set(['ata', 'boletim', 'ficha', 'assinatura', 'relacao']);
try { const s = localStorage.getItem('favs'); if (s) favs = new Set(JSON.parse(s)); } catch (e) { /* sem armazenamento */ }
const saveFavs = () => { try { localStorage.setItem('favs', JSON.stringify([...favs])); } catch (e) { /* sem armazenamento */ } };
const RELATORIOS = [
  { id: 'ata', nome: 'Ata de resultados finais', go: t => `#rel-ata-${t}` },
  { id: 'boletim', nome: 'Boletim de notas por turma', go: t => `#boletim-${t}` },
  { id: 'ficha', nome: 'Ficha individual com carga horária', go: t => `#rel-ficha-${t}` },
  { id: 'assinatura', nome: 'Relação de alunos com espaço para assinatura', go: t => `#rel-assinatura-${t}` },
  { id: 'relacao', nome: 'Relação de alunos por turma', go: t => `#rel-relacao-${t}` },
  { id: 'acomp', nome: 'Acompanhamento de diários', go: () => '#diarios' },
  { id: 'contatos', nome: 'Contatos dos responsáveis por turma', go: t => `#rel-contatos-${t}` }
];
function relTable(tid) {
  const list = [...RELATORIOS].sort((x, y) => favs.has(y.id) - favs.has(x.id));
  return html`<table class="rel"><thead><tr><th></th><th>Nome</th><th>Ação</th></tr></thead><tbody>${list.map(r => html`
    <tr>
      <td><button class="star ${favs.has(r.id) ? 'on' : ''}" data-act="fav" data-rep="${r.id}" data-turma="${tid}" aria-pressed="${favs.has(r.id)}" aria-label="Favoritar ${r.nome}">${ic('star')}</button></td>
      <td>${r.nome}</td>
      <td><button class="lupa" data-act="gen" data-rep="${r.id}" data-turma="${tid}" aria-label="Visualizar ${r.nome}">${ic('search')}</button></td>
    </tr>`)}</tbody></table>`;
}
tela('relatorios', 'relatorios', () => {
  view.innerHTML = html`
    <div class="page-title"><div><h1>Central de relatórios</h1></div></div>
    <section class="panel">
      <div class="filters"><label class="field" for="rTurma">Turma<select id="rTurma">${TURMAS.map(t => html`<option value="${t.id}">${t.nome} (${t.anoLetivo})</option>`)}</select></label></div>
      <div style="padding:0 20px 16px" id="repList"></div>
    </section>`;
  const draw = () => { $('repList').innerHTML = relTable($('rTurma').value); };
  $('rTurma').onchange = draw;
  draw();
});
acao('reports', el => {
  const t = turmaDe(el.dataset.turma);
  modal({ titulo: 'Relatórios da turma', sub: `${t.nome} · ${t.turno}`, corpo: html`<div id="mBody">${relTable(t.id)}</div>`, rodape: html`<button class="btn blue" data-close>Fechar</button>` });
});
acao('fav', el => {
  const id = el.dataset.rep; favs.has(id) ? favs.delete(id) : favs.add(id); saveFavs();
  ['mBody', 'repList'].forEach(x => { const n = $(x); if (n) n.innerHTML = relTable(el.dataset.turma); });
});
acao('gen', el => {
  const r = RELATORIOS.find(x => x.id === el.dataset.rep);
  closeLayer();
  location.hash = r.go(el.dataset.turma);
});

/* ----- relatórios imprimíveis ----- */
function cabecalhoRel(titulo, t) {
  return html`<div class="page-title"><div><div class="crumb"><a href="#relatorios">Central de relatórios</a> / ${t.nome}</div><h1>${titulo}</h1></div>
    <button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div>
    <div class="so-impressao"><b>${SESSAO.escola.nome}</b> · ${titulo} · ${t.nome} · ${t.turno} · ${t.anoLetivo} · impresso em ${new Date().toLocaleDateString('pt-BR')}</div>`;
}
rotaComParametro('rel-', 'relatorios', 'relatorios', arg => {
  const [tipo, tid] = arg.split('-'), t = turmaDe(tid);
  if (!t) { location.hash = '#relatorios'; return; }
  const alunos = t.alunos;
  if (tipo === 'relacao' || tipo === 'assinatura') {
    view.innerHTML = html`${cabecalhoRel(tipo === 'relacao' ? 'Relação de alunos por turma' : 'Relação de alunos com espaço para assinatura', t)}
      <section class="panel"><div class="table-wrap"><table class="t">
        <thead><tr><th>Nº</th><th>Matrícula</th><th>Aluno</th><th>Nascimento</th>${tipo === 'relacao' ? html`<th>Situação</th>` : html`<th style="width:40%">Assinatura</th>`}</tr></thead>
        <tbody>${alunos.map((a, i) => html`<tr><td class="num">${String(i + 1).padStart(2, '0')}</td><td class="num">${a.mat}</td><td style="font-weight:700">${a.nome}</td><td class="num">${a.nasc}</td>
          ${tipo === 'relacao' ? html`<td>${SITUACAO[a.situacao]}</td>` : html`<td style="border-bottom:1px solid var(--ink)"></td>`}</tr>`)}</tbody>
      </table></div></section>`;
  } else if (tipo === 'contatos') {
    view.innerHTML = html`${cabecalhoRel('Contatos dos responsáveis', t)}
      <section class="panel"><div class="table-wrap"><table class="t">
        <thead><tr><th>Aluno</th><th>Responsável</th><th>Parentesco</th><th>Telefone</th><th>E-mail</th></tr></thead>
        <tbody>${alunos.flatMap(a => { const rs = RESP.filter(r => r.alunoId === a.id); return (rs.length ? rs : [null]).map((r, i) => html`<tr><td style="font-weight:700">${i ? '' : a.nome}</td>
          <td>${r ? r.nome : html`<span class="muted">Sem responsável</span>`}</td><td>${r ? r.parentesco : ''}</td><td class="num">${r ? r.tel : ''}</td><td>${r ? r.email : ''}</td></tr>`); })}</tbody>
      </table></div></section>`;
  } else if (tipo === 'ata') {
    view.innerHTML = html`${cabecalhoRel('Ata de resultados finais', t)}
      <section class="panel"><div class="table-wrap"><table class="b">
        <thead><tr><th class="dis">Aluno</th>${t.disciplinas.map(d => html`<th title="${d.nome}">${d.nome.split(' ').map(w => w[0]).join('').toUpperCase()}</th>`)}<th>Faltas</th><th>Resultado</th></tr></thead>
        <tbody>${alunos.map(a => html`<tr><td class="dis"><b>${a.nome}</b><small>Matrícula ${a.mat}</small></td>
          ${t.disciplinas.map(d => { const m = mediaAnual(a, d.id); return html`<td class="${m != null && m < 6 ? 'low' : ''}">${fmt(m)}</td>`; })}
          <td>${faltasAluno(a)}</td><td><b>${(SITUACAO[a.situacao] || '').toUpperCase()}</b></td></tr>`)}</tbody>
      </table></div>
      <p class="muted" style="padding:12px 16px;font-size:.82rem;margin:0">Legenda: ${t.disciplinas.map((d, i) => html`${i ? ' · ' : ''}${d.nome.split(' ').map(w => w[0]).join('').toUpperCase()} = ${d.nome}`)}</p></section>`;
  } else if (tipo === 'ficha') {
    const carga = cargaTotal();
    view.innerHTML = html`${cabecalhoRel('Ficha individual com carga horária', t)}
      ${alunos.map(a => html`<article class="bol"><div class="bol-title">${a.nome} · Matrícula ${a.mat}</div>
        <div class="table-wrap"><table class="b"><thead><tr><th class="dis">Disciplina</th><th>Carga horária</th><th>1º</th><th>2º</th><th>3º</th><th>4º</th><th class="med">Média anual</th><th>Faltas</th><th>% faltas</th></tr></thead>
        <tbody>${t.disciplinas.map(d => { const dd = discDe(d.id), f = faltasDisc(a, d.id), ma = mediaAnual(a, d.id); return html`<tr><td class="dis"><b>${d.nome}</b></td><td>${dd ? dd.carga : ''} h</td>
          ${[0, 1, 2, 3].map(i => html`<td>${fmt(mediaBim((a.notas[d.id] || [])[i]))}</td>`)}<td class="med ${ma != null && ma < 6 ? 'low' : ''}">${fmt(ma)}</td><td>${f}</td><td>${dd && dd.carga ? (f / dd.carga * 100).toFixed(1).replace('.', ',') + '%' : '–'}</td></tr>`; })}</tbody></table></div>
        <div class="bol-foot"><div class="sit">Situação: <b>${(SITUACAO[a.situacao] || '').toUpperCase()}</b></div><div class="mid">Carga horária total: <b>${carga} h</b></div><div><b>Faltas: ${faltasAluno(a)}</b></div></div></article>`)}`;
  } else location.hash = '#relatorios';
});
