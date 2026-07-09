import prisma from '../../config/prisma';
import {
  buscarHistoricoSinal,
  buscarOscilacaoRede,
  buscarEquipamentoAtual,
  buscarOrdensServico,
  buscarMensagensOs,
  buscarArquivosOs,
  buscarIdsContratoPorCliente,
  buscarContextoComercial,
  buscarRegrasNegocio,
  buscarFotosRelevantes,
} from './diagnostico.repository';
import { ContextoClienteDiagnostico } from './diagnostico.types';
import { montarContextoTextual } from './diagnostico.prompt';
import { gerarDiagnostico, DiagnosticoIaResultado } from './diagnostico.ia';

/// Monta o contexto completo de um cliente (rede + O.S. + comercial) para a IA.
/// Cada fonte é buscada fresca a cada chamada — nada fica em cache permanente.
export async function montarContextoCliente(idCliente: number): Promise<ContextoClienteDiagnostico> {
  const idsContrato = await buscarIdsContratoPorCliente(idCliente);
  const equipamentoAtual = await buscarEquipamentoAtual(idCliente);

  const [historicoSinal, oscilacaoRede, ordensServico, comercial, regrasNegocio] = await Promise.all([
    buscarHistoricoSinal(idCliente),
    buscarOscilacaoRede(idCliente, equipamentoAtual),
    buscarOrdensServico(idCliente),
    buscarContextoComercial(idCliente, idsContrato),
    buscarRegrasNegocio(),
  ]);

  const idsOssChamado = ordensServico.map((os) => os.idOssChamado);
  const [osMensagens, osArquivos] = await Promise.all([
    buscarMensagensOs(idsOssChamado),
    buscarArquivosOs(idsOssChamado),
  ]);

  return {
    idCliente,
    equipamentoAtual,
    historicoSinal,
    oscilacaoRede,
    ordensServico,
    osMensagens,
    osArquivos,
    comercial,
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
): Promise<DiagnosticoIaResultado> {
  const contexto = await montarContextoCliente(idCliente);
  const contextoTextual = montarContextoTextual(contexto);
  const imagens = await buscarFotosRelevantes(contexto.osArquivos);
  const resultado = await gerarDiagnostico(contextoTextual, pergunta, imagens);

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
