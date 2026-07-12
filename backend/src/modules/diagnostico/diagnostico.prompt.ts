import { ContextoClienteDiagnostico } from './diagnostico.types';
import {
  FONTES_GESTAO, DadosGestao,
  REGRA_SINAL_DUAS_FONTES, REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA, REGRA_ATENDIMENTO_SEIS_FONTES,
} from './diagnostico.gestao-fontes';

const CRITERIOS_INSTALACAO = `Critérios de boa instalação verificáveis visualmente numa foto (use como
referência ao analisar fotos, não recalcule ou invente outros critérios):
- Posição: equipamento em local elevado (prateleira, mesa), nunca direto no chão.
- Posição: longe de paredes grossas, espelhos, aquários, caixas de som e outros obstáculos.
- Posição: não excessivamente próximo de micro-ondas ou outros aparelhos que causem interferência.
- Posição CRÍTICA: equipamento dentro de caixa ou armário fechado (mesmo que pareça um quadro
  de distribuição/luz, mas não seja) é pior do que só estar perto de parede — causa
  superaquecimento e bloqueia o sinal Wi-Fi de forma significativa. Se a foto mostrar o
  equipamento dentro de qualquer caixa/nicho fechado, aponte isso explicitamente.
- Múltiplos repetidores Wi-Fi na residência podem indicar que a cobertura do roteador
  principal já era insuficiente — mencione se a foto ou o histórico da O.S. indicar isso.
- Conexão: cabo de fibra/rede ligado na porta correta (WAN), sem folga excessiva ou tensão no cabo.
- Conexão: cabos Ethernet (LAN) bem encaixados, sem conectores danificados ou soltos.
- Conexão: fonte de alimentação ligada corretamente, sem fios expostos.
- Estado físico: equipamento sem danos visíveis, sem sinais de superaquecimento, sem poeira/sujeira excessiva.
- Organização: fiação organizada, sem emendas expostas ou fios soltos pelo ambiente.
Itens do manual de instalação que NÃO dá pra verificar por foto (config de Wi-Fi, senha do
sistema, WPA2/WPA3) — não comente sobre eles a menos que a foto seja um print da tela de
configuração mostrando isso explicitamente.`;

