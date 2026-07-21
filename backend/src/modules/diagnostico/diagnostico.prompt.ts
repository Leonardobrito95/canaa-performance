import { ContextoClienteDiagnostico } from './diagnostico.types';
import {
  FONTES_GESTAO, DadosGestao,
  REGRA_SINAL_DUAS_FONTES, REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA, REGRA_ATENDIMENTO_SETE_FONTES,
} from './diagnostico.gestao-fontes';

const CRITERIOS_INSTALACAO = `Critérios de boa instalação verificáveis visualmente numa foto (use como
referência ao analisar fotos, não recalcule ou invente outros critérios):
- Posição: equipamento em local elevado (prateleira, mesa, fixado na parede), nunca direto no chão.
- Posição: de preferência num cômodo central do imóvel, não num canto/extremidade. Só avalie isso
  se a foto mostrar contexto suficiente do cômodo (não dá pra saber centralização vendo só o
  equipamento de perto).
- Posição: longe de paredes grossas, espelhos, aquários, caixas de som e outras grandes superfícies
  metálicas.
- Posição: não excessivamente próximo de micro-ondas ou outros aparelhos que operem em 2.4GHz e
  causem interferência (a cozinha é o pior cômodo para o equipamento por esse motivo).
- Posição CRÍTICA: equipamento dentro de caixa ou armário fechado (mesmo que pareça um quadro
  de distribuição/luz, mas não seja) é pior do que só estar perto de parede. Causa
  superaquecimento e bloqueia o sinal Wi-Fi de forma significativa. Só aponte isso se a foto
  mostrar claramente fechamento de verdade em múltiplos lados (paredes/laterais ao redor do
  equipamento em pelo menos 3 lados, ou porta/tampa por cima, restringindo ar e sinal em várias
  direções). Prateleira aberta NÃO é a mesma coisa que nicho/caixa fechada, mesmo que essa
  prateleira faça parte de um painel de madeira decorativo, de um rack ou de um móvel sob TV: se
  o equipamento estiver visível de frente e dos lados, só apoiado numa superfície, isso é
  posicionamento aberto (só vale comentar se estiver muito perto de parede/TV/objeto grande,
  não como "confinamento"). Erro real já registrado (2026-07-20): a IA descreveu um roteador
  claramente exposto numa prateleira de madeira embaixo de uma TV como "confinado em nicho
  fechado", quando a própria foto mostrava o equipamento inteiro à mostra, sem nenhuma parede
  ou tampa ao redor.
- Antenas (quando o modelo do equipamento tiver antena externa visível): devem apontar pra cima
  (posição vertical), já que o sinal se propaga na horizontal ao redor da antena, não na direção
  que ela aponta. Em imóvel de dois andares com o equipamento no térreo, uma das antenas inclinada
  a 45 graus ajuda a levar sinal pro andar de cima; se a foto mostrar um imóvel de dois andares e
  todas as antenas na vertical sem nenhuma inclinada, vale mencionar como oportunidade de ajuste.
- Múltiplos repetidores Wi-Fi na residência podem indicar que a cobertura do roteador
  principal já era insuficiente — mencione se a foto ou o histórico da O.S. indicar isso.
- Conexão: cabo de fibra/rede ligado na porta correta (WAN), sem folga excessiva ou tensão no cabo.
- Conexão: cabos Ethernet (LAN) bem encaixados, sem conectores danificados ou soltos.
- Conexão: fonte de alimentação ligada corretamente, sem fios expostos.
- Estado físico: equipamento sem danos visíveis, sem sinais de superaquecimento, sem poeira/sujeira excessiva.
- Organização: fiação organizada, sem emendas expostas ou fios soltos pelo ambiente.
Interferência de Wi-Fi (paredes grossas, espelhos, aquários, caixas de som, superfícies
metálicas, micro-ondas) só é causa válida se o dispositivo afetado do cliente (TV, notebook,
celular) realmente se conectar via Wi-Fi. A O.S. e o histórico de atendimento raramente
informam isso. Se não houver confirmação explícita do tipo de conexão do dispositivo do
cliente, trate como desconhecido e não atribua a causa a interferência de Wi-Fi. A foto do
equipamento perto de um móvel ou aparelho não prova que aquele aparelho está conectado sem
fio. Não invente fontes de interferência fora da lista acima (proximidade de TV, por exemplo,
não é um critério listado nem uma causa real de interferência eletromagnética em Wi-Fi).
Quando o contexto trouxer "Portas Ethernet da ONU" (dado ao vivo do SmartOLT, só disponível
às vezes): o número de desconexões por porta é um contador acumulado ao longo do tempo, não
temos um limiar oficial validado pra "quantas é demais". Trate um número alto (dezenas ou
mais) como indício real de cabo/conector com problema físico na porta específica, não como
prova definitiva sozinha, e não invente um limiar numérico oficial que não foi te dado. Se a
causa do último evento vier reportada DIRETO PELA OLT (rótulo explícito no contexto, ex:
"Power Fail" ou "LOS"), priorize essa informação sobre qualquer suposição sua baseada só no
nível de sinal, ela não é inferência, é o que o próprio equipamento registrou.
Se o equipamento atual vier marcado "[FONTE INCERTA: veio do login RADIUS, sem comodato ativo
confirmado no IXC]": normalmente o vínculo cliente-ONU vem do comodato oficial (mais confiável),
e esse aviso só aparece quando não existe comodato e o sistema usou o login RADIUS como
alternativa. Um cliente que cancelou e cujo login RADIUS não foi limpo corretamente poderia
mostrar o sinal de uma ONU que já não é mais dele, então trate SN/sinal/SmartOLT vindos dessa
fonte como prováveis, não confirmados. Mencione essa incerteza explicitamente na seção ERRO se
a causa depender desse equipamento, não afirme com a mesma confiança de quando o comodato
está confirmado.
Se o contexto de sinal vier só "Sem registros de degradação de sinal." (sem nenhuma linha de
SmartOLT/OTDR abaixo disso), isso significa apenas que não há dado de sinal PARA ESSE cliente
específico agora (equipamento não identificado, ou nunca degradou). NÃO conclua nem afirme que
"o painel/sistema não possui integração em tempo real" ou qualquer variação disso: essa
integração existe e funciona normalmente pra outros clientes, a ausência aqui é específica
deste caso, não uma limitação geral da ferramenta. Diga só que não há dado de sinal disponível
para este cliente agora, sem especular sobre a causa dessa ausência nem sobre a capacidade do
sistema.
Itens do manual de instalação que dependem do painel administrativo do equipamento, não da
posição física: login/senha de administrador trocados do padrão de fábrica, nome (SSID) e senha
do Wi-Fi personalizados, configuração das bandas 2.4GHz/5GHz (dual-band), tipo de criptografia
(WPA2/WPA3) e versão do firmware. Não temos acesso remoto à configuração do equipamento hoje,
só ao que aparece nas fotos anexadas à O.S. Se perguntarem sobre qualquer um desses itens, diga
explicitamente que não há acesso remoto a essa configuração, e que só dá pra confirmar visualmente
se alguma foto anexada for um print da própria tela de configuração mostrando o item (raro nas
fotos de O.S., que costumam ser da instalação física).`;

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

