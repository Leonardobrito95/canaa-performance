import prisma from '../../config/prisma';
import logger from '../../config/logger';
import {
  buscarHistoricoSinal,
  buscarOscilacaoRede,
  buscarStatusSmartOlt,
  buscarEquipamentoAtual,
  buscarOrdensServico,
  buscarMensagensOs,
  buscarArquivosOs,
  buscarAtendimentos,
  buscarContratosCliente,
  buscarContextoComercial,
  buscarRetencaoNegociacoes,
  buscarRegrasNegocio,
  buscarFotosRelevantes,
  resolverSnOnu,
} from './diagnostico.repository';
import { buscarStatusSmartOltCompleto } from './diagnostico.smartolt-live';
import { buscarFatoPosAtivacaoCliente } from '../posativacao/posativacao.repository';
import { ContextoClienteDiagnostico } from './diagnostico.types';
import { montarContextoTextual, montarContextoGestaoTextual } from './diagnostico.prompt';
import { FONTES_GESTAO, DadosGestao, JanelaTemporalGestao } from './diagnostico.gestao-fontes';
import { gerarDiagnostico, gerarRespostaGestao, DiagnosticoIaResultado, custoEstimadoChamada } from './diagnostico.ia';

/// Teto diário de custo do chat do CAIO (Consulta individual + Painel de
/// Gestão), calibrado nos dados reais de uso (2026-07-09 a 2026-07-20, 384
/// consultas): custo médio ~US$0,018/consulta (~10.700 tokens de entrada,
/// ~230 de saída), maior dia histórico (incluindo teste intensivo de
/// desenvolvimento) foi de 201 consultas por ~US$1,76, e o dia "normal" de
/// uso real fica entre US$0,35 e US$0,40. US$10/dia dá margem de ~6-25x
/// sobre qualquer padrão já observado (equivale a ~550 consultas médias/dia)
/// sem deixar o gasto sem teto — no pior caso (excedido todo santo dia) o
/// mês fecha em ~US$300, bem abaixo de "conta exorbitante"; o uso esperado
/// de fato fica em torno de US$10-15/mês. Ajustável via env sem redeploy de
/// código, caso o padrão de uso mude (ex: acesso reaberto a mais gestores).
export const LIMITE_CAIO_USD_DIA = Number(process.env.LIMITE_CAIO_USD_DIA ?? '10');

export class LimiteCaioExcedidoError extends Error {
  statusCode = 429;
  constructor(public gastoHojeUsd: number, public limiteUsd: number) {
    super(`Limite diário de custo do CAIO atingido (US$ ${gastoHojeUsd.toFixed(2)} de US$ ${limiteUsd.toFixed(2)}). Tente novamente amanhã.`);
    this.name = 'LimiteCaioExcedidoError';
  }
}

/// Soma o custo estimado de todas as consultas do CAIO já registradas hoje
/// (fuso do servidor) — persistido, então sobrevive a restart do processo,
/// diferente do agregado em memória de diagnostico.ia.ts.
export async function gastoCaioHojeUsd(): Promise<number> {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const consultas = await prisma.diagnosticoConsulta.findMany({
    where: { criado_em: { gte: inicioHoje } },
    select: { tokens_entrada: true, tokens_saida: true, modelo_usado: true },
  });
  return consultas.reduce(
    (total, c) => total + (custoEstimadoChamada(c.tokens_entrada ?? 0, c.tokens_saida ?? 0, c.modelo_usado ?? '') ?? 0),
    0,
  );
}

async function garantirLimiteCaio(): Promise<void> {
  const gasto = await gastoCaioHojeUsd();
  if (gasto >= LIMITE_CAIO_USD_DIA) {
    throw new LimiteCaioExcedidoError(gasto, LIMITE_CAIO_USD_DIA);
  }
}

