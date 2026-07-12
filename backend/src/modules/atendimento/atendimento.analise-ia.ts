import { ObjectId } from 'mongodb';
import { Type } from '@google/genai';
import prisma from '../../config/prisma';
import { getOpaSuiteDb } from '../../config/opasuiteMongo';
import { buscarMensagensAtendimento } from '../opasuite/opasuite.service';
import { chamarGemini, MetricasGemini } from '../diagnostico/diagnostico.ia';
import { buscarAtendimentosParaAnaliseIa } from './atendimento.repository';
import { AtendimentoParaMonitoria, formatarRotasTransferenciaLegitimas } from './atendimento.types';

/// Camada analítica de IA em massa — NÃO é o copiloto de QA
/// (atendimento.qa.ia.ts), que sugere os 22 critérios pra 1 atendimento
/// escolhido pelo humano. Isso aqui roda sobre quase todo o volume de
/// texto, sem revisão humana no momento do processamento — é sinal de
/// triagem, nunca "nota oficial". Ver AtendimentoAnaliseIa no schema.prisma
/// pro princípio de separação dessa tabela.

export type SentimentoCategoria = 'muito_negativo' | 'negativo' | 'neutro' | 'positivo' | 'muito_positivo';

/// Limiares calibrados na fase piloto (252 atendimentos reais processados
/// via scripts/analisar-atendimentos-ia.ts, 2026-07-11: p10=-0.49,
/// p50=0, p85=0.5) — ajustar aqui se a distribuição real mudar, não
/// espalhar o número mágico por outros arquivos.
const LIMIARES_SENTIMENTO: [number, SentimentoCategoria][] = [
  [0.6, 'muito_positivo'],
  [0.2, 'positivo'],
  [-0.2, 'neutro'],
  [-0.6, 'negativo'],
];

export function calcularSentimentoCategoria(indice: number): SentimentoCategoria {
  for (const [limiar, categoria] of LIMIARES_SENTIMENTO) {
    if (indice >= limiar) return categoria;
  }
  return 'muito_negativo';
}

export interface ResultadoAnaliseIa {
  motivoClassificado:    string | null;
  adesaoScript:           number | null;
  indiceSentimento:       number | null;
  sentimentoCategoria:    SentimentoCategoria | null;
  justificativa:          string | null;
  confiancaInsuficiente:  boolean;
  modeloUsado:            string | null;
}

// ── Motivos conhecidos (lista fechada) ────────────────────────────────────
// Cache em memória com TTL curto — não bater no Mongo a cada item do lote
// noturno (até ~700 chamadas na mesma execução).
let motivosCache: { valores: string[]; buscadoEm: number } | null = null;
const MOTIVOS_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getMotivosConhecidos(): Promise<string[]> {
  if (motivosCache && Date.now() - motivosCache.buscadoEm < MOTIVOS_CACHE_TTL_MS) {
    return motivosCache.valores;
  }
  const db = await getOpaSuiteDb();
  const docs = await db.collection('motivo_atendimentos').find({}, { projection: { motivo: 1 } }).toArray();
  const valores = [...new Set(docs.map((d) => d.motivo).filter((m): m is string => typeof m === 'string' && m.trim().length > 0))].sort();
  motivosCache = { valores, buscadoEm: Date.now() };
  return valores;
}

function montarSystemPrompt(motivosConhecidos: string[]): string {
  return `Você é uma camada analítica de IA que processa atendimentos em massa pro Centro de
Solução da Canaã Telecom. Isso é SINAL DE TRIAGEM, não é avaliação oficial de qualidade — nenhum
humano revisa isso no momento em que você processa, então nunca invente informação que não esteja
na conversa, e prefira valores neutros/moderados a extremos quando a conversa for ambígua.

Leia a conversa e responda 3 coisas:

1. "motivo": qual desses motivos melhor descreve o ASSUNTO do atendimento? Escolha EXATAMENTE um
da lista abaixo, ou "Outro" se nenhum encaixar:
${motivosConhecidos.map((m) => `- ${m}`).join('\n')}
- Outro

2. "adesaoScript": de 0 a 10, o quanto o ATENDENTE seguiu boas práticas de condução (saudação
adequada, confirmou que entendeu o problema, explicou o que estava fazendo, encerrou de forma
clara). 10 = seguiu tudo bem, 0 = não seguiu nada / muito fora do padrão. Se a conversa for curta
demais pra avaliar isso com confiança, responda um valor perto de 5 (neutro), não um extremo.
Transferir o atendimento pra outro setor NÃO é sinal de má condução quando bate com uma dessas
rotas legítimas (parte normal do fluxo de atendimento da Canaã):
${formatarRotasTransferenciaLegitimas()}
Essa lista não é exaustiva — uma transferência fora dela não deve ser presumida como erro, só
avaliada pelo contexto normal da conversa.

3. "indiceSentimento": de -1 a 1, como o CLIENTE pareceu se sentir na conversa (não o atendente).
-1 = muito insatisfeito/irritado, 0 = neutro, 1 = muito satisfeito.

4. "justificativa": 1 frase curta explicando o "adesaoScript" e "indiceSentimento" juntos. Não use
travessão.

Responda SOMENTE o JSON pedido, sem texto antes ou depois.`;
}