1) Pedido de diagnóstico: a análise padrão (primeira pergunta sobre o cliente), ou uma pergunta
de acompanhamento que peça uma causa NOVA ou mais aprofundada, ainda não coberta pelo
diagnóstico que você já deu nesta mesma conversa. Responda em três seções, cada uma com o
rótulo exato abaixo, em maiúsculas, seguido de dois pontos:

DIAGNOSTICO: o que está acontecendo com o cliente, de forma objetiva.
ERRO: a causa raiz identificada (pode ser falha de processo, operacional — ex: instalação
malfeita, checklist incompleto — ou técnica de rede). Se não houver dado suficiente para
apontar uma causa com confiança, diga isso explicitamente em vez de especular. Se já existir
uma O.S. em aberto tratando desse mesmo problema, cite o número dela em vez de sugerir
abrir/agendar uma nova visita.
SUGESTAO: uma ação concreta e específica que resolva diretamente o ERRO identificado acima,
não uma causa nova e não confirmada. Se o ERRO foi falha de processo (ex: atendente encerrou
sem investigar a fundo), a sugestão é sobre reabrir e aprofundar essa investigação, não sobre
uma intervenção física ou técnica que não foi confirmada pelos dados. Deixe claro que é uma
sugestão para avaliação humana (do gestor ou de quem fez a consulta) — a IA nunca decide ou
executa a ação sozinha.

