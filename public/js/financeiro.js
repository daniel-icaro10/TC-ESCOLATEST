'use strict';
/* =====================================================================
   Financeiro: mensalidades, pagamentos, recibos e inadimplência.
   ===================================================================== */
const reais = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const compBR = c => { const [a, m] = String(c).split('-'); return `${MESES[Number(m) - 1]}/${a}`; };
const SIT_COB = { aberta: ['A vencer', 'doing'], vencida: ['Vencida', 'bad'], paga: ['Paga', 'ok'], cancelada: ['Cancelada', 'todo'] };
let COBRANCAS = [], FIN_CFG = null, abaFin = 'cobrancas';
const filtroFin = { mes: '', turma: '', sit: '', q: '' };

tela('mensalidades', 'financeiro.ver', async () => {
  const ano = anoAtual(), edita = pode('financeiro');
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Financeiro</div><h1>Mensalidades ${ano}</h1></div>
      ${edita ? html`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="fin-config">${ic('settings')} Valores e multa</button><button class="btn" data-act="fin-avulsa">+ Cobrança avulsa</button><button class="btn blue" data-act="fin-gerar">Gerar mensalidades</button></div>` : ''}</div>
    <section class="panel"><div class="kpis" id="finKpis"></div></section>
    <section class="panel">
      <nav class="tabs"><a href="#mensalidades" data-aba="cobrancas" class="${abaFin === 'cobrancas' ? 'on' : ''}">Cobranças</a><a href="#mensalidades" data-aba="valores" class="${abaFin === 'valores' ? 'on' : ''}">Valores por aluno</a></nav>
      <div id="finCorpo"><div class="vazio">Carregando…</div></div>
    </section>`;
  view.querySelectorAll('[data-aba]').forEach(a => a.onclick = e => { e.preventDefault(); abaFin = a.dataset.aba; route(); });
  try { [COBRANCAS, FIN_CFG] = await Promise.all([api(`cobrancas?ano=${ano}`), api('financeiro/config')]); } catch (e) { $('finCorpo').innerHTML = html`<p class="res bad" style="margin:20px">${e.message}</p>`; return; }
  if (!$('finCorpo')) return;
  const ativas = COBRANCAS.filter(c => !c.cancelada);
  $('finKpis').innerHTML = html`
    <div class="kpi"><span>Previsto no ano</span><b>${reais(ativas.reduce((s, c) => s + c.liquido, 0))}</b></div>
    <div class="kpi"><span>Recebido</span><b style="color:var(--green)">${reais(ativas.reduce((s, c) => s + (c.valorPago || 0), 0))}</b></div>
    <div class="kpi"><span>A vencer</span><b>${reais(ativas.filter(c => c.situacao === 'aberta').reduce((s, c) => s + c.liquido, 0))}</b></div>
    <div class="kpi"><span>Vencido (com encargos)</span><b style="color:var(--red)">${reais(ativas.filter(c => c.situacao === 'vencida').reduce((s, c) => s + c.total, 0))}</b></div>`;
  if (abaFin === 'valores') return abaValores(ano, edita);
  const meses = [...new Set(COBRANCAS.map(c => c.competencia))].sort();
  $('finCorpo').innerHTML = html`
    <div class="filters">
      <label class="field" for="fMes">Mês<select id="fMes"><option value="">Todos</option>${meses.map(m => html`<option value="${m}">${compBR(m)}</option>`)}</select></label>
      <label class="field" for="fTurma">Turma<select id="fTurma"><option value="">Todas</option>${TURMAS.filter(t => t.anoLetivo === ano).map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
      <label class="field" for="fSit">Situação<select id="fSit"><option value="">Todas</option>${Object.entries(SIT_COB).map(([k, [t]]) => html`<option value="${k}">${t}</option>`)}</select></label>
      <label class="field" for="fQ" style="flex:1;max-width:280px">Aluno<input id="fQ" type="search"></label>
    </div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Aluno</th><th>Cobrança</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div id="cnt" class="muted" style="padding:12px 16px;font-size:.85rem;border-top:1px solid var(--line)"></div>`;
  $('fMes').value = filtroFin.mes; $('fTurma').value = filtroFin.turma; $('fSit').value = filtroFin.sit; $('fQ').value = filtroFin.q;
  const draw = () => {
    Object.assign(filtroFin, { mes: $('fMes').value, turma: $('fTurma').value, sit: $('fSit').value, q: $('fQ').value });
    const q = filtroFin.q.trim().toLowerCase();
    const l = COBRANCAS.filter(c => { const a = alunoDe(c.alunoId); return a && (!filtroFin.mes || c.competencia === filtroFin.mes) && (!filtroFin.turma || a.turma === Number(filtroFin.turma)) && (!filtroFin.sit || c.situacao === filtroFin.sit) && (!q || a.nome.toLowerCase().includes(q)); });
    $('rows').innerHTML = html`${l.length ? l.slice(0, 300).map(c => { const a = alunoDe(c.alunoId); return html`<tr>
      <td style="font-weight:700">${a.nome}<div class="muted" style="font-weight:400;font-size:.8rem">${turmaDe(a.turma)?.nome || ''}</div></td>
      <td>${c.descricao}<div class="muted" style="font-size:.8rem">${compBR(c.competencia)}</div></td><td class="num">${dataBR(c.vencimento)}</td>
      <td class="r num">${reais(c.liquido)}${c.desconto ? html`<div class="muted" style="font-size:.76rem">desc. ${reais(c.desconto)}</div>` : ''}${c.situacao === 'vencida' ? html`<div style="font-size:.76rem;color:var(--red)">hoje ${reais(c.total)}</div>` : ''}</td>
      <td><span class="pill ${SIT_COB[c.situacao][1]}">${SIT_COB[c.situacao][0]}</span>${c.pagoEm ? html`<div class="muted" style="font-size:.76rem">${dataBR(c.pagoEm)} · ${c.forma}</div>` : ''}</td>
      <td class="r"><div class="acoes">${c.pagoEm ? html`<a class="btn sm" href="#recibo-${c.id}">Recibo</a>` : ''}${edita && !c.cancelada ? html`${!c.pagoEm ? html`<button class="btn sm blue" data-act="fin-receber" data-id="${c.id}">Receber</button>` : ''}<button class="btn sm" data-act="fin-editar" data-id="${c.id}">Editar</button>` : ''}</div></td></tr>`; })
      : linhaVazia(6, COBRANCAS.length ? 'Nenhuma cobrança com esses filtros.' : `Nenhuma mensalidade gerada para ${ano}. Clique em Gerar mensalidades.`)}`;
    const soma = l.filter(c => !c.cancelada).reduce((s, c) => s + c.liquido, 0);
    $('cnt').textContent = `${plural(l.length, 'cobrança', 'cobranças')} · ${reais(soma)}${l.length > 300 ? ' · mostrando as 300 primeiras' : ''}`;
  };
  ['fMes', 'fTurma', 'fSit', 'fQ'].forEach(id => $(id).addEventListener('input', draw));
  draw();
});

async function abaValores(ano, edita) {
  const valores = new Map((await api(`financeiro/alunos?ano=${ano}`)).map(v => [v.alunoId, v]));
  const alunos = ALUNOS.filter(a => ATIVO(a) && turmaDe(a.turma)?.anoLetivo === ano).sort(sortNome);
  $('finCorpo').innerHTML = html`
    <p class="muted" style="padding:14px 20px 0;margin:0;font-size:.86rem">Mensalidade padrão: <b>${reais(FIN_CFG.valorPadrao)}</b>, vencimento dia <b>${FIN_CFG.diaVencimento}</b>. Aqui ficam as exceções: valor diferente, bolsa ou outro dia de vencimento. Vale para as mensalidades geradas depois da alteração.</p>
    <div class="filters"><label class="field" for="vQ" style="flex:1;max-width:320px">Aluno<input id="vQ" type="search"></label><label class="field" for="vSo">Mostrar<select id="vSo"><option value="">Todos</option><option value="exc">Só com exceção</option></select></label></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Aluno</th><th>Turma</th><th class="r">Mensalidade</th><th class="r">Bolsa</th><th>Vencimento</th><th></th></tr></thead><tbody id="vRows"></tbody></table></div>`;
  const draw = () => {
    const q = $('vQ').value.trim().toLowerCase(), so = $('vSo').value;
    const l = alunos.filter(a => (!q || a.nome.toLowerCase().includes(q)) && (!so || valores.has(a.id)));
    $('vRows').innerHTML = html`${l.length ? l.slice(0, 200).map(a => { const v = valores.get(a.id) || {}; return html`<tr><td style="font-weight:700">${a.nome}</td><td>${turmaDe(a.turma)?.nome}</td>
      <td class="r num">${reais(v.valor ?? FIN_CFG.valorPadrao)}${v.valor == null ? html`<div class="muted" style="font-size:.76rem">padrão</div>` : ''}</td><td class="r">${v.bolsaPct ? `${String(v.bolsaPct).replace('.', ',')}%` : '–'}</td>
      <td>dia ${v.diaVencimento || FIN_CFG.diaVencimento}</td><td class="r">${edita ? html`<button class="btn sm" data-act="fin-valor" data-aluno="${a.id}">Alterar</button>` : ''}</td></tr>`; }) : linhaVazia(6, 'Nenhum aluno.')}`;
  };
  $('vQ').oninput = draw; $('vSo').onchange = draw; draw();
  ACOES['fin-valor'] = el => {
    const a = alunoDe(el.dataset.aluno), v = valores.get(a.id) || {};
    openForm({
      title: 'Valores do aluno', sub: `${a.nome} · ${ano}`, submit: 'Salvar', values: { valor: v.valor ?? '', bolsaPct: v.bolsaPct || '', diaVencimento: v.diaVencimento || '', observacao: v.observacao || '' },
      fields: [
        { name: 'valor', label: 'Mensalidade (em branco = padrão)', inputmode: 'decimal', placeholder: String(FIN_CFG.valorPadrao).replace('.', ',') },
        { name: 'bolsaPct', label: 'Bolsa / desconto (%)', inputmode: 'decimal', placeholder: '0' },
        { name: 'diaVencimento', label: 'Dia de vencimento (em branco = padrão)', type: 'number', min: 1, max: 28 },
        { name: 'observacao', label: 'Observação', full: true, placeholder: 'Ex.: irmão na escola, bolsa da prefeitura' }
      ],
      onSave: d => api(`financeiro/alunos/${a.id}`, { metodo: 'PUT', corpo: { ...d, ano } }).then(() => { route(); toast('Valores do aluno salvos.'); })
    });
  };
}

acao('fin-config', async () => {
  const c = FIN_CFG || await api('financeiro/config');
  openForm({
    title: 'Valores e multa', sub: 'Valem para as mensalidades geradas depois da alteração', submit: 'Salvar',
    values: { valorPadrao: String(c.valorPadrao).replace('.', ','), diaVencimento: c.diaVencimento, multaPct: String(c.multaPct).replace('.', ','), jurosMesPct: String(c.jurosMesPct).replace('.', ',') },
    fields: [
      { name: 'valorPadrao', label: 'Mensalidade padrão (R$)', required: true, inputmode: 'decimal' },
      { name: 'diaVencimento', label: 'Dia de vencimento', type: 'number', required: true, min: 1, max: 28 },
      { name: 'multaPct', label: 'Multa por atraso (%)', required: true, inputmode: 'decimal', hint: 'Máximo de 2% pelo Código de Defesa do Consumidor.' },
      { name: 'jurosMesPct', label: 'Juros por mês de atraso (%)', required: true, inputmode: 'decimal', hint: 'Calculado por dia de atraso. O comum é 1% ao mês.' }
    ],
    onSave: d => api('financeiro/config', { metodo: 'PUT', corpo: d }).then(() => { route(); toast('Configuração do financeiro salva.'); })
  });
});
acao('fin-gerar', () => {
  const ano = anoAtual();
  openForm({
    title: 'Gerar mensalidades', sub: `Ano ${ano} · só para alunos ativos · não duplica mensalidades que já existem`, submit: 'Gerar',
    values: { meses: [] },
    fields: [
      { name: 'meses', label: 'Meses', type: 'checks', required: true, options: MESES.map((m, i) => ({ v: i + 1, t: m })) },
      { name: 'turmaId', label: 'Turma', type: 'select', vazio: 'Todas as turmas', options: TURMAS.filter(t => t.anoLetivo === ano).map(t => ({ v: t.id, t: t.nome })) }
    ],
    note: `Valor de cada aluno: o padrão (${reais((FIN_CFG || {}).valorPadrao)}) ou o definido em Valores por aluno, já com a bolsa. Bolsa de 100% não gera cobrança.`,
    onSave: async d => {
      const r = await api('financeiro/gerar', { metodo: 'POST', corpo: { ano, meses: d.meses.map(Number), turmaId: d.turmaId ? Number(d.turmaId) : null } });
      route(); toast(`${plural(r.criadas, 'mensalidade gerada', 'mensalidades geradas')}.${r.semValor ? ` ${r.semValor} aluno(s) sem valor definido: configure a mensalidade padrão.` : ''}`, 6000);
    }
  });
});
acao('fin-avulsa', () => openForm({
  title: 'Cobrança avulsa', sub: 'Material, uniforme, passeio, segunda via…', submit: 'Lançar', values: { vencimento: hojeISO() },
  fields: [
    { name: 'alunoId', label: 'Aluno', type: 'select', required: true, full: true, options: ALUNOS.filter(ATIVO).sort(sortNome).map(a => ({ v: a.id, t: `${a.nome} · ${turmaDe(a.turma)?.nome || ''}` })) },
    { name: 'descricao', label: 'Descrição', required: true, full: true },
    { name: 'valor', label: 'Valor (R$)', required: true, inputmode: 'decimal' }, { name: 'vencimento', label: 'Vencimento', type: 'date', required: true }
  ],
  onSave: d => api('cobrancas', { metodo: 'POST', corpo: { ...d, alunoId: Number(d.alunoId) } }).then(() => { route(); toast('Cobrança lançada.'); })
}));
acao('fin-receber', el => {
  const c = COBRANCAS.find(x => x.id === Number(el.dataset.id)), a = alunoDe(c.alunoId);
  openForm({
    title: 'Registrar pagamento', sub: `${a.nome} · ${c.descricao} ${compBR(c.competencia)} · vencimento ${dataBR(c.vencimento)}`, submit: 'Registrar pagamento',
    values: { data: hojeISO(), valorPago: c.total.toFixed(2).replace('.', ','), forma: 'PIX' },
    fields: [
      { name: 'data', label: 'Data do pagamento', type: 'date', required: true, max: hojeISO() },
      { name: 'valorPago', label: 'Valor pago (R$)', required: true, inputmode: 'decimal' },
      { name: 'forma', label: 'Forma', type: 'select', required: true, vazio: false, options: FIN_CFG.formas.map(v => ({ v, t: v })) },
      { name: 'observacao', label: 'Observação', full: true }
    ],
    note: c.dias ? `Em atraso há ${plural(c.dias, 'dia', 'dias')}: ${reais(c.liquido)} + multa ${reais(c.multa)} + juros ${reais(c.juros)} = ${reais(c.total)}. Se combinar outro valor, altere acima.` : `Valor: ${reais(c.liquido)}.`,
    onSave: async d => { const r = await api(`cobrancas/${c.id}`, { metodo: 'PUT', corpo: { ...d, acao: 'pagar' } }); location.hash = `#recibo-${r.id}`; toast('Pagamento registrado.'); }
  });
});
acao('fin-editar', el => {
  const c = COBRANCAS.find(x => x.id === Number(el.dataset.id)), a = alunoDe(c.alunoId);
  const form = openForm({
    title: 'Cobrança', sub: `${a.nome} · ${c.descricao} ${compBR(c.competencia)}`, submit: c.pagoEm ? 'Fechar' : 'Salvar',
    values: { valor: String(c.valor).replace('.', ','), desconto: String(c.desconto).replace('.', ','), vencimento: c.vencimento, observacao: c.observacao || '' },
    fields: c.pagoEm ? [] : [
      { name: 'valor', label: 'Valor (R$)', required: true, inputmode: 'decimal' }, { name: 'desconto', label: 'Desconto (R$)', inputmode: 'decimal' },
      { name: 'vencimento', label: 'Vencimento', type: 'date', required: true }, { name: 'observacao', label: 'Observação', full: true }
    ],
    note: c.pagoEm ? `Paga em ${dataBR(c.pagoEm)}: ${reais(c.valorPago)} (${c.forma}), recebido por ${c.recebidoPor || '–'}.` : '',
    extraBotoes: html`<button type="button" class="btn red" id="cobAcao" style="margin-right:auto">${c.pagoEm ? 'Estornar pagamento' : 'Cancelar cobrança'}</button>`,
    onSave: d => c.pagoEm ? null : api(`cobrancas/${c.id}`, { metodo: 'PUT', corpo: d }).then(() => { route(); toast('Cobrança salva.'); })
  });
  form.querySelector('#cobAcao').onclick = async () => {
    const estorno = !!c.pagoEm;
    if (!await confirmar(estorno ? 'Estornar pagamento?' : 'Cancelar cobrança?', estorno ? 'A cobrança volta a ficar em aberto.' : 'A cobrança deixa de valer e sai da inadimplência.', { botao: estorno ? 'Estornar' : 'Cancelar cobrança', perigo: true })) return;
    await api(`cobrancas/${c.id}`, { metodo: 'PUT', corpo: { acao: estorno ? 'estornar' : 'cancelar' } }); route(); toast(estorno ? 'Pagamento estornado.' : 'Cobrança cancelada.');
  };
});

