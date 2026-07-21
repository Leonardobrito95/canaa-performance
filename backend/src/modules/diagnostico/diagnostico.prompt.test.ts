import { describe, it, expect } from 'vitest';
import { montarContextoTextual, montarContextoGestaoTextual, montarDiagnosticoSystemPrompt } from './diagnostico.prompt';
import type { ContextoClienteDiagnostico, RankingVendedorEntry, EvolucaoMensalEntry } from './diagnostico.types';

// ── Fixture base — um cliente "completo", editado por teste conforme necessário ──
function makeContexto(overrides: Partial<ContextoClienteDiagnostico> = {}): ContextoClienteDiagnostico {
  return {
    idCliente: 42929,
    contratos: [],
    posAtivacao: null,
    equipamentoAtual: [{ descricao: 'ONU TP-LINK', numeroSerie: 'ABC123' }],
    historicoSinal: [],
    oscilacaoRede: null,
    statusSmartOlt: null,
    statusSmartOltCompleto: null,
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
        idContrato: null, contratoAtivo: null,
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
        idContrato: null, contratoAtivo: null,
      }],
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('Técnico responsável: não definido');
  });

  it('usa a mensagem de fallback quando não há nenhuma O.S.', () => {
    const texto = montarContextoTextual(makeContexto());
    expect(texto).toContain('Sem ordens de serviço registradas.');
  });

  // Guarda contra a regressão vista em produção 2026-07-12: cliente com contrato
  // novo recém-instalado (ATIVO) e um contrato antigo já CANCELADO teve uma O.S.
  // do contrato antigo (financeira/penalidade, sem relação com a instalação)
  // usada pra explicar o problema do contrato novo, porque nada no texto
  // indicava que eram contratos diferentes.
  it('rotula o contrato de cada O.S. e marca claramente se está cancelado', () => {
    const ctx = makeContexto({
      ordensServico: [{
        idOssChamado: 553025, mensagem: 'Controle de descontos e penalidades', mensagemResposta: null,
        status: 'F', dataAbertura: new Date('2026-06-19'), dataFechamento: new Date('2026-06-19'),
        tecnicoId: 1, tecnicoNome: 'CARLOS EDUARDO RODRIGUES', endereco: null,
        idContrato: '38291', contratoAtivo: false,
      }],
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('contrato 38291 (NÃO ATIVO)');
  });

  it('rotula o contrato ativo de forma distinta do cancelado', () => {
    const ctx = makeContexto({
      ordensServico: [{
        idOssChamado: 554561, mensagem: 'Instalação', mensagemResposta: null,
        status: 'F', dataAbertura: new Date('2026-06-23'), dataFechamento: null,
        tecnicoId: 2, tecnicoNome: 'TÉCNICO X', endereco: null,
        idContrato: '45862', contratoAtivo: true,
      }],
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('contrato 45862 (ATIVO)');
  });
});

// Guarda contra a regressão vista em produção 2026-07-12 (segunda parte do mesmo
// caso): mesmo depois de rotular cada O.S./atendimento por contrato, o C.A.I.O.
// respondeu "não há contrato cancelado" pra um cliente que tinha um, porque a
// amostra de O.S. mostrada a ele já priorizava só o contrato ativo — o contrato
// cancelado nunca aparecia em NADA do contexto. A seção CONTRATOS DO CLIENTE
// existe justamente pra ser a fonte de verdade dessa pergunta, independente de
// quais O.S./atendimentos entraram na amostra.
describe('montarContextoTextual — Contratos do cliente', () => {
  it('lista todos os contratos do cliente, mesmo quando nenhuma O.S. do contrato cancelado está na amostra', () => {
    const ctx = makeContexto({
      contratos: [
        { id: '45862', status: 'A', ativo: true, dataAtivacao: new Date('2026-06-17'), dataCancelamento: null },
        { id: '38291', status: 'I', ativo: false, dataAtivacao: new Date('2025-02-12'), dataCancelamento: new Date('2026-06-25') },
      ],
      // amostra de O.S. só do contrato ativo, como o fix de priorização já garante
      ordensServico: [{
        idOssChamado: 554561, mensagem: 'Instalação', mensagemResposta: null, status: 'F',
        dataAbertura: new Date('2026-06-23'), dataFechamento: null,
        tecnicoId: 2, tecnicoNome: 'TÉCNICO X', endereco: null,
        idContrato: '45862', contratoAtivo: true,
      }],
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('Contrato 45862 | ATIVO');
    expect(texto).toContain('Contrato 38291 | NÃO ATIVO (status "I")');
    expect(texto).toContain('encerrado em 2026-06-25');
  });

  it('usa a mensagem de fallback quando o cliente não tem nenhum contrato', () => {
    const texto = montarContextoTextual(makeContexto());
    expect(texto).toContain('Nenhum contrato encontrado para este cliente.');
  });

  it('inclui o fato de pós-ativação junto da lista de contratos, quando presente', () => {
    const ctx = makeContexto({
      contratos: [{ id: '45862', status: 'A', ativo: true, dataAtivacao: new Date('2026-06-17'), dataCancelamento: null }],
      posAtivacao: { dataAtivacao: '2026-06-17', totalContatos: 2, diasPrimeiro: 3, motivos: ['Conexão', 'Financeiro'] },
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('Pós-ativação: este cliente abriu 2 ticket(s)');
    expect(texto).toContain('1º contato 3 dia(s) depois');
    expect(texto).toContain('Conexão, Financeiro');
  });

  it('não menciona pós-ativação quando não houve contato', () => {
    const texto = montarContextoTextual(makeContexto({
      contratos: [{ id: '45862', status: 'A', ativo: true, dataAtivacao: new Date('2026-06-17'), dataCancelamento: null }],
    }));
    expect(texto).not.toContain('Pós-ativação');
  });
});

describe('montarContextoTextual — Atendimentos (tickets)', () => {
  it('lista atendimentos com responsável, separados das O.S.', () => {
    const ctx = makeContexto({
      ordensServico: [{
        idOssChamado: 558426, mensagem: 'Vistoria', mensagemResposta: null, status: 'F',
        dataAbertura: new Date('2026-07-06'), dataFechamento: new Date('2026-07-07'),
        tecnicoId: 167, tecnicoNome: 'MARCOS VINICIUS SILVA SANTOS (CLT)', endereco: null,
        idContrato: null, contratoAtivo: null,
      }],
      atendimentos: [{
        id: 602545, titulo: 'Pedido de Vistoria', status: 'F',
        dataCriacao: new Date('2026-07-05'), responsavelNome: 'WALISON FELIPE SOUSA RODRIGUES',
        idContrato: null, contratoAtivo: null,
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

describe('montarContextoTextual — Status SmartOLT (Power fail vs LOS)', () => {
  it('inclui o status SmartOLT quando presente, distinguindo Power fail de LOS', () => {
    const ctx = makeContexto({
      statusSmartOlt: {
        sn: 'MONU005EC969', statusOnu: 'Power fail', signalClass: null,
        nivelSinal: '1 - Atencao', diasDegradado: 3,
        sinalRx: null, ultimaMudancaStatus: new Date('2026-07-08'), snapshotData: new Date('2026-07-08'),
      },
    });
    const texto = montarContextoTextual(ctx);
    expect(texto).toContain('Status SmartOLT da ONU (MONU005EC969): Power fail');
    expect(texto).toContain('2026-07-08');
    // A regra que ensina a IA a não confundir queda de energia com problema de
    // fibra tem que continuar no prompt (guarda contra regressão de instrução).
    const systemPrompt = montarDiagnosticoSystemPrompt({});
    expect(systemPrompt).toContain('queda de energia');
    expect(systemPrompt).toContain('LOS');
  });

  it('não menciona status SmartOLT quando a fonte não tem dado pra esse cliente (não é erro)', () => {
    const texto = montarContextoTextual(makeContexto({ statusSmartOlt: null }));
    expect(texto).not.toContain('Status SmartOLT');
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
    const texto = montarContextoGestaoTextual({ ranking, evolucao });
    expect(texto).toContain('2026-05 | NATHALIA | 74 contratos');
    expect(texto).toContain('ativos R$9152.80');
    expect(texto).toContain('liberado R$6734.70');
  });

  it('formata a evolução de vendas por mês e segmento', () => {
    const texto = montarContextoGestaoTextual({ ranking, evolucao });
    expect(texto).toContain('2026-05 | B2C | 294 contratos');
  });

  it('usa mensagens de fallback quando não há dados', () => {
    const texto = montarContextoGestaoTextual({});
    expect(texto).toContain('Sem dados de vendedores nos snapshots disponíveis.');
    expect(texto).toContain('Sem dados de evolução de vendas nos snapshots disponíveis.');
  });
});

describe('montarContextoGestaoTextual — Atendimento (KPIs vs QA humano)', () => {
  it('formata os critérios de QA mais reprovados, incluindo Transferencia Indevida', () => {
    const texto = montarContextoGestaoTextual({
      monitoriaAtendimento: {
        criterios: [
          { criterio: 'Transferencia Indevida', naoConforme: 18, total: 940, pct: 1.9 },
          { criterio: 'Omissão de atendimento', naoConforme: 3, total: 940, pct: 0.3 },
        ],
        ranking: [],
      },
    });
    expect(texto).toContain('Transferencia Indevida: 18/940 (1.9%) reprovados');
  });

  it('ranking de qualidade por agente traz nota real e classificação, não é o mesmo texto do ranking por volume (guarda contra o modelo confundir as duas fontes)', () => {
    const texto = montarContextoGestaoTextual({
      monitoriaAtendimento: {
        criterios: [],
        ranking: [
          { nomeAgente: 'Priscilla Rodrigues', equipe: 'SAC', qtd: 515, pontuacaoMedia: 9.66, classificacao: 'Ótimo' },
        ],
      },
    });
    expect(texto).toContain('Priscilla Rodrigues (SAC) — nota média 9.66/10, classificação "Ótimo", 515 avaliações');
  });

  it('inclui os KPIs brutos de atendimento (TMR/TME/TMA) com escalonamento só pra N1', () => {
    const kpis = [
      // TMR em segundos de propósito — guarda contra a formatação arredondar
      // TMR pra "0min" e esconder o dado quando a resposta humana é rápida.
      { setor: 'N1' as const, volume: 100, tmrMs: 45000, tmeMs: 900000, tmaMs: 600000, volumeChat: 100, volumeLigacao: 0, tmaMsChat: 600000, tmeMsChat: 900000, tmaMsLigacao: null, tmeMsLigacao: null, duracaoRealLigacaoMs: null, escalonamentos: 5, pctEscalonamento: 5, notaMediaSatisfacao: 4.1, qtdAvaliados: 20 },
      { setor: 'SAC' as const, volume: 50, tmrMs: 20000, tmeMs: 120000, tmaMs: 300000, volumeChat: 50, volumeLigacao: 0, tmaMsChat: 300000, tmeMsChat: 120000, tmaMsLigacao: null, tmeMsLigacao: null, duracaoRealLigacaoMs: null, escalonamentos: 0, pctEscalonamento: null, notaMediaSatisfacao: null, qtdAvaliados: 0 },
    ];
    const texto = montarContextoGestaoTextual({ kpisAtendimento: kpis });
    expect(texto).toContain('TMR (tempo que o atendente HUMANO demora pra responder uma mensagem do cliente NO CHAT, nunca conta URA/IZA, ligação não tem essa métrica): 45s');
    expect(texto).toContain('TME (espera em fila/URA/IZA até um humano assumir, chat+ligação): 15min');
    expect(texto).toContain('TMA (tempo com o atendente humano, chat+ligação): 10min');
    expect(texto).toContain('Escalonado pra N2: 5 (5%)');
    const linhaSac = texto.split('\n').find((l) => l.startsWith('- SAC'));
    expect(linhaSac).not.toContain('Escalonado');
  });

  it('mostra a quebra TME/TMA por canal (chat vs ligação) só quando o setor tem volume real de ligação', () => {
    const kpis = [
      { setor: 'N1' as const, volume: 130, tmrMs: 45000, tmeMs: 780000, tmaMs: 1470000, volumeChat: 100, volumeLigacao: 30, tmaMsChat: 1800000, tmeMsChat: 1500000, tmaMsLigacao: 30000, tmeMsLigacao: 0, duracaoRealLigacaoMs: 120000, escalonamentos: 5, pctEscalonamento: 5, notaMediaSatisfacao: 4.1, qtdAvaliados: 20 },
      { setor: 'N2' as const, volume: 8, tmrMs: 30000, tmeMs: 60000, tmaMs: 200000, volumeChat: 8, volumeLigacao: 0, tmaMsChat: 200000, tmeMsChat: 60000, tmaMsLigacao: null, tmeMsLigacao: null, duracaoRealLigacaoMs: null, escalonamentos: 0, pctEscalonamento: null, notaMediaSatisfacao: null, qtdAvaliados: 0 },
    ];
    const texto = montarContextoGestaoTextual({ kpisAtendimento: kpis });
    const linhaN1 = texto.split('\n').find((l) => l.startsWith('- N1'));
    expect(linhaN1).toContain('chat: TME 25min, TMA 30min | ligação: TME 0s, TMA (só toque humano) 30s, duração real da chamada 2min, volume 100 chat / 30 ligação');
    const linhaN2 = texto.split('\n').find((l) => l.startsWith('- N2'));
    expect(linhaN2).not.toContain('chat: TME');
  });
});

describe('montarContextoGestaoTextual — Atendimento (análise de IA em massa)', () => {
  it('formata sentimento e adesão por setor, distinto da nota de QA humano', () => {
    const texto = montarContextoGestaoTextual({
      analiseIaAtendimento: {
        porSetor: [
          { setor: 'VENDAS', qtd: 120, sentimentoMedio: -0.3, adesaoMedia: 7.2 },
        ],
        motivos: [],
      },
    });
    expect(texto).toContain('VENDAS: sentimento médio do cliente -0.3 (escala -1 a 1), adesão média ao script do atendente 7.2/10, 120 atendimento(s) analisados');
  });

  it('ranking de motivos classificados por IA aparece separado do ranking de motivos do OpaSuite', () => {
    const texto = montarContextoGestaoTextual({
      analiseIaAtendimento: {
        porSetor: [],
        motivos: [{ motivo: 'Sem Conexão', qtd: 42 }],
      },
    });
    expect(texto).toContain('ATENDIMENTO — ANÁLISE DE IA EM MASSA: MOTIVOS CLASSIFICADOS');
    expect(texto).toContain('1. Sem Conexão — 42 ocorrências');
  });
});