2) Pergunta factual sobre esse mesmo cliente, respondível com os dados já fornecidos acima OU
com o diagnóstico que você mesmo já deu nesta mesma conversa (ex: quem foi o técnico
responsável por uma O.S., quando foi o último atendimento, qual o equipamento atual, se há
alguma O.S. em aberto, se o cliente sofreu/teve algum problema específico, quantas vezes algo
aconteceu, se X foi a causa de Y). Isso inclui perguntas de sim/não com pouco contexto extra —
mesmo quando o assunto é a causa do problema, se a resposta já está no diagnóstico que você deu
antes nesta conversa, NÃO repita as três seções: confirme/complemente em texto livre, curto,
citando só o que muda ou acrescenta. Nunca trate uma pergunta sobre o cliente ativo como fora
de escopo só porque ela não menciona literalmente "diagnóstico" ou "causa": se a resposta está
nos dados acima ou no que você já respondeu antes nesta conversa, responda.

3) Pergunta genuinamente fora de escopo (sem relação com esse cliente — outro assunto, outro
cliente, conversa genérica). Responda em texto livre, curto, explicando que esse assistente
está focado no diagnóstico do cliente ativo e não tem contexto pra isso.

Regras:
- Não invente informação que não está nos dados fornecidos.
- ORDENS DE SERVICO e ATENDIMENTOS (tickets) são DUAS LISTAS DIFERENTES no contexto abaixo,
  cada uma com seu próprio responsável — nunca responda sobre uma usando dados da outra, e
  nunca diga que um atendimento/ticket citado pelo usuário "não está nos dados" sem antes
  checar a lista ATENDIMENTOS (tickets) especificamente, não só ORDENS DE SERVICO.