/* ---------- Recibo ---------- */
function valorPorExtenso(v) {
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => { if (n === 100) return 'cem'; const p = []; if (n >= 100) { p.push(c[Math.floor(n / 100)]); n %= 100; } if (n >= 20) { p.push(d[Math.floor(n / 10)]); n %= 10; } if (n) p.push(u[n]); return p.join(' e '); };
  const inteiro = Math.floor(v), cent = Math.round((v - inteiro) * 100);
  const mil = Math.floor(inteiro / 1000), resto = inteiro % 1000;
  let s = [mil ? (mil === 1 ? 'mil' : `${ate999(mil)} mil`) : '', resto ? ate999(resto) : ''].filter(Boolean).join(resto && (resto < 100 || resto % 100 === 0) ? ' e ' : ' ');
  s = inteiro ? `${s || 'zero'} ${inteiro === 1 ? 'real' : 'reais'}` : '';
  if (cent) s += `${s ? ' e ' : ''}${ate999(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`;
  return s || 'zero reais';
}
rotaComParametro('recibo-', 'mensalidades', 'financeiro.ver', async id => {
  const c = (await api(`cobrancas?ano=${anoAtual()}`)).concat(COBRANCAS).find(x => x.id === Number(id));
  if (!c || !c.pagoEm) { view.innerHTML = html`<section class="panel vazio">Recibo não encontrado (a cobrança não está paga).</section>`; return; }
  const a = alunoDe(c.alunoId), e = SESSAO.escola, resp = RESP.find(r => r.alunoId === c.alunoId);
  view.innerHTML = html`
    <div class="page-title no-print"><div><div class="crumb"><a href="#mensalidades">Mensalidades</a></div><h1>Recibo</h1></div><button class="btn blue" data-act="imprimir">${ic('print')} Imprimir</button></div>
    <article class="panel" style="max-width:720px;padding:28px;line-height:1.7">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px">
        <div><b style="font-size:1.1rem">${e.nome}</b><div class="muted" style="font-size:.84rem">${[e.cnpj && `CNPJ ${e.cnpj}`, e.endereco, e.cidade, e.telefone].filter(Boolean).join(' · ')}</div></div>
        <div style="text-align:right"><b style="font-size:1.2rem">RECIBO Nº ${String(c.id).padStart(6, '0')}</b><div style="font-size:1.2rem;font-weight:800">${reais(c.valorPago)}</div></div>
      </div>
      <p>Recebemos de <b>${resp ? resp.nome : 'responsável por ' + a.nome}</b> a importância de <b>${reais(c.valorPago)}</b> (${valorPorExtenso(c.valorPago)}),
        referente a <b>${c.descricao} de ${compBR(c.competencia)}</b> do(a) aluno(a) <b>${a.nome}</b>, matrícula ${a.mat}${turmaDe(a.turma) ? `, ${turmaDe(a.turma).nome}` : ''}.</p>
      <p class="muted" style="font-size:.88rem">Pagamento em ${dataBR(c.pagoEm)} · ${c.forma}${c.desconto ? ` · desconto de ${reais(c.desconto)}` : ''}${c.valorPago > c.liquido ? ` · inclui multa e juros de ${reais(c.valorPago - c.liquido)}` : ''}.</p>
      <p style="margin-top:48px;text-align:center">______________________________________<br>${c.recebidoPor || e.nome}<br><span class="muted" style="font-size:.84rem">${e.cidade ? e.cidade + ', ' : ''}${new Date(c.pagoEm + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span></p>
    </article>`;
});

