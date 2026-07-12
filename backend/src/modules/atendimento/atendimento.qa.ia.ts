import { chamarGemini, MetricasGemini } from '../diagnostico/diagnostico.ia';
import { AtendimentoParaMonitoria, formatarRotasTransferenciaLegitimas } from './atendimento.types';
import { CRITERIOS_QA, CriterioQa, RespostaCriterio, SugestaoMonitoriaQa, SugestaoCriterioQa } from './atendimento.qa.types';

/// Definição de cada critério pro C.A.I.O. entender o que avaliar — mesmo
/// espírito das definições internas do QA humano, resumidas pra caber num
/// prompt (não é a rubrica oficial completa, é o suficiente pra uma
/// sugestão inicial que o humano depois confirma/corrige).
const DEFINICAO_CRITERIO: Record<CriterioQa, string> = {
  'Script':                    'Seguiu o script de abertura/fechamento do atendimento?',
  'Sondagem':                  'Fez perguntas pra entender bem o problema do cliente antes de agir?',
  'Conhecimento técnico':      'Demonstrou saber do que estava falando, sem informação incorreta?',
  'Vícios de linguagem':       'Evitou gírias, muletas de fala ("né", "tipo assim" em excesso), informalidade excessiva?',
  'Tom de voz':                'Manteve tom adequado, sem indiferença ou irritação perceptível na escrita/fala?',
  'Cordialidade':              'Foi educado, empático e paciente com o cliente do início ao fim?',
  'Controle de Objeção':       'Soube contornar resistência/reclamação do cliente sem se alterar?',
  'Comunicação e Linguagem':   'Comunicação clara, direta, fácil de entender, sem ambiguidade?',
  'Retorno ao cliente':        'Deu retorno claro sobre o que foi feito/vai ser feito?',
  'Ação de retenção':          'Se era caso de cancelamento, tentou reverter oferecendo algo concreto?',
  'Confirmação de dados':      'Confirmou identidade/dados do cliente antes de agir na conta dele?',
  'Transferencia Indevida':    'Transferiu o atendimento sem necessidade real, ou pro departamento errado? (ver lista de rotas legítimas de transferência no prompt — uma transferência que bate com essa lista NÃO é indevida)',
  'Uso do Mute':               'Usou mudo de forma abusiva/excessiva, deixando o cliente sem satisfação?',
  'Erro de procedimento':      'Seguiu o procedimento correto pra esse tipo de caso (sem pular etapa)?',
  'Negociação e venda':        'Se era oportunidade de negociação/venda, conduziu bem (sem forçar nem deixar passar)?',
  'Agilidade':                 'Resolveu em tempo razoável, sem enrolação nem demora desnecessária?',
  'Prontidão':                 'Respondeu prontamente, sem deixar o cliente esperando sem explicação?',
  'Tabulação':                 'Classificou/registrou o atendimento corretamente ao final?',
  'Resolução do conflito':     'Se houve reclamação/conflito, foi resolvido de forma satisfatória?',
  'Personalização':            'Tratou o cliente pelo nome, de forma não robotizada/genérica?',
  'Omissão de atendimento':    'Deixou de atender algo que o cliente pediu, ignorou parte do pedido? (CRÍTICO — se Não Conforme, zera a nota toda sozinho)',
  'Inf. Protocolo?':           'Informou o número de protocolo ao cliente?',
};

const COPILOTO_QA_SYSTEM_PROMPT = `Você é o C.A.I.O., copiloto de QA do Centro de Solução da Canaã Telecom.
Sua função é SUGERIR o preenchimento de uma monitoria de qualidade pra um revisor humano confirmar
— você NUNCA decide sozinho, e o humano pode discordar de qualquer sugestão sua. Isso é uma ajuda
pra acelerar o trabalho do QA, não uma substituição do julgamento dele.

Rotas de transferência LEGÍTIMAS entre setores (parte normal do fluxo de atendimento da Canaã,
NÃO conte como "Transferencia Indevida" quando o motivo do atendimento bater com uma dessas
rotas):
${formatarRotasTransferenciaLegitimas()}
Essa lista não é exaustiva — se a conversa mostrar uma transferência fora dela, avalie pelo
contexto normal (não presuma indevida só por não estar mapeada aqui).

Leia a conversa abaixo e avalie os 22 critérios listados. Pra cada um, responda EXATAMENTE
"Conforme", "Não Conforme" ou "Não se aplica" (ex: "Ação de retenção" é "Não se aplica" se o
atendimento não tinha nada a ver com cancelamento). Se a conversa não tiver informação suficiente
pra avaliar um critério com confiança, prefira "Não se aplica" a chutar.

Não invente nada que não esteja no texto da conversa. Seja direto na justificativa (1 frase por
critério). Não use travessão em nenhuma frase.

Responda EXATAMENTE neste formato, uma linha por critério, sem nada antes ou depois:

CRITERIO: <nome exato do critério> | RESPOSTA: <Conforme|Não Conforme|Não se aplica> | JUSTIFICATIVA: <1 frase>
(repita pra cada um dos 22 critérios, na ordem em que foram listados)
OBSERVACOES: <rascunho de 2-3 frases resumindo o atendimento, pro QA revisar e ajustar>`;

