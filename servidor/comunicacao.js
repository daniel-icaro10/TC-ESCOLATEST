'use strict';
/* Comunicados (mural de avisos), mensagens internas e contato com o suporte. */
const { ErroHttp, valida } = require('./http');
const { pode, PAPEIS } = require('./auth');

const PUBLICOS = { todos: 'Toda a equipe', professores: 'Professores', secretaria: 'Secretaria e coordenação', portaria: 'Portaria', familias: 'Famílias', geral: 'Equipe e famílias' };
const vePublico = (usuario, publico) => usuario.papel === 'familia' ? ['familias', 'geral'].includes(publico)
  : publico === 'todos' || publico === 'geral' || usuario.papel === 'admin'
  || (publico === 'professores' && usuario.papel === 'professor')
  || (publico === 'secretaria' && ['secretaria', 'coordenacao', 'financeiro'].includes(usuario.papel))
  || (publico === 'portaria' && usuario.papel === 'portaria')
  || pode(usuario, 'comunicados');

function criarComunicacao(db) {
  function registrar(rota) {
    /* ----- comunicados ----- */
    // os comunicados que este usuário enxerga (o aviso de "novo" no topo usa a mesma lista)
    const visiveis = usuario => db.todos(`SELECT id, titulo, texto, publico, fixado, ate, autor, criado_em criadoEm FROM comunicados
      WHERE ate IS NULL OR ate >= date('now', 'localtime') OR ? ORDER BY fixado DESC, id DESC LIMIT 200`, pode(usuario, 'comunicados'))
      .filter(c => vePublico(usuario, c.publico));
    rota('GET', '/api/comunicados', 'logado', ({ usuario }) => visiveis(usuario).map(c => ({ ...c, fixado: !!c.fixado, vencido: !!(c.ate && c.ate < new Date().toISOString().slice(0, 10)) })));
    const dadosComunicado = c => {
      if (!PUBLICOS[c.publico]) throw new ErroHttp('Escolha para quem é o comunicado.');
      return { titulo: valida.texto(c.titulo, 'o título', { obrigatorio: true, max: 150 }), texto: String(c.texto || '').trim().slice(0, 5000) || (() => { throw new ErroHttp('Escreva o comunicado.'); })(),
        publico: c.publico, fixado: !!c.fixado, ate: valida.dataISO(c.ate, 'Data final') };
    };
    rota('POST', '/api/comunicados', 'comunicados', ({ corpo, usuario, auditar }) => {
      const d = dadosComunicado(corpo);
      const id = db.rodar('INSERT INTO comunicados (titulo, texto, publico, fixado, ate, autor_id, autor) VALUES (?, ?, ?, ?, ?, ?, ?)', d.titulo, d.texto, d.publico, d.fixado, d.ate, usuario.id, usuario.nome).id;
      auditar('publicou comunicado', d.titulo);
      return { id };
    });
    rota('PUT', '/api/comunicados/:id', 'comunicados', ({ params, corpo, auditar }) => {
      const id = valida.inteiro(params.id, 'Comunicado', 1);
      if (!db.um('SELECT 1 FROM comunicados WHERE id = ?', id)) throw new ErroHttp('Comunicado não encontrado.', 404);
      const d = dadosComunicado(corpo);
      db.rodar('UPDATE comunicados SET titulo = ?, texto = ?, publico = ?, fixado = ?, ate = ? WHERE id = ?', d.titulo, d.texto, d.publico, d.fixado, d.ate, id);
      auditar('alterou comunicado', d.titulo);
      return { ok: true };
    });
    rota('DELETE', '/api/comunicados/:id', 'comunicados', ({ params, auditar }) => {
      const c = db.um('SELECT titulo FROM comunicados WHERE id = ?', valida.inteiro(params.id, 'Comunicado', 1));
      if (!c) throw new ErroHttp('Comunicado não encontrado.', 404);
      db.rodar('DELETE FROM comunicados WHERE id = ?', Number(params.id));
      auditar('apagou comunicado', c.titulo);
      return { ok: true };
    });

    /* ----- mensagens ----- */
    // a família só fala com a secretaria, a coordenação e a direção
    rota('GET', '/api/mensagens/contatos', 'mensagens', ({ usuario }) => db.todos(`SELECT id, nome, papel FROM usuarios WHERE ativo = 1 AND id <> ? ${usuario.papel === 'familia' ? "AND papel IN ('admin', 'secretaria', 'coordenacao')" : ''} ORDER BY papel = 'familia', nome`, usuario.id)
      .map(u => ({ ...u, papelNome: PAPEIS[u.papel] })));
    rota('GET', '/api/mensagens/nao-lidas', 'logado', ({ usuario }) => ({
      mensagens: db.um('SELECT COUNT(*) n FROM mensagens WHERE para_id = ? AND lida_em IS NULL AND apagada_para = 0', usuario.id).n,
      ultimoComunicado: Math.max(0, ...visiveis(usuario).map(c => c.id))
    }));
    rota('GET', '/api/mensagens', 'mensagens', ({ usuario, url }) => {
      const pasta = url.searchParams.get('pasta') === 'enviadas' ? 'enviadas' : 'entrada';
      return pasta === 'entrada'
        ? db.todos(`SELECT m.id, m.de_nome de, m.assunto, substr(m.texto, 1, 140) previa, m.criado_em criadoEm, m.lida_em lidaEm FROM mensagens m
            WHERE m.para_id = ? AND m.apagada_para = 0 ORDER BY m.id DESC LIMIT 300`, usuario.id)
        : db.todos(`SELECT m.id, u.nome para, m.assunto, substr(m.texto, 1, 140) previa, m.criado_em criadoEm, m.lida_em lidaEm FROM mensagens m
            JOIN usuarios u ON u.id = m.para_id WHERE m.de_id = ? AND m.apagada_de = 0 ORDER BY m.id DESC LIMIT 300`, usuario.id);
    });
    rota('GET', '/api/mensagens/:id', 'mensagens', ({ params, usuario }) => {
      const m = db.um(`SELECT m.*, u.nome para_nome FROM mensagens m JOIN usuarios u ON u.id = m.para_id WHERE m.id = ?`, valida.inteiro(params.id, 'Mensagem', 1));
      if (!m || (m.para_id !== usuario.id && m.de_id !== usuario.id)) throw new ErroHttp('Mensagem não encontrada.', 404);
      if (m.para_id === usuario.id && !m.lida_em) db.rodar("UPDATE mensagens SET lida_em = datetime('now') WHERE id = ?", m.id);
      return { id: m.id, deId: m.de_id, de: m.de_nome, para: m.para_nome, paraId: m.para_id, assunto: m.assunto, texto: m.texto, criadoEm: m.criado_em, lidaEm: m.lida_em, recebida: m.para_id === usuario.id };
    });
    rota('POST', '/api/mensagens', 'mensagens', ({ corpo, usuario, auditar }) => {
      const assunto = valida.texto(corpo.assunto, 'o assunto', { obrigatorio: true, max: 150 });
      const texto = String(corpo.texto || '').trim().slice(0, 10000);
      if (!texto) throw new ErroHttp('Escreva a mensagem.');
      // destinatários: usuários escolhidos e/ou todos de um tipo de acesso
      const ids = new Set((Array.isArray(corpo.para) ? corpo.para : []).map(Number).filter(Number.isInteger));
      (Array.isArray(corpo.papeis) ? corpo.papeis : []).filter(p => PAPEIS[p]).forEach(p => db.todos('SELECT id FROM usuarios WHERE papel = ? AND ativo = 1', p).forEach(u => ids.add(u.id)));
      ids.delete(usuario.id);
      if (usuario.papel === 'familia') {
        if (corpo.papeis && corpo.papeis.length) throw new ErroHttp('Escolha para quem enviar.');
        [...ids].forEach(id => { if (!db.um("SELECT 1 FROM usuarios WHERE id = ? AND papel IN ('admin', 'secretaria', 'coordenacao')", id)) ids.delete(id); });
      }
      const validos = [...ids].filter(id => db.um('SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1', id));
      if (!validos.length) throw new ErroHttp('Escolha para quem enviar.');
      if (validos.length > 500) throw new ErroHttp('Destinatários demais.');
      db.transacao(() => validos.forEach(id => db.rodar('INSERT INTO mensagens (de_id, de_nome, para_id, assunto, texto, resposta_a) VALUES (?, ?, ?, ?, ?, ?)',
        usuario.id, usuario.nome, id, assunto, texto, corpo.respostaA ? Number(corpo.respostaA) : null)));
      auditar('enviou mensagem', `"${assunto}" para ${validos.length} pessoa(s)`);
      return { enviadas: validos.length };
    });
    rota('DELETE', '/api/mensagens/:id', 'mensagens', ({ params, usuario }) => {
      const m = db.um('SELECT * FROM mensagens WHERE id = ?', valida.inteiro(params.id, 'Mensagem', 1));
      if (!m || (m.para_id !== usuario.id && m.de_id !== usuario.id)) throw new ErroHttp('Mensagem não encontrada.', 404);
      if (m.para_id === usuario.id) db.rodar('UPDATE mensagens SET apagada_para = 1 WHERE id = ?', m.id);
      if (m.de_id === usuario.id) db.rodar('UPDATE mensagens SET apagada_de = 1 WHERE id = ?', m.id);
      db.rodar('DELETE FROM mensagens WHERE id = ? AND apagada_para = 1 AND (apagada_de = 1 OR de_id IS NULL)', m.id);
      return { ok: true };
    });

    /* ----- suporte: vai para os administradores do sistema ----- */
    rota('GET', '/api/suporte', 'logado', () => db.config('suporte', { nome: '', telefone: '', email: '', whatsapp: '' }));
    rota('PUT', '/api/suporte', 'config', ({ corpo, auditar }) => {
      const s = { nome: valida.texto(corpo.nome, 'o nome', { max: 100 }), telefone: valida.texto(corpo.telefone, 'o telefone', { max: 40 }), email: valida.email(corpo.email), whatsapp: valida.texto(corpo.whatsapp, 'o WhatsApp', { max: 40 }) };
      db.salvarConfig('suporte', s);
      auditar('alterou o contato do suporte');
      return s;
    });
    rota('POST', '/api/suporte', 'logado', ({ corpo, usuario, auditar }) => {
      if (usuario.papel === 'familia') throw new ErroHttp('Fale com a escola pela Caixa de mensagens.', 403);
      const assunto = valida.texto(corpo.assunto, 'o assunto', { obrigatorio: true, max: 150 });
      const texto = String(corpo.texto || '').trim().slice(0, 10000);
      if (!texto) throw new ErroHttp('Descreva o problema ou a dúvida.');
      const admins = db.todos("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND id <> ?", usuario.id);
      if (!admins.length) throw new ErroHttp('Não há outro administrador para receber. Use o telefone ou e-mail do suporte técnico.', 409);
      db.transacao(() => admins.forEach(a => db.rodar('INSERT INTO mensagens (de_id, de_nome, para_id, assunto, texto) VALUES (?, ?, ?, ?, ?)', usuario.id, usuario.nome, a.id, `[Suporte] ${assunto}`, texto)));
      auditar('pediu ajuda ao suporte', assunto);
      return { enviadas: admins.length };
    });
  }
  return { registrar };
}

module.exports = { criarComunicacao, PUBLICOS };
