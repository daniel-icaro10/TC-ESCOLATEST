'use strict';
/* Página pública de pré-matrícula (sem login). */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const box = document.getElementById('pm');
  const logo = '<svg viewBox="0 0 42 42" aria-hidden="true" style="width:42px;height:42px"><circle cx="21" cy="21" r="20" fill="#e7f1fd"/><circle cx="21" cy="21" r="13" fill="none" stroke="#3d8fe6" stroke-width="2"/><path d="M8 21h26M21 8c-5 4-5 22 0 26M21 8c5 4 5 22 0 26" fill="none" stroke="#3d8fe6" stroke-width="1.6"/></svg>';
  const hoje = new Date().toISOString().slice(0, 10);

  fetch('/api/pre-matricula/info').then(r => r.json()).then(info => {
    const e = info.escola || {};
    document.title = `Pré-matrícula ${info.ano} · ${e.nome || ''}`;
    const contato = [e.telefone, e.email].filter(Boolean).map(esc).join(' · ');
    const topo = `<div class="logo">${logo}<div><b>${esc(e.nome)}</b><small>${esc([e.endereco, e.cidade].filter(Boolean).join(' · '))}</small></div></div>`;
    if (!info.aberta) {
      box.innerHTML = `${topo}<section class="panel"><h1>Pré-matrícula fechada</h1><p class="muted">No momento a pré-matrícula on-line não está aberta.${contato ? ` Fale com a escola: ${contato}.` : ''}</p></section>`;
      return;
    }
    const op = (l, f = v => v) => l.map(v => `<option value="${esc(v)}">${esc(f(v))}</option>`).join('');
    box.innerHTML = `${topo}
      <div><h1>Pré-matrícula ${esc(info.ano)}</h1><p class="muted" style="margin:6px 0 0">Preencha para pedir uma vaga. A secretaria entra em contato para confirmar e combinar a entrega dos documentos. A pré-matrícula não garante a vaga.</p>
      ${info.texto ? `<p class="aviso" style="margin-top:12px">${esc(info.texto)}</p>` : ''}</div>
      <form class="panel" id="pmForm" novalidate>
        <div class="form-grid">
          <div class="form-titulo" style="border:0;padding-top:0;margin-top:0">Aluno</div>
          <label class="field full" for="alunoNome">Nome completo do aluno *<input id="alunoNome" name="alunoNome" autocomplete="off" required></label>
          <label class="field" for="alunoNascimento">Data de nascimento *<input id="alunoNascimento" name="alunoNascimento" type="date" max="${hoje}" required></label>
          <label class="field" for="serie">Ano / série pretendido *<select id="serie" name="serie" required><option value="">Selecione</option>${op(info.series, v => `${v}º Ano`)}</select></label>
          <label class="field" for="turno">Turno de preferência<select id="turno" name="turno"><option value="">Sem preferência</option>${op(info.turnos)}</select></label>
          <label class="field" for="escolaAtual">Escola atual<input id="escolaAtual" name="escolaAtual" autocomplete="off"></label>
          <div class="form-titulo">Responsável</div>
          <label class="field full" for="respNome">Nome completo do responsável *<input id="respNome" name="respNome" autocomplete="name" required></label>
          <label class="field" for="respParentesco">Parentesco *<select id="respParentesco" name="respParentesco" required>${op(info.parentescos)}</select></label>
          <label class="field" for="respTel">Telefone / WhatsApp *<input id="respTel" name="respTel" type="tel" autocomplete="tel" placeholder="(21) 99999-0000" required></label>
          <label class="field" for="respEmail">E-mail<input id="respEmail" name="respEmail" type="email" autocomplete="email"></label>
          <label class="field" for="respCpf">CPF do responsável<input id="respCpf" name="respCpf" inputmode="numeric" autocomplete="off"></label>
          <label class="field full" for="observacoes">Observações<textarea id="observacoes" name="observacoes" rows="3" maxlength="1000" placeholder="Irmãos na escola, necessidades especiais, melhor horário para contato…"></textarea></label>
          <label class="hp" aria-hidden="true">Site<input name="site" tabindex="-1" autocomplete="off"></label>
          <label class="field check full" for="aceite"><input type="checkbox" id="aceite" name="aceite"><span>Autorizo a escola a usar estes dados para analisar a pré-matrícula e entrar em contato. *<small>Os dados ficam só com a escola e são apagados se a matrícula não acontecer.</small></span></label>
          <div class="full" id="pmRes" role="alert"></div>
        </div>
        <div style="display:flex;justify-content:flex-end"><button class="btn blue" type="submit">Enviar pré-matrícula</button></div>
      </form>`;
    const form = document.getElementById('pmForm');
    form.onsubmit = async ev => {
      ev.preventDefault();
      const res = document.getElementById('pmRes');
      const faltando = [...form.querySelectorAll('[required]')].filter(i => !i.value.trim()).map(i => i.closest('label').firstChild.textContent.replace('*', '').trim());
      if (faltando.length) { res.innerHTML = `<p class="res bad">Preencha: ${esc(faltando.join(', '))}.</p>`; return; }
      if (!form.aceite.checked) { res.innerHTML = '<p class="res bad">Marque a autorização de uso dos dados.</p>'; return; }
      const corpo = Object.fromEntries(new FormData(form));
      corpo.aceite = true; corpo.serie = Number(corpo.serie);
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const r = await fetch('/api/pre-matricula', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.erro || 'Não foi possível enviar. Tente de novo.');
        box.innerHTML = `${topo}<section class="panel"><h1>Pré-matrícula enviada!</h1>
          <p>Protocolo: <b>${esc(d.protocolo)}</b>. Guarde este número.</p>
          <p class="muted">A secretaria vai entrar em contato pelo telefone informado.${contato ? ` Dúvidas: ${contato}.` : ''}</p></section>`;
      } catch (err) { res.innerHTML = `<p class="res bad">${esc(err.message)}</p>`; btn.disabled = false; }
    };
  }).catch(() => { box.innerHTML = '<section class="panel"><h1>Página fora do ar</h1><p class="muted">Tente de novo mais tarde.</p></section>'; });
})();
