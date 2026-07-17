import { ObjectId } from 'mongodb';
import prisma from '../../config/prisma';
import logger from '../../config/logger';
import { MONITORIA_AUTOMATICA_ATIVA } from '../../config/notificacoes';
import { buscarMensagensAtendimento } from '../opasuite/opasuite.service';
import { buscarAtendimentosParaAnaliseIa, resolverIdentidadesAgentes } from './atendimento.repository';
import { PAUSA_ENTRE_CHAMADAS_MS } from './atendimento.analise-ia';
import { sugerirPreenchimentoQa } from './atendimento.qa.ia';
import { calcularPontuacaoQa, criarMonitoriaQa, protocoloJaMonitorado } from './atendimento.qa.service';
import { CriterioQa, RespostaCriterio, classificarPontuacaoMedia } from './atendimento.qa.types';

/// C.A.I.O. cria a monitoria de QA (22 critérios) SOZINHO pra casos de baixo
/// risco, sem revisão humana — pedido explícito do usuário 2026-07-16 ("o
/// agente humano só vai avaliar as monitorias que o agente enviar para
/// avaliação humana"). Reverte, conscientemente, a decisão anterior
/// documentada no schema.prisma de manter a avaliação oficial "100%
/// controlada por humano" — a diferença é que agora existe um copiloto de 22
/// critérios já validado (atendimento.qa.ia.ts) capaz de sugerir com
/// qualidade, e um mecanismo de escalonamento que só deixa o CAIO decidir
/// sozinho quando TUDO indica baixo risco (ver deveEscalar).
///
/// Roda como um 2º job, 1h depois da análise leve (atendimento.analise-ia.ts,
/// 05h) — não estende o mesmo cron, pra não competir por rate-limit do
/// Gemini na mesma janela e pra sempre ler flag_triagem já gravado e
/// definitivo do dia. Protegido por MONITORIA_AUTOMATICA_ATIVA: com a flag
/// off, roda a lógica inteira (resolve identidade, chama a IA, decide) mas
/// NUNCA grava em AtendimentoMonitoriaQa — só loga o que teria acontecido.

export const ORIGEM_MONITORIA_AUTOMATICA = 'caio_automatico' as const;
const SOLICITANTE_MONITORIA_AUTOMATICA = { ixcUserId: 'caio-monitoria-automatica' };

export interface ResultadoMonitoriaAutomatica {
  totalCandidatos:        number;
  totalElegiveis:         number; // análise leve concluída E flag_triagem=false
  identidadeNaoResolvida: number; // escalado sem gastar Gemini
  jaMonitorados:          number; // pulado, dedupe
  avaliadosPelaIa:        number; // consumiu 1 chamada Gemini (dentro do teto)
  autoSalvos:             number;
  escaladosAposAvaliacao: number; // conversa curta, erro crítico, ou nota baixa
  falhas:                 number;
}

/// Critério de escalonamento pós-avaliação pesada: erro crítico OU pontuação
/// abaixo do corte de "Bom" (7.0, CLASSIFICACAO_LIMIARES em
/// atendimento.qa.types.ts) — reaproveita um limiar já estabelecido em vez de
/// inventar um número novo. erroCritico é matematicamente redundante (já
/// zera a pontuação, que cai abaixo de 7.0 de qualquer forma), mas mantido
/// explícito por clareza/auditoria.
export function deveEscalarAposAvaliacao(pont: { pontuacao: number; erroCritico: boolean }): boolean {
  return pont.erroCritico || classificarPontuacaoMedia(pont.pontuacao) === 'Não Conforme';
}

