import { GoogleGenAI } from '@google/genai';
import { DIAGNOSTICO_SYSTEM_PROMPT } from './diagnostico.prompt';

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

export async function gerarDiagnostico(contextoTextual: string, pergunta?: string): Promise<DiagnosticoIaResultado> {
  const partes = [
    DIAGNOSTICO_SYSTEM_PROMPT,
    '',
    contextoTextual,
  ];
  if (pergunta) {
    partes.push('', `=== PERGUNTA DO USUARIO ===`, pergunta,
      'Responda a pergunta acima, mas mantenha as três seções (DIAGNOSTICO/ERRO/SUGESTAO).');
  }

  const client = getClient();
  const resposta = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: partes.join('\n'),
    config: {
      maxOutputTokens: 600,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const texto = resposta.text ?? '';
  if (!texto) throw new Error('Resposta vazia do Gemini');
  return parseResposta(texto);
}