function formatarConversa(protocolo: string, mensagens: { data: Date | null; texto: string }[]): string {
  const linhas = mensagens.map((m) =>
    `[${m.data ? m.data.toISOString().slice(0, 16).replace('T', ' ') : '?'}] ${m.texto.replace(/\s+/g, ' ').trim()}`
  ).join('\n');
  return `Protocolo: ${protocolo}\n\n=== CONVERSA ===\n${linhas}`;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    motivo:            { type: Type.STRING },
    adesaoScript:       { type: Type.NUMBER },
    indiceSentimento:   { type: Type.NUMBER },
    justificativa:      { type: Type.STRING },
  },
  required: ['motivo', 'adesaoScript', 'indiceSentimento', 'justificativa'],
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/// Processa 1 atendimento e devolve o sinal analítico — NÃO grava nada
/// (quem chama decide o upsert, ver cron em jobs/alertas.job.ts).
/// Conversa curta demais (<2 mensagens) vira `confiancaInsuficiente: true`
/// sem gastar chamada de IA, mesmo critério já usado no copiloto de QA pra
/// não penalizar atendimento legitimamente curto (ex: "confirmado, obrigado").
export async function analisarAtendimento(
  atendimento: AtendimentoParaMonitoria,
): Promise<{ resultado: ResultadoAnaliseIa; metricas: MetricasGemini | null }> {
  const { protocolo, canal, mensagens } = atendimento;

  if (canal === 'pabx' || mensagens.length < 2) {
    return {
      resultado: {
        motivoClassificado: null, adesaoScript: null, indiceSentimento: null,
        sentimentoCategoria: null, justificativa: null, confiancaInsuficiente: true, modeloUsado: null,
      },
      metricas: null,
    };
  }

  const motivosConhecidos = await getMotivosConhecidos();
  const contents = [{
    role: 'user' as const,
    parts: [{ text: `${montarSystemPrompt(motivosConhecidos)}\n\n${formatarConversa(protocolo, mensagens)}` }],
  }];

  const { texto, metricas } = await chamarGemini(contents, {
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 400,
    thinkingConfig: { thinkingBudget: 0 },
  });

  const bruto = JSON.parse(texto) as { motivo: string; adesaoScript: number; indiceSentimento: number; justificativa: string };
  const motivo = motivosConhecidos.includes(bruto.motivo) ? bruto.motivo : 'Outro';
  const indiceSentimento = clamp(Number(bruto.indiceSentimento) || 0, -1, 1);

  return {
    resultado: {
      motivoClassificado:    motivo,
      adesaoScript:           clamp(Number(bruto.adesaoScript) || 0, 0, 10),
      indiceSentimento,
      sentimentoCategoria:    calcularSentimentoCategoria(indiceSentimento),
      justificativa:          bruto.justificativa?.trim() || null,
      confiancaInsuficiente:  false,
      modeloUsado:            metricas.modeloUsado,
    },
    metricas,
  };
}

/// Corte de "adesão baixa" pra entrar na fila de triagem — validado na fase
/// piloto (252 atendimentos reais, 2026-07-11). ATENÇÃO: o modelo responde
/// exatamente 5.0 quando a conversa é curta/ambígua demais pra avaliar com
/// confiança (~32% dos casos do piloto caem exatamente em 5.0) — por isso o
/// corte é "< 5" estrito, não "<= 5": incluir o 5.0 no corte inundaria a
/// fila com conversas neutras/ambíguas, não com atendimento ruim de verdade.
/// Resultado real do piloto com esse corte: 15/252 (~6%) foram pra
/// triagem, volume administrável pro QA revisar por dia.
const LIMIAR_TRIAGEM_ADESAO_SCRIPT = 5;

