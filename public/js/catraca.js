'use strict';
/* =====================================================================
   Controle de acesso: catraca Control iD.
   O navegador fala só com o servidor da escola; o servidor fala com a catraca.
   ===================================================================== */
let catracaStatus = {};   // matrícula -> { facial, cartao, senha }
let camStream = null;
const hora = ts => new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const statusCatraca = (ok, texto) => html`<div class="aviso" style="${ok ? '' : 'background:var(--red-soft);border-color:var(--red-soft)'}"><span class="dot ${ok === null ? '' : ok ? 'on' : 'off'}"></span><div><b>${ok === null ? 'Verificando…' : ok ? 'Catraca conectada' : 'Catraca sem conexão'}</b><span>${texto}</span></div>${ok === false && pode('catraca.config') ? html`<a class="btn" href="#catraca-config" style="margin-left:auto">Configurar</a>` : ''}</div>`;
const sim = (v, txt) => v ? html`<span class="pill ok">${ic('check')}${txt || 'Sim'}</span>` : html`<span class="muted">–</span>`;

tela('catraca-cadastro', 'catraca', () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Controle de acesso</div><h1>Cadastro facial</h1></div>
      ${pode('cadastros') ? html`<button class="btn blue" data-act="novo-aluno-facial">+ Novo aluno com facial</button>` : ''}</div>
    ${SESSAO.demo ? html`<div class="aviso">${ic('info')}<div><b>Catraca simulada</b><span>Cadastro com foto, cartão e senha, liberação e lista de acessos funcionam como na catraca de verdade.</span></div></div>` : ''}
    <div id="ponteSt">${statusCatraca(null, 'Consultando a catraca…')}</div>
    <section class="panel">
      <div class="filters">
        <label class="field" for="cNome" style="flex:1;max-width:360px">Nome ou matrícula<input id="cNome" type="search" autocomplete="off"></label>
        <label class="field" for="cTurma">Turma<select id="cTurma"><option value="">Todas</option>${TURMAS.filter(t => t.anoLetivo === SESSAO.escola.anoLetivo).map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
        <label class="field" for="cSit">Situação na catraca<select id="cSit"><option value="">Todos</option><option value="sem">Sem cadastro</option><option value="com">Cadastrados</option><option value="semface">Sem facial</option><option value="semconsent">Sem autorização de biometria</option></select></label>
      </div>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Matrícula</th><th>Aluno</th><th>Turma</th><th>Facial</th><th>Cartão</th><th>Senha</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
      <div id="cnt" class="muted" style="padding:12px 16px;font-size:.85rem;border-top:1px solid var(--line)"></div>
    </section>
    <section class="panel" id="foraCadastro" hidden></section>`;
  const draw = () => {
    if (!$('rows')) return;
    const q = $('cNome').value.trim().toLowerCase(), tu = Number($('cTurma').value), si = $('cSit').value;
    const list = ALUNOS.filter(a => {
      const c = catracaStatus[a.mat];
      if (!ATIVO(a)) return false;
      if (q && !a.nome.toLowerCase().includes(q) && !String(a.mat).includes(q)) return false;
      if (tu && a.turma !== tu) return false;
      if (si === 'sem' && c) return false;
      if (si === 'com' && !c) return false;
      if (si === 'semface' && c && c.facial) return false;
      if (si === 'semconsent' && a.consentimentoBiometria) return false;
      return true;
    }).sort(sortNome);
    $('rows').innerHTML = html`${list.length ? list.slice(0, 80).map(a => {
      const c = catracaStatus[a.mat];
      return html`<tr>
        <td class="num muted">${a.mat}</td><td style="font-weight:700;text-transform:uppercase;font-size:.86rem">${a.nome}${!a.consentimentoBiometria ? html`<div class="muted" style="text-transform:none;font-weight:400;font-size:.76rem">Sem autorização de biometria</div>` : ''}</td>
        <td>${turmaDe(a.turma)?.nome || '–'}</td>
        <td>${sim(c && c.facial)}</td><td class="num">${c && c.cartao ? c.cartao : html`<span class="muted">–</span>`}</td><td>${sim(c && c.senha)}</td>
        <td class="r"><button class="btn sm ${c ? '' : 'blue'}" data-act="catraca-aluno" data-aluno="${a.id}">${c ? 'Editar' : 'Cadastrar'}</button></td></tr>`;
    }) : linhaVazia(7, 'Nenhum aluno encontrado.')}`;
    const total = ALUNOS.filter(a => ATIVO(a) && catracaStatus[a.mat]).length;
    $('cnt').textContent = `Mostrando ${Math.min(80, list.length)} de ${list.length} alunos · ${total} cadastrados na catraca`;
  };
  ['cNome', 'cTurma', 'cSit'].forEach(id => $(id).addEventListener('input', draw));
  const aplicar = lista => { catracaStatus = {}; lista.forEach(u => { catracaStatus[u.matricula] = { facial: u.facial, cartao: u.cartao, senha: u.senha }; }); };
  // primeiro o que o sistema lembra; depois a lista da própria catraca, que é a fonte da verdade
  api('catraca/lembrados').then(l => { aplicar(l); draw(); }).catch(() => {});
  draw();
  api('catraca/alunos').then(lista => {
    aplicar(lista);
    const el = $('ponteSt'); if (el) el.innerHTML = statusCatraca(true, `${plural(lista.length, 'pessoa cadastrada', 'pessoas cadastradas')} na catraca.`);
    // pessoas na catraca que não são alunos ativos (ex.: funcionários, ou alunos que saíram e não foram removidos)
    const fora = lista.filter(u => { const a = alunoPorMat(u.matricula); return !a || !ATIVO(a); });
    const box = $('foraCadastro');
    if (box && fora.length) {
      box.hidden = false;
      box.innerHTML = html`<div class="panel-h">${ic('info')}<h2>Na catraca, mas não são alunos ativos</h2><span class="sp"></span><span class="muted" style="font-size:.82rem">Funcionários ou alunos que saíram da escola</span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Matrícula</th><th>Nome</th><th>No sistema</th><th></th></tr></thead>
        <tbody>${fora.map(u => { const a = alunoPorMat(u.matricula); return html`<tr><td class="num">${u.matricula}</td><td>${u.nome}</td><td>${a ? pillSituacao(a.situacao) : html`<span class="muted">Não cadastrado</span>`}</td>
          <td class="r">${/^\d+$/.test(String(u.matricula)) ? html`<button class="btn sm red" data-act="catraca-remover-mat" data-mat="${u.matricula}" data-nome="${u.nome}">Remover da catraca</button>` : ''}</td></tr>`; })}</tbody></table></div>`;
    }
    draw();
  }).catch(e => { const el = $('ponteSt'); if (el) el.innerHTML = statusCatraca(false, `${e.message} A lista abaixo mostra o último estado conhecido.`); });
});
acao('catraca-remover-mat', async el => {
  if (!await confirmar('Remover da catraca?', `${el.dataset.nome} (matrícula ${el.dataset.mat}) deixa de passar pela catraca.`, { botao: 'Remover', perigo: true })) return;
  await api(`catraca/alunos/${el.dataset.mat}`, { metodo: 'DELETE' });
  toast('Removido da catraca.'); route();
});

tela('catraca-acessos', 'catraca.acessos', () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Controle de acesso</div><h1>Liberação e acessos</h1></div></div>
    <section class="panel">
      <div class="panel-h">${ic('unlock')}<h2>Liberar a catraca</h2><span class="sp"></span><span class="muted" style="font-size:.84rem">Libera um giro, para quem esqueceu o cartão ou a senha</span></div>
      <div class="liberar">
        <button class="main" data-act="liberar" data-sentido="entrada">${ic('in')}Liberar entrada<small>um aluno entra</small></button>
        <button data-act="liberar" data-sentido="saida">${ic('out')}Liberar saída<small>um aluno sai</small></button>
        <button data-act="liberar" data-sentido="ambos">${ic('both')}Liberar os dois lados<small>o primeiro giro passa</small></button>
      </div>
    </section>
    <section class="panel"><div class="kpis" id="kpis"></div></section>
    <section class="panel">
      <div class="panel-h">${ic('list')}<h2 id="tAcessos">Acessos de hoje</h2><span class="sp"></span>
        <label class="field" for="aData" style="flex-direction:row;align-items:center;gap:8px">Dia<input id="aData" type="date" value="${hojeISO()}" max="${hojeISO()}"></label>
        <span class="muted" id="atual" style="font-size:.84rem"></span></div>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Hora</th><th>Aluno</th><th>Turma</th><th>Como passou</th><th>Resultado</th></tr></thead>
        <tbody id="rows"><tr><td colspan="5" class="vazio">Carregando…</td></tr></tbody>
      </table></div>
    </section>`;
  const pill = ev => ev === 7 ? 'ok' : [10, 11, 12, 15].includes(ev) ? 'doing' : [6, 3, 2, 5].includes(ev) ? 'bad' : 'todo';
  const carregar = () => {
    const dia = $('aData') ? $('aData').value : hojeISO(), hoje = dia === hojeISO();
    return api(`catraca/acessos?limite=500${hoje ? '' : '&data=' + dia}`).then(lista => {
      if (!$('kpis')) return;
      $('tAcessos').textContent = hoje ? 'Acessos de hoje' : `Acessos de ${dataBR(dia)}`;
      $('kpis').parentElement.hidden = false;
      const liberados = lista.filter(l => l.evento === 7), negados = lista.filter(l => [3, 6].includes(l.evento));
      const alunosDia = new Set(liberados.map(l => l.matricula).filter(Boolean));
      const ativos = ALUNOS.filter(ATIVO).length;
      $('kpis').innerHTML = html`
        <div class="kpi"><span>Passagens liberadas</span><b>${liberados.length}</b></div>
        <div class="kpi"><span>Alunos que passaram</span><b>${alunosDia.size}${ativos ? html`<small class="muted" style="font-size:.8rem;font-weight:600"> de ${ativos}</small>` : ''}</b></div>
        <div class="kpi"><span>Negados</span><b style="${negados.length ? 'color:var(--red)' : ''}">${negados.length}</b></div>
        <div class="kpi"><span>Último acesso</span><b>${lista[0] ? hora(lista[0].hora).slice(0, 5) : '–'}</b></div>`;
      $('rows').innerHTML = html`${lista.length ? lista.map(l => {
        const a = alunoPorMat(l.matricula);
        return html`<tr><td class="num">${hora(l.hora)}</td>
          <td style="font-weight:700;text-transform:uppercase;font-size:.86rem">${a ? a.nome : l.nome ? l.nome : html`<span class="muted" style="text-transform:none;font-weight:400">Não identificado</span>`}</td>
          <td>${a ? turmaDe(a.turma)?.nome || '–' : html`<span class="muted">–</span>`}</td>
          <td>${l.meio || html`<span class="muted">–</span>`}</td>
          <td><span class="pill ${pill(l.evento)}">${l.descricao}</span></td></tr>`;
      }) : linhaVazia(5, hoje ? 'Nenhum acesso registrado hoje.' : 'Nenhum acesso registrado neste dia.')}`;
      $('atual').textContent = hoje ? `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · atualiza sozinho` : '';
    }).catch(e => {
      const rows = $('rows');
      if (rows) rows.innerHTML = html`<tr><td colspan="5" style="padding:20px"><p class="res bad">${e.message} ${pode('catraca.config') ? html`<a href="#catraca-config">Configurar conexão</a>` : ''}</p></td></tr>`;
      const k = $('kpis'); if (k) k.parentElement.hidden = true;
    });
  };
  $('aData').onchange = carregar;
  carregar();
  const poll = setInterval(() => { if ($('aData') && $('aData').value === hojeISO()) carregar(); }, 10000);
  aoSairDaTela.push(() => clearInterval(poll));
});
/* presença por turma: quem passou pela catraca no dia e quem não passou */
tela('catraca-presenca', 'catraca.acessos', () => {
  const turmas = TURMAS.filter(t => t.anoLetivo === SESSAO.escola.anoLetivo);
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Controle de acesso</div><h1>Presença por turma</h1></div><button class="btn" data-act="imprimir">${ic('print')} Imprimir</button></div>
    <section class="panel no-print"><div class="filters">
      <label class="field" for="prTurma">Turma<select id="prTurma">${turmas.map(t => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
      <label class="field" for="prDia">Dia<input id="prDia" type="date" value="${hojeISO()}" max="${hojeISO()}"></label>
    </div></section>
    <section class="panel"><div class="kpis" id="prKpis"></div></section>
    <section class="panel"><div class="so-impressao" id="prTitulo"></div><div class="table-wrap"><table class="t"><thead><tr><th>Nº</th><th>Aluno</th><th>Entrada</th><th>Última passagem</th></tr></thead><tbody id="rows">${linhaVazia(4, 'Carregando…')}</tbody></table></div></section>
    <p class="muted" style="font-size:.84rem">Conta como presente quem passou pela catraca no dia (por rosto, cartão, senha ou liberado pela escola). Não substitui a chamada do professor.</p>`;
  const carregar = async () => {
    const t = turmaDe($('prTurma').value), dia = $('prDia').value;
    if (!t) { $('rows').innerHTML = html`${linhaVazia(4, 'Nenhuma turma.')}`; return; }
    $('rows').innerHTML = html`${linhaVazia(4, 'Consultando a catraca…')}`;
    try {
      const l = await api(`catraca/acessos?limite=2000${dia === hojeISO() ? '' : '&data=' + dia}`);
      const passou = new Map();
      l.filter(x => [7, 10, 11, 12, 15].includes(x.evento) && x.matricula).forEach(x => { const p = passou.get(String(x.matricula)) || []; p.push(x.hora); passou.set(String(x.matricula), p); });
      const alunos = t.alunos.filter(ATIVO);
      const presentes = alunos.filter(a => passou.has(String(a.mat)));
      $('prTitulo').innerHTML = html`<b>${SESSAO.escola.nome}</b> · Presença pela catraca · ${t.nome} · ${dataBR(dia)}`;
      $('prKpis').innerHTML = html`<div class="kpi"><span>Alunos</span><b>${alunos.length}</b></div><div class="kpi"><span>Presentes</span><b style="color:var(--green)">${presentes.length}</b></div>
        <div class="kpi"><span>Não passaram</span><b style="${alunos.length - presentes.length ? 'color:var(--red)' : ''}">${alunos.length - presentes.length}</b></div><div class="kpi"><span>Presença</span><b>${alunos.length ? Math.round(presentes.length / alunos.length * 100) : 0}%</b></div>`;
      $('rows').innerHTML = html`${alunos.length ? alunos.map((a, i) => { const h = (passou.get(String(a.mat)) || []).sort((x, y) => x - y); return html`<tr>
        <td class="num muted">${String(i + 1).padStart(2, '0')}</td><td style="font-weight:700">${a.nome}</td>
        <td>${h.length ? html`<span class="pill ok">${hora(h[0]).slice(0, 5)}</span>` : html`<span class="pill bad">Não passou</span>`}</td><td class="num muted">${h.length > 1 ? hora(h[h.length - 1]).slice(0, 5) : ''}</td></tr>`; })
        : linhaVazia(4, 'Nenhum aluno ativo na turma.')}`;
    } catch (e) { $('rows').innerHTML = html`<tr><td colspan="4"><p class="res bad">${e.message}</p></td></tr>`; }
  };
  if (!turmas.length) { $('rows').innerHTML = html`${linhaVazia(4, 'Nenhuma turma no ano letivo.')}`; return; }
  $('prTurma').onchange = carregar; $('prDia').onchange = carregar;
  carregar();
});

acao('liberar', async el => {
  const sentido = el.dataset.sentido, bts = document.querySelectorAll('[data-act="liberar"]');
  bts.forEach(b => b.disabled = true);
  try {
    await api('catraca/liberar', { metodo: 'POST', corpo: { sentido } });
    toast(sentido === 'saida' ? 'Saída liberada: um giro.' : sentido === 'ambos' ? 'Catraca liberada nos dois sentidos: um giro.' : 'Entrada liberada: um giro.');
  } finally { bts.forEach(b => b.disabled = false); }
});

tela('catraca-config', 'catraca.config', () => {
  view.innerHTML = html`
    <div class="page-title"><div><div class="crumb">Controle de acesso</div><h1>Conexão com a catraca</h1></div></div>
    <section class="panel">
      <div class="panel-h">${ic('settings')}<h2>Catraca</h2></div>
      <form id="cfgForm" novalidate style="padding:18px 22px 22px"><div id="cfgCorpo"><p class="res info">Carregando a configuração…</p></div></form>
    </section>
    <section class="panel">
      <div class="panel-h">${ic('info')}<h2>Como encontrar os dados da catraca</h2></div>
      <ol class="passos">
        <li>O <b>IP</b> aparece no menu da catraca, em Configurações &gt; Rede. Deixe o IP <b>fixo</b> (na própria catraca ou reservado no roteador), senão ele muda e o sistema perde a conexão.</li>
        <li>O usuário e a senha de administrador de fábrica são <code>admin</code> / <code>admin</code>. Troque a senha na catraca e coloque a nova aqui.</li>
        <li>O computador deste sistema precisa estar na mesma rede da catraca.</li>
        <li>Clique em <b>Testar conexão</b>. Depois de salvar, libere a entrada em <a href="#catraca-acessos">Liberação e acessos</a> para conferir se o giro vai para o lado certo.</li>
      </ol>
    </section>`;
  const msgCfg = (tipo, conteudo) => { const r = $('cfgRes'); if (r) r.innerHTML = conteudo ? html`<p class="res ${tipo}">${conteudo}</p>` : ''; };
  const lerForm = () => ({
    ip: $('kIp').value.trim(), usuario: $('kUser').value.trim(), senha: $('kSenha').value,
    acaoLiberar: $('kAcao').value, sentidoEntrada: $('kSentido').value,
    grupoId: $('kGrupo').value, secBoxId: $('kSecbox').value, porta_rele: $('kRele').value
  });
  const ajustaModelo = () => { $('fSecbox').hidden = $('kAcao').value !== 'sec_box'; $('fRele').hidden = $('kAcao').value !== 'door'; };
  const op = (v, t, atual) => html`<option value="${v}" ${v === atual ? seguro('selected') : ''}>${t}</option>`;
  const desenha = c => {
    $('cfgCorpo').innerHTML = html`
      <div class="form-grid">
        <label class="field" for="kIp">IP da catraca *<input id="kIp" value="${c.ip}" placeholder="Ex.: 192.168.0.129"></label>
        <label class="field" for="kAcao">Modelo *<select id="kAcao">${op('catra', 'Catraca iDBlock', c.acaoLiberar)}${op('sec_box', 'iDFace / iDFlex com SecBox', c.acaoLiberar)}${op('door', 'Porta com relé (iDAccess)', c.acaoLiberar)}</select></label>
        <label class="field" for="kUser">Usuário administrador *<input id="kUser" value="${c.usuario}" autocomplete="off"></label>
        <label class="field" for="kSenha">Senha da catraca<input id="kSenha" type="password" autocomplete="new-password" placeholder="${c.senhaDefinida ? 'Já salva. Em branco mantém a atual' : 'Senha do administrador'}"></label>
        <label class="field" for="kSentido">Sentido da entrada *<select id="kSentido">${op('clockwise', 'Horário', c.sentidoEntrada)}${op('anticlockwise', 'Anti-horário', c.sentidoEntrada)}</select></label>
        <label class="field" for="kGrupo">Grupo de acesso dos alunos<input id="kGrupo" type="number" min="0" value="${c.grupoId}"></label>
        <label class="field" for="kSecbox" id="fSecbox">Número da SecBox<input id="kSecbox" type="number" min="0" value="${c.secBoxId}"></label>
        <label class="field" for="kRele" id="fRele">Número do relé<input id="kRele" type="number" min="1" max="8" value="${c.porta_rele}"></label>
        <p class="form-note">O sentido da entrada é o giro que leva o aluno para dentro da escola: se a liberação de entrada abrir para o lado errado, troque aqui. O grupo de acesso vem da configuração da catraca (o padrão costuma ser 1).</p>
        <div class="full" id="cfgRes" role="status">${c.demo ? html`<p class="res info">Demonstração online: a catraca simulada fica no IP <b>${c.ip}</b>, usuário <b>admin</b> e senha <b>admin</b>.</p>` : !c.configurada ? html`<p class="res info">A catraca ainda não foi configurada.</p>` : ''}</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px">
        <button type="button" class="btn" id="kTestar">Testar conexão</button>
        <button type="submit" class="btn blue">Salvar</button>
      </div>`;
    ajustaModelo();
    $('kAcao').onchange = ajustaModelo;
    $('kTestar').onclick = async () => {
      msgCfg('info', 'Testando com os dados digitados…');
      try { await api('catraca/config/testar', { metodo: 'POST', corpo: lerForm() }); msgCfg('ok', html`<b>Conectou.</b> A catraca aceitou o usuário e a senha. Clique em Salvar para usar estes dados.`); }
      catch (e) { msgCfg('bad', e.message); }
    };
  };
  $('cfgForm').onsubmit = async e => {
    e.preventDefault();
    if (!$('kIp')) return;
    msgCfg('info', 'Salvando…');
    try {
      desenha(await api('catraca/config', { metodo: 'PUT', corpo: lerForm() }));
      msgCfg('info', 'Salvo. Testando a conexão com a catraca…');
      try { await api('catraca/status'); msgCfg('ok', html`<b>Configuração salva e catraca conectada.</b>`); }
      catch (err) { msgCfg('bad', `Configuração salva, mas a catraca não respondeu: ${err.message}`); }
    } catch (err) { msgCfg('bad', err.message); }
  };
  api('catraca/config').then(desenha).catch(e => { $('cfgCorpo').innerHTML = html`<p class="res bad">${e.message}</p>`; });
});

/* ---------- Câmera e foto ---------- */
function pararCamera() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } }
/* reduz a foto para no máximo 900 px no lado maior, em JPEG: fica bem abaixo do limite de 1 MB da catraca */
function fotoDe(origem, larg, alt, espelhar) {
  const k = Math.min(1, 900 / Math.max(larg, alt));
  const c = document.createElement('canvas');
  c.width = Math.round(larg * k); c.height = Math.round(alt * k);
  const g = c.getContext('2d');
  if (espelhar) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(origem, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .88);
}

function openCatraca(a) {
  if (!a) return;
  const t = turmaDe(a.turma), info = catracaStatus[a.mat] || null, consent = a.consentimentoBiometria;
  let foto = null, facialFeita = false, cartaoInicial = (info && info.cartao) || '';
  layer.innerHTML = html`
    <div class="overlay" data-close>
      <form class="modal" id="catForm" role="dialog" aria-modal="true" aria-labelledby="cT" novalidate style="width:min(800px,100%)">
        <div class="modal-h"><div><h2 id="cT">Cadastro na catraca</h2><p>${a.nome} · Matrícula ${a.mat} · ${t ? t.nome : ''}</p></div><button type="button" class="x" data-close aria-label="Fechar">${ic('x')}</button></div>
        <div class="modal-b"><div class="cat-grid">
          <section aria-label="Foto do rosto">
            ${consent ? html`
            <div class="cam">
              <video id="camV" autoplay playsinline muted hidden></video>
              <img id="camI" alt="Foto do rosto capturada" hidden>
              <div class="cam-guide" id="camG" hidden></div>
              <div class="cam-msg" id="camMsg">${ic('camera')}${info && info.facial ? 'Este aluno já tem rosto cadastrado. Tire uma nova foto só se quiser trocar.' : 'Ligue a câmera e tire uma foto do rosto do aluno.'}</div>
            </div>
            <div class="cam-btns">
              <button type="button" class="btn blue" data-cam="ligar">${ic('camera')} Ligar câmera</button>
              <button type="button" class="btn blue" data-cam="foto" hidden>Tirar foto</button>
              <button type="button" class="btn" data-cam="outra" hidden>Tirar outra</button>
              <label class="btn" for="camF" style="cursor:pointer">Enviar arquivo</label>
              <input type="file" id="camF" accept="image/jpeg,image/png" hidden>
              <button type="button" class="btn" data-cam="remoto" title="O aluno olha para a câmera da própria catraca">Capturar na catraca</button>
            </div>
            <p class="form-note" style="margin-top:10px">Rosto de frente, dentro do oval, com boa luz. Sem boné, máscara ou óculos escuros.</p>`
            : html`<div class="cam"><div class="cam-msg">${ic('shield')}<b>Sem autorização para biometria</b><br>O responsável ainda não autorizou o uso da foto do rosto (LGPD). Marque a autorização na ficha do aluno depois de recolher o termo assinado. Enquanto isso, cadastre cartão ou senha.</div></div>
              ${pode('cadastros') ? html`<div class="cam-btns"><button type="button" class="btn" data-act="aluno-ficha" data-aluno="${a.id}">Abrir ficha do aluno</button></div>` : ''}`}
          </section>
          <div class="form-grid" style="grid-template-columns:minmax(0,1fr);padding-top:0">
            <label class="field" for="cSenha">Senha numérica
              <input id="cSenha" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="${info && info.senha ? 'Já tem senha. Em branco mantém a atual' : '4 a 8 números'}">
              <span class="err" id="eSenha" hidden></span></label>
            <label class="field" for="cCartao">Cartão de aproximação
              <span class="inline"><input id="cCartao" inputmode="numeric" value="${cartaoInicial}" placeholder="Ex.: 123,45678 ou 0012345678"><button type="button" class="btn" data-cam="cartao" title="O aluno aproxima o cartão do leitor da catraca">Ler na catraca</button></span>
              <span class="err" id="eCartao" hidden></span></label>
            <p class="form-note">O aluno passa pela catraca pelo rosto, aproximando o cartão ou digitando a senha. Cadastre só o que ele for usar. O número do cartão vem impresso nele; se tiver vírgula, digite com a vírgula.</p>
            <div id="catRes" role="status"></div>
          </div>
        </div></div>
        <div class="modal-f">
          ${info ? html`<button type="button" class="btn red" data-cam="remover" style="margin-right:auto">Remover da catraca</button>` : ''}
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn blue" id="catSalvar">Salvar na catraca</button>
        </div>
      </form>
    </div>`;
  aoFecharLayer.push(pararCamera);
  const form = $('catForm');
  const vid = $('camV'), img = $('camI'), msg = $('camMsg'), res = $('catRes');
  const mostra = (q, s) => { const b = form.querySelector(`[data-cam="${q}"]`); if (b) b.hidden = !s; };
  const resultado = (tipo, conteudo) => { res.innerHTML = conteudo ? html`<p class="res ${tipo}">${conteudo}</p>` : ''; };
  const ocupado = s => form.querySelectorAll('button, input').forEach(b => { if (!b.matches('[data-close]')) b.disabled = s; });
  const lembrar = parcial => { catracaStatus[a.mat] = { ...(catracaStatus[a.mat] || { facial: false, cartao: null, senha: false }), ...parcial }; };
  const exibeFoto = url => {
    foto = url; pararCamera();
    img.src = url; img.hidden = false; vid.hidden = true; $('camG').hidden = true; msg.hidden = true;
    mostra('ligar', false); mostra('foto', false); mostra('outra', true);
  };

  async function ligar() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { resultado('bad', 'Este navegador não permite usar a câmera aqui. Use "Enviar arquivo". (Nos outros computadores da rede, o navegador só libera a câmera em endereço https ou localhost.)'); return; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (!document.body.contains(vid)) { pararCamera(); return; }
      vid.srcObject = camStream; vid.hidden = false; img.hidden = true; $('camG').hidden = false; msg.hidden = true;
      mostra('ligar', false); mostra('foto', true); mostra('outra', false); foto = null; resultado();
    } catch (e) {
      resultado('bad', e.name === 'NotAllowedError' ? 'O navegador bloqueou a câmera. Clique no cadeado ao lado do endereço e permita a câmera.' : 'Nenhuma câmera encontrada. Use "Enviar arquivo" ou "Capturar na catraca".');
    }
  }
  form.addEventListener('click', async e => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const q = b.dataset.cam;
    if (q === 'ligar' || q === 'outra') ligar();
    if (q === 'foto') {
      if (!vid.videoWidth) { resultado('info', 'A câmera ainda está abrindo. Tente de novo em um segundo.'); return; }
      exibeFoto(fotoDe(vid, vid.videoWidth, vid.videoHeight, true));
    }
    if (q === 'remoto' || q === 'cartao') {
      ocupado(true);
      resultado('info', q === 'remoto' ? 'Peça para o aluno olhar para a câmera da catraca…' : 'Peça para o aluno aproximar o cartão do leitor da catraca…');
      try {
        const r = await api(`catraca/alunos/${a.mat}/${q === 'remoto' ? 'facial' : 'cartao'}-na-catraca`, { metodo: 'POST', corpo: {} });
        if (q === 'remoto') { facialFeita = true; lembrar({ facial: true }); resultado('ok', 'Rosto cadastrado pela catraca.'); }
        else { $('cCartao').value = cartaoInicial = r.cartao || ''; lembrar({ cartao: r.cartao || null }); resultado('ok', `Cartão ${r.cartao || ''} cadastrado.`); }
      } catch (err) { resultado('bad', err.message); }
      ocupado(false);
    }
    if (q === 'remover') {
      if (!confirm(`Remover ${a.nome} da catraca? O aluno deixa de passar pelo rosto, cartão e senha.`)) return;
      ocupado(true);
      try {
        await api(`catraca/alunos/${a.mat}`, { metodo: 'DELETE' });
        delete catracaStatus[a.mat];
        closeLayer(); route(); toast(`${a.nome} removido(a) da catraca.`);
      } catch (err) { resultado('bad', err.message); ocupado(false); }
    }
  });
  if ($('camF')) $('camF').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const im = new Image();
    im.onload = () => { exibeFoto(fotoDe(im, im.naturalWidth, im.naturalHeight, false)); URL.revokeObjectURL(im.src); };
    im.onerror = () => resultado('bad', 'Não consegui abrir esta imagem. Use JPG ou PNG.');
    im.src = URL.createObjectURL(f);
    e.target.value = '';
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const senha = $('cSenha').value.trim(), cartao = $('cCartao').value.trim();
    const erroS = senha && !/^\d{4,8}$/.test(senha) ? 'A senha precisa ter de 4 a 8 números.' : '';
    const erroC = cartao && !/^(\d{1,15}|\d{1,3}[,.]\d{1,10})$/.test(cartao.replace(/\s/g, '')) ? 'Use só números, ou área,código (ex.: 123,45678).' : '';
    [['eSenha', erroS], ['eCartao', erroC]].forEach(([id, m]) => { $(id).hidden = !m; $(id).textContent = m; $(id).parentElement.classList.toggle('invalid', !!m); });
    if (erroS || erroC) return;
    if (!foto && !senha && cartao === cartaoInicial && !info && !facialFeita) { resultado('bad', consent ? 'Tire a foto do rosto, cadastre um cartão ou uma senha.' : 'Cadastre um cartão ou uma senha.'); return; }
    const corpo = {};
    if (senha) corpo.senha = senha;
    if (cartao !== cartaoInicial) corpo.cartao = cartao;
    if (foto) corpo.foto = foto;
    ocupado(true); resultado('info', 'Enviando para a catraca…');
    try {
      const r = await api(`catraca/alunos/${a.mat}`, { metodo: 'PUT', corpo });
      const p = {};
      if (r.senha !== undefined) p.senha = r.senha;
      if (r.cartao !== undefined) { p.cartao = r.cartao; cartaoInicial = cartao; }
      if (r.foto && r.foto.ok) p.facial = true;
      lembrar(p);
      const avisos = r.avisos || [];
      if (r.foto && !r.foto.ok) {
        res.innerHTML = html`<p class="res bad"><b>A catraca recusou a foto.</b></p><ul>${r.foto.erros.map(x => html`<li>${x}</li>`)}</ul>${corpo.senha || corpo.cartao !== undefined ? html`<p class="res info">Senha e cartão foram salvos.</p>` : ''}`;
        $('cSenha').value = ''; ocupado(false); return;
      }
      closeLayer(); route();
      toast(`${a.nome} cadastrado(a) na catraca.${avisos.length ? ' ' + avisos[0] : ''}`);
    } catch (err) { resultado('bad', err.message); ocupado(false); }
  };
  if (consent && (!info || !info.facial)) ligar();
}
acao('catraca-aluno', el => openCatraca(alunoDe(el.dataset.aluno)));
acao('novo-aluno-facial', () => formAluno('', openCatraca));
