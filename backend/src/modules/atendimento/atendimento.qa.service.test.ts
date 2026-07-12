import { describe, it, expect } from 'vitest';
import { calcularPontuacaoQa } from './atendimento.qa.service';
import { RespostaCriterio, CriterioQa } from './atendimento.qa.types';

function todosConformes(overrides: Partial<Record<CriterioQa, RespostaCriterio>> = {}) {
  const base: Partial<Record<CriterioQa, RespostaCriterio>> = {
    'Script': 'Conforme', 'Sondagem': 'Conforme', 'Conhecimento técnico': 'Conforme',
    'Vícios de linguagem': 'Conforme', 'Tom de voz': 'Conforme', 'Cordialidade': 'Conforme',
    'Controle de Objeção': 'Conforme', 'Comunicação e Linguagem': 'Conforme', 'Retorno ao cliente': 'Conforme',
    'Ação de retenção': 'Conforme', 'Confirmação de dados': 'Conforme', 'Transferencia Indevida': 'Conforme',
    'Uso do Mute': 'Conforme', 'Erro de procedimento': 'Conforme', 'Negociação e venda': 'Conforme',
    'Agilidade': 'Conforme', 'Prontidão': 'Conforme', 'Tabulação': 'Conforme',
    'Resolução do conflito': 'Conforme', 'Personalização': 'Conforme', 'Omissão de atendimento': 'Conforme',
    'Inf. Protocolo?': 'Conforme',
  };
  return { ...base, ...overrides };
}

describe('calcularPontuacaoQa', () => {
  it('dá 10.0 e 22 itens aplicáveis quando tudo é Conforme', () => {
    const r = calcularPontuacaoQa(todosConformes());
    expect(r.pontuacao).toBe(10);
    expect(r.itensAplicaveis).toBe(22);
    expect(r.erroCritico).toBe(false);
  });

  it('erro crítico ("Omissão de atendimento" Não Conforme) zera tudo e ignora o resto das penalidades', () => {
    const r = calcularPontuacaoQa(todosConformes({
      'Omissão de atendimento': 'Não Conforme',
      'Cordialidade': 'Não Conforme', // também seria -2, mas não deve importar — erro crítico já zera
    }));
    expect(r.pontuacao).toBe(0);
    expect(r.erroCritico).toBe(true);
    expect(r.itensAplicaveis).toBe(0); // guarda contra a rotina de contagem rodar mesmo com corte crítico
  });

  it('subtrai o peso correto de uma única penalidade', () => {
    const r = calcularPontuacaoQa(todosConformes({ 'Cordialidade': 'Não Conforme' })); // peso 2.00
    expect(r.pontuacao).toBe(8);
    expect(r.erroCritico).toBe(false);
  });

  it('soma múltiplas penalidades de pesos diferentes', () => {
    const r = calcularPontuacaoQa(todosConformes({
      'Personalização': 'Não Conforme', // 0.50
      'Sondagem': 'Não Conforme',       // 1.00
      'Script': 'Não Conforme',         // 2.50
    }));
    expect(r.pontuacao).toBe(6); // 10 - 0.5 - 1 - 2.5
  });

  it('nunca fica abaixo de 0 mesmo somando mais penalidade que 10 pontos (sem cair no critério crítico)', () => {
    const r = calcularPontuacaoQa(todosConformes({
      'Confirmação de dados':    'Não Conforme', // 5.00
      'Erro de procedimento':    'Não Conforme', // 5.00
      'Inf. Protocolo?':         'Não Conforme', // 5.00
    }));
    expect(r.pontuacao).toBe(0);
    expect(r.erroCritico).toBe(false); // zerou por soma de penalidade, não pelo critério crítico
  });

  it('"Não se aplica" não conta em itensAplicaveis nem gera penalidade', () => {
    const r = calcularPontuacaoQa(todosConformes({
      'Uso do Mute':           'Não se aplica',
      'Negociação e venda':    'Não se aplica',
    }));
    expect(r.pontuacao).toBe(10); // nenhuma penalidade
    expect(r.itensAplicaveis).toBe(20); // 22 - 2 marcados como "Não se aplica"
  });

  it('campo faltando (undefined) se comporta como "Não se aplica" — não conta, não penaliza', () => {
    const respostas = todosConformes();
    delete respostas['Tom de voz'];
    const r = calcularPontuacaoQa(respostas);
    expect(r.pontuacao).toBe(10);
    expect(r.itensAplicaveis).toBe(21);
  });
});
