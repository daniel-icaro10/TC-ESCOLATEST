'use strict';
/* =====================================================================
   Lançamento de notas e faltas, importação de alunos por planilha
   e histórico escolar.
   ===================================================================== */

/* ================= Notas e faltas ================= */
const COLUNAS_NOTA = [['at', 'AT', 3, 'Atividades (até 3,0)'], ['tbl', 'TBL', 7, 'Trabalho (até 7,0)'], ['te', 'TESTE', 10, 'Teste (até 10,0)'], ['pr', 'PROVA', 10, 'Prova (até 10,0)'], ['rp', 'RP', 10, 'Recuperação paralela (até 10,0)']];
const numNota = v => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? null : Number(s); };

function telaEscolherNotas() {
  const ano = anoAtual();
  const turmas = TURMAS.filter(t => t.anoLetivo === ano);
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Alteração de notas e faltas</h1></div></div>
    <section class="panel"><div class="filters">
      <label class="field" for="nTurma">Turma<select id="nTurma">${turmas.map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
      <label class="field" for="nDisc">Disciplina<select id="nDisc"></select></label>
      <button class="btn blue" id="nAbrir">Abrir diário</button>
    </div></section>`;
  const discs = () => { const t = turmaDe($('nTurma').value); $('nDisc').innerHTML = html`${t ? t.disciplinas.map(d => html`<option value="${d.id}">${d.nome}${d.prof ? ` · ${d.prof}` : ''}</option>`) : ''}`; };
  $('nTurma').onchange = discs; discs();
  $('nAbrir').onclick = () => { location.hash = `#notas-${$('nTurma').value}-${$('nDisc').value}`; };
}
tela('notas', 'notas', telaEscolherNotas);

rotaComParametro('notas-', 'notas', ['notas', 'notas.proprias'], arg => {
  const [tid, did, b] = arg.split('-').map(Number);
  const t = turmaDe(tid), d = t && t.disciplinas.find(x => x.id === did);
  if (!t || !d) { location.hash = pode('notas') ? '#notas' : '#meus-diarios'; return; }
  const bim = b >= 1 && b <= 4 ? b : 1;
  const geral = pode('notas');
  const dono = SESSAO.usuario.professorId && d.profId === SESSAO.usuario.professorId;
  const bloqueio = !geral && (t.bloqueada || t.finalizada) ? 'Os lançamentos desta turma estão bloqueados pela secretaria.'
    : !geral && d.entregue ? 'Este diário já foi entregue. Para alterar, peça à secretaria para reabrir.' : !geral && !dono ? 'Esta disciplina não é sua.' : '';
  const alunos = t.alunos;
  view.innerHTML = html`
    <div class="page-title">
      <div><div class="crumb"><a href="${geral ? '#notas' : '#meus-diarios'}">${geral ? 'Alteração de notas e faltas' : 'Meus diários'}</a> / ${t.nome}</div>
        <h1>${d.nome} · ${t.nome}</h1><div class="muted" style="font-size:.9rem">${d.prof ? `Professor(a): ${d.prof}` : 'Sem professor'} · ${t.anoLetivo}${d.entregue ? ' · Diário entregue' : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${!bloqueio ? html`<button class="btn blue" id="nSalvar">${ic('check')} Salvar ${bim}º bimestre</button>` : ''}</div>
    </div>
    ${bloqueio ? html`<div class="aviso">${ic('lock')}<div><b>Somente leitura</b><span>${bloqueio}</span></div></div>` : ''}
    <section class="panel">
      <nav class="tabs" aria-label="Bimestres">${[1, 2, 3, 4].map(n => html`<a href="#notas-${t.id}-${d.id}-${n}" class="${n === bim ? 'on' : ''}" data-bim="${n}">${n}º bimestre</a>`)}</nav>
      <div class="table-wrap"><table class="t" id="gradeNotas">
        <thead><tr><th>Nº</th><th>Aluno</th>${COLUNAS_NOTA.map(([, r, , tit]) => html`<th class="c" title="${tit}">${r}</th>`)}<th class="c">Média</th><th class="c">Faltas</th></tr></thead>
        <tbody>${alunos.length ? alunos.map((a, i) => {
          const n = (a.notas[d.id] || [])[bim - 1] || {}, f = (a.faltasBim[d.id] || [])[bim - 1] || 0;
          const off = !!bloqueio || !ATIVO(a);
          return html`<tr data-aluno="${a.id}" class="${!ATIVO(a) ? 'muted' : ''}">
            <td class="num muted">${String(i + 1).padStart(2, '0')}</td>
            <td style="font-weight:700;font-size:.86rem;text-transform:uppercase">${a.nome}${!ATIVO(a) ? html` <span class="pill todo">${SITUACAO[a.situacao]}</span>` : ''}</td>
            ${COLUNAS_NOTA.map(([k, r, max]) => html`<td class="c"><input class="nota-in" data-k="${k}" data-max="${max}" inputmode="decimal" value="${fmt(n[k])}" aria-label="${r} de ${a.nome}" ${off ? seguro('disabled') : ''}></td>`)}
            <td class="c num med" data-media style="font-weight:800">${fmt(mediaBim((a.notas[d.id] || [])[bim - 1]))}</td>
            <td class="c"><input class="nota-in" data-k="faltas" data-max="500" inputmode="numeric" value="${f || ''}" style="width:56px" aria-label="Faltas de ${a.nome}" ${off ? seguro('disabled') : ''}></td></tr>`;
        }) : linhaVazia(9, 'Nenhum aluno nesta turma.')}</tbody>
      </table></div>
      <p class="muted" style="padding:12px 20px;margin:0;font-size:.82rem">Média do bimestre = (AT + TBL + TESTE + PROVA) ÷ 3. Se a recuperação (RP) for maior que a média, a média passa a ser (média + RP) ÷ 2. Use vírgula ou ponto. Enter vai para o aluno de baixo.</p>
      <div id="nRes" style="padding:0 20px 16px" role="status"></div>
    </section>`;
  let alterado = false;
  const grade = $('gradeNotas');
  const validar = inp => {
    const v = numNota(inp.value), max = Number(inp.dataset.max);
    const ok = v === null || (Number.isFinite(v) && v >= 0 && v <= max && (inp.dataset.k !== 'faltas' || Number.isInteger(v)));
    inp.classList.toggle('err-in', !ok);
    return ok;
  };
  grade.addEventListener('input', e => {
    const inp = e.target.closest('.nota-in'); if (!inp) return;
    alterado = true; validar(inp);
    const tr = inp.closest('tr'), n = {};
    tr.querySelectorAll('.nota-in').forEach(x => { if (x.dataset.k !== 'faltas') n[x.dataset.k] = numNota(x.value); });
    const m = mediaBim(n);
    const cel = tr.querySelector('[data-media]'); cel.textContent = fmt(m); cel.classList.toggle('low', m != null && m < 6);
  });
  grade.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('.nota-in'); if (!inp) return;
    e.preventDefault();
    const prox = inp.closest('tr').nextElementSibling;
    const alvo = prox && prox.querySelector(`.nota-in[data-k="${inp.dataset.k}"]:not([disabled])`);
    if (alvo) { alvo.focus(); alvo.select(); }
  });
  view.querySelectorAll('[data-bim]').forEach(a => a.addEventListener('click', e => {
    if (alterado && !confirm('Há notas não salvas neste bimestre. Sair sem salvar?')) e.preventDefault();
  }));
  const avisoSaida = e => { if (alterado) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', avisoSaida);
  aoSairDaTela.push(() => window.removeEventListener('beforeunload', avisoSaida));
  if ($('nSalvar')) $('nSalvar').onclick = async () => {
    const invalidos = [...grade.querySelectorAll('.nota-in:not([disabled])')].filter(x => !validar(x));
    if (invalidos.length) { $('nRes').innerHTML = html`<p class="res bad">Há ${plural(invalidos.length, 'valor inválido', 'valores inválidos')} (em vermelho). AT vai até 3, TBL até 7 e as outras notas até 10. Faltas: número inteiro.</p>`; invalidos[0].focus(); return; }
    const lancamentos = [...grade.querySelectorAll('tr[data-aluno]')].filter(tr => !tr.querySelector('.nota-in[disabled]')).map(tr => {
      const l = { alunoId: Number(tr.dataset.aluno) };
      tr.querySelectorAll('.nota-in').forEach(x => { l[x.dataset.k] = numNota(x.value); });
      return l;
    });
    $('nSalvar').disabled = true;
    try {
      await api('notas', { metodo: 'PUT', corpo: { turmaId: t.id, disciplinaId: d.id, bimestre: bim, lancamentos } });
      alterado = false;
      await carregarDados(); route();
      toast(`Notas e faltas do ${bim}º bimestre salvas.`);
    } catch (e) { $('nRes').innerHTML = html`<p class="res bad">${e.message}</p>`; $('nSalvar').disabled = false; }
  };
});

