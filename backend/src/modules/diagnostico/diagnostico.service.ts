import prisma from '../../config/prisma';
import logger from '../../config/logger';
import {
  buscarHistoricoSinal,
  buscarOscilacaoRede,
  buscarEquipamentoAtual,
  buscarOrdensServico,
  buscarMensagensOs,
  buscarArquivosOs,
  buscarAtendimentos,
  buscarIdsContratoPorCliente,
  buscarContextoComercial,
  buscarRetencaoNegociacoes,
  buscarRegrasNegocio,
  buscarFotosRelevantes,
  buscarRankingVendedores,
  buscarEvolucaoVendas,
  buscarStatusPops,
} from './diagnostico.repository';
import { ContextoClienteDiagnostico } from './diagnostico.types';
import { montarContextoTextual, montarContextoGestaoTextual } from './diagnostico.prompt';
import { gerarDiagnostico, gerarRespostaGestao, DiagnosticoIaResultado } from './diagnostico.ia';

/// Monta o contexto completo de um cliente (rede + O.S. + comercial) para a IA.
/// Cada fonte é buscada fresca a cada chamada — nada fica em cache permanente.
export async function montarContextoCliente(idCliente: number): Promise<ContextoClienteDiagnostico> {
  const idsContrato = await buscarIdsContratoPorCliente(idCliente);
  const equipamentoAtual = await buscarEquipamentoAtual(idCliente);

  const [historicoSinal, oscilacaoRede, ordensServico, atendimentos, comercial, regrasNegocio] = await Promise.all([
    buscarHistoricoSinal(idCliente),
    buscarOscilacaoRede(idCliente, equipamentoAtual),
    buscarOrdensServico(idCliente),
    buscarAtendimentos(idCliente),
    buscarContextoComercial(idCliente, idsContrato),
    buscarRegrasNegocio(),
  ]);

  const idsOssChamado = ordensServico.map((os) => os.idOssChamado);
  const [osMensagens, osArquivos, retencaoNegociacoes] = await Promise.all([
    buscarMensagensOs(idsOssChamado),
    buscarArquivosOs(idsOssChamado),
    buscarRetencaoNegociacoes(idsOssChamado),
  ]);

  return {
    idCliente,
    equipamentoAtual,
    historicoSinal,
    oscilacaoRede,
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

/// Gera um diagnóstico individual para um cliente (botão padrão ou pergunta livre no
/// chat) e persiste a consulta para auditoria.
export async function gerarDiagnosticoIndividual(
  idCliente: number,
  solicitante: SolicitanteDiagnostico,
  pergunta?: string,
  historico?: { pergunta: string; resposta: string }[],
): Promise<DiagnosticoIaResultado> {
  const contexto = await montarContextoCliente(idCliente);
  const contextoTextual = montarContextoTextual(contexto);
  const imagens = await buscarFotosRelevantes(contexto.osArquivos);
  const resultado = await gerarDiagnostico(contextoTextual, pergunta, imagens, historico);

  await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:     'CLIENTE',
      id_alvo:       String(idCliente),
      pergunta:      pergunta ?? null,
      resposta:      resultado.textoCompleto,
      contexto_json: contexto as any,
      ixc_user_id:   solicitante.ixcUserId,
      ixc_username:  solicitante.ixcUsername,
    },
  });

  return resultado;
}

/// Responde perguntas de gestão (ranking de vendedores, evolução de vendas)
/// sem cliente específico — mesma auditoria de consultas do Diagnóstico.
export async function gerarRespostaGestaoIndividual(
  pergunta: string,
  solicitante: SolicitanteDiagnostico,
  historico?: { pergunta: string; resposta: string }[],
): Promise<string> {
  const [ranking, evolucao, pops] = await Promise.all([
    buscarRankingVendedores(),
    buscarEvolucaoVendas(),
    buscarStatusPops().catch((err) => {
      logger.warn('[DIAGNOSTICO] Falha ao buscar status de POPs para o chat de gestão', { error: err.message });
      return [];
    }),
  ]);
  const contextoTextual = montarContextoGestaoTextual(ranking, evolucao, pops);
  const resposta = await gerarRespostaGestao(contextoTextual, pergunta, historico);

  await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:     'GESTAO',
      id_alvo:       'GERAL',
      pergunta,
      resposta,
      contexto_json: { ranking, evolucao, pops } as any,
      ixc_user_id:   solicitante.ixcUserId,
      ixc_username:  solicitante.ixcUsername,
    },
  });

  return resposta;
}
