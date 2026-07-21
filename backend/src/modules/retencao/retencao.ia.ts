import { chamarGemini } from '../diagnostico/diagnostico.ia';
import { ChamadoParaAuditar } from './retencao.repository';

export type ClassificacaoRetencao = 'NEGOCIACAO_REAL' | 'SEM_NEGOCIACAO' | 'INDEFINIDO';

export interface ResultadoClassificacao {
  classificacao:        ClassificacaoRetencao;
  justificativa:        string;
  negociacaoDetectada:  string | null;
  /// Diferença entre o que a nota da O.S. alega e o que a conversa real do
  /// OpaSuite mostra (null = bateu, ou não havia conversa do OpaSuite pra comparar).
  divergenciaNotaOs:    string | null;
  /// Falha de processo ANTES da retenção em si (ex: instalação sem
  /// viabilidade, transferência de setor sem aviso), achado real
  /// investigando um caso (2026-07-21) onde a IA classificou certo a
  /// retenção isolada, mas não via o processo bem mais grave que
  /// aconteceu antes dela. Não muda a CLASSIFICACAO (que mede só a
  /// negociação em si), é contexto adicional. null = nada relevante achado.
  processoAnterior:     string | null;
  modeloUsado:          string;
}

/// Regra de negócio (confirmada com o gestor): retenção só conta como
/// negociação real quando o operador ofereceu uma concessão concreta e o
/// cliente aceitou ficar POR CAUSA dela — não quando o cliente só desistiu
/// sozinho, transferiu titularidade, ou o cancelamento não avançou por
/// motivo administrativo. A classificação do IXC (id_su_diagnostico) não
/// distingue esses casos, só o texto livre das mensagens tem essa evidência.
const AUDITORIA_SYSTEM_PROMPT = `Você é um auditor de qualidade de atendimento da Canaã Telecom, avaliando casos de retenção de clientes.

Uma retenção só conta como NEGOCIACAO_REAL quando o operador ofereceu uma concessão concreta ao
cliente (desconto, isenção de taxa, mudança/ajuste de plano, fidelização com benefício, etc) E o
cliente aceitou ficar POR CAUSA dessa concessão, com isso registrado no texto.

NÃO conta como negociação real (classifique como SEM_NEGOCIACAO):
- Cliente decidiu ficar sem que nada tenha sido oferecido (ex: só mudou de ideia sozinho).
- Transferência de titularidade (o contrato muda de nome, não é uma retenção negociada).
- Cancelamento revertido só porque o processo administrativo não avançou.
- Qualquer resolução onde não há registro de uma oferta concreta.

Use INDEFINIDO só quando o texto for insuficiente pra decidir com confiança (ex: sem mensagens
registradas, mensagens genéricas demais pra saber o que realmente aconteceu, ou quando a única
evidência do OpaSuite é um roteiro de ligação sem transcrição E a nota da O.S. também não é
específica o suficiente sozinha).

IMPORTANTE sobre as fontes de evidência: a "nota da O.S." é escrita livremente pelo próprio
operador que atendeu — ele pode descrever a negociação de forma imprecisa ou, no limite,
inventada. A "CONVERSA REAL DO OPASUITE" é o histórico de verdade em TEXTO (WhatsApp) daquele
atendimento, que o operador não edita depois — quando ela estiver disponível como texto real da
conversa, baseie sua classificação NELA, não na nota da O.S. Se a nota da O.S. alegar algo que a
conversa real não sustenta (ex: nota diz "ofertei desconto e cliente aceitou" mas a conversa não
mostra isso), classifique com base na conversa real e registre a divergência explicitamente.

ATENÇÃO — atendimento por LIGAÇÃO (canal PABX) é diferente: o que fica registrado em texto nesse
caso é só o roteiro automático da URA até a chamada ser transferida pra um atendente humano
("ligação será transferida", "ligação encaminhada", "ligação finalizada") — a conversa real entre
cliente e atendente acontece por voz e NÃO vira texto em lugar nenhum (só existe como gravação de
áudio, sem transcrição disponível). Um bloco marcado abaixo como "LIGAÇÃO/PABX — sem transcrição"
NÃO é "conversa real disponível": trate como se não houvesse conversa real pra verificar a nota,
não como "a conversa não sustenta o que a nota alega". Nesse caso, baseie a classificação na nota
da O.S. e nos atendimentos relacionados, e NUNCA reporte DIVERGENCIA_NOTA_OS só porque o roteiro
da ligação não menciona a oferta — divergência só se aplica quando há TEXTO real (WhatsApp)
contradizendo a nota.

Sobre "OUTRAS O.S. DO CLIENTE NO PERÍODO": mostra a jornada do cliente ANTES de chegar na
retenção (ex: pedido de mudança de endereço sem viabilidade, transferências entre setores,
atendimentos anteriores mal resolvidos). NÃO use isso pra mudar a CLASSIFICACAO, que continua
medindo só se a retenção em si teve uma concessão real oferecida e aceita, mesmo quando o
processo anterior foi ruim. Mas se essa jornada mostrar falha de processo real e relevante
(ex: cliente não avisado de mudança de setor, prometido algo que não foi cumprido, atendimento
que se arrastou sem resolução), registre isso em PROCESSO_ANTERIOR, é informação separada da
negociação de retenção, útil pro gestor entender a causa raiz completa do cancelamento.

Não invente informação que não está no texto abaixo. Responda EXATAMENTE neste formato, sem nada antes ou depois:

CLASSIFICACAO: NEGOCIACAO_REAL | SEM_NEGOCIACAO | INDEFINIDO
JUSTIFICATIVA: <1-2 frases explicando a decisão, citando o que foi encontrado no texto>
NEGOCIACAO_DETECTADA: <o que foi oferecido e aceito, se houver, ou "nenhuma">
DIVERGENCIA_NOTA_OS: <o que a nota da O.S. alega que a conversa real do OpaSuite não sustenta, ou "nenhuma">
PROCESSO_ANTERIOR: <falha de processo relevante ANTES da retenção, encontrada nas outras O.S. do período, ou "nenhum">`;

