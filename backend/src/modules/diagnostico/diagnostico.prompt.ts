import { ContextoClienteDiagnostico, RankingVendedorEntry, EvolucaoMensalEntry, PopStatusEntry } from './diagnostico.types';

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
- O status de comissão vem de um snapshot mensal imutável (veja o mês de referência e a data
  do snapshot em cada contrato). Se o mês de referência for anterior ao mês atual, não
  descreva o bloqueio como algo "em aberto" ou "aguardando" — deixe claro que é o retrato
  congelado daquele mês e que pode não refletir pagamento feito depois, já que o snapshot
  não é recalculado.
- Não use travessão em nenhuma frase.
- Seja direto e técnico, sem saudação nem introdução.
- Cada seção deve ter no máximo 3 frases.`;

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

export const GESTAO_SYSTEM_PROMPT = `Você é um analista sênior do Canaã Performance, o hub interno da
Canaã Telecom. Aqui você responde perguntas de GESTÃO sobre o negócio como um todo (ranking de
vendedores, evolução de vendas por período/segmento, status de rede por POP agora) — não é sobre
um cliente específico.

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
  é a fração com o primeiro boleto pago — a comissão só é paga sobre o valor liberado.
- Cada mês tem seu próprio líder de vendedores — isso NÃO é uma competição contínua entre
  pessoas. Nunca diga que o líder de um mês "superou", "ultrapassou" ou "supera" o líder de OUTRO
  mês — os números de meses diferentes não são comparáveis dessa forma (ex: não diga "Fulano
  liderou maio superando Beltrano que liderou abril com R$X", isso mistura números de períodos
  diferentes e pode soar como uma comparação que nem sempre é verdadeira). Se for comparar
  desempenho de vendedores entre meses, compare o MESMO vendedor no tempo (ex: "Fulano caiu de
  R$X em abril para R$Y em maio") ou compare vendedores dentro do MESMO mês.
- O status de POP é AO VIVO (consultado no momento da pergunta, não é histórico) — cada POP
  agrupa várias OLTs. Se perguntarem por um POP específico, procure pelo nome mesmo que não bata
  exatamente (ex: "aguas claras" deve encontrar "AGUAS CLARAS").
- Se a pergunta pedir algo fora do que os dados cobrem (ex: um cliente específico, alertas
  históricos de sinal, um POP que não existe na lista), diga que esse assistente de gestão cobre
  vendedores, evolução de vendas e status de POP por enquanto, e não tem dado para o que foi
  pedido.
- Não use travessão em nenhuma frase. Seja direto, sem saudação nem introdução.`;

function formatarRankingVendedores(ranking: RankingVendedorEntry[]): string {
  if (!ranking.length) return 'Sem dados de vendedores nos snapshots disponíveis.';
  return ranking.map((r) =>
    `- ${r.mesReferencia} | ${r.nomeVendedor} | ${r.qtdContratos} contratos | ativos R$${r.valorAtivos.toFixed(2)} | liberado R$${r.valorLiberado.toFixed(2)}`
  ).join('\n');
}

function formatarEvolucaoVendas(evolucao: EvolucaoMensalEntry[]): string {
  if (!evolucao.length) return 'Sem dados de evolução de vendas nos snapshots disponíveis.';
  return evolucao.map((e) =>
    `- ${e.mesReferencia} | ${e.segmento} | ${e.qtdContratos} contratos | ativos R$${e.valorAtivos.toFixed(2)} | liberado R$${e.valorLiberado.toFixed(2)}`
  ).join('\n');
}

function formatarStatusPops(pops: PopStatusEntry[]): string {
  if (!pops.length) return 'Sem dados de POPs disponíveis agora.';
  return pops.map((p) =>
    `- ${p.pop} | ${p.totalOnus} ONUs | Normal: ${p.normal} | Atenção: ${p.atencao} | Crítico: ${p.critico} | Fora de operação: ${p.foraDeOperacao} | Sem leitura: ${p.semLeitura}` +
    (p.piorSinalRx !== null ? ` | Pior sinal: ${p.piorSinalRx.toFixed(2)}dBm` : '')
  ).join('\n');
}

export function montarContextoGestaoTextual(
  ranking: RankingVendedorEntry[],
  evolucao: EvolucaoMensalEntry[],
  pops: PopStatusEntry[] = [],
): string {
  return [
    `=== RANKING DE VENDEDORES POR MES (snapshots mensais) ===`,
    formatarRankingVendedores(ranking),
    '',
    `=== EVOLUCAO DE VENDAS POR MES E SEGMENTO ===`,
    formatarEvolucaoVendas(evolucao),
    '',
    `=== STATUS DE POPS AGORA (ao vivo) ===`,
    formatarStatusPops(pops),
  ].join('\n');
}
