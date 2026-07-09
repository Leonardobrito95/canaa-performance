import { describe, it, expect } from 'vitest';
import { montarContextoTextual, montarContextoGestaoTextual } from './diagnostico.prompt';
import type { ContextoClienteDiagnostico, RankingVendedorEntry, EvolucaoMensalEntry } from './diagnostico.types';

// ── Fixture base — um cliente "completo", editado por teste conforme necessário ──
function makeContexto(overrides: Partial<ContextoClienteDiagnostico> = {}): ContextoClienteDiagnostico {
  return {
    idCliente: 42929,
    equipamentoAtual: [{ descricao: 'ONU TP-LINK', numeroSerie: 'ABC123' }],
    historicoSinal: [],
    oscilacaoRede: null,
    ordensServico: [],
    osMensagens: {},
    osArquivos: {},
    atendimentos: [],
    comercial: { vendas: [], comissoesBdr: [], retencaoNegociacoes: [] },
    regrasNegocio: {},
    ...overrides,
  };
}

describe('montarContextoTextual — Ordens de Serviço', () => {
  it('inclui o técnico responsável de cada O.S. quando presente', () => {
    const ctx = makeContexto({
      ordensServico: [{
        idOssChamado: 559047, mensagem: 'Cliente relata lentidão', mensagemResposta: null,
        status: 'A', dataAbertura: new Date('2026-07-06'), dataFechamento: null,
        tecnicoId: 167, tecnicoNome: 'MARCOS VINICIUS SILVA SANTOS (CLT)', endereco: null,
      }],
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('Técnico responsável: MARCOS VINICIUS SILVA SANTOS (CLT)');
  });

  it('mostra "não definido" quando a O.S. não tem técnico associado', () => {
    const ctx = makeContexto({
      ordensServico: [{
        idOssChamado: 1, mensagem: 'x', mensagemResposta: null, status: 'F',
        dataAbertura: null, dataFechamento: null, tecnicoId: null, tecnicoNome: null, endereco: null,
      }],
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('Técnico responsável: não definido');
  });

  it('usa a mensagem de fallback quando não há nenhuma O.S.', () => {
    const texto = montarContextoTextual(makeContexto());
    expect(texto).toContain('Sem ordens de serviço registradas.');
  });
});

describe('montarContextoTextual — Atendimentos (tickets)', () => {
  it('lista atendimentos com responsável, separados das O.S.', () => {
    const ctx = makeContexto({
      ordensServico: [{
        idOssChamado: 558426, mensagem: 'Vistoria', mensagemResposta: null, status: 'F',
        dataAbertura: new Date('2026-07-06'), dataFechamento: new Date('2026-07-07'),
        tecnicoId: 167, tecnicoNome: 'MARCOS VINICIUS SILVA SANTOS (CLT)', endereco: null,
      }],
      atendimentos: [{
        id: 602545, titulo: 'Pedido de Vistoria', status: 'F',
        dataCriacao: new Date('2026-07-05'), responsavelNome: 'WALISON FELIPE SOUSA RODRIGUES',
      }],
    });
    const texto = montarContextoTextual(ctx);

    // A seção de atendimentos existe e tem o responsável correto...
    expect(texto).toContain('=== ATENDIMENTOS (tickets) ===');
    expect(texto).toContain('Atendimento #602545');
    expect(texto).toContain('WALISON FELIPE SOUSA RODRIGUES');

    // ...e não é a mesma pessoa do técnico da O.S. (guarda contra a regressão de
    // confundir as duas listas, já vista em produção nesta mesma sessão).
    const secaoAtendimentos = texto.split('=== ATENDIMENTOS (tickets) ===')[1].split('=== SITUACAO COMERCIAL ===')[0];
    expect(secaoAtendimentos).not.toContain('MARCOS VINICIUS');
  });

  it('usa a mensagem de fallback quando não há atendimentos', () => {
    const texto = montarContextoTextual(makeContexto());
    expect(texto).toContain('Sem atendimentos (tickets) registrados.');
  });
});

describe('montarContextoTextual — Situação comercial (snapshot)', () => {
  it('expõe mês de referência e data do snapshot (guarda contra status apresentado como "em aberto")', () => {
    const ctx = makeContexto({
      comercial: {
        vendas: [{
          idContrato: '45053', plano: 'Plano BÁSICO 500MB', statusComissao: 'Bloqueada — aguardando pagamento',
          motivoBloqueio: 'Primeiro boleto não recebido', valorMensal: 99.9,
          mesReferencia: '2026-04', dataSnapshot: new Date('2026-05-19'),
        }],
        comissoesBdr: [], retencaoNegociacoes: [],
      },
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('referência: 2026-04');
    expect(texto).toContain('2026-05-19');
    expect(texto).toContain('Bloqueada — aguardando pagamento');
    // A regra que instrui a IA a não tratar snapshot antigo como "em aberto" tem que
    // continuar presente no prompt — se essa frase sumir do código, o teste falha.
    expect(texto.toLowerCase()).toContain('imutável');
  });

  it('inclui negociações de retenção quando existentes (guarda contra ficar hardcoded vazio)', () => {
    const ctx = makeContexto({
      comercial: {
        vendas: [], comissoesBdr: [],
        retencaoNegociacoes: [{
          idChamado: '558426', valorOriginal: 129.9, valorNegociado: 99.9,
          descricao: 'Cliente ameaçou cancelar por lentidão recorrente', dataRegistro: new Date('2026-07-09'),
        }],
      },
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('O.S. #558426');
    expect(texto).toContain('R$129.90');
    expect(texto).toContain('R$99.90');
    expect(texto).toContain('Cliente ameaçou cancelar por lentidão recorrente');
  });

  it('usa a mensagem de fallback quando não há dado comercial nenhum', () => {
    const texto = montarContextoTextual(makeContexto());
    expect(texto).toContain('Sem dados comerciais associados.');
  });
});

describe('montarContextoTextual — Regras de negócio e equipamento', () => {
  it('inclui as regras de negócio fornecidas', () => {
    const ctx = makeContexto({ regrasNegocio: { META_B2C: '10000' } });
    expect(montarContextoTextual(ctx)).toContain('META_B2C: 10000');
  });

  it('inclui o equipamento atual em comodato', () => {
    const ctx = makeContexto({ equipamentoAtual: [{ descricao: 'ROTEADOR TP-LINK EX141', numeroSerie: 'XYZ789' }] });
    expect(montarContextoTextual(ctx)).toContain('ROTEADOR TP-LINK EX141 (S/N XYZ789)');
  });
});

describe('montarContextoGestaoTextual — ranking e evolução', () => {
  const ranking: RankingVendedorEntry[] = [
    { nomeVendedor: 'NATHALIA', mesReferencia: '2026-05', qtdContratos: 74, valorAtivos: 9152.8, valorLiberado: 6734.7 },
  ];
  const evolucao: EvolucaoMensalEntry[] = [
    { mesReferencia: '2026-05', segmento: 'B2C', qtdContratos: 294, valorAtivos: 34920.1, valorLiberado: 25068.3 },
  ];

  it('formata o ranking de vendedores com mês, contratos e valores', () => {
    const texto = montarContextoGestaoTextual(ranking, evolucao);
    expect(texto).toContain('2026-05 | NATHALIA | 74 contratos');
    expect(texto).toContain('ativos R$9152.80');
    expect(texto).toContain('liberado R$6734.70');
  });

  it('formata a evolução de vendas por mês e segmento', () => {
    const texto = montarContextoGestaoTextual(ranking, evolucao);
    expect(texto).toContain('2026-05 | B2C | 294 contratos');
  });

  it('usa mensagens de fallback quando não há dados', () => {
    const texto = montarContextoGestaoTextual([], []);
    expect(texto).toContain('Sem dados de vendedores nos snapshots disponíveis.');
    expect(texto).toContain('Sem dados de evolução de vendas nos snapshots disponíveis.');
  });
});
