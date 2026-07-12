import prisma from '../../config/prisma';
import { buscarChamadosParaAuditar, ChamadoParaAuditar, FiltrosAuditoria } from './retencao.repository';
import { classificarNegociacao, ResultadoClassificacao } from './retencao.ia';

const PAUSA_ENTRE_CHAMADAS_MS = 1200; // evita rajada na API do Gemini

export interface OpcoesAuditoriaRetencao extends FiltrosAuditoria {
  limite?:        number;
  reclassificar?: boolean;
}

export interface ItemAuditoriaProcessado {
  chamado:        ChamadoParaAuditar;
  resultado?:     ResultadoClassificacao;
  erro?:          string;
}

export interface ResultadoAuditoriaRetencao {
  totalEncontrados: number;
  sucesso:          number;
  falha:            number;
  divergencias:     number;
}

/// Núcleo da auditoria de retenção: busca O.S. de retenção ainda não
/// classificadas (ou todas, se `reclassificar`), roda cada uma pelo
/// classificador de IA e faz upsert em RetencaoAuditoria. Usado tanto pelo
/// script manual (scripts/auditar-retencao.ts) quanto pelo cron diário
/// (jobs/alertas.job.ts) — mantém a mesma lógica idempotente nos dois casos.
export async function rodarAuditoriaRetencao(
  opcoes: OpcoesAuditoriaRetencao = {},
  onItem?: (item: ItemAuditoriaProcessado) => void,
): Promise<ResultadoAuditoriaRetencao> {
  const { limite = 50, dataMinima, apenasRetido = false, reclassificar = false } = opcoes;

  const idsJaClassificados = reclassificar
    ? []
    : (await prisma.retencaoAuditoria.findMany({ select: { id_chamado: true } })).map((r) => r.id_chamado);

  const chamados = await buscarChamadosParaAuditar(idsJaClassificados, limite, { dataMinima, apenasRetido });

  let sucesso = 0;
  let falha = 0;
  let divergencias = 0;

  for (const chamado of chamados) {
    try {
      const resultado = await classificarNegociacao(chamado);
      await prisma.retencaoAuditoria.upsert({
        where:  { id_chamado: chamado.idChamado },
        create: {
          id_chamado:           chamado.idChamado,
          nome_operador:        chamado.nomeOperador,
          resultado_ixc:        chamado.resultadoIxc,
          classificacao:        resultado.classificacao,
          justificativa:        resultado.justificativa,
          negociacao_detectada: resultado.negociacaoDetectada,
          divergencia_nota_os:  resultado.divergenciaNotaOs,
          data_abertura_os:     chamado.dataAberturaOs,
          modelo_usado:         resultado.modeloUsado,
        },
        update: {
          classificacao:        resultado.classificacao,
          justificativa:        resultado.justificativa,
          negociacao_detectada: resultado.negociacaoDetectada,
          divergencia_nota_os:  resultado.divergenciaNotaOs,
          modelo_usado:         resultado.modeloUsado,
        },
      });
      sucesso++;
      if (resultado.divergenciaNotaOs) divergencias++;
      onItem?.({ chamado, resultado });
    } catch (err: any) {
      falha++;
      onItem?.({ chamado, erro: err.message });
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CHAMADAS_MS));
  }

  return { totalEncontrados: chamados.length, sucesso, falha, divergencias };
}