export async function rodarMonitoriaAutomaticaEmMassa(
  dateFrom: Date,
  dateTo: Date,
  limite: number,
  onItem?: (protocolo: string, status: string) => void,
): Promise<ResultadoMonitoriaAutomatica> {
  const r: ResultadoMonitoriaAutomatica = {
    totalCandidatos: 0, totalElegiveis: 0, identidadeNaoResolvida: 0, jaMonitorados: 0,
    avaliadosPelaIa: 0, autoSalvos: 0, escaladosAposAvaliacao: 0, falhas: 0,
  };

  const candidatos = await buscarAtendimentosParaAnaliseIa(dateFrom, dateTo);
  r.totalCandidatos = candidatos.length;
  if (!candidatos.length) return r;

  // 1. Só quem já tem análise leve concluída e NÃO foi flagado por ela —
  //    quem já é flag_triagem=true vai pra fila humana de qualquer jeito,
  //    não deve consumir o teto de avaliação pesada.
  const idsCandidatos = candidatos.map((c) => c.opasuiteAtendimentoId!);
  const leves = await prisma.atendimentoAnaliseIa.findMany({
    where: { opasuite_atendimento_id: { in: idsCandidatos } },
    select: { opasuite_atendimento_id: true, flag_triagem: true },
  });
  const flagPorId = new Map(leves.map((a) => [a.opasuite_atendimento_id, a.flag_triagem]));
  const elegiveis = candidatos.filter((c) => flagPorId.get(c.opasuiteAtendimentoId!) === false);
  r.totalElegiveis = elegiveis.length;
  if (!elegiveis.length) return r;

  // 2. Resolve identidade em lote — grátis, sem custo de IA.
  const identidades = await resolverIdentidadesAgentes(elegiveis);

  // 3. Quem não resolveu identidade escala DIRETO, sem gastar orçamento de IA
  //    (nunca teria como auto-salvar mesmo com nota perfeita, falta nomeAgente).
  for (const c of elegiveis.filter((c) => !identidades.get(c.opasuiteAtendimentoId!))) {
    r.identidadeNaoResolvida++;
    await prisma.atendimentoAnaliseIa.update({
      where: { opasuite_atendimento_id: c.opasuiteAtendimentoId! },
      data:  { flag_triagem: true, motivo_triagem: 'identidade_nao_resolvida' },
    }).catch((err: any) => logger.error('[MONITORIA-AUTO] falha ao escalar por identidade não resolvida', { protocolo: c.protocolo, error: err.message }));
    onItem?.(c.protocolo, 'escalado: identidade não resolvida');
  }

  // 4. Só quem tem identidade resolvida disputa o teto diário da IA pesada.
  //    Amostragem ALEATÓRIA (Fisher-Yates) sobre quem sobrou, não os N mais
  //    antigos — pedido explícito do usuário 2026-07-17 ("de 500 atendimentos,
  //    pegar 150 de forma sortida"), já que rodar em TODOS custaria caro
  //    demais em chamadas de Gemini.
  const elegiveisParaSorteio = elegiveis.filter((c) => identidades.get(c.opasuiteAtendimentoId!));
  for (let i = elegiveisParaSorteio.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [elegiveisParaSorteio[i], elegiveisParaSorteio[j]] = [elegiveisParaSorteio[j], elegiveisParaSorteio[i]];
  }
  const paraAvaliar = elegiveisParaSorteio.slice(0, limite);

  for (const c of paraAvaliar) {
    const agente = identidades.get(c.opasuiteAtendimentoId!)!;
    try {
      // Checa duplicidade ANTES de gastar Gemini — evita reavaliar um
      // protocolo que um humano já monitorou manualmente entre os 2 crons.
      if (await protocoloJaMonitorado(c.protocolo)) {
        r.jaMonitorados++;
        onItem?.(c.protocolo, 'ignorado: protocolo já monitorado');
        continue;
      }

      const mensagens = await buscarMensagensAtendimento(new ObjectId(c.opasuiteAtendimentoId!));
      const { sugestao } = await sugerirPreenchimentoQa({ ...c, mensagens });
      r.avaliadosPelaIa++;

      if (sugestao.aviso) {
        await prisma.atendimentoAnaliseIa.update({
          where: { opasuite_atendimento_id: c.opasuiteAtendimentoId! },
          data: {
            flag_triagem: true,
            motivo_triagem: 'conversa_curta',
            qa_ia_observacoes: sugestao.observacoes,
            qa_ia_criterios_sugeridos: sugestao.criterios as unknown as object,
          },
        });
        r.escaladosAposAvaliacao++;
        onItem?.(c.protocolo, `escalado: ${sugestao.aviso}`);
        continue;
      }

      const criterios = Object.fromEntries(
        sugestao.criterios.map((s) => [s.criterio, s.sugestao]),
      ) as Partial<Record<CriterioQa, RespostaCriterio>>;
      const pont = calcularPontuacaoQa(criterios);

      if (deveEscalarAposAvaliacao(pont)) {
        await prisma.atendimentoAnaliseIa.update({
          where: { opasuite_atendimento_id: c.opasuiteAtendimentoId! },
          data: {
            flag_triagem: true,
            motivo_triagem: pont.erroCritico ? 'erro_critico' : 'nota_baixa',
            qa_ia_pontuacao_sugerida: pont.pontuacao,
            qa_ia_observacoes: sugestao.observacoes,
            qa_ia_criterios_sugeridos: sugestao.criterios as unknown as object,
          },
        });
        r.escaladosAposAvaliacao++;
        onItem?.(c.protocolo, `escalado: pontuação ${pont.pontuacao}${pont.erroCritico ? ' (erro crítico)' : ''}`);
        continue;
      }

      if (MONITORIA_AUTOMATICA_ATIVA) {
        await criarMonitoriaQa({
          protocolo:        c.protocolo,
          dataAtendimento:  c.dataAtendimento,
          dataMonitoria:    new Date(),
          nomeAgente:       agente.nome,
          equipe:           agente.equipe,
          observacoes:      sugestao.observacoes,
          criterios,
        }, SOLICITANTE_MONITORIA_AUTOMATICA, ORIGEM_MONITORIA_AUTOMATICA);
        r.autoSalvos++;
        onItem?.(c.protocolo, 'auto-salvo');
      } else {
        r.autoSalvos++;
        onItem?.(c.protocolo, `teria auto-salvo (MONITORIA_AUTOMATICA_ATIVA=false): pontuação ${pont.pontuacao}`);
      }
    } catch (err: any) {
      r.falhas++;
      onItem?.(c.protocolo, `falha: ${err.message}`);
    }
    await new Promise((res) => setTimeout(res, PAUSA_ENTRE_CHAMADAS_MS));
  }

  return r;
}
