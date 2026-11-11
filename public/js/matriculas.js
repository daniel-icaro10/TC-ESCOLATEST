'use strict';
/* =====================================================================
   Matrículas do ano, rematrícula (virada de ano) e pré-matrícula.
   ===================================================================== */
const STATUS_PRE = { nova: ['Nova', 'warn'], contatada: ['Contatada', 'doing'], aprovada: ['Aprovada', 'ok'], recusada: ['Recusada', 'bad'], matriculada: ['Matriculada', 'ok'], desistiu: ['Desistiu', 'todo'] };
const pillPre = s => html`<span class="pill ${(STATUS_PRE[s] || [])[1] || 'todo'}">${(STATUS_PRE[s] || [s])[0]}</span>`;

/* ================= Matrículas do ano ================= */
tela('matriculas', 'matriculas', async () => {
  const ano = anoAtual();
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Matrículas</div><h1>Matrículas</h1></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="#pre-matricula">Pré-matrículas</a>${pode('cadastros') ? html`<button class="btn blue" data-act="novo-aluno">+ Nova matrícula</button>` : ''}</div></div>
    <section class="panel"><div class="filters">
      <label class="field" for="mAno">Ano letivo<select id="mAno">${[ano + 1, ano, ano - 1, ano - 2].map(a => html`<option value="${a}" ${a === ano ? seguro('selected') : ''}>${a}</option>`)}</select></label>
      <label class="field" for="mTipo">Tipo<select id="mTipo"><option value="">Todas</option><option value="nova">Alunos novos</option><option value="re">Rematrículas</option></select></label>
      <label class="field" for="mBusca" style="flex:1;max-width:320px">Nome ou matrícula<input id="mBusca" type="search"></label>
    </div><div class="resumo" id="mKpis"></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Matrícula</th><th>Aluno</th><th>Turma</th><th>Tipo</th><th>Situação</th><th>Data</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  let lista = [];
  const draw = () => {
    const tipo = $('mTipo').value, q = $('mBusca').value.trim().toLowerCase();
    const l = lista.filter(m => (!tipo || (tipo === 'nova' ? !m.anosAntes : m.anosAntes)) && (!q || m.nome.toLowerCase().includes(q) || String(m.matricula).includes(q)));
    $('mKpis').innerHTML = html`<div class="kpi"><span>Matrículas</span><b>${lista.length}</b></div><div class="kpi"><span>Alunos novos</span><b>${lista.filter(m => !m.anosAntes).length}</b></div>
      <div class="kpi"><span>Rematrículas</span><b>${lista.filter(m => m.anosAntes).length}</b></div><div class="kpi"><span>Saíram (transf./canc.)</span><b>${lista.filter(m => ['transferido', 'cancelado'].includes(m.situacao)).length}</b></div>`;
    $('rows').innerHTML = html`${l.length ? l.slice(0, 300).map(m => html`<tr><td class="num">${m.matricula}</td><td style="font-weight:700">${m.nome}</td><td>${m.turma || '–'}</td>
      <td>${m.anosAntes ? html`<span class="pill doing">Rematrícula</span>` : html`<span class="pill new">Aluno novo</span>`}</td><td>${pillSituacao(m.situacao)}</td><td class="num muted">${dataHoraBR(m.criadoEm).slice(0, 10)}</td></tr>`)
      : linhaVazia(6, 'Nenhuma matrícula encontrada.')}`;
  };
  const carregar = async () => {
    $('rows').innerHTML = html`${linhaVazia(6, 'Carregando…')}`;
    try { lista = await api(`matriculas?ano=${$('mAno').value}`); draw(); } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; }
  };
  $('mAno').onchange = carregar; $('mTipo').onchange = draw; $('mBusca').oninput = draw;
  carregar();
});

