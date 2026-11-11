'use strict';
/* Início: confere a sessão e mostra o login, o primeiro acesso ou o sistema. */
(async function iniciar() {
  try {
    const s = await api('sessao');
    SESSAO.escola = s.escola || {};
    SESSAO.demo = !!s.demo;
    if (s.primeiroAcesso) return mostrarPrimeiroAcesso();
    if (!s.usuario) return mostrarLogin();
    await entrou(s.usuario);
  } catch (e) {
    $('carregando').innerHTML = html`<div class="entrar-box"><h1>Sistema fora do ar</h1><p class="res bad">${e.message}</p>
      <p>Este endereço precisa ser aberto pelo servidor da escola (o computador onde roda o sistema).</p><a class="btn blue" href="/">Tentar de novo</a></div>`;
  }
})();