function formatarEvidencia(chamado: ChamadoParaAuditar): string {
  const linhasOs = chamado.mensagensOs.length
    ? chamado.mensagensOs
        .map((m) => `- [${m.data ? m.data.toISOString().slice(0, 16).replace('T', ' ') : '?'}] ${m.mensagem.replace(/\s+/g, ' ').trim()}`)
        .join('\n')
    : '(nenhuma mensagem registrada nesta O.S.)';

  const linhasAtendimento = chamado.atendimentosRelacionados.length
    ? chamado.atendimentosRelacionados
        .map((a) => `- [${a.dataCriacao ? a.dataCriacao.toISOString().slice(0, 16).replace('T', ' ') : '?'}] ${a.titulo}: ${a.mensagem.replace(/\s+/g, ' ').trim()}`)
        .join('\n')
    : '(nenhum atendimento relacionado no período)';

  const linhasOutrasOs = chamado.outrasOsRelacionadas.length
    ? chamado.outrasOsRelacionadas
        .map((os) => `- [${os.dataAbertura ? os.dataAbertura.toISOString().slice(0, 16).replace('T', ' ') : '?'}] O.S. ${os.idChamado} (${os.assunto}): ${os.mensagem.replace(/\s+/g, ' ').trim()}${os.mensagemResposta ? ` | Resposta: ${os.mensagemResposta.replace(/\s+/g, ' ').trim()}` : ''}`)
        .join('\n')
    : '(nenhuma outra O.S. do cliente no período)';

  const blocoOpaSuite = chamado.conversasOpaSuite.length
    ? chamado.conversasOpaSuite.map((c) => {
        const ehLigacao = c.canal === 'pabx';
        const cabecalho = ehLigacao
          ? `--- protocolo ${c.protocolo} (LIGAÇÃO/PABX — sem transcrição; abaixo é só o roteiro automático da URA, não a conversa real) ---`
          : `--- protocolo ${c.protocolo} ---`;
        return cabecalho + '\n' + (c.mensagens.length
          ? c.mensagens.map((m) => `[${m.data ? m.data.toISOString().slice(0, 16).replace('T', ' ') : '?'}] ${m.texto.replace(/\s+/g, ' ').trim()}`).join('\n')
          : '(conversa encontrada mas sem mensagens de texto legíveis)');
      }).join('\n\n')
    : '(nenhum protocolo OpaSuite encontrado nas mensagens acima, ou conversa não localizada)';

  return [
    `Operador: ${chamado.nomeOperador}`,
    `Classificação do IXC (não confiável sozinha): ${chamado.resultadoIxc}`,
    '',
    '=== MENSAGENS DA O.S. (nota do operador — pode ser imprecisa) ===',
    linhasOs,
    '',
    '=== ATENDIMENTOS RELACIONADOS (mesmo cliente, +-3 dias) ===',
    linhasAtendimento,
    '',
    '=== OUTRAS O.S. DO CLIENTE NO PERÍODO (jornada até a retenção, +-3 dias) ===',
    linhasOutrasOs,
    '',
    '=== CONVERSA REAL DO OPASUITE (fonte de verdade, prioridade sobre a nota da O.S.) ===',
    blocoOpaSuite,
  ].join('\n');
}