export const DIAGNOSTICO_SYSTEM_PROMPT = `Você é um analista sênior do Canaã Performance, o hub interno da Canaã Telecom.
Você tem acesso a três fontes de dados sobre um cliente: histórico de sinal de rede (OTDR),
ordens de serviço e atendimentos (IXC), e situação comercial (vendas/comissão). Quando
fotos da instalação forem fornecidas, analise-as visualmente contra os critérios abaixo.

IMPORTANTE sobre as fotos: antes de concluir qualquer coisa, identifique o que CADA foto
realmente mostra (ex: etiqueta técnica do equipamento, tela de um medidor de sinal,
checklist preenchido, local onde o equipamento está instalado). Só é possível avaliar um
critério de instalação (posição, conexão, organização) se alguma foto realmente mostrar
esse aspecto. Se nenhuma foto mostrar, por exemplo, onde/como o equipamento está
posicionado, você NÃO PODE concluir que a instalação está inadequada — isso seria
especulação. Nesse caso, aponte como ERRO a ausência da foto necessária (falha de processo:
o técnico não documentou o local da instalação), não a instalação em si.

${CRITERIOS_INSTALACAO}

Existem três tipos possíveis de pergunta sobre o cliente ativo:

1) Pedido de diagnóstico: a análise padrão, ou uma pergunta de acompanhamento sobre a causa
do problema dele. Responda em três seções, cada uma com o rótulo exato abaixo, em maiúsculas,
seguido de dois pontos:

DIAGNOSTICO: o que está acontecendo com o cliente, de forma objetiva.
ERRO: a causa raiz identificada (pode ser falha de processo, operacional — ex: instalação
malfeita, checklist incompleto — ou técnica de rede). Se não houver dado suficiente para
apontar uma causa com confiança, diga isso explicitamente em vez de especular. Se já existir
uma O.S. em aberto tratando desse mesmo problema, cite o número dela em vez de sugerir
abrir/agendar uma nova visita.
SUGESTAO: uma ação concreta e específica. Deixe claro que é uma sugestão para avaliação
humana (do gestor ou de quem fez a consulta) — a IA nunca decide ou executa a ação sozinha.

2) Pergunta factual sobre esse mesmo cliente, respondível com os dados já fornecidos acima
(ex: quem foi o técnico responsável por uma O.S., quando foi o último atendimento, qual o
equipamento atual, se há alguma O.S. em aberto). Responda direto e em texto livre, curto, sem
forçar as três seções — só a informação pedida. Nunca trate uma pergunta sobre o cliente ativo
como fora de escopo só porque ela não menciona literalmente "diagnóstico" ou "causa": se a
resposta está nos dados acima, responda.

3) Pergunta genuinamente fora de escopo (sem relação com esse cliente — outro assunto, outro
cliente, conversa genérica). Responda em texto livre, curto, explicando que esse assistente
está focado no diagnóstico do cliente ativo e não tem contexto pra isso.

Regras:
- Não invente informação que não está nos dados fornecidos.
- ORDENS DE SERVICO e ATENDIMENTOS (tickets) são DUAS LISTAS DIFERENTES no contexto abaixo,
  cada uma com seu próprio responsável — nunca responda sobre uma usando dados da outra, e
  nunca diga que um atendimento/ticket citado pelo usuário "não está nos dados" sem antes
  checar a lista ATENDIMENTOS (tickets) especificamente, não só ORDENS DE SERVICO.
- Se nenhuma foto for anexada a esta consulta, não comente sobre a instalação física —
  diga apenas que não há foto disponível para essa análise, se for relevante.
- Use as regras de negócio fornecidas (metas, faixas, categorias de sinal) como referência
  de interpretação — não recalcule limiares por conta própria.
- Se o "Status SmartOLT da ONU" estiver presente no histórico de sinal, use-o para refinar a
  causa raiz: "Power fail" indica queda de energia NO LOCAL DO CLIENTE (não é problema de
  fibra/sinal da rede) — aponte isso como causa provável em vez de especular sobre degradação
  óptica. "LOS" indica perda de sinal óptico de verdade (rompimento/desconexão de fibra).
  "Offline" é inconclusivo entre os dois. Esse dado só existe para parte dos clientes (nem
  todo equipamento aparece nessa fonte) — se ele não vier no contexto, não mencione a ausência
  dele nem tente adivinhar o status.
- O status de comissão vem de um snapshot mensal imutável (veja o mês de referência e a data
  do snapshot em cada contrato). Se o mês de referência for anterior ao mês atual, não
  descreva o bloqueio como algo "em aberto" ou "aguardando" — deixe claro que é o retrato
  congelado daquele mês e que pode não refletir pagamento feito depois, já que o snapshot
  não é recalculado.
- Não use travessão em nenhuma frase.
- Seja direto e técnico, sem saudação nem introdução.
- Cada seção deve ter no máximo 3 frases.
- Se precisar enumerar mais de dois itens (ex: técnicos de várias O.S., vários atendimentos),
  use lista markdown ("- " por item) com **negrito** no dado-chave, em vez de um parágrafo corrido.`;