/// Monta o contexto completo de um cliente (rede + O.S. + comercial) para a IA.
/// Cada fonte é buscada fresca a cada chamada — nada fica em cache permanente.
export async function montarContextoCliente(idCliente: number): Promise<ContextoClienteDiagnostico> {
  const contratos = await buscarContratosCliente(idCliente);
  const idsContrato = contratos.map((c) => c.id);
  const idsContratoAtivos = new Set(contratos.filter((c) => c.ativo).map((c) => c.id));
  const equipamentoAtual = await buscarEquipamentoAtual(idCliente);

  const [historicoSinal, oscilacaoRede, statusSmartOlt, statusSmartOltCompleto, ordensServico, atendimentos, comercial, regrasNegocio, posAtivacao] = await Promise.all([
    buscarHistoricoSinal(idCliente),
    buscarOscilacaoRede(idCliente, equipamentoAtual),
    buscarStatusSmartOlt(equipamentoAtual),
    buscarStatusSmartOltCompleto(resolverSnOnu(equipamentoAtual)),
    buscarOrdensServico(idCliente, idsContratoAtivos),
    buscarAtendimentos(idCliente, idsContratoAtivos),
    buscarContextoComercial(idCliente, idsContrato),
    buscarRegrasNegocio(),
    buscarFatoPosAtivacaoCliente(idCliente, idsContratoAtivos),
  ]);

  const idsOssChamado = ordensServico.map((os) => os.idOssChamado);
  const [osMensagens, osArquivos, retencaoNegociacoes] = await Promise.all([
    buscarMensagensOs(idsOssChamado),
    buscarArquivosOs(idsOssChamado),
    buscarRetencaoNegociacoes(idsOssChamado),
  ]);

  return {
    idCliente,
    contratos,
    posAtivacao,
    equipamentoAtual,
    historicoSinal,
    oscilacaoRede,
    statusSmartOlt,
    statusSmartOltCompleto,
    ordensServico,
    osMensagens,
    osArquivos,
    atendimentos,
    comercial: { ...comercial, retencaoNegociacoes },
    regrasNegocio,
  };
}

export interface SolicitanteDiagnostico {
  ixcUserId: string;
  ixcUsername: string;
}

/// Intervalo do mês corrente (dia 1 até hoje) — usado pra trazer o desempenho
/// de retenção do mês em andamento tanto pro chat de gestão quanto pro
/// resumo estático dos cards (diagnostico.controller.ts), mantendo os dois
/// consistentes com o mesmo período.
export function intervaloMesAtual(): { dateFrom: string; dateTo: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return { dateFrom: `${ano}-${mes}-01`, dateTo: hoje.toISOString().slice(0, 10) };
}

/// Gera um diagnóstico individual para um cliente (botão padrão ou pergunta livre no
/// chat) e persiste a consulta para auditoria.
export async function gerarDiagnosticoIndividual(
  idCliente: number,
  solicitante: SolicitanteDiagnostico,
  pergunta?: string,
  historico?: { pergunta: string; resposta: string }[],
): Promise<DiagnosticoIaResultado & { consultaId: string }> {
  await garantirLimiteCaio();
  const contexto = await montarContextoCliente(idCliente);
  const contextoTextual = montarContextoTextual(contexto);
  // Fotos só são buscadas/reenviadas na PRIMEIRA pergunta de uma conversa (sem
  // histórico ainda) — reenviar a mesma foto em base64 a cada pergunta de
  // acompanhamento é o maior custo de token da consulta (medido em produção:
  // média de ~9.700 tokens de entrada por chamada, com 81% sendo perguntas de
  // acompanhamento) sem ganho real, já que a foto não muda no meio da
  // conversa. `gerarDiagnostico` avisa a IA quando isso acontece, pra ela usar
  // o que já descreveu antes em vez de inventar detalhe visual novo.
  const imagens = historico?.length ? [] : await buscarFotosRelevantes(contexto.osArquivos);
  const resultado = await gerarDiagnostico(contextoTextual, pergunta, imagens, historico);

  const consulta = await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:      'CLIENTE',
      id_alvo:        String(idCliente),
      pergunta:       pergunta ?? null,
      resposta:       resultado.textoCompleto,
      contexto_json:  contexto as any,
      ixc_user_id:    solicitante.ixcUserId,
      ixc_username:   solicitante.ixcUsername,
      latencia_ms:    resultado.metricas.latenciaMs,
      tokens_entrada: resultado.metricas.tokensEntrada,
      tokens_saida:   resultado.metricas.tokensSaida,
      modelo_usado:   resultado.metricas.modeloUsado,
    },
  });

  return { ...resultado, consultaId: consulta.id };
}

/// Mesma janela temporal usada pelo chat de gestão e pela exportação de
/// relatório (diagnostico.controller.ts::exportarRelatorioGestao) — um só
/// lugar pra não desalinhar "mês em andamento"/"últimos 3 meses" entre os
/// dois usos.
export function criarJanelaAtual(): JanelaTemporalGestao {
  const hoje = new Date();
  return {
    hoje,
    inicioMes: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    inicioUltimos3Meses: new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1),
  };
}