/* ================= Rematrícula ================= */
tela('rematriculas', 'matriculas', () => {
  const ano = anoAtual(), prox = ano + 1;
  const origem = TURMAS.filter(t => t.anoLetivo === ano), destino = TURMAS.filter(t => t.anoLetivo === prox);
  const maxSerie = Math.max(0, ...TURMAS.map(t => t.serie));
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Matrículas</div><h1>Rematrícula ${ano} → ${prox}</h1></div></div>
    <section class="panel"><ul class="steps">
      <li><span class="st">${destino.length ? doneIco : todoIco}</span><p><b>1. Turmas de ${prox}:</b> ${destino.length ? `${plural(destino.length, 'turma cadastrada', 'turmas cadastradas')}.` : `ainda não há turmas de ${prox}.`}
        Copie as turmas de ${ano} (com os professores) ou crie em Lista de turmas.</p>${pode('cadastros') ? html`<button class="btn sm" data-act="copiar-turmas" data-de="${ano}" data-para="${prox}">Copiar turmas de ${ano}</button>` : ''}</li>
      <li><span class="st">${spinner}</span><p><b>2. Situação final:</b> marque cada aluno de ${ano} como Aprovado ou Reprovado (na ficha do aluno). O sistema sugere a turma de destino por ela.</p><a class="btn sm" href="#alunos">Alunos</a></li>
      <li><span class="st">${todoIco}</span><p><b>3. Rematricular:</b> escolha a turma de ${ano}, confira o destino de cada aluno e clique em Rematricular. Depois, em Configurações, mude o ano letivo para ${prox}.</p><span></span></li>
    </ul></section>
    <section class="panel">
      <div class="filters"><label class="field" for="rOrigem">Turma de ${ano}<select id="rOrigem"><option value="">Selecione</option>${origem.map(t => html`<option value="${t.id}">${t.nome} · ${plural(t.alunos.length, 'aluno', 'alunos')}</option>`)}</select></label></div>
      <div id="rCorpo"></div>
    </section>`;
  const sugerir = a => {
    const t = turmaDe(a.turma);
    if (!t || !destino.length) return null;
    const serie = a.situacao === 'reprovado' ? t.serie : t.serie + 1;
    const op = destino.filter(d => d.serie === serie);
    return (op.find(d => d.turno === t.turno) || op[0] || null);
  };
  $('rOrigem').onchange = () => {
    const t = turmaDe($('rOrigem').value);
    if (!t) { $('rCorpo').innerHTML = ''; return; }
    if (!destino.length) { $('rCorpo').innerHTML = html`<p class="res info" style="margin:0 20px 20px">Cadastre ou copie as turmas de ${prox} primeiro (passo 1).</p>`; return; }
    const alunos = t.alunos.filter(a => !['transferido', 'cancelado', 'concluido'].includes(a.situacao));
    $('rCorpo').innerHTML = html`<div class="table-wrap"><table class="t"><thead><tr><th><input type="checkbox" id="rTodos" aria-label="Marcar todos" checked></th><th>Aluno</th><th>Situação em ${ano}</th><th>Turma em ${prox}</th></tr></thead>
      <tbody>${alunos.length ? alunos.map(a => { const s = sugerir(a); const fim = a.situacao === 'aprovado' && t.serie >= maxSerie; return html`<tr data-aluno="${a.id}">
        <td><input type="checkbox" class="rMarca" ${a.situacao === 'cursando' || fim ? '' : seguro('checked')} aria-label="Rematricular ${a.nome}"></td>
        <td style="font-weight:700">${a.nome}</td><td>${pillSituacao(a.situacao)}${a.situacao === 'cursando' ? html`<div class="muted" style="font-size:.78rem">Situação final ainda não definida</div>` : ''}${fim ? html`<div class="muted" style="font-size:.78rem">Concluiu a última série</div>` : ''}</td>
        <td><select class="mini rDest"><option value="">Não rematricular</option>${destino.map(d => html`<option value="${d.id}" ${s && s.id === d.id && a.situacao !== 'cursando' && !fim ? seguro('selected') : ''}>${d.nome} · ${d.turno}</option>`)}</select></td></tr>`; })
        : linhaVazia(4, 'Nenhum aluno para rematricular nesta turma.')}</tbody></table></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px" id="rAcoes"><button class="btn blue" id="rOk">Rematricular marcados</button></div><div id="rRes" style="padding:0 20px 16px"></div>`;
    if ($('rTodos')) $('rTodos').onchange = e => view.querySelectorAll('.rMarca').forEach(c => { c.checked = e.target.checked; });
    $('rOk').onclick = async () => {
      const grupos = {};
      let semDestino = 0;
      view.querySelectorAll('tr[data-aluno]').forEach(tr => {
        if (!tr.querySelector('.rMarca').checked) return;
        const d = tr.querySelector('.rDest').value;
        if (!d) { semDestino++; return; }
        (grupos[d] = grupos[d] || []).push(Number(tr.dataset.aluno));
      });
      const total = Object.values(grupos).reduce((s, l) => s + l.length, 0);
      if (!total) { $('rRes').innerHTML = html`<p class="res bad">Marque alunos e escolha a turma de ${prox} de cada um.</p>`; return; }
      if (!await confirmar(`Rematricular ${plural(total, 'aluno', 'alunos')}?`, `Os alunos passam para as turmas de ${prox}. As notas de ${ano} ficam guardadas no histórico escolar.${semDestino ? ` ${plural(semDestino, 'aluno marcado está', 'alunos marcados estão')} sem turma de destino e não serão rematriculados.` : ''}`, { botao: 'Rematricular' })) return;
      const erros = []; let feitos = 0;
      for (const [turmaId, ids] of Object.entries(grupos)) {
        try { const r = await api('rematricula', { metodo: 'POST', corpo: { turmaId: Number(turmaId), alunos: ids } }); feitos += r.feitos; erros.push(...r.erros); }
        catch (e) { erros.push(e.message); }
      }
      await carregarDados(); route();
      toast(`${plural(feitos, 'aluno rematriculado', 'alunos rematriculados')}.${erros.length ? ' ' + erros[0] : ''}`, 6000);
    };
  };
});
acao('copiar-turmas', async el => {
  const r = await api('turmas/copiar', { metodo: 'POST', corpo: { de: Number(el.dataset.de), para: Number(el.dataset.para) } });
  await carregarDados(); route();
  toast(`${plural(r.criadas, 'turma criada', 'turmas criadas')} em ${el.dataset.para}${r.jaExistiam ? ` (${r.jaExistiam} já existiam)` : ''}.`);
});

