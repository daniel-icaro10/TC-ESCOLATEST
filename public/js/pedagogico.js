'use strict';
/* =====================================================================
   Pedagógico: horários, ocorrências, acompanhamento, planejamento,
   habilidades (BNCC) e simulados.
   ===================================================================== */
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TIPOS_OCORRENCIA = ['Advertência', 'Indisciplina', 'Atraso', 'Falta sem justificativa', 'Tarefa não entregue', 'Saúde', 'Elogio', 'Conversa com responsável', 'Outro'];
const minhasTurmas = () => TURMAS.filter(t => t.anoLetivo === anoAtual() && (pode('escola.ver') || t.disciplinas.some(d => d.profId === SESSAO.usuario.professorId)));
const seletorTurma = (id, turmas, valor) => html`<select id="${id}">${turmas.map(t => html`<option value="${t.id}" ${t.id === Number(valor) ? seguro('selected') : ''}>${t.nome}</option>`)}</select>`;
let turmaPedagogico = null;   // lembra a turma escolhida entre as telas

/* ================= Horários ================= */
tela('horarios', ['escola.ver', 'notas.proprias'], async () => {
  const turmas = minhasTurmas(), edita = pode('cadastros');
  const meu = !pode('escola.ver');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Horários</h1></div><button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div>
    <section class="panel no-print"><div class="filters">
      ${meu ? html`<p class="muted" style="margin:0">Seu horário em todas as turmas.</p>` : html`<label class="field" for="hTurma">Turma${seletorTurma('hTurma', turmas, turmaPedagogico)}</label>
      <label class="field" for="hAulas">Aulas por dia<select id="hAulas">${[4, 5, 6, 7, 8, 9, 10].map(n => html`<option ${n === 6 ? seguro('selected') : ''}>${n}</option>`)}</select></label>
      <label class="field" for="hDias">Dias<select id="hDias"><option value="5">Segunda a sexta</option><option value="6">Segunda a sábado</option></select></label>`}
    </div></section>
    <section class="panel" id="hGrade"><div class="vazio">Carregando…</div></section>`;
  let dados;
  try { dados = await api(`horarios?ano=${anoAtual()}`); } catch (e) { $('hGrade').innerHTML = html`<p class="res bad" style="margin:20px">${e.message}</p>`; return; }
  if (meu) {
    // grade do professor: junta as aulas dele de todas as turmas
    const pid = SESSAO.usuario.professorId;
    const minhas = dados.aulas.filter(a => a.professorId === pid);
    const nAulas = Math.max(5, ...minhas.map(a => a.aula));
    $('hGrade').innerHTML = html`<div class="table-wrap"><table class="t"><thead><tr><th>Aula</th>${DIAS.slice(0, 5).map(d => html`<th>${d}</th>`)}</tr></thead><tbody>
      ${[...Array(nAulas)].map((_, i) => html`<tr><td class="num" style="font-weight:700">${i + 1}ª</td>${[1, 2, 3, 4, 5].map(dia => { const a = minhas.find(x => x.dia === dia && x.aula === i + 1); return html`<td>${a ? html`<b>${discDe(a.disciplinaId)?.nome}</b><div class="muted" style="font-size:.8rem">${turmaDe(a.turmaId)?.nome}</div>` : html`<span class="muted">–</span>`}</td>`; })}</tr>`)}
    </tbody></table></div>${minhas.length ? '' : html`<p class="vazio">A secretaria ainda não montou os horários das suas turmas.</p>`}`;
    return;
  }
  const desenhar = () => {
    const t = turmaDe($('hTurma').value); if (!t) { $('hGrade').innerHTML = html`<div class="vazio">Cadastre turmas primeiro.</div>`; return; }
    turmaPedagogico = t.id;
    const aulasT = dados.aulas.filter(a => a.turmaId === t.id), tempos = dados.tempos.filter(x => x.turmaId === t.id);
    const nAulas = Math.max(Number($('hAulas').value), ...aulasT.map(a => a.aula), ...tempos.map(x => x.aula));
    const nDias = Math.max(Number($('hDias').value), ...aulasT.map(a => a.dia));
    $('hAulas').value = String(Math.min(10, nAulas)); $('hDias').value = String(nDias);
    const contagem = d => aulasT.filter(a => a.disciplinaId === d.id).length;
    $('hGrade').innerHTML = html`<div class="so-impressao"><b>${SESSAO.escola.nome}</b> · Horário ${t.nome} · ${t.turno} · ${t.anoLetivo}</div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Aula</th><th>Horário</th>${DIAS.slice(0, nDias).map(d => html`<th>${d}</th>`)}</tr></thead><tbody>
      ${[...Array(nAulas)].map((_, i) => { const tp = tempos.find(x => x.aula === i + 1) || {}; return html`<tr data-aula="${i + 1}"><td class="num" style="font-weight:700">${i + 1}ª</td>
        <td style="white-space:nowrap">${edita ? html`<input class="nota-in" data-ini value="${tp.inicio || ''}" placeholder="--:--" style="width:64px" aria-label="Início da ${i + 1}ª aula"> – <input class="nota-in" data-fim value="${tp.fim || ''}" placeholder="--:--" style="width:64px" aria-label="Fim da ${i + 1}ª aula">` : `${tp.inicio || ''}${tp.fim ? ' – ' + tp.fim : ''}`}</td>
        ${[...Array(nDias)].map((_, di) => { const a = aulasT.find(x => x.dia === di + 1 && x.aula === i + 1); return html`<td>${edita
          ? html`<select class="mini" data-dia="${di + 1}" aria-label="${DIAS[di]}, ${i + 1}ª aula"><option value=""></option>${t.disciplinas.map(d => html`<option value="${d.id}" ${a && a.disciplinaId === d.id ? seguro('selected') : ''}>${d.nome}</option>`)}</select>`
          : a ? html`<b>${discDe(a.disciplinaId)?.nome}</b><div class="muted" style="font-size:.8rem">${t.disciplinas.find(d => d.id === a.disciplinaId)?.prof || ''}</div>` : ''}</td>`; })}</tr>`; })}
      </tbody></table></div>
      <div style="padding:12px 20px;display:flex;gap:14px;flex-wrap:wrap;align-items:center" class="no-print">
        <span class="muted" style="font-size:.84rem">Aulas por semana: ${t.disciplinas.map((d, i) => html`${i ? ' · ' : ''}${d.nome} ${contagem(d)}`)}</span>
        ${edita ? html`<span style="flex:1"></span><button class="btn blue" id="hSalvar">Salvar horário</button>` : ''}</div><div id="hRes" style="padding:0 20px 16px"></div>`;
    if (!edita) return;
    $('hSalvar').onclick = async () => {
      const aulas = [], temposN = [];
      view.querySelectorAll('tr[data-aula]').forEach(tr => {
        const aula = Number(tr.dataset.aula);
        temposN.push({ aula, inicio: tr.querySelector('[data-ini]').value, fim: tr.querySelector('[data-fim]').value });
        tr.querySelectorAll('[data-dia]').forEach(s => { if (s.value) aulas.push({ dia: Number(s.dataset.dia), aula, disciplinaId: Number(s.value) }); });
      });
      try {
        const r = await api(`horarios/${t.id}`, { metodo: 'PUT', corpo: { aulas, tempos: temposN } });
        dados = await api(`horarios?ano=${anoAtual()}`); desenhar();
        $('hRes').innerHTML = r.choques.length ? html`<p class="res bad"><b>Horário salvo, mas há choque de professor:</b> ${r.choques.map((c, i) => html`${i ? '; ' : ''}${c.professor} também dá aula no ${c.outra} (${DIAS[c.dia - 1]}, ${c.aula}ª aula)`)}.</p>` : html`<p class="res ok">Horário salvo.</p>`;
      } catch (e) { $('hRes').innerHTML = html`<p class="res bad">${e.message}</p>`; }
    };
  };
  ['hTurma', 'hAulas', 'hDias'].forEach(id => $(id).onchange = desenhar);
  desenhar();
});

/* ================= Ocorrências ================= */
let OCORRENCIAS = [];
tela('ocorrencias', ['pedagogico.ver', 'pedagogico.proprio'], async () => {
  const geral = pode('pedagogico.ver');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Pedagógico / Coordenação</div><h1>Ocorrências</h1></div><button class="btn blue" data-act="ocorrencia-nova">+ Registrar ocorrência</button></div>
    <section class="panel">
      <div class="filters">
        <label class="field" for="oBusca" style="flex:1;max-width:320px">Aluno<input id="oBusca" type="search"></label>
        <label class="field" for="oTurma">Turma<select id="oTurma"><option value="">Todas</option>${minhasTurmas().map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
        <label class="field" for="oTipo">Tipo<select id="oTipo"><option value="">Todos</option>${TIPOS_OCORRENCIA.map(t => html`<option>${t}</option>`)}</select></label>
        <label class="field" for="oSit">Situação<select id="oSit"><option value="">Todas</option><option value="abertas">Em aberto</option><option value="resolvidas">Resolvidas</option></select></label>
      </div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Data</th><th>Aluno</th><th>Tipo</th><th>O que aconteceu</th><th>Registrado por</th><th></th></tr></thead><tbody id="rows">${linhaVazia(6, 'Carregando…')}</tbody></table></div>
    </section>
    ${geral ? '' : html`<p class="muted" style="font-size:.84rem">Você vê as ocorrências que registrou. A coordenação vê todas.</p>`}`;
  const draw = () => {
    const q = $('oBusca').value.trim().toLowerCase(), tu = Number($('oTurma').value), tp = $('oTipo').value, si = $('oSit').value;
    const l = OCORRENCIAS.filter(o => (!q || o.aluno.toLowerCase().includes(q)) && (!tu || o.turmaId === tu) && (!tp || o.tipo === tp) && (!si || (si === 'abertas' ? !o.resolvida : o.resolvida)));
    $('rows').innerHTML = html`${l.length ? l.map(o => html`<tr><td class="num" style="white-space:nowrap">${dataBR(o.data)}</td><td style="font-weight:700">${o.aluno}<div class="muted" style="font-weight:400;font-size:.8rem">${turmaDe(o.turmaId)?.nome || ''}</div></td>
      <td><span class="pill ${o.tipo === 'Elogio' ? 'ok' : ['Advertência', 'Indisciplina'].includes(o.tipo) ? 'bad' : 'warn'}">${o.tipo}</span>${o.resolvida ? html`<div><span class="pill todo" style="margin-top:4px">Resolvida</span></div>` : ''}</td>
      <td style="max-width:380px">${o.descricao}${o.providencia ? html`<div class="muted" style="font-size:.82rem;margin-top:4px"><b>Providência:</b> ${o.providencia}</div>` : ''}${o.responsavelAvisado ? html`<div class="muted" style="font-size:.78rem">Responsável avisado</div>` : ''}</td>
      <td class="muted" style="font-size:.84rem">${o.autor}</td><td class="r"><button class="btn sm" data-act="ocorrencia-editar" data-id="${o.id}">Editar</button></td></tr>`)
      : linhaVazia(6, 'Nenhuma ocorrência encontrada.')}`;
  };
  ['oBusca', 'oTurma', 'oTipo', 'oSit'].forEach(id => $(id).addEventListener('input', draw));
  try { OCORRENCIAS = await api('ocorrencias'); if ($('rows')) draw(); } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; }
});
function formOcorrencia(o, alunoId) {
  const alunos = ALUNOS.filter(a => ATIVO(a) && minhasTurmas().some(t => t.id === a.turma)).sort(sortNome);
  openForm({
    title: o ? 'Editar ocorrência' : 'Registrar ocorrência', sub: o ? o.aluno : 'Fica no registro do aluno, visível para a coordenação', submit: 'Salvar', largura: 720,
    values: o || { data: hojeISO(), alunoId },
    fields: [
      ...(o ? [] : [{ name: 'alunoId', label: 'Aluno', type: 'select', required: true, full: true, options: alunos.map(a => ({ v: a.id, t: `${a.nome} · ${turmaDe(a.turma)?.nome || ''}` })) }]),
      { name: 'data', label: 'Data', type: 'date', required: true, max: hojeISO() },
      { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: TIPOS_OCORRENCIA.map(v => ({ v, t: v })) },
      { name: 'descricao', label: 'O que aconteceu', type: 'textarea', required: true, full: true, rows: 4 },
      { name: 'providencia', label: 'Providência tomada', type: 'textarea', full: true, rows: 2 },
      { name: 'responsavelAvisado', label: 'O responsável foi avisado', type: 'checkbox' },
      { name: 'resolvida', label: 'Resolvida', type: 'checkbox' }
    ],
    extraBotoes: o ? html`<button type="button" class="btn red" id="exclOc" style="margin-right:auto">Apagar</button>` : '',
    onSave: d => api(o ? `ocorrencias/${o.id}` : 'ocorrencias', { metodo: o ? 'PUT' : 'POST', corpo: { ...d, alunoId: o ? o.alunoId : Number(d.alunoId) } }).then(() => { route(); toast('Ocorrência salva.'); })
  });
  if (o) $('exclOc').onclick = async () => { if (await confirmar('Apagar ocorrência?', `${o.tipo} de ${o.aluno} em ${dataBR(o.data)}.`, { botao: 'Apagar', perigo: true })) { await api(`ocorrencias/${o.id}`, { metodo: 'DELETE' }); route(); toast('Ocorrência apagada.'); } };
}
acao('ocorrencia-nova', el => formOcorrencia(null, el.dataset.aluno));
acao('ocorrencia-editar', el => formOcorrencia(OCORRENCIAS.find(o => o.id === Number(el.dataset.id))));