/* ================= Importar planilha ================= */
const CAMPOS_IMPORT = [
  ['nome', 'Nome do aluno', true, ['nome', 'aluno', 'nome do aluno', 'nome completo', 'nome completo do aluno', 'estudante']],
  ['nascimento', 'Data de nascimento', true, ['nascimento', 'data de nascimento', 'data nascimento', 'dt nasc', 'dt nascimento', 'nasc', 'data nasc']],
  ['turma', 'Turma', true, ['turma', 'classe', 'turma atual', 'nome da turma']],
  ['matricula', 'Matrícula', false, ['matricula', 'matrícula', 'ra', 'codigo', 'código', 'n matricula', 'numero de matricula']],
  ['turno', 'Turno', false, ['turno', 'periodo', 'período']],
  ['sexo', 'Sexo', false, ['sexo', 'genero', 'gênero']],
  ['cpf', 'CPF do aluno', false, ['cpf', 'cpf do aluno', 'cpf aluno']],
  ['naturalidade', 'Naturalidade', false, ['naturalidade', 'cidade de nascimento', 'local de nascimento']],
  ['endereco', 'Endereço', false, ['endereco', 'endereço', 'logradouro', 'endereco completo']],
  ['observacoes', 'Observações', false, ['observacoes', 'observações', 'obs', 'observacao']],
  ['responsavel', 'Nome do responsável', false, ['responsavel', 'responsável', 'nome do responsavel', 'nome do responsável', 'mae', 'mãe', 'nome da mae', 'nome da mãe', 'filiacao', 'filiação']],
  ['parentesco', 'Parentesco', false, ['parentesco', 'grau de parentesco', 'vinculo', 'vínculo']],
  ['telefone', 'Telefone', false, ['telefone', 'celular', 'tel', 'fone', 'whatsapp', 'telefone do responsavel', 'contato']],
  ['email', 'E-mail', false, ['email', 'e-mail', 'e mail', 'email do responsavel']],
  ['cpfResponsavel', 'CPF do responsável', false, ['cpf do responsavel', 'cpf do responsável', 'cpf responsavel', 'cpf resp']],
  ['consentimento', 'Autorização de biometria (Sim/Não)', false, ['consentimento', 'autorizacao', 'autorização', 'biometria', 'autorizacao biometria', 'autoriza biometria']]
];
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* lê CSV com ; , ou tab, aspas e quebras de linha dentro de aspas */
function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = [';', ',', '\t'].map(s => [s, primeira.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo); if (linha.some(x => x.trim())) linhas.push(linha);
  return linhas;
}
async function lerArquivoTexto(arq) {
  const buf = await arq.arrayBuffer();
  // planilhas salvas pelo Excel no Brasil costumam vir em Windows-1252, não em UTF-8
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

tela('importar', 'cadastros', () => {
  let cabecalho = [], dadosCsv = [];
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Cadastro</div><h1>Importar alunos por planilha</h1></div>
      <button class="btn" id="iModelo">${ic('download')} Baixar planilha modelo</button></div>
    <section class="panel">
      <div class="panel-h">${ic('upload')}<h2>1. Escolha a planilha</h2></div>
      <div style="padding:16px 22px 20px;display:flex;flex-direction:column;gap:12px">
        <p class="muted" style="margin:0;font-size:.9rem">Exporte do sistema antigo ou do Excel no formato <b>CSV</b>: no Excel, <i>Arquivo &gt; Salvar como &gt; CSV (separado por vírgulas ou ponto e vírgula)</i>. A primeira linha precisa ter os nomes das colunas. Obrigatórios: nome do aluno, data de nascimento e turma.</p>
        <label class="btn blue" for="iArq" style="align-self:flex-start;cursor:pointer">${ic('upload')} Escolher arquivo CSV</label>
        <input type="file" id="iArq" accept=".csv,.txt,text/csv" hidden>
        <div id="iArqNome" class="muted"></div>
      </div>
    </section>
    <section class="panel" id="iMapa" hidden></section>
    <section class="panel" id="iRes" hidden></section>`;
  $('iModelo').onclick = () => baixar('modelo-alunos.csv', '﻿' + [
    'Nome do aluno;Data de nascimento;Turma;Turno;Matrícula;Sexo;CPF do aluno;Nome do responsável;Parentesco;Telefone;E-mail;Autorização biometria',
    'Maria Eduarda Souza Lima;25/03/2016;4º Ano A;Tarde;;F;;Ana Paula Souza;Mãe;(21) 99999-0000;ana@email.com;Sim',
    'João Pedro Alves Costa;10/11/2014;6º Ano A;Manhã;;M;;Carlos Alves Costa;Pai;(21) 98888-1111;;Não'
  ].join('\r\n'));
  $('iArq').onchange = async e => {
    const arq = e.target.files[0]; if (!arq) return;
    const linhas = lerCSV(await lerArquivoTexto(arq));
    e.target.value = '';
    if (linhas.length < 2) { $('iArqNome').innerHTML = html`<p class="res bad">Não encontrei dados no arquivo. Confira se é um CSV com cabeçalho na primeira linha.</p>`; return; }
    cabecalho = linhas[0].map(c => c.trim()); dadosCsv = linhas.slice(1);
    $('iArqNome').textContent = `${arq.name}: ${plural(dadosCsv.length, 'linha', 'linhas')} de dados, ${cabecalho.length} colunas.`;
    desenharMapa();
  };
  function desenharMapa() {
    const box = $('iMapa'); box.hidden = false; $('iRes').hidden = true;
    const auto = sin => { const i = cabecalho.findIndex(c => sin.includes(semAcento(c))); return i; };
    box.innerHTML = html`
      <div class="panel-h">${ic('list')}<h2>2. Confira as colunas</h2></div>
      <div style="padding:6px 22px 20px">
        <div class="form-grid">${CAMPOS_IMPORT.map(([k, rot, obr, sin]) => { const ai = auto(sin.map(semAcento)); return html`
          <label class="field" for="map_${k}">${rot}${obr ? ' *' : ''}<select id="map_${k}" data-campo="${k}"><option value="-1">— não importar —</option>${cabecalho.map((c, i) => html`<option value="${i}" ${i === ai ? seguro('selected') : ''}>${c || `Coluna ${i + 1}`}</option>`)}</select></label>`; })}
          <label class="field check full" for="iCriar"><input type="checkbox" id="iCriar" checked><span>Criar as turmas que ainda não existem em ${anoAtual()}<small>O ano/série vem do número no nome da turma, como "5º Ano B".</small></span></label>
          <label class="field check full" for="iAtual"><input type="checkbox" id="iAtual"><span>Atualizar os alunos que já estão cadastrados<small>Encontra pela matrícula ou, sem matrícula, pelo nome e data de nascimento. Desmarcado: quem já existe é ignorado.</small></span></label>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn blue" id="iConferir">Conferir planilha</button></div>
      </div>`;
    $('iConferir').onclick = () => enviar(true);
  }
  function montarLinhas() {
    const mapa = {};
    view.querySelectorAll('[data-campo]').forEach(s => { mapa[s.dataset.campo] = Number(s.value); });
    const faltando = CAMPOS_IMPORT.filter(([k, , obr]) => obr && mapa[k] < 0).map(([, r]) => r);
    if (faltando.length) throw new Error(`Escolha a coluna de: ${faltando.join(', ')}.`);
    return dadosCsv.map(l => Object.fromEntries(Object.entries(mapa).filter(([, i]) => i >= 0).map(([k, i]) => [k, (l[i] || '').trim()])));
  }
  async function enviar(simular) {
    const res = $('iRes'); res.hidden = false;
    let linhas;
    try { linhas = montarLinhas(); } catch (e) { res.innerHTML = html`<div style="padding:16px 22px"><p class="res bad">${e.message}</p></div>`; return; }
    res.innerHTML = html`<div style="padding:16px 22px"><p class="res info">${simular ? 'Conferindo' : 'Importando'} ${plural(linhas.length, 'aluno', 'alunos')}…</p></div>`;
    try {
      const r = await api('importar/alunos', { metodo: 'POST', corpo: { linhas, simular, criarTurmas: $('iCriar').checked, atualizar: $('iAtual').checked } });
      const resumo = html`<div class="resumo">
        <div class="kpi"><span>Novos</span><b>${r.criados}</b></div><div class="kpi"><span>Atualizados</span><b>${r.atualizados}</b></div>
        <div class="kpi"><span>Já cadastrados (ignorados)</span><b>${r.ignorados}</b></div><div class="kpi"><span>Com erro</span><b style="${r.erros.length ? 'color:var(--red)' : ''}">${r.erros.length}</b></div></div>`;
      if (r.gravado) {
        await carregarDados();
        res.innerHTML = html`<div class="panel-h">${ic('check')}<h2>Importação concluída</h2></div>${resumo}
          <div style="padding:16px 22px"><p class="res ok">${plural(r.criados, 'aluno novo', 'alunos novos')}${r.atualizados ? `, ${r.atualizados} atualizados` : ''}${r.turmasCriadas.length ? `. Turmas criadas: ${r.turmasCriadas.join(', ')}` : ''}.</p>
          <p style="margin-top:12px"><a class="btn blue" href="#alunos">Ver alunos</a></p></div>`;
        toast('Importação concluída.');
        return;
      }
      res.innerHTML = html`<div class="panel-h">${ic('search')}<h2>3. Resultado da conferência</h2></div>${resumo}
        <div style="padding:16px 22px;display:flex;flex-direction:column;gap:12px">
          ${r.turmasCriadas.length ? html`<p class="res info">Turmas que serão criadas: ${r.turmasCriadas.join(', ')}.</p>` : ''}
          ${r.erros.length ? html`<p class="res bad">Corrija as linhas abaixo na planilha e escolha o arquivo de novo. Nada foi gravado.</p>
            <div class="table-wrap"><table class="t"><thead><tr><th>Linha</th><th>Aluno</th><th>Problema</th></tr></thead>
            <tbody>${r.erros.slice(0, 200).map(e => html`<tr><td class="num">${e.linha}</td><td>${e.nome}</td><td>${e.erro}</td></tr>`)}</tbody></table></div>
            ${r.erros.length > 200 ? html`<p class="muted">e mais ${r.erros.length - 200} linhas com erro.</p>` : ''}`
            : html`<p class="res ok">Tudo certo. Nada foi gravado ainda: clique em Importar para gravar.</p>
              <div style="display:flex;justify-content:flex-end"><button class="btn blue" id="iGravar">${ic('upload')} Importar ${plural(r.criados + r.atualizados, 'aluno', 'alunos')}</button></div>`}
        </div>`;
      if ($('iGravar')) $('iGravar').onclick = () => enviar(false);
    } catch (e) { res.innerHTML = html`<div style="padding:16px 22px"><p class="res bad">${e.message}</p></div>`; }
  }
});

/* ================= Histórico escolar ================= */
tela('historico', ['notas', 'relatorios'], () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Secretaria / Turmas</div><h1>Histórico escolar</h1></div></div>
    <section class="panel">
      <div class="filters"><label class="field" for="hBusca" style="flex:1;max-width:420px">Nome ou matrícula do aluno<input id="hBusca" type="search" autocomplete="off" placeholder="Digite para buscar"></label></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Matrícula</th><th>Aluno</th><th>Turma</th><th>Situação</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    </section>`;
  const draw = () => {
    const q = $('hBusca').value.trim().toLowerCase();
    const l = q.length < 2 ? [] : ALUNOS.filter(a => a.nome.toLowerCase().includes(q) || String(a.mat).includes(q)).sort(sortNome).slice(0, 30);
    $('rows').innerHTML = html`${l.length ? l.map(a => html`<tr><td class="num">${a.mat}</td><td style="font-weight:700">${a.nome}</td><td>${turmaDe(a.turma)?.nome || '–'}</td><td>${pillSituacao(a.situacao)}</td>
      <td class="r"><a class="btn sm" href="#historico-${a.id}">Ver histórico</a></td></tr>`) : linhaVazia(5, q.length < 2 ? 'Digite pelo menos 2 letras do nome ou a matrícula.' : 'Nenhum aluno encontrado.')}`;
  };
  $('hBusca').oninput = draw; draw(); $('hBusca').focus();
});

rotaComParametro('historico-', 'historico', ['notas', 'relatorios'], async id => {
  view.innerHTML = html`<section class="panel vazio">Carregando o histórico…</section>`;
  let h;
  try { h = await api(`alunos/${Number(id)}/historico`); } catch (e) { view.innerHTML = html`<section class="panel"><p class="res bad" style="margin:20px">${e.message}</p></section>`; return; }
  const a = h.aluno;
  // um quadro por ano: os da escola (calculados das notas) e os de outras escolas (lançados à mão)
  const anos = [
    ...h.anos.map(m => ({ ano: m.ano, serie: m.serie, escola: h.escola.nome, turma: m.turma, resultado: SITUACAO[m.situacao] || m.situacao,
      linhas: m.disciplinas.map(d => ({ nome: d.nome, media: (() => { const ms = d.notas.map(mediaBim).filter(x => x != null); return ms.length ? trunc1(ms.reduce((s, x) => s + x, 0) / ms.length) : null; })(), carga: d.carga, faltas: d.faltas })) })),
    ...Object.values(h.externo.reduce((acc, e) => { (acc[e.ano] = acc[e.ano] || { ano: e.ano, serie: e.serie, escola: e.escola, resultado: e.resultado, externo: true, linhas: [] }).linhas.push({ nome: e.disciplina, media: e.media, carga: e.carga, faltas: e.faltas }); return acc; }, {}))
  ].sort((x, y) => x.ano - y.ano);
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb"><a href="#historico">Histórico escolar</a></div><h1>${a.nome}</h1>
      <div class="muted" style="font-size:.9rem">Matrícula ${a.matricula} · nascimento ${dataBR(a.nascimento)}${a.naturalidade ? ` · ${a.naturalidade}` : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${pode('cadastros') ? html`<button class="btn" data-act="hist-externo" data-aluno="${a.id}">+ Ano em outra escola</button>` : ''}<button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div></div>
    <div class="so-impressao"><b>${h.escola.nome}</b>${h.escola.cnpj ? ` · CNPJ ${h.escola.cnpj}` : ''}${h.escola.cidade ? ` · ${h.escola.cidade}` : ''}<br>HISTÓRICO ESCOLAR · ${a.nome} · Matrícula ${a.matricula} · Nascimento ${dataBR(a.nascimento)}</div>
    ${anos.length ? anos.map(y => html`<article class="bol">
      <div class="bol-title">${y.ano} · ${y.serie}º Ano · ${y.escola}${y.turma ? ` · ${y.turma}` : ''}</div>
      <div class="table-wrap"><table class="b"><thead><tr><th class="dis">Disciplina</th><th class="med">Média final</th><th>Carga horária</th><th>Faltas</th></tr></thead>
        <tbody>${y.linhas.length ? '' : html`<tr><td colspan="4" class="vazio">Nenhuma nota lançada neste ano ainda.</td></tr>`}${y.linhas.map(l => html`<tr><td class="dis"><b>${l.nome}</b></td><td class="med ${l.media != null && l.media < 6 ? 'low' : ''}">${fmt(l.media)}</td><td>${l.carga ? `${l.carga} h` : '–'}</td><td>${l.faltas ?? '–'}</td></tr>`)}</tbody></table></div>
      <div class="bol-foot"><div class="sit">Resultado: <b>${(y.resultado || '–').toUpperCase()}</b></div><div class="mid">${y.externo ? 'Cursado em outra escola' : ''}</div>
        <div>${y.externo && pode('cadastros') ? html`<button class="btn sm no-print" data-act="hist-externo-apagar" data-aluno="${a.id}" data-ano="${y.ano}">Apagar este ano</button>` : ''}</div></div>
    </article>`) : html`<section class="panel vazio">Ainda não há anos com notas para este aluno.</section>`}
    <p class="so-impressao" style="margin-top:40px">______________________________________<br>Secretaria escolar · ${new Date().toLocaleDateString('pt-BR')}</p>`;
});
acao('hist-externo', el => {
  const aid = Number(el.dataset.aluno);
  const linhasDisc = DISC.map((d, i) => html`<tr><td><input class="nota-in" style="width:100%;text-align:left" data-hx="disciplina" data-i="${i}" value="${d.nome}"></td>
    <td><input class="nota-in" data-hx="media" data-i="${i}" inputmode="decimal"></td><td><input class="nota-in" data-hx="carga" data-i="${i}" inputmode="numeric" value="${d.carga}"></td><td><input class="nota-in" data-hx="faltas" data-i="${i}" inputmode="numeric"></td></tr>`);
  const form = openForm({
    title: 'Ano cursado em outra escola', sub: 'Copie as notas do histórico que o aluno trouxe da escola anterior.', submit: 'Salvar no histórico', largura: 760,
    values: { ano: anoAtual() - 1 },
    fields: [
      { name: 'ano', label: 'Ano', type: 'number', required: true, min: 1950, max: anoAtual() },
      { name: 'serie', label: 'Ano / série', type: 'select', required: true, options: [...Array(12)].map((_, i) => ({ v: i + 1, t: `${i + 1}º Ano` })) },
      { name: 'escola', label: 'Escola de origem', required: true, full: true },
      { name: 'resultado', label: 'Resultado', type: 'select', required: true, options: ['Aprovado', 'Reprovado', 'Transferido', 'Cursando'].map(v => ({ v, t: v })) }
    ],
    note: html`<div class="table-wrap" style="margin-top:6px"><table class="t"><thead><tr><th>Disciplina</th><th>Média</th><th>Carga (h)</th><th>Faltas</th></tr></thead><tbody>${linhasDisc}</tbody></table></div>
      <span class="muted">Deixe a média em branco nas disciplinas que o aluno não cursou.</span>`,
    onSave: d => {
      const linhas = DISC.map((_, i) => { const v = k => form.querySelector(`[data-hx="${k}"][data-i="${i}"]`).value.trim(); return { disciplina: v('disciplina'), media: v('media').replace(',', '.'), carga: v('carga'), faltas: v('faltas') }; }).filter(l => l.disciplina && l.media !== '');
      return api(`alunos/${aid}/historico-externo`, { metodo: 'POST', corpo: { ...d, ano: Number(d.ano), serie: Number(d.serie), disciplinas: linhas } }).then(() => { route(); toast('Ano incluído no histórico.'); });
    }
  });
});
acao('hist-externo-apagar', async el => {
  if (!await confirmar('Apagar este ano do histórico?', `As notas de ${el.dataset.ano} lançadas de outra escola serão apagadas.`, { botao: 'Apagar', perigo: true })) return;
  await api(`alunos/${el.dataset.aluno}/historico-externo/${el.dataset.ano}`, { metodo: 'DELETE' });
  route(); toast('Ano apagado do histórico.');
});
