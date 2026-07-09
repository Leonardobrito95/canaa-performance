import { ContextoClienteDiagnostico } from './diagnostico.types';

const CRITERIOS_INSTALACAO = `Critérios de boa instalação verificáveis visualmente numa foto (use como
referência ao analisar fotos, não recalcule ou invente outros critérios):
- Posição: equipamento em local elevado (prateleira, mesa), nunca direto no chão.
- Posição: longe de paredes grossas, espelhos, aquários, caixas de som e outros obstáculos.
- Posição: não excessivamente próximo de micro-ondas ou outros aparelhos que causem interferência.
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

Com base SOMENTE nos dados fornecidos, produza uma resposta em três seções, cada uma
com o rótulo exato abaixo, em maiúsculas, seguido de dois pontos:

DIAGNOSTICO: o que está acontecendo com o cliente, de forma objetiva.
ERRO: a causa raiz identificada (pode ser falha de processo, operacional — ex: instalação
malfeita, checklist incompleto — ou técnica de rede). Se não houver dado suficiente para
apontar uma causa com confiança, diga isso explicitamente em vez de especular.
SUGESTAO: uma ação concreta e específica. Deixe claro que é uma sugestão para avaliação
humana (do gestor ou de quem fez a consulta) — a IA nunca decide ou executa a ação sozinha.

Regras:
- Não invente informação que não está nos dados fornecidos.
- Se nenhuma foto for anexada a esta consulta, não comente sobre a instalação física —
  diga apenas que não há foto disponível para essa análise, se for relevante.
- Use as regras de negócio fornecidas (metas, faixas, categorias de sinal) como referência
  de interpretação — não recalcule limiares por conta própria.
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
      `  Descrição: ${os.mensagem.slice(0, 300)}`,
      historicoResumo,
      arquivosResumo,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function formatarComercial(ctx: ContextoClienteDiagnostico): string {
  const { vendas, comissoesBdr } = ctx.comercial;
  const linhas: string[] = [];
  if (vendas.length) {
    linhas.push('Contratos:');
    for (const v of vendas.slice(0, 5)) {
      linhas.push(`- ${v.idContrato} | ${v.plano} | R$${v.valorMensal.toFixed(2)} | comissão: ${v.statusComissao}${v.motivoBloqueio ? ` (${v.motivoBloqueio})` : ''}`);
    }
  }
  if (comissoesBdr.length) {
    linhas.push('Alterações contratuais (BDR):');
    for (const c of comissoesBdr.slice(0, 5)) {
      const data = fmtData(c.dataRegistro);
      linhas.push(`- ${data} | ${c.tipoNegociacao} | R$${c.valorComissao.toFixed(2)}`);
    }
  }
  return linhas.length ? linhas.join('\n') : 'Sem dados comerciais associados.';
}

export function montarContextoTextual(ctx: ContextoClienteDiagnostico): string {
  return [
    `=== REGRAS DE NEGOCIO (referencia) ===`,
    formatarRegrasNegocio(ctx.regrasNegocio),
    '',
    `=== HISTORICO DE SINAL (cliente ${ctx.idCliente}) ===`,
    formatarHistoricoSinal(ctx),
    '',
    `=== ORDENS DE SERVICO ===`,
    formatarOrdensServico(ctx),
    '',
    `=== SITUACAO COMERCIAL ===`,
    formatarComercial(ctx),
  ].join('\n');
}