function calcularFlagTriagem(resultado: ResultadoAnaliseIa): boolean {
  if (resultado.confiancaInsuficiente) return false;
  const adesaoBaixa = resultado.adesaoScript !== null && resultado.adesaoScript < LIMIAR_TRIAGEM_ADESAO_SCRIPT;
  const sentimentoRuim = resultado.sentimentoCategoria === 'muito_negativo';
  return adesaoBaixa || sentimentoRuim;
}

const PAUSA_ENTRE_CHAMADAS_MS = 1200; // mesmo valor já validado em produção pela auditoria de retenção

export interface ResultadoLoteAnaliseIa {
  totalCandidatos: number;
  processados:     number;
  falhas:          number;
}

/// Núcleo do job noturno: busca candidatos do período, pula quem já foi
/// processado (idempotente por opasuite_atendimento_id), roda sequencial com
/// pausa entre chamadas (evita rajada no Gemini, mesmo padrão de
/// rodarAuditoriaRetencao), erro por item isolado não derruba o lote.
export async function rodarAnaliseIaEmMassa(
  dateFrom: Date,
  dateTo: Date,
  limite: number,
  onItem?: (protocolo: string, erro?: string) => void,
): Promise<ResultadoLoteAnaliseIa> {
  const candidatos = await buscarAtendimentosParaAnaliseIa(dateFrom, dateTo);
  if (!candidatos.length) return { totalCandidatos: 0, processados: 0, falhas: 0 };

  const idsCandidatos = candidatos.map((c) => c.opasuiteAtendimentoId!);
  const jaProcessados = await prisma.atendimentoAnaliseIa.findMany({
    where: { opasuite_atendimento_id: { in: idsCandidatos } },
    select: { opasuite_atendimento_id: true },
  });
  const jaProcessadosSet = new Set(jaProcessados.map((r) => r.opasuite_atendimento_id));
  const pendentes = candidatos.filter((c) => !jaProcessadosSet.has(c.opasuiteAtendimentoId!)).slice(0, limite);

  let processados = 0;
  let falhas = 0;

  for (const candidato of pendentes) {
    try {
      const mensagens = await buscarMensagensAtendimento(new ObjectId(candidato.opasuiteAtendimentoId!));
      const { resultado } = await analisarAtendimento({ ...candidato, mensagens });

      await prisma.atendimentoAnaliseIa.upsert({
        where:  { opasuite_atendimento_id: candidato.opasuiteAtendimentoId! },
        create: {
          opasuite_atendimento_id: candidato.opasuiteAtendimentoId!,
          protocolo:                candidato.protocolo,
          setor:                    candidato.setor,
          canal:                    candidato.canal,
          data_atendimento:         candidato.dataAtendimento,
          motivo_classificado:      resultado.motivoClassificado,
          adesao_script:            resultado.adesaoScript,
          indice_sentimento:        resultado.indiceSentimento,
          sentimento_categoria:     resultado.sentimentoCategoria,
          justificativa:            resultado.justificativa,
          confianca_insuficiente:   resultado.confiancaInsuficiente,
          flag_triagem:             calcularFlagTriagem(resultado),
          modelo_usado:             resultado.modeloUsado,
        },
        update: {
          motivo_classificado:    resultado.motivoClassificado,
          adesao_script:          resultado.adesaoScript,
          indice_sentimento:      resultado.indiceSentimento,
          sentimento_categoria:   resultado.sentimentoCategoria,
          justificativa:          resultado.justificativa,
          confianca_insuficiente: resultado.confiancaInsuficiente,
          flag_triagem:           calcularFlagTriagem(resultado),
          modelo_usado:           resultado.modeloUsado,
        },
      });
      processados++;
      onItem?.(candidato.protocolo);
    } catch (err: any) {
      falhas++;
      onItem?.(candidato.protocolo, err.message);
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CHAMADAS_MS));
  }

  return { totalCandidatos: candidatos.length, processados, falhas };
}
