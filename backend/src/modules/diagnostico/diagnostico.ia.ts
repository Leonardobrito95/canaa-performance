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
}

function parseResposta(texto: string): DiagnosticoIaResultado {
  const extrair = (rotulo: string): string => {
    const regex = new RegExp(`${rotulo}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'i');
    const m = texto.match(regex);
    return m ? m[1].trim() : '';
  };
  return {
    diagnostico: extrair('DIAGNOSTICO'),
    erro: extrair('ERRO'),
    sugestao: extrair('SUGESTAO'),
    textoCompleto: texto.trim(),
  };
}

export async function gerarDiagnostico(
  contextoTextual: string,
  pergunta?: string,
  imagens: ImagemAnexo[] = [],
): Promise<DiagnosticoIaResultado> {
  const partes = [
    DIAGNOSTICO_SYSTEM_PROMPT,
    '',
    contextoTextual,
  ];
  if (pergunta) {
    partes.push('', `=== PERGUNTA DO USUARIO ===`, pergunta,
      'Responda a pergunta acima, mas mantenha as três seções (DIAGNOSTICO/ERRO/SUGESTAO).');
  }
  if (imagens.length) {
    partes.push('', `=== FOTOS DA INSTALACAO ===`, `${imagens.length} foto(s) anexada(s) abaixo, nessa ordem.`);
  } else {
    partes.push('', `=== FOTOS DA INSTALACAO ===`, 'Nenhuma foto anexada a esta consulta.');
  }

  const client = getClient();
  const resposta = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: partes.join('\n') },
        ...imagens.map((img) => ({
          inlineData: { mimeType: img.mimeType, data: img.buffer.toString('base64') },
        })),
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
}
