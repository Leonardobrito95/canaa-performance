import { chamarGemini, MetricasGemini } from '../diagnostico/diagnostico.ia';
import { AtendimentoParaMonitoria, nomeSetorAtendimento } from './atendimento.types';

/// Análise pontual, sob demanda — mais parecida com o modo Consulta do
/// Diagnóstico (texto livre) do que com a régua fixa da monitoria contínua:
/// aqui é uma pergunta específica de um gestor sobre 1 atendimento, não uma
/// nota padronizada pra alimentar o painel.
const AUDITORIA_PONTUAL_SYSTEM_PROMPT = `Você é um analista sênior do Canaã Performance,
analisando um atendimento específico (SAC, Suporte, Cobrança, Vendas, Retenção, Pós-Vendas ou
Backoffice) registrado no OpaSuite, a pedido de um gestor. Responda a pergunta feita sobre esse
atendimento de forma direta e objetiva, citando
trechos relevantes da conversa quando útil. Se a conversa for só o roteiro automático de uma
ligação (URA), sem diálogo real com um atendente humano, deixe isso claro em vez de especular
sobre o que teria sido dito na ligação (o áudio não está disponível pra análise, só o roteiro).
Não invente informação que não está no texto fornecido. Não use travessão em nenhuma frase.`;

function formatarConversa(atendimento: AtendimentoParaMonitoria): string {
  const ehLigacao = atendimento.canal === 'pabx';
  const aviso = ehLigacao
    ? `\n(ATENÇÃO: atendimento por LIGAÇÃO/PABX — abaixo é só o roteiro automático da URA até a transferência pro atendente humano, a conversa real por voz não fica transcrita em texto.)\n`
    : '';
  const linhas = atendimento.mensagens.length
    ? atendimento.mensagens
        .map((m) => `[${m.data ? m.data.toISOString().slice(0, 16).replace('T', ' ') : '?'}] ${m.texto.replace(/\s+/g, ' ').trim()}`)
        .join('\n')
    : '(nenhuma mensagem de texto registrada)';

  return [
    `Protocolo: ${atendimento.protocolo}`,
    `Setor: ${nomeSetorAtendimento(atendimento.setor)}`,
    `Canal: ${atendimento.canal}`,
    `Data: ${atendimento.dataAtendimento.toISOString().slice(0, 16).replace('T', ' ')}`,
    aviso,
    '=== CONVERSA ===',
    linhas,
  ].join('\n');
}

export async function auditarAtendimentoPontual(
  atendimento: AtendimentoParaMonitoria,
  pergunta?: string,
): Promise<{ texto: string; metricas: MetricasGemini }> {
  const perguntaFinal = pergunta?.trim() || 'Faça uma análise geral da qualidade desse atendimento.';
  const contents = [{
    role: 'user' as const,
    parts: [{ text: `${AUDITORIA_PONTUAL_SYSTEM_PROMPT}\n\n${formatarConversa(atendimento)}\n\n=== PERGUNTA DO GESTOR ===\n${perguntaFinal}` }],
  }];
  const { texto, metricas } = await chamarGemini(contents, { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } });
  return { texto: texto.trim(), metricas };
}