/* ================= Acompanhamento pedagógico ================= */
tela('acompanhamento', ['pedagogico', 'pedagogico.ver'], async () => {
  const ano = anoAtual(), turmas = TURMAS.filter(t => t.anoLetivo === ano);
  const temNotas = ALUNOS.some(a => Object.keys(a.notas).length);
  // aluno em risco: média abaixo de 6 em alguma disciplina ou faltas acima de 25% da carga de alguma disciplina
  const analise = ALUNOS.filter(a => ATIVO(a) && turmas.some(t => t.id === a.turma)).map(a => {
    const t = turmaDe(a.turma);
    const baixas = t.disciplinas.map(d => ({ d, m: mediaAnual(a, d.id) })).filter(x => x.m != null && x.m < 6);
    const faltas = t.disciplinas.map(d => ({ d, f: faltasDisc(a, d.id), c: discDe(d.id)?.carga || 0 })).filter(x => x.c && x.f / x.c > .25);
    return { a, t, baixas, faltas, total: faltasAluno(a) };
  });
  const risco = analise.filter(x => x.baixas.length || x.faltas.length).sort((x, y) => (y.baixas.length + y.faltas.length) - (x.baixas.length + x.faltas.length));
  const porTurma = turmas.map(t => {
    const ms = t.alunos.filter(ATIVO).flatMap(a => t.disciplinas.map(d => mediaAnual(a, d.id))).filter(m => m != null);
    const media = ms.length ? trunc1(ms.reduce((s, m) => s + m, 0) / ms.length) : null;
    return { t, media, risco: risco.filter(r => r.t.id === t.id).length, ativos: t.alunos.filter(ATIVO).length };
  });
  const porDisc = DISC.map(d => {
    const ms = analise.map(x => mediaAnual(x.a, d.id)).filter(m => m != null);
    return { d, media: ms.length ? trunc1(ms.reduce((s, m) => s + m, 0) / ms.length) : null, abaixo: ms.filter(m => m < 6).length };
  });
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Pedagógico / Coordenação</div><h1>Acompanhamento pedagógico ${ano}</h1></div><button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div>
    ${!temNotas ? html`<div class="aviso">${ic('info')}<div><b>Sem notas lançadas ainda</b><span>O acompanhamento aparece conforme os professores lançam notas e faltas.</span></div></div>` : ''}
    <section class="panel"><div class="kpis">
      <div class="kpi"><span>Alunos ativos</span><b>${analise.length}</b></div>
      <div class="kpi"><span>Alunos em atenção</span><b style="${risco.length ? 'color:var(--red)' : ''}">${risco.length}</b></div>
      <div class="kpi"><span>Com nota abaixo de 6</span><b>${analise.filter(x => x.baixas.length).length}</b></div>
      <div class="kpi"><span>Faltas acima de 25%</span><b>${analise.filter(x => x.faltas.length).length}</b></div>
    </div></section>
    <div class="home">
      <section class="panel"><div class="panel-h">${ic('users')}<h2>Alunos que precisam de atenção</h2></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Aluno</th><th>Turma</th><th>Abaixo da média</th><th>Faltas</th><th></th></tr></thead>
        <tbody>${risco.length ? risco.slice(0, 100).map(r => html`<tr><td style="font-weight:700">${r.a.nome}</td><td>${r.t.nome}</td>
          <td style="font-size:.82rem">${r.baixas.length ? html`<b style="color:var(--red)">${plural(r.baixas.length, 'disciplina', 'disciplinas')}:</b> ` : ''}${r.baixas.map((x, i) => html`${i ? ', ' : ''}${x.d.nome} ${fmt(x.m)}`)}${r.baixas.length ? '' : html`<span class="muted">–</span>`}</td>
          <td>${r.faltas.length ? r.faltas.map((x, i) => html`${i ? ', ' : ''}${x.d.nome} (${x.f})`) : html`<span class="muted">${r.total}</span>`}</td>
          <td class="r"><div class="acoes no-print"><a class="btn sm" href="#boletim-${r.t.id}-${r.a.id}">Boletim</a><button class="btn sm" data-act="ocorrencia-nova" data-aluno="${r.a.id}">Ocorrência</button></div></td></tr>`)
          : linhaVazia(5, 'Nenhum aluno em atenção.')}</tbody></table></div></section>
      <div style="display:flex;flex-direction:column;gap:22px;min-width:0">
        <section class="panel"><div class="panel-h">${ic('chart')}<h2>Por turma</h2></div><div class="table-wrap"><table class="t"><thead><tr><th>Turma</th><th class="c">Média geral</th><th class="c">Em atenção</th></tr></thead>
          <tbody>${porTurma.map(x => html`<tr><td>${x.t.nome}</td><td class="c num ${x.media != null && x.media < 6 ? 'low' : ''}" style="font-weight:700">${fmt(x.media) || '–'}</td><td class="c">${x.risco} de ${x.ativos}</td></tr>`)}</tbody></table></div></section>
        <section class="panel"><div class="panel-h">${ic('list')}<h2>Por disciplina</h2></div><div class="table-wrap"><table class="t"><thead><tr><th>Disciplina</th><th class="c">Média</th><th class="c">Abaixo de 6</th></tr></thead>
          <tbody>${porDisc.map(x => html`<tr><td>${x.d.nome}</td><td class="c num ${x.media != null && x.media < 6 ? 'low' : ''}" style="font-weight:700">${fmt(x.media) || '–'}</td><td class="c">${x.abaixo}</td></tr>`)}</tbody></table></div></section>
      </div>
    </div>`;
});

/* ================= Planejamento de aulas ================= */
const STATUS_PLANO = { rascunho: ['Rascunho', 'todo'], enviado: ['Enviado', 'doing'], aprovado: ['Aprovado', 'ok'], devolvido: ['Devolvido', 'bad'] };
let PLANOS = [];
tela('planejamento', ['pedagogico.proprio', 'pedagogico.ver'], async () => {
  const prof = pode('pedagogico.proprio') && SESSAO.usuario.professorId, coord = pode('pedagogico');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Pedagógico</div><h1>Planejamento de aulas</h1></div>${prof ? html`<button class="btn blue" data-act="plano-novo">+ Novo planejamento</button>` : ''}</div>
    <section class="panel">
      <div class="filters">
        <label class="field" for="plTurma">Turma<select id="plTurma"><option value="">Todas</option>${minhasTurmas().map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
        <label class="field" for="plSit">Situação<select id="plSit"><option value="">Todas</option>${Object.entries(STATUS_PLANO).map(([k, [t]]) => html`<option value="${k}" ${!prof && k === 'enviado' ? seguro('selected') : ''}>${t}</option>`)}</select></label>
      </div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Período</th><th>Tema</th><th>Turma / disciplina</th>${prof ? '' : html`<th>Professor</th>`}<th>Situação</th><th></th></tr></thead><tbody id="rows">${linhaVazia(6, 'Carregando…')}</tbody></table></div>
    </section>`;
  const draw = () => {
    const tu = Number($('plTurma').value), si = $('plSit').value;
    const l = PLANOS.filter(p => (!tu || p.turmaId === tu) && (!si || p.status === si));
    $('rows').innerHTML = html`${l.length ? l.map(p => html`<tr><td class="num" style="white-space:nowrap">${dataBR(p.inicio)}${p.fim && p.fim !== p.inicio ? html`<br>até ${dataBR(p.fim)}` : ''}</td>
      <td style="font-weight:700">${p.titulo}${p.comentario ? html`<div class="muted" style="font-weight:400;font-size:.8rem">Coordenação: ${p.comentario}</div>` : ''}</td>
      <td>${turmaDe(p.turmaId)?.nome || '–'}<div class="muted" style="font-size:.8rem">${discDe(p.disciplinaId)?.nome || ''}</div></td>${prof ? '' : html`<td>${p.professor}</td>`}
      <td><span class="pill ${STATUS_PLANO[p.status][1]}">${STATUS_PLANO[p.status][0]}</span></td>
      <td class="r"><button class="btn sm" data-act="plano-abrir" data-id="${p.id}">${prof ? 'Abrir' : coord && p.status === 'enviado' ? 'Revisar' : 'Ver'}</button></td></tr>`)
      : linhaVazia(6, prof ? 'Nenhum planejamento. Clique em + Novo planejamento.' : 'Nenhum planejamento encontrado.')}`;
  };
  ['plTurma', 'plSit'].forEach(id => $(id).onchange = draw);
  try { PLANOS = await api('planos'); if ($('rows')) draw(); } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; }
});
function formPlano(p) {
  const meus = TURMAS.flatMap(t => t.disciplinas.filter(d => d.profId === SESSAO.usuario.professorId).map(d => ({ v: `${t.id}-${d.id}`, t: `${t.nome} · ${d.nome}` })));
  const form = openForm({
    title: p ? 'Planejamento' : 'Novo planejamento', sub: p && p.comentario ? `Comentário da coordenação: ${p.comentario}` : 'Salve como rascunho ou envie para a coordenação', submit: 'Salvar rascunho', largura: 780,
    values: p ? { ...p, td: `${p.turmaId}-${p.disciplinaId}` } : { inicio: hojeISO() },
    fields: [
      { name: 'td', label: 'Turma e disciplina', type: 'select', required: true, full: true, options: meus },
      { name: 'inicio', label: 'De', type: 'date', required: true }, { name: 'fim', label: 'Até', type: 'date' },
      { name: 'titulo', label: 'Tema / conteúdo da aula', required: true, full: true },
      { name: 'objetivos', label: 'Objetivos', type: 'textarea', full: true },
      { name: 'habilidades', label: 'Habilidades da BNCC', full: true, placeholder: 'Ex.: EF05MA01, EF05MA02' },
      { name: 'conteudo', label: 'Desenvolvimento', type: 'textarea', full: true, rows: 4 },
      { name: 'metodologia', label: 'Recursos e metodologia', type: 'textarea', full: true },
      { name: 'avaliacao', label: 'Avaliação', type: 'textarea', full: true }
    ],
    extraBotoes: html`${p ? html`<button type="button" class="btn red" id="exclPl" style="margin-right:auto">Apagar</button>` : ''}<button type="button" class="btn" id="plEnviar">Enviar para a coordenação</button>`,
    onSave: d => salvarPlano(p, d, false)
  });
  let enviar = false;
  $('plEnviar').onclick = () => { enviar = true; form.requestSubmit(); };
  $('formOk').addEventListener('click', () => { enviar = false; });
  async function salvarPlano(pl, d) {
    const [turmaId, disciplinaId] = d.td.split('-').map(Number);
    await api(pl ? `planos/${pl.id}` : 'planos', { metodo: pl ? 'PUT' : 'POST', corpo: { ...d, turmaId, disciplinaId, enviar } });
    route(); toast(enviar ? 'Planejamento enviado para a coordenação.' : 'Rascunho salvo.');
  }
  if (p) $('exclPl').onclick = async () => { if (await confirmar('Apagar planejamento?', p.titulo, { botao: 'Apagar', perigo: true })) { await api(`planos/${p.id}`, { metodo: 'DELETE' }); route(); toast('Planejamento apagado.'); } };
}
acao('plano-novo', () => formPlano());
acao('plano-abrir', el => {
  const p = PLANOS.find(x => x.id === Number(el.dataset.id));
  if (pode('pedagogico.proprio') && SESSAO.usuario.professorId === p.professorId) return formPlano(p);
  const bloco = (t, v) => v ? html`<h3 style="font-size:.82rem;text-transform:uppercase;color:var(--muted);margin:14px 0 4px">${t}</h3><div style="line-height:1.6">${textoComQuebras(v)}</div>` : '';
  const m = modal({
    titulo: p.titulo, sub: `${p.professor} · ${turmaDe(p.turmaId)?.nome || ''} · ${discDe(p.disciplinaId)?.nome || ''} · ${dataBR(p.inicio)}${p.fim ? ' a ' + dataBR(p.fim) : ''}`, largura: 760,
    corpo: html`${bloco('Objetivos', p.objetivos)}${bloco('Habilidades da BNCC', p.habilidades)}${bloco('Desenvolvimento', p.conteudo)}${bloco('Recursos e metodologia', p.metodologia)}${bloco('Avaliação', p.avaliacao)}
      ${pode('pedagogico') ? html`<label class="field" for="plCom" style="margin:16px 0 8px">Comentário para o professor<textarea id="plCom" rows="2">${p.comentario || ''}</textarea></label>` : ''}`,
    rodape: pode('pedagogico') ? html`<button class="btn" data-close>Fechar</button><button class="btn red" data-rev="devolvido">Devolver para ajuste</button><button class="btn blue" data-rev="aprovado">Aprovar</button>` : html`<button class="btn blue" data-close>Fechar</button>`
  });
  m.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => {
    await api(`planos/${p.id}`, { metodo: 'PUT', corpo: { revisao: true, status: b.dataset.rev, comentario: $('plCom').value } });
    closeLayer(); route(); toast(b.dataset.rev === 'aprovado' ? 'Planejamento aprovado.' : 'Planejamento devolvido ao professor.');
  });
});

