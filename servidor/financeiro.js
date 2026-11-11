'use strict';
/* Financeiro: valores por aluno, mensalidades, pagamentos e inadimplência. */
const { ErroHttp, valida } = require('./http');

const FORMAS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência'];
/* aceita número (450.5) ou texto no formato brasileiro ("1.200,50", "1.200" ou "450,5") */
const dinheiro = (v, nome, min = 0) => {
  const s = String(v ?? '').trim().replace(/^R\$\s*/, '');
  const milhar = /^\d{1,3}(\.\d{3})+$/.test(s);   // "1.200" é mil e duzentos, não 1,2
  const n = typeof v === 'number' ? v : s.includes(',') || milhar ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  if (!Number.isFinite(n) || n < min || n > 1e7) throw new ErroHttp(`${nome} inválido.`);
  return Math.round(n * 100) / 100;
};
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

function criarFinanceiro(db) {
  const cfg = () => ({ valorPadrao: 0, diaVencimento: 10, multaPct: 2, jurosMesPct: 1, ...(db.config('financeiro') || {}) });

  /* multa e juros simples por dia de atraso (padrão do mercado: 2% de multa e 1% ao mês) */
  function encargos(c, data = hoje()) {
    const liquido = Math.round((c.valor - c.desconto) * 100) / 100;
    if (c.pago_em || c.cancelada || c.vencimento >= data) return { liquido, multa: 0, juros: 0, total: liquido, dias: 0 };
    const dias = Math.round((new Date(data) - new Date(c.vencimento)) / 86400000);
    const f = cfg();
    const multa = Math.round(liquido * f.multaPct) / 100;
    const juros = Math.round(liquido * f.jurosMesPct / 30 * dias) / 100;
    return { liquido, multa, juros, total: Math.round((liquido + multa + juros) * 100) / 100, dias };
  }
  const publica = c => {
    const e = encargos(c);
    return { id: c.id, alunoId: c.aluno_id, ano: c.ano_letivo, competencia: c.competencia, descricao: c.descricao, valor: c.valor, desconto: c.desconto, vencimento: c.vencimento,
      pagoEm: c.pago_em, valorPago: c.valor_pago, forma: c.forma, recebidoPor: c.recebido_por, observacao: c.observacao, cancelada: !!c.cancelada,
      situacao: c.cancelada ? 'cancelada' : c.pago_em ? 'paga' : c.vencimento < hoje() ? 'vencida' : 'aberta', ...e };
  };

  function registrar(rota) {
    rota('GET', '/api/financeiro/config', 'financeiro.ver', () => ({ ...cfg(), formas: FORMAS }));
    rota('PUT', '/api/financeiro/config', 'financeiro', ({ corpo, auditar }) => {
      const n = { valorPadrao: dinheiro(corpo.valorPadrao, 'Valor da mensalidade'), diaVencimento: valida.inteiro(corpo.diaVencimento, 'Dia de vencimento', 1, 28),
        multaPct: dinheiro(corpo.multaPct, 'Multa'), jurosMesPct: dinheiro(corpo.jurosMesPct, 'Juros') };
      if (n.multaPct > 2) throw new ErroHttp('Pelo Código de Defesa do Consumidor, a multa por atraso é de no máximo 2%.');
      db.salvarConfig('financeiro', n);
      auditar('alterou a configuração do financeiro', `mensalidade ${n.valorPadrao}, vencimento dia ${n.diaVencimento}`);
      return n;
    });

    /* valor, bolsa e vencimento de cada aluno no ano */
    rota('GET', '/api/financeiro/alunos', 'financeiro.ver', ({ url }) => {
      const ano = Number(url.searchParams.get('ano')) || db.config('escola', {}).anoLetivo;
      return db.todos('SELECT aluno_id alunoId, valor, bolsa_pct bolsaPct, dia_vencimento diaVencimento, observacao FROM financeiro_alunos WHERE ano_letivo = ?', ano);
    });
    rota('PUT', '/api/financeiro/alunos/:id', 'financeiro', ({ params, corpo, auditar }) => {
      const a = db.um('SELECT id, nome FROM alunos WHERE id = ?', valida.inteiro(params.id, 'Aluno', 1));
      if (!a) throw new ErroHttp('Aluno não encontrado.', 404);
      const ano = valida.inteiro(corpo.ano || db.config('escola', {}).anoLetivo, 'Ano', 2000, 2100);
      const valor = corpo.valor === '' || corpo.valor == null ? null : dinheiro(corpo.valor, 'Valor');
      const bolsa = corpo.bolsaPct === '' || corpo.bolsaPct == null ? 0 : dinheiro(corpo.bolsaPct, 'Bolsa');
      if (bolsa > 100) throw new ErroHttp('A bolsa vai até 100%.');
      const dia = corpo.diaVencimento ? valida.inteiro(corpo.diaVencimento, 'Dia de vencimento', 1, 28) : null;
      db.rodar(`INSERT INTO financeiro_alunos (aluno_id, ano_letivo, valor, bolsa_pct, dia_vencimento, observacao) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(aluno_id, ano_letivo) DO UPDATE SET valor = excluded.valor, bolsa_pct = excluded.bolsa_pct, dia_vencimento = excluded.dia_vencimento, observacao = excluded.observacao`,
        a.id, ano, valor, bolsa, dia, valida.texto(corpo.observacao, 'a observação', { max: 300 }));
      auditar('alterou valores do aluno', `${a.nome}: ${valor ?? 'padrão'}${bolsa ? `, bolsa ${bolsa}%` : ''}`);
      return { ok: true };
    });

    /* gera as mensalidades dos meses escolhidos para os alunos ativos (não duplica) */
    rota('POST', '/api/financeiro/gerar', 'financeiro', ({ corpo, auditar }) => {
      const ano = valida.inteiro(corpo.ano, 'Ano', 2000, 2100);
      const meses = (Array.isArray(corpo.meses) ? corpo.meses : []).map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
      if (!meses.length) throw new ErroHttp('Escolha os meses.');
      const f = cfg();
      const turma = corpo.turmaId ? valida.inteiro(corpo.turmaId, 'Turma', 1) : null;
      const alunos = db.todos(`SELECT a.id, a.nome, fa.valor, fa.bolsa_pct, fa.dia_vencimento FROM alunos a JOIN turmas t ON t.id = a.turma_id
        LEFT JOIN financeiro_alunos fa ON fa.aluno_id = a.id AND fa.ano_letivo = ?
        WHERE t.ano_letivo = ? AND a.situacao IN ('cursando', 'aprovado', 'reprovado') ${turma ? 'AND t.id = ?' : ''}`, ano, ano, ...(turma ? [turma] : []));
      let criadas = 0, semValor = 0;
      db.transacao(() => alunos.forEach(a => {
        const valor = a.valor ?? f.valorPadrao;
        if (!valor) { semValor++; return; }
        const desconto = Math.round(valor * (a.bolsa_pct || 0)) / 100;
        if (desconto >= valor) return;   // bolsa integral: não gera cobrança
        const dia = a.dia_vencimento || f.diaVencimento;
        meses.forEach(m => {
          const comp = `${ano}-${String(m).padStart(2, '0')}`;
          if (db.um("SELECT 1 FROM cobrancas WHERE aluno_id = ? AND competencia = ? AND descricao = 'Mensalidade' AND cancelada = 0", a.id, comp)) return;
          db.rodar("INSERT INTO cobrancas (aluno_id, ano_letivo, competencia, descricao, valor, desconto, vencimento) VALUES (?, ?, ?, 'Mensalidade', ?, ?, ?)",
            a.id, ano, comp, valor, desconto, `${comp}-${String(dia).padStart(2, '0')}`);
          criadas++;
        });
      }));
      auditar('gerou mensalidades', `${criadas} cobranças de ${ano} (meses ${meses.join(', ')})`);
      return { criadas, semValor, alunos: alunos.length };
    });

    /* cobrança avulsa (material, uniforme, passeio...) */
    rota('POST', '/api/cobrancas', 'financeiro', ({ corpo, auditar }) => {
      const a = db.um('SELECT id, nome FROM alunos WHERE id = ?', valida.inteiro(corpo.alunoId, 'Aluno', 1));
      if (!a) throw new ErroHttp('Aluno não encontrado.', 404);
      const venc = valida.dataISO(corpo.vencimento, 'Vencimento', { obrigatorio: true });
      const desc = valida.texto(corpo.descricao, 'a descrição', { obrigatorio: true, max: 120 });
      const valor = dinheiro(corpo.valor, 'Valor', 0.01);
      if (desc === 'Mensalidade' && db.um("SELECT 1 FROM cobrancas WHERE aluno_id = ? AND competencia = ? AND descricao = 'Mensalidade' AND cancelada = 0", a.id, venc.slice(0, 7)))
        throw new ErroHttp('Este aluno já tem mensalidade neste mês. Use outra descrição ou altere a mensalidade que já existe.', 409);
      const id = db.rodar('INSERT INTO cobrancas (aluno_id, ano_letivo, competencia, descricao, valor, desconto, vencimento) VALUES (?, ?, ?, ?, ?, ?, ?)',
        a.id, Number(venc.slice(0, 4)), venc.slice(0, 7), desc, valor, dinheiro(corpo.desconto || 0, 'Desconto'), venc).id;
      auditar('lançou cobrança', `${desc} · ${a.nome} · R$ ${valor}`);
      return { id };
    });

    rota('GET', '/api/cobrancas', 'financeiro.ver', ({ url }) => {
      const ano = Number(url.searchParams.get('ano')) || null, aluno = Number(url.searchParams.get('aluno')) || null;
      const filtros = [], p = [];
      if (ano) { filtros.push('ano_letivo = ?'); p.push(ano); }
      if (aluno) { filtros.push('aluno_id = ?'); p.push(aluno); }
      return db.todos(`SELECT * FROM cobrancas ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''} ORDER BY vencimento, id`, ...p).map(publica);
    });

    rota('PUT', '/api/cobrancas/:id', 'financeiro', ({ params, corpo, usuario, auditar }) => {
      const c = db.um('SELECT * FROM cobrancas WHERE id = ?', valida.inteiro(params.id, 'Cobrança', 1));
      if (!c) throw new ErroHttp('Cobrança não encontrada.', 404);
      const a = db.um('SELECT nome FROM alunos WHERE id = ?', c.aluno_id);
      if (corpo.acao === 'pagar') {
        if (c.pago_em) throw new ErroHttp('Esta cobrança já está paga.', 409);
        if (c.cancelada) throw new ErroHttp('Esta cobrança está cancelada.', 409);
        const forma = FORMAS.includes(corpo.forma) ? corpo.forma : null;
        if (!forma) throw new ErroHttp('Escolha a forma de pagamento.');
        const data = valida.dataISO(corpo.data, 'Data do pagamento', { obrigatorio: true });
        if (data > hoje()) throw new ErroHttp('A data do pagamento não pode ser no futuro.');
        const valorPago = dinheiro(corpo.valorPago, 'Valor pago', 0.01);
        db.rodar('UPDATE cobrancas SET pago_em = ?, valor_pago = ?, forma = ?, recebido_por = ?, observacao = ? WHERE id = ?', data, valorPago, forma, usuario.nome, valida.texto(corpo.observacao, 'a observação', { max: 300 }) || c.observacao, c.id);
        auditar('registrou pagamento', `${c.descricao} ${c.competencia} · ${a.nome} · R$ ${valorPago} (${forma})`);
      } else if (corpo.acao === 'estornar') {
        if (!c.pago_em) throw new ErroHttp('Esta cobrança não está paga.', 409);
        db.rodar('UPDATE cobrancas SET pago_em = NULL, valor_pago = NULL, forma = NULL, recebido_por = NULL WHERE id = ?', c.id);
        auditar('estornou pagamento', `${c.descricao} ${c.competencia} · ${a.nome}`);
      } else if (corpo.acao === 'cancelar') {
        if (c.pago_em) throw new ErroHttp('Estorne o pagamento antes de cancelar.', 409);
        db.rodar('UPDATE cobrancas SET cancelada = 1, observacao = ? WHERE id = ?', valida.texto(corpo.observacao, 'o motivo', { max: 300 }) || c.observacao, c.id);
        auditar('cancelou cobrança', `${c.descricao} ${c.competencia} · ${a.nome}`);
      } else {
        if (c.pago_em) throw new ErroHttp('Cobrança paga não pode ser alterada. Estorne antes.', 409);
        const valor = dinheiro(corpo.valor ?? c.valor, 'Valor', 0.01), desconto = dinheiro(corpo.desconto ?? c.desconto, 'Desconto');
        if (desconto >= valor) throw new ErroHttp('O desconto não pode ser maior que o valor.');
        db.rodar('UPDATE cobrancas SET valor = ?, desconto = ?, vencimento = ?, observacao = ? WHERE id = ?', valor, desconto,
          valida.dataISO(corpo.vencimento ?? c.vencimento, 'Vencimento', { obrigatorio: true }), valida.texto(corpo.observacao ?? c.observacao ?? '', 'a observação', { max: 300 }), c.id);
        auditar('alterou cobrança', `${c.descricao} ${c.competencia} · ${a.nome}`);
      }
      return publica(db.um('SELECT * FROM cobrancas WHERE id = ?', c.id));
    });
  }
  return { registrar, publica };
}

module.exports = { criarFinanceiro, FORMAS };