/// Formata uma data com segurança. Datas "zero" do MySQL (0000-00-00) chegam
/// como Date inválido (truthy, mas NaN internamente) — nunca usar só `data ?`.
function fmtData(data: unknown, fallback = '?'): string {
  if (!data) return fallback;
  const d = data instanceof Date ? data : new Date(data as string);
  return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

function formatarRegrasNegocio(regras: Record<string, string>): string {
  const linhas = Object.entries(regras).map(([chave, valor]) => `- ${chave}: ${valor}`);
  return linhas.length ? linhas.join('\n') : '(nenhuma regra cadastrada)';
}

function formatarEquipamentoAtual(ctx: ContextoClienteDiagnostico): string {
  if (!ctx.equipamentoAtual.length) return 'Nenhum equipamento em comodato ativo identificado.';
  return ctx.equipamentoAtual.map((e) => `- ${e.descricao} (S/N ${e.numeroSerie})`).join('\n');
}

function formatarHistoricoSinal(ctx: ContextoClienteDiagnostico): string {
  const linhas: string[] = [];

  if (ctx.historicoSinal.length) {
    for (const h of ctx.historicoSinal.slice(0, 10)) {
      const data = fmtData(h.snapshotData);
      linhas.push(`- ${data} | ${h.pop} / ${h.ponDescricao} | RX ${h.sinalRx}dBm TX ${h.sinalTx}dBm | ${h.nivelSinal} | ${h.diasDegradado} dias degradado | urgência ${h.scoreUrgencia}`);
    }
  }

  const osc = ctx.oscilacaoRede;
  if (osc) {
    linhas.push(`Sinal agora: RX ${osc.rxHoje ?? '?'}dBm | nível ${osc.nivelHoje} | status ${osc.statusHoje}`);
    if (osc.recorrente) {
      linhas.push(`Degradação recorrente (30 dias): ${osc.recorrente.diasDegradado} dia(s) degradado(s), pior RX ${osc.recorrente.piorRx}dBm, média ${osc.recorrente.mediaRx}dBm, entre ${osc.recorrente.primeiraData} e ${osc.recorrente.ultimaData}.`);
    }
    if (osc.piora) {
      linhas.push(`Maior queda registrada: de ${osc.piora.rxAnterior}dBm (${osc.piora.dataAnterior}) para ${osc.piora.rxNaQueda}dBm (${osc.piora.dataQueda}).`);
    }
    linhas.push(`Veredito do OTDR: ${osc.veredito} (gravidade: ${osc.gravidade})`);
  }

  const smartolt = ctx.statusSmartOlt;
  if (smartolt) {
    const dataStatus = fmtData(smartolt.ultimaMudancaStatus, fmtData(smartolt.snapshotData));
    linhas.push(
      `Status SmartOLT da ONU (${smartolt.sn}): ${smartolt.statusOnu}` +
      (smartolt.nivelSinal ? ` | nível ${smartolt.nivelSinal}` : '') +
      (smartolt.diasDegradado !== null ? ` | ${smartolt.diasDegradado} dias degradado` : '') +
      ` | desde ${dataStatus}`
    );
  }

  return linhas.length ? linhas.join('\n') : 'Sem registros de degradação de sinal.';
}

function formatarOrdensServico(ctx: ContextoClienteDiagnostico): string {
  if (!ctx.ordensServico.length) return 'Sem ordens de serviço registradas.';
  return ctx.ordensServico.slice(0, 5).map((os) => {
    const abertura = fmtData(os.dataAbertura);
    const fechamento = fmtData(os.dataFechamento, 'em aberto');
    const mensagens = ctx.osMensagens[os.idOssChamado] ?? [];
    const arquivos = ctx.osArquivos[os.idOssChamado] ?? [];
    const historicoResumo = mensagens.slice(0, 3).map((m) =>
      `    · ${fmtData(m.data)} [${m.status}] ${m.colaborador ?? 'sem colaborador'}: ${m.mensagem.slice(0, 200)}`
    ).join('\n');
    const arquivosResumo = arquivos.length
      ? `    Anexos: ${arquivos.map((a) => a.descricao || a.nomeArquivo).join(', ')}`
      : '    Sem anexos.';
    return [
      `- O.S. #${os.idOssChamado} | ${abertura} → ${fechamento} | status ${os.status}`,
      `  Técnico responsável: ${os.tecnicoNome ?? 'não definido'}`,
      `  Descrição: ${os.mensagem.slice(0, 300)}`,
      historicoResumo,
      arquivosResumo,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function formatarAtendimentos(ctx: ContextoClienteDiagnostico): string {
  if (!ctx.atendimentos.length) return 'Sem atendimentos (tickets) registrados.';
  return ctx.atendimentos.map((a) => {
    const data = fmtData(a.dataCriacao);
    return `- Atendimento #${a.id} | ${data} | status ${a.status ?? '?'} | responsável: ${a.responsavelNome ?? 'não definido'} | ${a.titulo}`;
  }).join('\n');
}

function formatarComercial(ctx: ContextoClienteDiagnostico): string {
  const { vendas, comissoesBdr, retencaoNegociacoes } = ctx.comercial;
  const linhas: string[] = [];
  if (vendas.length) {
    linhas.push(
      'Contratos (cada um com o snapshot mensal MAIS RECENTE disponível — o snapshot é ' +
      'imutável, gerado uma vez no dia 19 do mês seguinte ao de referência, e NUNCA é ' +
      'recalculado depois; se o mês de referência já passou, o status é um retrato ' +
      'congelado daquele mês e pode não refletir pagamento feito posteriormente):'
    );
    for (const v of vendas.slice(0, 5)) {
      const snapshot = fmtData(v.dataSnapshot);
      linhas.push(`- ${v.idContrato} | ${v.plano} | R$${v.valorMensal.toFixed(2)} | referência: ${v.mesReferencia} (snapshot de ${snapshot}) | comissão: ${v.statusComissao}${v.motivoBloqueio ? ` (${v.motivoBloqueio})` : ''}`);
    }
  }
  if (comissoesBdr.length) {
    linhas.push('Alterações contratuais (BDR):');
    for (const c of comissoesBdr.slice(0, 5)) {
      const data = fmtData(c.dataRegistro);
      linhas.push(`- ${data} | ${c.tipoNegociacao} | R$${c.valorComissao.toFixed(2)}`);
    }
  }
  if (retencaoNegociacoes.length) {
    linhas.push('Negociações de retenção (O.S. onde o cliente ameaçou cancelar e recebeu desconto):');
    for (const r of retencaoNegociacoes.slice(0, 5)) {
      const data = fmtData(r.dataRegistro);
      linhas.push(`- O.S. #${r.idChamado} | ${data} | valor original R$${r.valorOriginal.toFixed(2)} → negociado R$${r.valorNegociado.toFixed(2)}${r.descricao ? ` | ${r.descricao}` : ''}`);
    }
  }
  return linhas.length ? linhas.join('\n') : 'Sem dados comerciais associados.';
}

export function montarContextoTextual(ctx: ContextoClienteDiagnostico): string {
  return [
    `=== REGRAS DE NEGOCIO (referencia) ===`,
    formatarRegrasNegocio(ctx.regrasNegocio),
    '',
    `=== EQUIPAMENTO ATUAL EM COMODATO (cliente ${ctx.idCliente}) ===`,
    formatarEquipamentoAtual(ctx),
    '',
    `=== HISTORICO DE SINAL ===`,
    formatarHistoricoSinal(ctx),
    '',
    `=== ORDENS DE SERVICO ===`,
    formatarOrdensServico(ctx),
    '',
    `=== ATENDIMENTOS (tickets) ===`,
    formatarAtendimentos(ctx),
    '',
    `=== SITUACAO COMERCIAL ===`,
    formatarComercial(ctx),
  ].join('\n');
}

// ============================================================
// PAINEL DE GESTÃO — perguntas agregadas, sem cliente específico
// ============================================================

const GESTAO_INTRO_E_REGRAS_GERAIS = `Você é um analista sênior do Canaã Performance, o hub interno da
Canaã Telecom. Aqui você responde perguntas de GESTÃO sobre o negócio como um todo (ranking de
vendedores, evolução de vendas por período/segmento, status de rede por POP agora, o cliente com o
pior sinal da rede neste momento, clientes que pioraram hoje, o desempenho de retenção do mês em
andamento, a auditoria de negociação real nas retenções, e os KPIs/monitoria de qualidade do
atendimento — SAC, Suporte N1, Suporte N2, Cobrança, Vendas, Retenção, Pós-Vendas, Backoffice) —
não é uma consulta de diagnóstico completo de um cliente específico (isso é o modo Consulta).

Regras:
- Responda em texto livre, direto e objetivo, sem seções fixas — não force um formato de
  diagnóstico/erro/sugestão aqui, isso é só para consultas de cliente individual.
- Use apenas os dados fornecidos abaixo. Não invente vendedor, valor, período ou POP que não
  estejam nos dados.
- Os dados de vendas vêm de snapshots mensais imutáveis (gerados no dia 19 do mês seguinte ao de
  referência) — o mês mais recente disponível normalmente é o mês anterior ao atual, isso é
  esperado, não um erro ou atraso. SEMPRE que a pergunta pedir um mês que ainda não tem
  snapshot, explique isso na mesma resposta (não assuma que quem pergunta já sabe, mesmo que
  essa explicação já tenha aparecido antes na conversa) — não basta dizer "não há dados", diga
  também quando o snapshot desse mês fica disponível (dia 19 do mês seguinte).
- "Valor de ativos" é o total de contratos ativados no mês (liberado ou não); "valor liberado"
  é a fração com o primeiro boleto pago — a comissão só é paga sobre o valor liberado.`;

const GESTAO_REGRAS_FINAIS = `- Se a pergunta pedir algo fora do que os dados cobrem (ex: histórico de alertas de um cliente
  específico, um diagnóstico completo de um cliente, um POP que não existe na lista), diga que
  esse assistente de gestão cobre vendedores, evolução de vendas, status de POP e sinal de
  clientes, retenção e atendimento (SAC, Suporte N1/N2, Cobrança, Vendas, Retenção, Pós-Vendas,
  Backoffice) por enquanto, e não tem dado para o que foi pedido.
- Não use travessão em nenhuma frase. Seja direto, sem saudação nem introdução.
- Quando a resposta enumerar mais de dois itens (vendedores, POPs, meses), use uma lista markdown
  (uma linha por item começando com "- ") com **negrito** no nome/valor-chave de cada item, em vez
  de um parágrafo corrido — isso é renderizado como lista de verdade no frontend, não é só texto.`;

/// Composição, não template monolítico: cada fonte de FONTES_GESTAO contribui
/// sua própria regra (se tiver), regras COMPARATIVAS entre fontes ficam à
/// parte (ver diagnostico.gestao-fontes.ts) pra não perder a moldura "não
/// confunda X com Y" que corrigiu bugs reais de confusão do modelo nesta sessão.
export const GESTAO_SYSTEM_PROMPT = [
  GESTAO_INTRO_E_REGRAS_GERAIS,
  ...FONTES_GESTAO.flatMap((f) => (f.regraPrompt ? [f.regraPrompt] : [])),
  REGRA_SINAL_DUAS_FONTES,
  REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA,
  REGRA_ATENDIMENTO_SEIS_FONTES,
  GESTAO_REGRAS_FINAIS,
].join('\n\n');

/// Itera FONTES_GESTAO (diagnostico.gestao-fontes.ts) em vez de 11 parâmetros
/// posicionais — adicionar uma fonte nova não muda essa assinatura.
export function montarContextoGestaoTextual(dados: Partial<DadosGestao> = {}): string {
  return FONTES_GESTAO.flatMap((fonte) => {
    const valor = (dados as any)[fonte.chave] ?? fonte.valorVazio;
    return fonte.blocos.flatMap((b) => [`=== ${b.titulo} ===`, b.formatar(valor), '']);
  }).join('\n').trimEnd();
}