/// Marcador estruturado que o CAIO pode colocar no INÍCIO da resposta pra
/// pedir a geração de um relatório (ver regra no GESTAO_SYSTEM_PROMPT,
/// diagnostico.prompt.ts) — mesmo padrão de marcador-em-texto-livre já usado
/// em diagnostico.ia.ts (parseResposta, DIAGNOSTICO:/ERRO:/SUGESTAO:), só que
/// aqui é opcional e nunca quebra a resposta se vier malformado: se `chave`
/// não existir em FONTES_GESTAO, ou `formato` não for suportado por ela
/// (xlsx exige paraExcel), o marcador é simplesmente ignorado — o texto
/// visível fica sem o arquivo anexado, sem erro pro usuário.
///
/// No INÍCIO, não no final: bug real encontrado ao vivo (2026-07-14) — com o
/// marcador no final, uma resposta comparativa longa (ex: variação de vendas
/// entre 2 meses) cortava no meio da frase ao bater no teto de tokens antes
/// de alcançar a linha EXPORTAR, e nenhum arquivo era oferecido mesmo sendo
/// pedido explicitamente. No início, o marcador nunca é vítima de corte por
/// tamanho do texto que vem depois.
const REGEX_EXPORTAR = /^EXPORTAR:\s*chave=([a-zA-Z0-9_]+)\s+formato=(pdf|xlsx)\s*\n?/i;

export interface ArquivoGerado {
  chave:   string;
  formato: 'pdf' | 'xlsx';
  nome:    string;
}

function extrairPedidoExportacao(respostaBruta: string): { resposta: string; arquivo: ArquivoGerado | null } {
  const match = respostaBruta.trimStart().match(REGEX_EXPORTAR);
  if (!match) return { resposta: respostaBruta, arquivo: null };

  const resposta = respostaBruta.trimStart().slice(match[0].length).trimStart();
  const [, chave, formatoBruto] = match;
  const formato = formatoBruto.toLowerCase() as 'pdf' | 'xlsx';

  const fonte = FONTES_GESTAO.find((f) => f.chave === chave);
  if (!fonte) return { resposta, arquivo: null };
  if (formato === 'xlsx' && !fonte.paraExcel) return { resposta, arquivo: null };

  const dataIso = new Date().toISOString().slice(0, 10);
  return { resposta, arquivo: { chave, formato, nome: `${chave}-${dataIso}.${formato}` } };
}

/// Responde perguntas de gestão (ranking de vendedores, evolução de vendas,
/// atendimento, retenção...) sem cliente específico — mesma auditoria de
/// consultas do Diagnóstico. Busca cada fonte de FONTES_GESTAO em paralelo
/// (diagnostico.gestao-fontes.ts) — adicionar uma fonte nova não muda essa
/// função, só o registry.
export async function gerarRespostaGestaoIndividual(
  pergunta: string,
  solicitante: SolicitanteDiagnostico,
  historico?: { pergunta: string; resposta: string }[],
): Promise<{ resposta: string; consultaId: string; arquivo: ArquivoGerado | null }> {
  await garantirLimiteCaio();
  const janela = criarJanelaAtual();

  const entradas = await Promise.all(FONTES_GESTAO.map(async (fonte) => {
    // ranking/evolução não são resilientes de propósito — uma falha nelas
    // propaga e derruba a resposta (500) em vez de degradar silenciosamente,
    // diferente das outras fontes (ver comentário de `resiliente` no tipo).
    if (!fonte.resiliente) return [fonte.chave, await fonte.buscar(janela)] as const;
    try {
      return [fonte.chave, await fonte.buscar(janela)] as const;
    } catch (err: any) {
      logger.warn(`[DIAGNOSTICO] ${fonte.resiliente.logErroMsg}`, { error: err.message });
      return [fonte.chave, fonte.valorVazio] as const;
    }
  }));
  const dados = Object.fromEntries(entradas) as DadosGestao;

  const contextoTextual = montarContextoGestaoTextual(dados);
  const { texto: respostaBruta, metricas } = await gerarRespostaGestao(contextoTextual, pergunta, historico);
  const { resposta, arquivo } = extrairPedidoExportacao(respostaBruta);

  const consulta = await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:      'GESTAO',
      id_alvo:        'GERAL',
      pergunta,
      resposta,
      contexto_json:  dados as any,
      ixc_user_id:    solicitante.ixcUserId,
      ixc_username:   solicitante.ixcUsername,
      latencia_ms:    metricas.latenciaMs,
      tokens_entrada: metricas.tokensEntrada,
      tokens_saida:   metricas.tokensSaida,
      modelo_usado:   metricas.modeloUsado,
    },
  });

  return { resposta, consultaId: consulta.id, arquivo };
}
