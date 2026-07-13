import { GoogleGenAI } from '@google/genai';
import logger from '../../config/logger';
import { DIAGNOSTICO_SYSTEM_PROMPT, GESTAO_SYSTEM_PROMPT } from './diagnostico.prompt';
import { ImagemAnexo } from './diagnostico.types';

// 'gemini-2.5-flash' foi descontinuado para geração (ainda aparece em
// models.list() mas generateContent retorna 404). Usa o alias "latest" em vez
// de fixar uma versão — a Google atualiza o que ele aponta, evitando esse
// mesmo tipo de quebra silenciosa de novo.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
// Modelo de fallback, usado só se o principal falhar em todas as tentativas —
// alias diferente (não apenas outra versão do mesmo), pra não compartilhar a
// mesma causa de falha (ex: descontinuação, outage específico daquele modelo).
const GEMINI_MODEL_FALLBACK = process.env.GEMINI_MODEL_FALLBACK || 'gemini-flash-lite-latest';

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export interface MetricasGemini {
  latenciaMs:    number;
  tokensEntrada: number;
  tokensSaida:   number;
  modeloUsado:   string;
}

// ── Observabilidade de custo/latência (desde o início do processo) ───────────
// Preço opcional via env — sem ele, o agregado mostra só tokens/latência, sem
// inventar um valor em R$/US$ sem taxa real configurada.
const agregado = {
  chamadas: 0,
  falhas: 0,
  usosFallback: 0,
  tokensEntradaTotal: 0,
  tokensSaidaTotal: 0,
  latenciaTotalMs: 0,
};

function calcularCustoEstimado(tokensEntrada: number, tokensSaida: number): number | null {
  const precoInput = process.env.GEMINI_PRECO_INPUT_POR_1M_USD;
  const precoOutput = process.env.GEMINI_PRECO_OUTPUT_POR_1M_USD;
  if (!precoInput || !precoOutput) return null;
  return (tokensEntrada / 1_000_000) * Number(precoInput) + (tokensSaida / 1_000_000) * Number(precoOutput);
}

export function obterMetricasAgregadasGemini() {
  const { chamadas, falhas, usosFallback, tokensEntradaTotal, tokensSaidaTotal, latenciaTotalMs } = agregado;
  return {
    chamadas,
    falhas,
    usosFallback,
    tokensEntradaTotal,
    tokensSaidaTotal,
    latenciaMediaMs: chamadas ? Math.round(latenciaTotalMs / chamadas) : 0,
    custoEstimadoUsd: calcularCustoEstimado(tokensEntradaTotal, tokensSaidaTotal),
    custoConfigurado: Boolean(process.env.GEMINI_PRECO_INPUT_POR_1M_USD && process.env.GEMINI_PRECO_OUTPUT_POR_1M_USD),
  };
}