function parseClassificacao(texto: string, modeloUsado: string): ResultadoClassificacao {
  const classMatch = /CLASSIFICACAO:\s*(NEGOCIACAO_REAL|SEM_NEGOCIACAO|INDEFINIDO)/i.exec(texto);
  const justMatch  = /JUSTIFICATIVA:\s*(.+?)(?=\n\s*NEGOCIACAO_DETECTADA:|$)/is.exec(texto);
  const negMatch   = /NEGOCIACAO_DETECTADA:\s*(.+?)(?=\n\s*DIVERGENCIA_NOTA_OS:|$)/is.exec(texto);
  const divMatch   = /DIVERGENCIA_NOTA_OS:\s*(.+?)(?=\n\s*PROCESSO_ANTERIOR:|$)/is.exec(texto);
  const procMatch  = /PROCESSO_ANTERIOR:\s*(.+)/is.exec(texto);

  const classificacao = (classMatch?.[1]?.toUpperCase() as ClassificacaoRetencao) ?? 'INDEFINIDO';
  const justificativa = justMatch?.[1]?.trim() || texto.trim().slice(0, 500);
  const negociacaoBruta = negMatch?.[1]?.trim() ?? '';
  const divergenciaBruta = divMatch?.[1]?.trim() ?? '';
  const processoBruto = procMatch?.[1]?.trim() ?? '';
  // Frouxo de propósito: o modelo varia entre "nenhuma", "nenhuma.", "nenhuma
  // divergência encontrada" etc — verifica só o prefixo, não a frase inteira.
  const ehNenhuma = (s: string) => !s || /^nenhum/i.test(s.trim());
  const negociacaoDetectada = ehNenhuma(negociacaoBruta) ? null : negociacaoBruta;
  const divergenciaNotaOs   = ehNenhuma(divergenciaBruta) ? null : divergenciaBruta;
  const processoAnterior    = ehNenhuma(processoBruto) ? null : processoBruto;

  return { classificacao, justificativa, negociacaoDetectada, divergenciaNotaOs, processoAnterior, modeloUsado };
}

export async function classificarNegociacao(chamado: ChamadoParaAuditar): Promise<ResultadoClassificacao> {
  const contents = [{
    role: 'user' as const,
    parts: [{ text: `${AUDITORIA_SYSTEM_PROMPT}\n\n${formatarEvidencia(chamado)}` }],
  }];
  const { texto, metricas } = await chamarGemini(contents, { maxOutputTokens: 300, thinkingConfig: { thinkingLevel: 'MINIMAL' } }, 'alto_volume');
  return parseClassificacao(texto, metricas.modeloUsado);
}