/* ================= Habilidades por turma (BNCC) ================= */
tela('habilidades', ['escola.ver', 'notas.proprias'], async () => {
  const turmas = minhasTurmas();
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Habilidades por turma</h1></div></div>
    <section class="panel"><div class="filters">
      <label class="field" for="habTurma">Turma${seletorTurma('habTurma', turmas, turmaPedagogico)}</label>
      <label class="field" for="habDisc">Disciplina<select id="habDisc"></select></label>
    </div><div id="habCorpo"></div></section>`;
  if (!turmas.length) { $('habCorpo').innerHTML = html`<div class="vazio">Nenhuma turma disponível.</div>`; return; }
  const discs = () => {
    const t = turmaDe($('habTurma').value); turmaPedagogico = t.id;
    const lista = t.disciplinas.filter(d => pode('escola.ver') || d.profId === SESSAO.usuario.professorId);
    $('habDisc').innerHTML = html`${lista.map(d => html`<option value="${d.id}">${d.nome}</option>`)}`;
  };
  const carregar = async () => {
    const t = turmaDe($('habTurma').value), did = Number($('habDisc').value), d = t.disciplinas.find(x => x.id === did);
    const edita = pode('pedagogico') || pode('cadastros') || (d && d.profId === SESSAO.usuario.professorId);
    const lista = (await api(`habilidades?turma=${t.id}`)).filter(h => h.disciplinaId === did);
    const feitas = lista.filter(h => h.trabalhada).length;
    $('habCorpo').innerHTML = html`
      <div style="padding:0 20px 8px" class="muted">${lista.length ? `${feitas} de ${lista.length} habilidades trabalhadas (${Math.round(feitas / lista.length * 100)}%).` : 'Nenhuma habilidade cadastrada para esta disciplina.'}</div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Trabalhada</th><th>Código</th><th>Habilidade</th><th>Bimestre</th>${edita ? html`<th></th>` : ''}</tr></thead>
      <tbody>${lista.map(h => html`<tr><td><input type="checkbox" data-hab="${h.id}" ${h.trabalhada ? seguro('checked') : ''} ${edita ? '' : seguro('disabled')} aria-label="Trabalhada" style="width:18px;height:18px;accent-color:var(--teal)"></td>
        <td class="num" style="font-weight:700">${h.codigo || '–'}</td><td>${h.descricao}</td>
        <td>${edita ? html`<select class="mini" data-habbim="${h.id}"><option value="">–</option>${[1, 2, 3, 4].map(b => html`<option value="${b}" ${h.bimestre === b ? seguro('selected') : ''}>${b}º</option>`)}</select>` : h.bimestre ? `${h.bimestre}º` : '–'}</td>
        ${edita ? html`<td class="r"><button class="btn sm" data-habdel="${h.id}" aria-label="Apagar">${ic('trash')}</button></td>` : ''}</tr>`)}</tbody></table></div>
      ${edita ? html`<form id="habForm" style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">
        <label class="field" for="habTexto">Acrescentar habilidades (uma por linha)<textarea id="habTexto" rows="4" placeholder="EF05MA01 - Ler, escrever e ordenar números naturais até a ordem das centenas de milhar…&#10;EF05MA02 - Ler, escrever e ordenar números racionais na forma decimal…"></textarea></label>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap"><label class="field" for="habBim">Bimestre<select id="habBim"><option value="">–</option>${[1, 2, 3, 4].map(b => html`<option value="${b}">${b}º</option>`)}</select></label>
          <span style="flex:1"></span><button class="btn blue" type="submit">Acrescentar</button></div></form>` : ''}`;
    if (!edita) return;
    view.querySelectorAll('[data-hab]').forEach(c => c.onchange = () => api(`habilidades/${c.dataset.hab}`, { metodo: 'PUT', corpo: { trabalhada: c.checked } }).then(carregar).catch(e => toast(e.message, 6000)));
    view.querySelectorAll('[data-habbim]').forEach(s => s.onchange = () => api(`habilidades/${s.dataset.habbim}`, { metodo: 'PUT', corpo: { bimestre: s.value ? Number(s.value) : null } }).catch(e => toast(e.message, 6000)));
    view.querySelectorAll('[data-habdel]').forEach(b => b.onclick = () => api(`habilidades/${b.dataset.habdel}`, { metodo: 'DELETE' }).then(carregar).catch(e => toast(e.message, 6000)));
    $('habForm').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api('habilidades', { metodo: 'POST', corpo: { turmaId: t.id, disciplinaId: did, texto: $('habTexto').value, bimestre: $('habBim').value ? Number($('habBim').value) : null } }); toast(`${plural(r.criadas, 'habilidade acrescentada', 'habilidades acrescentadas')}.`); carregar(); }
      catch (err) { toast(err.message, 6000); }
    };
  };
  $('habTurma').onchange = () => { discs(); carregar(); };
  $('habDisc').onchange = carregar;
  discs(); carregar().catch(e => { $('habCorpo').innerHTML = html`<p class="res bad" style="margin:20px">${e.message}</p>`; });
});

/* ================= Simulados ================= */
let SIMULADOS = [];
tela('simulados', ['notas', 'relatorios'], async () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Simulados</h1></div>${pode('notas') ? html`<button class="btn blue" data-act="simulado-novo">+ Novo simulado</button>` : ''}</div>
    <section class="panel"><div class="table-wrap"><table class="t"><thead><tr><th>Simulado</th><th>Data</th><th>Turmas</th><th>Disciplinas</th><th>Resultados</th><th></th></tr></thead><tbody id="rows">${linhaVazia(6, 'Carregando…')}</tbody></table></div></section>`;
  try {
    SIMULADOS = await api('simulados');
    if (!$('rows')) return;
    $('rows').innerHTML = html`${SIMULADOS.length ? SIMULADOS.map(s => html`<tr><td style="font-weight:700">${s.nome}</td><td class="num">${dataBR(s.data) || '–'}</td>
      <td>${s.turmas.map(t => turmaDe(t)?.nome).filter(Boolean).join(', ')}</td><td>${s.disciplinas.map(d => `${discDe(d.disciplinaId)?.nome} (${d.questoes})`).join(', ')}</td>
      <td>${plural(s.lancados, 'aluno', 'alunos')}</td>
      <td class="r"><div class="acoes"><a class="btn sm blue" href="#simulado-${s.id}">${pode('notas') ? 'Lançar / ver' : 'Ver'}</a>${pode('notas') ? html`<button class="btn sm" data-act="simulado-editar" data-id="${s.id}">Editar</button>` : ''}</div></td></tr>`)
      : linhaVazia(6, 'Nenhum simulado cadastrado.')}`;
  } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; }
});
function formSimulado(s) {
  const turmas = TURMAS.filter(t => t.anoLetivo === anoAtual());
  const qs = new Map((s ? s.disciplinas : []).map(d => [d.disciplinaId, d.questoes]));
  const form = openForm({
    title: s ? 'Editar simulado' : 'Novo simulado', submit: 'Salvar', largura: 720, values: s ? { ...s, turmas: s.turmas } : { data: hojeISO() },
    fields: [
      { name: 'nome', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Simulado 1 · 2º bimestre' },
      { name: 'data', label: 'Data', type: 'date' },
      { name: 'turmas', label: 'Turmas', type: 'checks', required: true, options: turmas.map(t => ({ v: t.id, t: t.nome })) }
    ],
    note: html`<div class="field full"><span style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase">Número de questões por disciplina (em branco = não cai)</span>
      <div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));padding-top:6px">${DISC.map(d => html`<label class="field" style="text-transform:none;letter-spacing:0;font-weight:600">${d.nome}<input data-q="${d.id}" type="number" min="1" max="500" value="${qs.get(d.id) || ''}"></label>`)}</div></div>`,
    extraBotoes: s ? html`<button type="button" class="btn red" id="exclSim" style="margin-right:auto">Apagar</button>` : '',
    onSave: d => {
      const disciplinas = [...form.querySelectorAll('[data-q]')].filter(i => i.value).map(i => ({ disciplinaId: Number(i.dataset.q), questoes: Number(i.value) }));
      return api(s ? `simulados/${s.id}` : 'simulados', { metodo: s ? 'PUT' : 'POST', corpo: { ...d, turmas: d.turmas.map(Number), disciplinas } }).then(() => { route(); toast('Simulado salvo.'); });
    }
  });
  if (s) $('exclSim').onclick = async () => { if (await confirmar('Apagar simulado?', `${s.nome} e todos os resultados lançados.`, { botao: 'Apagar', perigo: true })) { await api(`simulados/${s.id}`, { metodo: 'DELETE' }); route(); toast('Simulado apagado.'); } };
}
acao('simulado-novo', () => formSimulado());
acao('simulado-editar', el => formSimulado(SIMULADOS.find(s => s.id === Number(el.dataset.id))));

rotaComParametro('simulado-', 'simulados', ['notas', 'relatorios'], async id => {
  if (!SIMULADOS.length) SIMULADOS = await api('simulados').catch(() => []);
  const s = SIMULADOS.find(x => x.id === Number(id));
  if (!s) { location.hash = '#simulados'; return; }
  const edita = pode('notas');
  const res = await api(`simulados/${s.id}/resultados`);
  const ac = new Map(res.map(r => [`${r.alunoId}-${r.disciplinaId}`, r.acertos]));
  const totalQ = s.disciplinas.reduce((t, d) => t + d.questoes, 0);
  const turmas = s.turmas.map(turmaDe).filter(Boolean);
  let filtro = turmas[0] ? turmas[0].id : null;
  const desenhar = () => {
    const alunos = (turmaDe(filtro)?.alunos || []).filter(ATIVO);
    const pct = a => { const v = s.disciplinas.map(d => ac.get(`${a.id}-${d.disciplinaId}`)); if (v.every(x => x == null)) return null; return Math.round(v.reduce((t, x) => t + (x || 0), 0) / totalQ * 100); };
    const ranking = [...alunos].filter(a => pct(a) != null).sort((x, y) => pct(y) - pct(x));
    const pos = new Map(ranking.map((a, i) => [a.id, i + 1]));
    view.innerHTML = html`
      <div class="page-title"><div><div class="crumb"><a href="#simulados">Simulados</a></div><h1>${s.nome}</h1><div class="muted">${dataBR(s.data)} · ${totalQ} questões</div></div>
        <div style="display:flex;gap:8px">${edita ? html`<button class="btn blue" id="simSalvar">${ic('check')} Salvar acertos</button>` : ''}<button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div></div>
      <section class="panel">
        <nav class="tabs">${turmas.map(t => html`<a href="#simulado-${s.id}" data-tt="${t.id}" class="${t.id === filtro ? 'on' : ''}">${t.nome}</a>`)}</nav>
        <div class="table-wrap"><table class="t" id="simGrade"><thead><tr><th>Aluno</th>${s.disciplinas.map(d => html`<th class="c">${discDe(d.disciplinaId)?.nome}<div class="muted" style="font-weight:400;text-transform:none">${d.questoes} q.</div></th>`)}<th class="c">Total</th><th class="c">Posição</th></tr></thead>
        <tbody>${alunos.map(a => html`<tr data-aluno="${a.id}"><td style="font-weight:700">${a.nome}</td>
          ${s.disciplinas.map(d => { const v = ac.get(`${a.id}-${d.disciplinaId}`); return html`<td class="c">${edita ? html`<input class="nota-in" data-d="${d.disciplinaId}" data-max="${d.questoes}" inputmode="numeric" value="${v ?? ''}">` : v ?? '–'}</td>`; })}
          <td class="c num" style="font-weight:800">${pct(a) == null ? '–' : `${pct(a)}%`}</td><td class="c num">${pos.get(a.id) ? `${pos.get(a.id)}º` : '–'}</td></tr>`)}</tbody></table></div>
        <div style="padding:12px 20px" class="muted">${s.disciplinas.map((d, i) => { const v = alunos.map(a => ac.get(`${a.id}-${d.disciplinaId}`)).filter(x => x != null); return html`${i ? ' · ' : ''}${discDe(d.disciplinaId)?.nome}: média ${v.length ? Math.round(v.reduce((t, x) => t + x, 0) / v.length / d.questoes * 100) + '%' : '–'}`; })}</div>
        <div id="simRes" style="padding:0 20px 16px"></div>
      </section>`;
    view.querySelectorAll('[data-tt]').forEach(a => a.onclick = e => { e.preventDefault(); filtro = Number(a.dataset.tt); desenhar(); });
    if (!edita) return;
    $('simSalvar').onclick = async () => {
      const resultados = [];
      let erro = false;
      view.querySelectorAll('#simGrade tr[data-aluno]').forEach(tr => tr.querySelectorAll('[data-d]').forEach(i => {
        const v = i.value.trim(), n = Number(v), ok = v === '' || (Number.isInteger(n) && n >= 0 && n <= Number(i.dataset.max));
        i.classList.toggle('err-in', !ok); if (!ok) erro = true;
        resultados.push({ alunoId: Number(tr.dataset.aluno), disciplinaId: Number(i.dataset.d), acertos: v === '' ? null : n });
      }));
      if (erro) { $('simRes').innerHTML = html`<p class="res bad">Há acertos inválidos (em vermelho): use de 0 até o número de questões.</p>`; return; }
      try {
        await api(`simulados/${s.id}/resultados`, { metodo: 'PUT', corpo: { resultados } });
        (await api(`simulados/${s.id}/resultados`)).forEach(r => ac.set(`${r.alunoId}-${r.disciplinaId}`, r.acertos));
        resultados.filter(r => r.acertos == null).forEach(r => ac.delete(`${r.alunoId}-${r.disciplinaId}`));
        desenhar(); toast('Acertos salvos.');
      } catch (e) { $('simRes').innerHTML = html`<p class="res bad">${e.message}</p>`; }
    };
  };
  desenhar();
});