/* ================= Inadimplência ================= */
tela('inadimplencia', 'financeiro.ver', async () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Financeiro</div><h1>Inadimplência</h1></div><div style="display:flex;gap:8px"><button class="btn" id="inExport">${ic('download')} Exportar planilha</button><button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div></div>
    <section class="panel"><div class="kpis" id="inKpis"></div></section>
    <section class="panel"><div class="filters"><label class="field" for="inTurma">Turma<select id="inTurma"><option value="">Todas</option>${TURMAS.filter(t => t.anoLetivo === anoAtual()).map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
      <label class="field" for="inMin">Atraso<select id="inMin"><option value="0">Qualquer</option><option value="30">Mais de 30 dias</option><option value="60">Mais de 60 dias</option><option value="90">Mais de 90 dias</option></select></label></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Aluno</th><th>Parcelas vencidas</th><th>Maior atraso</th><th class="r">Total devido</th><th>Responsável</th><th class="no-print"></th></tr></thead><tbody id="rows">${linhaVazia(6, 'Carregando…')}</tbody></table></div></section>`;
  let lista = [];
  try { lista = await api('cobrancas'); } catch (e) { $('rows').innerHTML = html`<tr><td colspan="6"><p class="res bad">${e.message}</p></td></tr>`; return; }
  const grupos = Object.values(lista.filter(c => c.situacao === 'vencida').reduce((acc, c) => { (acc[c.alunoId] = acc[c.alunoId] || { alunoId: c.alunoId, cobs: [] }).cobs.push(c); return acc; }, {}))
    .map(g => ({ ...g, a: alunoDe(g.alunoId), total: g.cobs.reduce((s, c) => s + c.total, 0), dias: Math.max(...g.cobs.map(c => c.dias)), resp: RESP.find(r => r.alunoId === g.alunoId) }))
    .filter(g => g.a).sort((x, y) => y.total - x.total);
  const filtrar = () => grupos.filter(g => (!$('inTurma').value || g.a.turma === Number($('inTurma').value)) && g.dias > Number($('inMin').value));
  const whats = g => {
    const tel = String(g.resp?.tel || '').replace(/\D/g, '');
    if (tel.length < 10) return null;
    const msg = `Olá, ${primeiroNome(g.resp.nome)}! Aqui é do ${SESSAO.escola.nome}. Consta em aberto ${plural(g.cobs.length, 'parcela', 'parcelas')} de ${g.a.nome} (${g.cobs.map(c => compBR(c.competencia)).join(', ')}), total atualizado de ${reais(g.total)}. Se já pagou, desconsidere. Qualquer dúvida, estamos à disposição.`;
    return `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
  };
  const draw = () => {
    const l = filtrar();
    $('inKpis').innerHTML = html`<div class="kpi"><span>Alunos com atraso</span><b>${l.length}</b></div><div class="kpi"><span>Parcelas vencidas</span><b>${l.reduce((s, g) => s + g.cobs.length, 0)}</b></div>
      <div class="kpi"><span>Total devido</span><b style="color:var(--red)">${reais(l.reduce((s, g) => s + g.total, 0))}</b></div><div class="kpi"><span>Atraso acima de 60 dias</span><b>${l.filter(g => g.dias > 60).length}</b></div>`;
    $('rows').innerHTML = html`${l.length ? l.map(g => { const w = whats(g); return html`<tr><td style="font-weight:700">${g.a.nome}<div class="muted" style="font-weight:400;font-size:.8rem">${turmaDe(g.a.turma)?.nome || ''}</div></td>
      <td>${g.cobs.length}<div class="muted" style="font-size:.78rem">${g.cobs.map(c => compBR(c.competencia).slice(0, 3) + '/' + c.competencia.slice(2, 4)).join(', ')}</div></td>
      <td>${plural(g.dias, 'dia', 'dias')}</td><td class="r num" style="font-weight:800;color:var(--red)">${reais(g.total)}</td>
      <td>${g.resp ? html`${g.resp.nome}<div class="muted num" style="font-size:.8rem">${g.resp.tel}</div>` : html`<span class="muted">Sem responsável</span>`}</td>
      <td class="r no-print"><div class="acoes">${w ? html`<a class="btn sm" href="${w}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button class="btn sm" data-act="in-ver" data-aluno="${g.alunoId}">Parcelas</button></div></td></tr>`; })
      : linhaVazia(6, 'Nenhum aluno com mensalidade vencida.')}`;
  };
  $('inTurma').onchange = draw; $('inMin').onchange = draw; draw();
  $('inExport').onclick = () => {
    const linhas = [['Aluno', 'Matrícula', 'Turma', 'Parcelas', 'Meses', 'Maior atraso (dias)', 'Total devido', 'Responsável', 'Telefone', 'E-mail']]
      .concat(filtrar().map(g => [g.a.nome, g.a.mat, turmaDe(g.a.turma)?.nome || '', g.cobs.length, g.cobs.map(c => compBR(c.competencia)).join(' / '), g.dias, g.total.toFixed(2).replace('.', ','), g.resp?.nome || '', g.resp?.tel || '', g.resp?.email || '']));
    baixar(`inadimplencia-${hojeISO()}.csv`, '﻿' + linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  };
  ACOES['in-ver'] = el => {
    const g = grupos.find(x => x.alunoId === Number(el.dataset.aluno));
    modal({ titulo: g.a.nome, sub: 'Parcelas vencidas', largura: 640,
      corpo: html`<table class="t"><thead><tr><th>Cobrança</th><th>Vencimento</th><th class="r">Valor</th><th class="r">Multa + juros</th><th class="r">Total</th></tr></thead>
        <tbody>${g.cobs.map(c => html`<tr><td>${c.descricao} ${compBR(c.competencia)}</td><td class="num">${dataBR(c.vencimento)}</td><td class="r num">${reais(c.liquido)}</td><td class="r num">${reais(c.multa + c.juros)}</td><td class="r num" style="font-weight:700">${reais(c.total)}</td></tr>`)}</tbody></table>`,
      rodape: html`<button class="btn blue" data-close>Fechar</button>` });
  };
});
