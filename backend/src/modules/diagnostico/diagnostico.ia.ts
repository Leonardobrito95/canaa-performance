import { GoogleGenAI } from '@google/genai';
import { DIAGNOSTICO_SYSTEM_PROMPT } from './diagnostico.prompt';
import { ImagemAnexo } from './diagnostico.types';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
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
}

function parseResposta(texto: string): DiagnosticoIaResultado {
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
    partes.push('', `=== FOTOS DA INSTALACAO ===`, 'Nenhuma foto anexada a esta consulta.');
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

  const client = getClient();

  // Retry único: chamadas ao Gemini ocasionalmente falham por instabilidade de
  // rede/API — uma nova tentativa evita que o usuário fique sem diagnóstico
  // por uma falha transitória.
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const resposta = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: 'user',
          parts: [
            { text: partes.join('\n') },
            ...partesImagens,
          ],
        }],
        config: {
          maxOutputTokens: 700,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const texto = resposta.text ?? '';
      if (!texto) throw new Error('Resposta vazia do Gemini');
      return parseResposta(texto);
    } catch (err) {
      ultimoErro = err;
      if (tentativa < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw ultimoErro;
}