/// Chama o Gemini com retry no modelo principal e fallback para um modelo
/// diferente se o principal falhar em todas as tentativas — cobre tanto
/// instabilidade transitória quanto uma descontinuação/outage do modelo
/// principal (já aconteceu uma vez nesta mesma base de código). Também
/// acumula latência/tokens no agregado em memória e devolve as métricas
/// dessa chamada específica, pra persistir por consulta.
export async function chamarGemini(contents: any[], config: Record<string, unknown>): Promise<{ texto: string; metricas: MetricasGemini }> {
  const client = getClient();
  const tentativas = [GEMINI_MODEL, GEMINI_MODEL, GEMINI_MODEL_FALLBACK];

  let ultimoErro: unknown;
  for (let i = 0; i < tentativas.length; i++) {
    const model = tentativas[i];
    const inicio = Date.now();
    try {
      const resposta = await client.models.generateContent({ model, contents, config });
      const latenciaMs = Date.now() - inicio;
      const texto = resposta.text ?? '';
      if (!texto) throw new Error('Resposta vazia do Gemini');

      const tokensEntrada = resposta.usageMetadata?.promptTokenCount ?? 0;
      const tokensSaida = resposta.usageMetadata?.candidatesTokenCount ?? 0;

      agregado.chamadas++;
      agregado.tokensEntradaTotal += tokensEntrada;
      agregado.tokensSaidaTotal += tokensSaida;
      agregado.latenciaTotalMs += latenciaMs;

      if (model !== GEMINI_MODEL) {
        agregado.usosFallback++;
        logger.warn('[GEMINI] Modelo principal falhou em todas as tentativas — resposta veio do fallback', {
          modeloFallback: model, modeloPrincipal: GEMINI_MODEL,
        });
      }

      return { texto, metricas: { latenciaMs, tokensEntrada, tokensSaida, modeloUsado: model } };
    } catch (err: any) {
      agregado.falhas++;
      ultimoErro = err;
      logger.warn('[GEMINI] Tentativa falhou', { model, numeroTentativa: i + 1, error: err.message });
      if (i < tentativas.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw ultimoErro;
}

export interface DiagnosticoIaResultado {
  diagnostico: string;
  erro: string;
  sugestao: string;
  textoCompleto: string;
  /// true quando a resposta veio nas três seções (pergunta era sobre o
  /// diagnóstico do cliente); false quando o modelo respondeu em texto livre
  /// (pergunta fora de escopo) — nesse caso diagnostico/erro/sugestao ficam
  /// vazios e quem consome deve mostrar textoCompleto como texto simples.
  estruturado: boolean;
  metricas: MetricasGemini;
}

function parseResposta(texto: string, metricas: MetricasGemini): DiagnosticoIaResultado {
  const extrair = (rotulo: string): string => {
    const regex = new RegExp(`${rotulo}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'i');
    const m = texto.match(regex);
    return m ? m[1].trim() : '';
  };
  const diagnostico = extrair('DIAGNOSTICO');
  const erro = extrair('ERRO');
  const sugestao = extrair('SUGESTAO');
  return {
    diagnostico,
    erro,
    sugestao,
    textoCompleto: texto.trim(),
    estruturado: Boolean(diagnostico || erro || sugestao),
    metricas,
  };
}

export async function gerarDiagnostico(
  contextoTextual: string,
  pergunta?: string,
  imagens: ImagemAnexo[] = [],
  historico?: { pergunta: string; resposta: string }[],
): Promise<DiagnosticoIaResultado> {
  const partes = [
    DIAGNOSTICO_SYSTEM_PROMPT,
    '',
    contextoTextual,
  ];
  if (historico?.length) {
    partes.push('', `=== CONVERSA ANTERIOR NESTE ATENDIMENTO ===`,
      'As perguntas abaixo já foram feitas e respondidas nesta mesma conversa sobre esse cliente. ' +
      'Use isso para entender perguntas de acompanhamento curtas ou que dependem do contexto anterior ' +
      '(ex: "e os atendimentos?" após uma pergunta sobre técnicos de O.S.).');
    for (const h of historico) {
      partes.push('', `Pergunta anterior: ${h.pergunta}`, `Resposta anterior: ${h.resposta}`);
    }
  }
  if (pergunta) {
    partes.push('', `=== PERGUNTA ATUAL DO USUARIO ===`, pergunta,
      'Responda a pergunta ATUAL acima (considerando a conversa anterior, se houver) seguindo as ' +
      'instruções de formato do system prompt.');
  }
  if (!imagens.length) {
    // Duas situações diferentes por trás de "sem imagens", que a IA precisa
    // tratar diferente: nunca existiu foto pra esse cliente (pode apontar como
    // erro de processo, ver system prompt), vs. existe foto mas ela já foi
    // enviada e analisada numa pergunta anterior desta mesma conversa (não
    // reenviada de novo por custo, ver gerarDiagnosticoIndividual) — nesse
    // segundo caso a IA NÃO pode fingir que está vendo a foto de novo.
    partes.push('', `=== FOTOS DA INSTALACAO ===`,
      historico?.length
        ? 'As fotos desta consulta NÃO foram reenviadas nesta pergunta de acompanhamento (elas já ' +
          'foram analisadas e descritas numa resposta anterior desta mesma conversa, ver CONVERSA ' +
          'ANTERIOR acima). Use o que você já descreveu sobre elas nas respostas anteriores. Se a ' +
          'pergunta atual pedir um detalhe visual específico que você não descreveu antes, diga que ' +
          'não pode confirmar sem reanalisar a foto, em vez de especular ou inventar.'
        : 'Nenhuma foto anexada a esta consulta.');
  }

  // Cada foto é intercalada com a legenda original do IXC (geralmente a
  // pergunta do checklist que ela deveria responder, ex: "Foto do local
  // instalado"). Isso permite a IA notar quando o que a foto mostra não
  // corresponde ao que era esperado, ou quando falta uma foto essencial
  // (ex: nenhuma foto realmente mostra onde/como o equipamento foi instalado).
  const partesImagens = imagens.length
    ? [
        { text: `=== FOTOS DA INSTALACAO (${imagens.length}) ===` },
        ...imagens.flatMap((img, i) => [
          { text: `Foto ${i + 1} — legenda original no IXC: "${img.descricao}"` },
          { inlineData: { mimeType: img.mimeType, data: img.buffer.toString('base64') } },
        ]),
      ]
    : [];

  const contents = [{
    role: 'user',
    parts: [
      { text: partes.join('\n') },
      ...partesImagens,
    ],
  }];
  const { texto, metricas } = await chamarGemini(contents, { maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } });
  return parseResposta(texto, metricas);
}

/// Igual a gerarDiagnostico, mas para perguntas de gestão (sem cliente
/// específico, sem fotos, sem formato de 3 seções) — ranking de vendedores,
/// evolução de vendas etc.
export async function gerarRespostaGestao(
  contextoTextual: string,
  pergunta: string,
  historico?: { pergunta: string; resposta: string }[],
): Promise<{ texto: string; metricas: MetricasGemini }> {
  const partes = [GESTAO_SYSTEM_PROMPT, '', contextoTextual];
  if (historico?.length) {
    partes.push('', `=== CONVERSA ANTERIOR NESTE ATENDIMENTO ===`,
      'As perguntas abaixo já foram feitas e respondidas nesta mesma conversa de gestão. ' +
      'Use isso para entender perguntas de acompanhamento curtas que dependem do contexto anterior.');
    for (const h of historico) {
      partes.push('', `Pergunta anterior: ${h.pergunta}`, `Resposta anterior: ${h.resposta}`);
    }
  }
  partes.push('', `=== PERGUNTA ATUAL DO USUARIO ===`, pergunta,
    'Responda a pergunta ATUAL acima (considerando a conversa anterior, se houver) seguindo as ' +
    'instruções do system prompt.');

  const contents = [{ role: 'user', parts: [{ text: partes.join('\n') }] }];
  const { texto, metricas } = await chamarGemini(contents, { maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } });
  return { texto: texto.trim(), metricas };
}