/* ================= Pré-matrícula ================= */
let PRE = [];
tela('pre-matricula', 'matriculas', async () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Matrículas</div><h1>Pré-matrícula</h1></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="pre-config">${ic('settings')} Abrir / fechar</button><button class="btn blue" data-act="pre-nova">+ Registrar pré-matrícula</button></div></div>
    <div id="preCfg"></div>
    <section class="panel">
      <div class="filters"><label class="field" for="pSit">Situação<select id="pSit"><option value="abertas">Em andamento</option><option value="">Todas</option>${Object.entries(STATUS_PRE).map(([k, [t]]) => html`<option value="${k}">${t}</option>`)}</select></label>
        <label class="field" for="pBusca" style="flex:1;max-width:320px">Nome do aluno ou responsável<input id="pBusca" type="search"></label></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Data</th><th>Aluno</th><th>Ano/série</th><th>Responsável</th><th>Situação</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    </section>`;
  const draw = () => {
    const s = $('pSit').value, q = $('pBusca').value.trim().toLowerCase();
    const l = PRE.filter(p => (s === 'abertas' ? ['nova', 'contatada', 'aprovada'].includes(p.status) : !s || p.status === s) && (!q || p.alunoNome.toLowerCase().includes(q) || p.respNome.toLowerCase().includes(q)));
    $('rows').innerHTML = html`${l.length ? l.map(p => html`<tr><td class="num muted">${dataHoraBR(p.criadoEm)}<div style="font-size:.76rem">${p.origem === 'online' ? 'On-line' : 'Secretaria'}</div></td>
      <td style="font-weight:700">${p.alunoNome}<div class="muted" style="font-weight:400;font-size:.8rem">Nasc. ${dataBR(p.alunoNascimento)}${p.escolaAtual ? ` · ${p.escolaAtual}` : ''}</div></td>
      <td>${p.serie}º Ano · ${p.ano}${p.turno ? html`<div class="muted" style="font-size:.8rem">${p.turno}</div>` : ''}</td>
      <td>${p.respNome}<div class="muted num" style="font-size:.8rem">${p.respTel}${p.respEmail ? ` · ${p.respEmail}` : ''}</div></td>
      <td>${pillPre(p.status)}${p.anotacao ? html`<div class="muted" style="font-size:.78rem;max-width:220px">${p.anotacao}</div>` : ''}</td>
      <td class="r"><div class="acoes"><button class="btn sm" data-act="pre-editar" data-id="${p.id}">Atualizar</button>
        ${p.status !== 'matriculada' && pode('cadastros') ? html`<button class="btn sm blue" data-act="pre-matricular" data-id="${p.id}">Matricular</button>` : ''}</div></td></tr>`)
      : linhaVazia(6, 'Nenhuma pré-matrícula.')}`;
  };
  $('pSit').onchange = draw; $('pBusca').oninput = draw;
  try {
    const [lista, cfg] = await Promise.all([api('pre-matriculas'), api('config/pre-matricula')]);
    PRE = lista;
    if (!$('preCfg')) return;
    const link = `${location.origin}/pre-matricula.html`;
    $('preCfg').innerHTML = html`<div class="aviso">${ic(cfg.aberta ? 'unlock' : 'lock')}<div><b>Pré-matrícula on-line ${cfg.aberta ? `aberta para ${cfg.ano}` : 'fechada'}</b>
      <span>${cfg.aberta ? html`Formulário para as famílias: <a href="${link}" target="_blank" rel="noopener">${link}</a>. O endereço só funciona fora da escola se o servidor estiver publicado na internet; senão, registre aqui os pedidos feitos por telefone ou na recepção.` : 'Abra para receber pedidos pelo formulário on-line. Pedidos por telefone podem ser registrados a qualquer momento.'}</span></div></div>`;
    draw();
  } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; }
});
const camposPre = () => [
  { name: 'alunoNome', label: 'Nome completo do aluno', required: true, full: true, minWords: 2 },
  { name: 'alunoNascimento', label: 'Data de nascimento', type: 'date', required: true, max: hojeISO() },
  { name: 'serie', label: 'Ano / série pretendido', type: 'select', required: true, options: [...Array(12)].map((_, i) => ({ v: i + 1, t: `${i + 1}º Ano` })) },
  { name: 'ano', label: 'Ano letivo', type: 'number', required: true, min: 2000, max: 2100 },
  { name: 'turno', label: 'Turno de preferência', type: 'select', vazio: 'Sem preferência', options: LISTAS.turnos.map(v => ({ v, t: v })) },
  { name: 'escolaAtual', label: 'Escola atual', full: true },
  { type: 'titulo', name: '_r', label: 'Responsável' },
  { name: 'respNome', label: 'Nome do responsável', required: true, full: true, minWords: 2 },
  { name: 'respParentesco', label: 'Parentesco', type: 'select', required: true, options: LISTAS.parentescos.map(v => ({ v, t: v })) },
  { name: 'respTel', label: 'Telefone', type: 'tel', required: true },
  { name: 'respEmail', label: 'E-mail', type: 'email' },
  { name: 'respCpf', label: 'CPF', inputmode: 'numeric' },
  { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }
];
acao('pre-nova', () => openForm({
  title: 'Registrar pré-matrícula', sub: 'Pedido de vaga feito por telefone ou na recepção', submit: 'Registrar', largura: 760, values: { ano: anoAtual() + 1 }, fields: camposPre(),
  onSave: d => api('pre-matriculas', { metodo: 'POST', corpo: { ...d, serie: Number(d.serie), ano: Number(d.ano) } }).then(() => { route(); toast('Pré-matrícula registrada.'); })
}));
acao('pre-editar', el => {
  const p = PRE.find(x => x.id === Number(el.dataset.id));
  openForm({
    title: 'Atualizar pré-matrícula', sub: `${p.alunoNome} · ${p.serie}º Ano · ${p.ano}`, submit: 'Salvar', values: p,
    fields: [
      { name: 'status', label: 'Situação', type: 'select', required: true, vazio: false, options: Object.entries(STATUS_PRE).map(([v, [t]]) => ({ v, t })) },
      { name: 'anotacao', label: 'Anotação da secretaria', type: 'textarea', full: true, placeholder: 'Ex.: liguei dia 10, vem entregar os documentos na sexta' }
    ],
    note: html`<b>Responsável:</b> ${p.respNome} (${p.respParentesco}) · ${p.respTel}${p.respEmail ? ` · ${p.respEmail}` : ''}${p.observacoes ? html`<br><b>Observações da família:</b> ${p.observacoes}` : ''}`,
    extraBotoes: html`<button type="button" class="btn red" id="exclPre" style="margin-right:auto">Apagar</button>`,
    onSave: d => api(`pre-matriculas/${p.id}`, { metodo: 'PUT', corpo: d }).then(() => { route(); toast('Pré-matrícula atualizada.'); })
  });
  $('exclPre').onclick = async () => {
    if (!await confirmar('Apagar pré-matrícula?', `Os dados de ${p.alunoNome} e do responsável serão apagados (LGPD: apague quando a matrícula não acontecer).`, { botao: 'Apagar', perigo: true })) return;
    await api(`pre-matriculas/${p.id}`, { metodo: 'DELETE' }); route(); toast('Pré-matrícula apagada.');
  };
});
acao('pre-matricular', el => {
  const p = PRE.find(x => x.id === Number(el.dataset.id));
  const turma = TURMAS.find(t => t.anoLetivo === p.ano && t.serie === p.serie && (!p.turno || t.turno === p.turno)) || TURMAS.find(t => t.anoLetivo === p.ano && t.serie === p.serie);
  formAluno(turma ? turma.id : '', async a => {
    try { await api(`pre-matriculas/${p.id}`, { metodo: 'PUT', corpo: { status: 'matriculada', alunoId: a.id } }); } catch (e) { toast(e.message, 6000); }
  }, { nome: p.alunoNome, nascimento: p.alunoNascimento, rNome: p.respNome, rParentesco: p.respParentesco, rTel: p.respTel, rEmail: p.respEmail, rCpf: p.respCpf, observacoes: p.observacoes });
});
acao('pre-config', async () => {
  const c = await api('config/pre-matricula');
  openForm({
    title: 'Pré-matrícula on-line', sub: 'Formulário público para as famílias pedirem vaga', submit: 'Salvar', values: { ...c, series: c.series },
    fields: [
      { name: 'aberta', label: 'Pré-matrícula aberta', type: 'checkbox', hint: 'Com ela aberta, o formulário em /pre-matricula.html aceita pedidos.' },
      { name: 'ano', label: 'Ano letivo das vagas', type: 'number', required: true, min: 2000, max: 2100 },
      { name: 'series', label: 'Anos/séries com vaga', type: 'checks', required: true, options: [...Array(12)].map((_, i) => ({ v: i + 1, t: `${i + 1}º` })) },
      { name: 'texto', label: 'Aviso para as famílias (opcional)', type: 'textarea', full: true, placeholder: 'Ex.: Documentos: certidão de nascimento, comprovante de residência…' }
    ],
    onSave: d => api('config/pre-matricula', { metodo: 'PUT', corpo: { ...d, ano: Number(d.ano), series: d.series.map(Number) } }).then(() => { route(); toast(d.aberta ? 'Pré-matrícula aberta.' : 'Pré-matrícula fechada.'); })
  });
});