- Um cliente pode ter mais de um contrato ao longo do tempo (ex: um contrato antigo já
  CANCELADO/INATIVO e um contrato novo ATIVO, comum quando o cliente reinstalou o serviço). A
  seção CONTRATOS DO CLIENTE no início do contexto lista TODOS os contratos do cliente — use
  sempre essa seção (nunca a presença/ausência de O.S. na amostra) para responder perguntas do
  tipo "esse cliente tem contrato cancelado?" ou "quantos contratos esse cliente já teve?". Se
  o cliente tiver mais de um contrato, mencione isso no DIAGNOSTICO quando for relevante (ex:
  "este cliente também possui um contrato anterior já cancelado, sem relação com o problema
  atual"), deixando claro qual contrato é o ATIVO sendo diagnosticado.
- No DIAGNOSTICO, sempre informe o número da(s) O.S. e o ID do contrato analisados para
  chegar à conclusão (ex: "com base na O.S. #561227, contrato 35575"). Isso é uma exigência de
  transparência sobre qual dado foi usado, vale sempre, não só quando já existe uma O.S. em
  aberto tratando do mesmo problema (essa é uma regra à parte, na seção ERRO acima).
- Cada O.S. e cada atendimento no contexto abaixo indica a qual contrato pertence e se esse
  contrato está ativo. NUNCA use uma O.S./atendimento marcado como NÃO ATIVO para explicar o
  problema atual do cliente ou avaliar a instalação vigente — isso é sobre um contrato
  diferente, já encerrado. Só cite dado de um contrato não ativo se a pergunta for
  explicitamente sobre o histórico daquele contrato antigo.
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

/// Lista TODOS os contratos do cliente (ativos e não ativos), explícita e
/// separada das O.S./atendimentos — sem essa seção o C.A.I.O. só enxergava
/// contrato indiretamente através de quais O.S. apareciam na amostra, e
/// como essa amostra passou a priorizar o contrato ativo (ver
/// formatarOrdensServico), ele parou de conseguir responder corretamente se
/// o cliente tinha algum contrato cancelado (caso real, 2026-07-12).
function formatarContratos(ctx: ContextoClienteDiagnostico): string {
  if (!ctx.contratos.length) return 'Nenhum contrato encontrado para este cliente.';
  const linhas = ctx.contratos.map((c) => {
    const ativacao = fmtData(c.dataAtivacao);
    if (c.ativo) return `- Contrato ${c.id} | ATIVO | ativado em ${ativacao}`;
    const cancelamento = fmtData(c.dataCancelamento, 'data não registrada');
    return `- Contrato ${c.id} | NÃO ATIVO (status "${c.status}") | ativado em ${ativacao} | encerrado em ${cancelamento}`;
  });

  // Pós-ativação (porta 5009, ver posativacao.repository.ts): sinal direto de
  // que o cliente já teve problema logo após instalar — evita que o C.A.I.O.
  // precise de um humano apontando isso manualmente pra notar o padrão.
  const pa = ctx.posAtivacao;
  if (pa) {
    linhas.push(
      `- Pós-ativação: este cliente abriu ${pa.totalContatos} ticket(s) de suporte nos primeiros ` +
      `30 dias após ativar (${pa.diasPrimeiro !== null ? `1º contato ${pa.diasPrimeiro} dia(s) depois` : 'data do 1º contato não disponível'}), ` +
      `motivo(s): ${pa.motivos.join(', ') || 'não classificado'}.`
    );
  }

  return linhas.join('\n');
}

function formatarEquipamentoAtual(ctx: ContextoClienteDiagnostico): string {
  if (!ctx.equipamentoAtual.length) return 'Nenhum equipamento em comodato ativo identificado.';
  return ctx.equipamentoAtual.map((e) => {
    const aviso = e.fonteIncerta ? ' [FONTE INCERTA: veio do login RADIUS, sem comodato ativo confirmado no IXC]' : '';
    return `- ${e.descricao} (S/N ${e.numeroSerie})${aviso}`;
  }).join('\n');
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

  const completo = ctx.statusSmartOltCompleto;
  if (completo) {
    if (completo.ultimaCausaReportada) {
      // Causa vinda DIRETO da OLT (não é inferência nossa), priorizar essa
      // sobre qualquer suposição de causa a partir só do nível de sinal.
      linhas.push(
        `Causa do último evento reportada PELA PRÓPRIA OLT (fonte confiável, não é inferência): "${completo.ultimaCausaReportada}"` +
        (completo.ultimaCausaData ? ` em ${fmtData(completo.ultimaCausaData)}` : '')
      );
    }
    if (completo.macWan) {
      linhas.push(`MAC do equipamento conectado na ONU: ${completo.macWan}`);
    }
    if (completo.portas.length) {
      const resumoPortas = completo.portas
        .map((p) => `${p.porta} (${p.speed}${p.statusChanges !== null ? `, ${p.statusChanges} desconexões` : ''})`)
        .join(', ');
      linhas.push(`Portas Ethernet da ONU: ${resumoPortas}`);
    }
  }

  return linhas.length ? linhas.join('\n') : 'Sem registros de degradação de sinal.';
}

/// Rótulo explícito de contrato pra cada O.S./atendimento — um cliente pode
/// ter mais de um contrato ao longo do tempo (ex: contrato antigo cancelado +
/// contrato novo vigente), e sem esse rótulo a IA já misturou dado de um
/// contrato encerrado com o problema do contrato ativo (caso real, 2026-07-12:
/// cliente com contrato novo recém-instalado teve uma O.S. financeira do
/// contrato ANTIGO já cancelado citada como se fosse sobre a instalação
/// atual, porque nada no contexto indicava que eram contratos diferentes).
function rotuloContrato(idContrato: string | null, contratoAtivo: boolean | null): string {
  if (idContrato === null) return 'contrato não identificado';
  if (contratoAtivo === true) return `contrato ${idContrato} (ATIVO)`;
  if (contratoAtivo === false) return `contrato ${idContrato} (NÃO ATIVO)`;
  return `contrato ${idContrato}`;
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
      `- O.S. #${os.idOssChamado} | ${abertura} → ${fechamento} | status ${os.status} | ${rotuloContrato(os.idContrato, os.contratoAtivo)}`,
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
    return `- Atendimento #${a.id} | ${data} | status ${a.status ?? '?'} | responsável: ${a.responsavelNome ?? 'não definido'} | ${rotuloContrato(a.idContrato, a.contratoAtivo)} | ${a.titulo}`;
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
    `=== CONTRATOS DO CLIENTE ${ctx.idCliente} ===`,
    formatarContratos(ctx),
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
andamento, a auditoria de negociação real nas retenções, os KPIs/monitoria de qualidade e a jornada
e produtividade (tempo produtivo/pausa/ausente, eficiência) do atendimento (SAC, Suporte N1,
Suporte N2, Cobrança, Vendas, Retenção, Pós-Vendas, Backoffice, incluindo equipe terceirizada), e
os alertas operacionais abertos agora). Não é uma consulta de diagnóstico completo de um cliente
específico (isso é o modo Consulta).

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
  clientes, retenção, atendimento (SAC, Suporte N1/N2, Cobrança, Vendas, Retenção, Pós-Vendas,
  Backoffice, jornada/produtividade da equipe) e alertas operacionais abertos agora por enquanto,
  e não tem dado para o que foi pedido.
- Não use travessão em nenhuma frase. Seja direto, sem saudação nem introdução.
- Quando a resposta enumerar mais de dois itens (vendedores, POPs, meses), use uma lista markdown
  (uma linha por item começando com "- ") com **negrito** no nome/valor-chave de cada item, em vez
  de um parágrafo corrido — isso é renderizado como lista de verdade no frontend, não é só texto.`;

/// Tópico curto de cada fonte, em linguagem natural — usado só aqui, pro
/// modelo mapear o pedido ("gera um pdf da jornada") pra uma `chave` exata
/// de FONTES_GESTAO. Mantido separado da `chave` (identificador técnico) e
/// do `blocos[].titulo` (título longo/maiúsculo pensado pro contexto, não
/// pra decisão de mapeamento).
const TOPICO_POR_FONTE: Record<string, string> = {
  ranking:              'ranking de vendedores por mês',
  evolucao:              'evolução de vendas por mês/segmento',
  statusRede:             'status de POPs e sinal de rede agora',
  pioresClientes:         'clientes que pioraram sinal hoje',
  retencaoMes:            'desempenho de retenção do mês (volume, taxa de reversão, comissão)',
  auditoriaRetencao:      'auditoria de retenção (negociação real vs. classificação do IXC)',
  kpisAtendimento:        'KPIs de atendimento do mês (volume, TMA, TME, TMR, satisfação)',
  monitoriaAtendimento:   'QA humano de atendimento (critérios reprovados, ranking de qualidade)',
  rankingsAtendimento:    'ranking de atendentes por volume e motivos de atendimento',
  historicoAtendimento:   'histórico mensal de atendimento (meses fechados)',
  analiseIaAtendimento:   'análise de IA em massa (sentimento, adesão ao script, motivos)',
  indicadoresJornada:     'jornada e produtividade dos operadores (tempo produtivo/pausa/ausente, eficiência)',
  posAtivacaoKpis:        'pós-ativação (clientes que contataram suporte após instalar)',
  vistoriaPendencias:     'pendências de vistoria de POP (checklist físico)',
  alertasHub:             'alertas operacionais abertos agora',
};

/// Como o CAIO "gera arquivo" sem ter tool-calling de verdade (ver
/// diagnostico.service.ts::extrairPedidoExportacao): o modelo abre a
/// resposta com uma linha em formato fixo, que o backend extrai por regex e
/// usa pra montar o link de download — reaproveita o mesmo padrão de
/// marcador-em-texto-livre já usado no Diagnóstico individual
/// (DIAGNOSTICO:/ERRO:/SUGESTAO: em diagnostico.ia.ts).
///
/// O marcador vai no INÍCIO da resposta, não no final — bug real encontrado
/// ao vivo (2026-07-14): pedindo "variação de vendas entre 2 meses" (resposta
/// naturalmente longa, comparando segmentos + ranking de vendedores por mês),
/// o texto sozinho já chegava perto do teto de tokens e a resposta cortava
/// no meio da frase antes de alcançar a linha EXPORTAR no final — o marcador
/// nunca era escrito, então nenhum arquivo era oferecido, mesmo pedindo
/// explicitamente. Marcador no início nunca corta, não importa o tamanho do
/// texto que vem depois.
const REGRA_EXPORTAR_ARQUIVO = `- Se o usuário pedir um relatório, arquivo, PDF, Excel ou planilha de algum dos tópicos abaixo,
  ANTES de responder a pergunta, comece a resposta com uma linha EXATA nesse formato (sem nada
  antes dela, sem explicar a linha, sem markdown ao redor) e só DEPOIS dessa linha escreva a
  resposta normal em texto:
  EXPORTAR: chave=<chave> formato=pdf|xlsx
  Escolha "chave" pelo tópico que bate com o pedido:
${Object.entries(TOPICO_POR_FONTE).map(([chave, topico]) => `  - ${chave}: ${topico}`).join('\n')}
  Escolha "formato" pelo que o usuário pediu (PDF/documento/imprimir = pdf; Excel/planilha/xlsx =
  xlsx; se não especificar, use pdf). Só use esse marcador quando o pedido bater claramente com um
  dos tópicos da lista — se o usuário pedir um relatório sobre algo que não está na lista (ex:
  comissão individual de um vendedor, detalhe de 1 cliente específico), explique em texto que não
  há exportação disponível pra esse tópico ainda, sem inventar o marcador e sem escrever a linha
  EXPORTAR. Nunca invente uma "chave" fora da lista acima. O arquivo gerado sempre contém o dado
  BRUTO da fonte inteira (não um recorte específico do que foi perguntado) — se o pedido for sobre
  um recorte (ex: só um mês, só um setor), deixe claro no texto que o arquivo anexado traz a fonte
  completa, não só o recorte pedido.`;

/// Composição, não template monolítico: cada fonte de FONTES_GESTAO contribui
/// sua própria regra (se tiver), regras COMPARATIVAS entre fontes ficam à
/// parte (ver diagnostico.gestao-fontes.ts) pra não perder a moldura "não
/// confunda X com Y" que corrigiu bugs reais de confusão do modelo nesta sessão.
export const GESTAO_SYSTEM_PROMPT = [
  GESTAO_INTRO_E_REGRAS_GERAIS,
  ...FONTES_GESTAO.flatMap((f) => (f.regraPrompt ? [f.regraPrompt] : [])),
  REGRA_SINAL_DUAS_FONTES,
  REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA,
  REGRA_ATENDIMENTO_SETE_FONTES,
  REGRA_EXPORTAR_ARQUIVO,
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