function formatarConversaParaCopiloto(protocolo: string, canal: string, mensagens: { data: Date | null; texto: string }[]): string {
  const ehLigacao = canal === 'pabx';
  const aviso = ehLigacao
    ? '\n(ATENÇÃO: atendimento por LIGAÇÃO/PABX — só o roteiro automático da URA está disponível em texto, a conversa real por voz não é transcrita. Avalie só o que der pra avaliar com esse roteiro, marque o resto como "Não se aplica".)\n'
    : '';
  const linhas = mensagens.length
    ? mensagens.map((m) => `[${m.data ? m.data.toISOString().slice(0, 16).replace('T', ' ') : '?'}] ${m.texto.replace(/\s+/g, ' ').trim()}`).join('\n')
    : '(nenhuma mensagem de texto registrada)';

  const listaCriterios = CRITERIOS_QA.map((c) => `- ${c}: ${DEFINICAO_CRITERIO[c]}`).join('\n');

  return [
    `Protocolo: ${protocolo}`,
    `Canal: ${canal}`,
    aviso,
    '=== CRITÉRIOS A AVALIAR ===',
    listaCriterios,
    '',
    '=== CONVERSA ===',
    linhas,
  ].join('\n');
}

function parseSugestao(texto: string): SugestaoMonitoriaQa {
  const criterios: SugestaoCriterioQa[] = [];
  const linhas = texto.split('\n');

  for (const linha of linhas) {
    const m = linha.match(/^CRITERIO:\s*(.+?)\s*\|\s*RESPOSTA:\s*(.+?)\s*\|\s*JUSTIFICATIVA:\s*(.+)$/);
    if (!m) continue;
    const [, nomeBruto, respostaBruta, justificativa] = m;
    const criterio = CRITERIOS_QA.find((c) => c.toLowerCase() === nomeBruto.trim().toLowerCase());
    if (!criterio) continue;
    const respostaNormalizada = respostaBruta.trim();
    const resposta: RespostaCriterio =
      respostaNormalizada === 'Não Conforme' ? 'Não Conforme'
      : respostaNormalizada === 'Conforme' ? 'Conforme'
      : 'Não se aplica';
    criterios.push({ criterio, sugestao: resposta, justificativa: justificativa.trim() });
  }

  const obsMatch = texto.match(/OBSERVACOES:\s*([\s\S]*)$/);
  const observacoes = obsMatch ? obsMatch[1].trim() : '';

  return { criterios, observacoes };
}

/// Copiloto do CAIO pra monitoria de QA: sugere preenchimento dos 22
/// critérios a partir da conversa real do OpaSuite. NÃO grava nada — só
/// devolve a sugestão pro formulário pré-preencher, o humano revisa/edita
/// tudo antes de salvar (ver criarMonitoriaQa em atendimento.qa.service.ts,
/// que só é chamado quando o QA confirma/envia o formulário).
export async function sugerirPreenchimentoQa(
  atendimento: AtendimentoParaMonitoria,
): Promise<{ sugestao: SugestaoMonitoriaQa; metricas: MetricasGemini | null }> {
  const { protocolo, canal, mensagens } = atendimento;

  if (canal === 'pabx' || mensagens.length < 2) {
    return {
      sugestao: {
        criterios: [],
        observacoes: '',
        aviso: canal === 'pabx'
          ? 'Atendimento por ligação (PABX) — a conversa real não é transcrita, só o roteiro automático da URA. O CAIO não tem base suficiente pra sugerir os critérios, preencha manualmente.'
          : 'Conversa com poucas mensagens de texto — o CAIO não tem base suficiente pra sugerir com confiança, preencha manualmente.',
      },
      metricas: null,
    };
  }

  const contents = [{
    role: 'user' as const,
    parts: [{ text: `${COPILOTO_QA_SYSTEM_PROMPT}\n\n${formatarConversaParaCopiloto(protocolo, canal, mensagens)}` }],
  }];
  const { texto, metricas } = await chamarGemini(contents, { maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } });

  return { sugestao: parseSugestao(texto), metricas };
}
