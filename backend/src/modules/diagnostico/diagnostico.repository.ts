import axios from 'axios';
import mysqlPool from '../../config/mysql';
import prisma from '../../config/prisma';
import logger from '../../config/logger';
import { buscarArquivoBinario, registrarFalhaFotosEsperadas } from '../../config/ixcSession';
import {
  HistoricoSinalEntry,
  ContratoResumo,
  OsEntry,
  OsMensagemEntry,
  OsArquivoEntry,
  AtendimentoEntry,
  ContextoComercial,
  ImagemAnexo,
  OscilacaoRede,
  StatusSmartOlt,
  RankingVendedorEntry,
  EvolucaoMensalEntry,
  PopStatusEntry,
  StatusRedeAgora,
} from './diagnostico.types';

const OTDR_BASE = process.env.OTDR_API_URL ?? 'http://127.0.0.1:5008';

export interface ClienteCandidato {
  id:       number;
  nome:     string;
  cpfCnpj:  string;
  endereco: string;
  /// IDs dos contratos ATIVOS (status='A') desse cliente. Um cliente pode ter
  /// mais de um contrato ativo ao mesmo tempo (ex: endereços diferentes) —
  /// quando houver mais de um, o frontend mostra "ID CONTRATO - NOME" pra cada
  /// um, em vez de escolher um sozinho. Vazio/1 item = sem ambiguidade.
  contratosAtivos: number[];
}

/// Busca cliente por nome (parcial) ou CPF/CNPJ (dígitos), para o chat de
/// Diagnóstico resolver "qual cliente" antes de rodar a análise. Limitado a
/// poucos resultados — quando ambíguo, quem decide é o usuário, não a IA.
export async function buscarClientePorNome(termo: string): Promise<ClienteCandidato[]> {
  const limpo = termo.trim();
  const apenasDigitos = limpo.replace(/\D/g, '');

  const porDocumento = apenasDigitos.length >= 11;
  const [rows] = await mysqlPool.query<any[]>(
    porDocumento
      ? `SELECT id, razao, cnpj_cpf, endereco FROM cliente WHERE cnpj_cpf = ? LIMIT 10`
      : `SELECT id, razao, cnpj_cpf, endereco FROM cliente WHERE razao LIKE ? LIMIT 10`,
    [porDocumento ? apenasDigitos : `%${limpo}%`],
  );
  if (!rows.length) return [];

  const idsClientes = rows.map((r) => r.id);
  const [contratoRows] = await mysqlPool.query<any[]>(
    `SELECT id_cliente, id FROM cliente_contrato WHERE status = 'A' AND id_cliente IN (${idsClientes.map(() => '?').join(',')})`,
    idsClientes,
  );
  const contratosPorCliente = new Map<number, number[]>();
  for (const c of contratoRows) {
    const lista = contratosPorCliente.get(c.id_cliente) ?? [];
    lista.push(c.id);
    contratosPorCliente.set(c.id_cliente, lista);
  }

  return rows.map((r) => ({
    id:              r.id,
    nome:            r.razao,
    cpfCnpj:         r.cnpj_cpf,
    endereco:        r.endereco || '',
    contratosAtivos: contratosPorCliente.get(r.id) ?? [],
  }));
}

/// MySQL/MariaDB permite datas "zero" (0000-00-00), que o driver mysql2 entrega
/// como um objeto Date inválido (não null). Isso passa despercebido em checagens
/// truthy e quebra tanto formatação (.toISOString) quanto a serialização JSON do
/// Prisma. Sanitiza na borda, na leitura, para nunca vazar um Date inválido daqui.
function dataValidaOuNula(valor: unknown): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor as string);
  return isNaN(d.getTime()) ? null : d;
}

// ── Rede (Postgres, schema otdr — mesma sistema_db do Prisma, leitura via $queryRaw) ──

export async function buscarHistoricoSinal(idCliente: number, limite = 30): Promise<HistoricoSinalEntry[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT snapshot_data, pop, pon_descricao, sinal_rx, sinal_tx, nivel_sinal, dias_degradado, score_urgencia
    FROM otdr.historico_sinal
    WHERE cliente_id = ${idCliente}
    ORDER BY snapshot_data DESC
    LIMIT ${limite}
  `;
  return rows.map((r) => ({
    snapshotData:  r.snapshot_data,
    pop:           r.pop,
    ponDescricao:  r.pon_descricao,
    sinalRx:       Number(r.sinal_rx),
    sinalTx:       Number(r.sinal_tx),
    nivelSinal:    r.nivel_sinal,
    diasDegradado: r.dias_degradado,
    scoreUrgencia: r.score_urgencia,
  }));
}

/// Traz todos os contratos do cliente (ativos e não ativos) — usado pra: (1)
/// montar a lista de ids que alimenta ContextoComercial, (2) identificar
/// qual(is) contrato(s) estão ATIVOS agora (status='A', mesmo código usado em
/// vendas.repository.ts/retencao.repository.ts) pra não misturar O.S./
/// atendimentos de um contrato já cancelado com os do contrato vigente (ver
/// buscarOrdensServico/buscarAtendimentos abaixo), e (3) alimentar a seção
/// própria "CONTRATOS" do contexto — sem essa lista explícita, o C.A.I.O. só
/// enxergava contrato indiretamente via O.S./atendimento, e como esses agora
/// priorizam o contrato ativo, ele parou de conseguir responder se o cliente
/// tinha algum contrato cancelado (bug reportado 2026-07-12, corrigido aqui).
export async function buscarContratosCliente(idCliente: number): Promise<ContratoResumo[]> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT id, status, data_ativacao, data_cancelamento FROM cliente_contrato WHERE id_cliente = ? ORDER BY data_ativacao DESC`,
    [idCliente],
  );
  return rows.map((r) => {
    const ativo = String(r.status) === 'A';
    return {
      id:               String(r.id),
      status:           String(r.status),
      ativo,
      dataAtivacao:     dataValidaOuNula(r.data_ativacao),
      dataCancelamento: ativo ? null : dataValidaOuNula(r.data_cancelamento),
    };
  });
}

/// Ordena por relevância de contrato primeiro (ativo ou não vinculado a
/// nenhum contrato específico), depois por data mais recente dentro de cada
/// grupo — garante que o corte por `limite` não fique dominado por O.S./
/// atendimentos de um contrato JÁ CANCELADO só porque calharam de ter uma
/// data mais recente que os do contrato vigente (ex: O.S. financeira de
/// encerramento de um contrato antigo, aberta dias depois da instalação do
/// contrato novo).
function ordenarPorRelevanciaEData<T>(
  itens: T[],
  contratoAtivo: (item: T) => boolean | null,
  data: (item: T) => Date | null,
): T[] {
  return [...itens].sort((a, b) => {
    const pesoA = contratoAtivo(a) === false ? 1 : 0;
    const pesoB = contratoAtivo(b) === false ? 1 : 0;
    if (pesoA !== pesoB) return pesoA - pesoB;
    return (data(b)?.getTime() ?? 0) - (data(a)?.getTime() ?? 0);
  });
}

/// Resolve todo equipamento atualmente em comodato ativo com o cliente (ONU,
/// roteador etc). Equipamentos são trocados ao longo do tempo (upgrade,
/// defeito etc.) — usar o histórico de comodato (status_comodato = 'E',
/// "Emprestado") é a forma confiável de achar o que está em uso agora, em vez
/// de confiar em campos que podem ficar desatualizados (ex: radusuarios.onu_mac)
/// ou em fotos antigas que podem mostrar um equipamento já devolvido.
export async function buscarEquipamentoAtual(idCliente: number): Promise<{ descricao: string; numeroSerie: string }[]> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT mp.descricao, mp.numero_serie
     FROM movimento_comodatos mc
     JOIN movimento_produtos mp ON mp.id = mc.id_movimento_produtos
     WHERE mc.id_cliente = ? AND mp.status_comodato = 'E'
     ORDER BY mp.data DESC`,
    [idCliente],
  );
  return rows.map((r) => ({ descricao: r.descricao, numeroSerie: r.numero_serie }));
}

/// Busca a oscilação/degradação de sinal via o próprio OTDR (/api/consulta_cliente).
/// Resolve o SN da ONU atual (ver buscarEquipamentoAtual) e busca por SN direto —
/// a busca por CPF do OTDR depende de uma correlação MAC/cliente própria dele que
/// pode falhar mesmo com a ONU online (confirmado: buscar por CPF não encontrou
/// um cliente cuja ONU, buscada por SN, respondia normalmente). Cai para busca
/// por CPF só se não houver comodato de ONU ativo identificado.
export async function buscarOscilacaoRede(idCliente: number, equipamentoAtual: { descricao: string; numeroSerie: string }[]): Promise<OscilacaoRede | null> {
  let termoBusca = resolverSnOnu(equipamentoAtual);

  if (!termoBusca) {
    const [rows] = await mysqlPool.query<any[]>(
      `SELECT cnpj_cpf FROM cliente WHERE id = ?`,
      [idCliente],
    );
    termoBusca = rows[0]?.cnpj_cpf ? String(rows[0].cnpj_cpf).replace(/\D/g, '') : null;
  }
  if (!termoBusca) return null;

  try {
    const { data } = await axios.get(`${OTDR_BASE}/api/consulta_cliente`, {
      params: { nome: termoBusca },
      timeout: 15_000,
    });
    const resultado = data?.resultados?.[0];
    if (!resultado) return null;

    return {
      sn:         resultado.sn,
      rxHoje:     resultado.rx_hoje,
      nivelHoje:  resultado.nivel_hoje,
      statusHoje: resultado.status_hoje,
      recorrente: resultado.recorrente ? {
        diasDegradado: resultado.recorrente.dias_degradado,
        piorRx:        resultado.recorrente.pior_rx,
        mediaRx:       resultado.recorrente.media_rx,
        primeiraData:  resultado.recorrente.primeira_data,
        ultimaData:    resultado.recorrente.ultima_data,
      } : null,
      piora: resultado.piora ? {
        dataQueda:    resultado.piora.data_queda,
        rxNaQueda:    resultado.piora.rx_na_queda,
        dataAnterior: resultado.piora.data_anterior,
        rxAnterior:   resultado.piora.rx_anterior,
      } : null,
      veredito:  resultado.veredito,
      gravidade: resultado.gravidade,
    };
  } catch (e: any) {
    logger.warn('[DIAGNOSTICO] Falha ao consultar oscilação de rede no OTDR', { error: e.message });
    return null;
  }
}

/// Acha o SN da ONU dentro do equipamento atual do cliente: fonte única pra
/// esse resolvedor, usado tanto pelo snapshot diário (buscarStatusSmartOlt)
/// quanto pela consulta ao vivo (diagnostico.smartolt-live.ts).
/// Bug real corrigido 2026-07-20: só testava "onu", mas um modelo bem comum
/// no fleet é descrito como "ONT" (Optical Network Terminal, mesmo
/// equipamento, nome diferente), ex: "ONT TX40 SUMEC NAVIGATOR WIFI 6",
/// 16.822 ocorrências reais em movimento_produtos. Sem "ont" no regex, todo
/// contrato com esse modelo nunca recebia enriquecimento de SmartOLT (nem o
/// snapshot diário, nem a consulta ao vivo), silenciosamente.
export function resolverSnOnu(equipamentoAtual: { descricao: string; numeroSerie: string }[]): string | null {
  return equipamentoAtual.find((e) => /onu|ont/i.test(e.descricao))?.numeroSerie || null;
}

/// Busca o status granular da ONU no SmartOLT (otdr.historico_smartolt), pelo
/// mesmo SN resolvido em buscarEquipamentoAtual. Cobre só uma parte do fleet
/// (ONUs que já tiveram algum problema) — não encontrar é esperado, não erro,
/// então retorna null silenciosamente nesse caso (só loga falha de conexão).
export async function buscarStatusSmartOlt(equipamentoAtual: { descricao: string; numeroSerie: string }[]): Promise<StatusSmartOlt | null> {
  const sn = resolverSnOnu(equipamentoAtual);
  if (!sn) return null;

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT sn, status_onu, signal_class, nivel_sinal, dias_degradado, sinal_rx, last_status_change, snapshot_data
      FROM otdr.historico_smartolt
      WHERE sn = ${sn}
      ORDER BY snapshot_data DESC
      LIMIT 1
    `;
    const r = rows[0];
    if (!r || !r.status_onu) return null;

    return {
      sn:                  r.sn,
      statusOnu:           r.status_onu,
      signalClass:         r.signal_class,
      nivelSinal:          r.nivel_sinal,
      diasDegradado:       r.dias_degradado,
      sinalRx:             r.sinal_rx !== null ? Number(r.sinal_rx) : null,
      ultimaMudancaStatus: dataValidaOuNula(r.last_status_change),
      snapshotData:        dataValidaOuNula(r.snapshot_data),
    };
  } catch (e: any) {
    logger.warn('[DIAGNOSTICO] Falha ao consultar status SmartOLT', { error: e.message, sn });
    return null;
  }
}

// ── O.S. / instalação (MariaDB IXC, somente leitura) ──────────────────────────

/// `idsContratoAtivos` vem de buscarContratosCliente — usado só pra marcar
/// contratoAtivo em cada linha, não pra filtrar no SQL (busca um pool maior
/// que `limite` justamente pra poder reordenar por relevância de contrato
/// ANTES de cortar, ver ordenarPorRelevanciaEData).
export async function buscarOrdensServico(idCliente: number, idsContratoAtivos: Set<string>, limite = 10): Promise<OsEntry[]> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT oc.id AS id_oss_chamado, oc.mensagem, oc.mensagem_resposta, oc.status, oc.data_abertura,
            oc.data_fechamento, oc.id_tecnico, oc.endereco, oc.id_contrato_kit, ft.funcionario AS tecnico_nome
     FROM su_oss_chamado oc
       LEFT JOIN funcionarios ft ON ft.id = oc.id_tecnico
     WHERE oc.id_cliente = ?
     ORDER BY oc.data_abertura DESC
     LIMIT ?`,
    [idCliente, Math.max(limite * 3, 30)],
  );
  const entradas: OsEntry[] = rows.map((r) => {
    const idContrato = r.id_contrato_kit ? String(r.id_contrato_kit) : null;
    return {
      idOssChamado:    r.id_oss_chamado,
      mensagem:        r.mensagem ?? '',
      mensagemResposta: r.mensagem_resposta,
      status:          r.status,
      dataAbertura:    dataValidaOuNula(r.data_abertura),
      dataFechamento:  dataValidaOuNula(r.data_fechamento),
      tecnicoId:       r.id_tecnico || null,
      tecnicoNome:     r.tecnico_nome || null,
      endereco:        r.endereco,
      idContrato,
      contratoAtivo:   idContrato ? idsContratoAtivos.has(idContrato) : null,
    };
  });
  return ordenarPorRelevanciaEData(entradas, (e) => e.contratoAtivo, (e) => e.dataAbertura).slice(0, limite);
}

/// "Atendimentos" (su_ticket) são um conceito separado de O.S. (su_oss_chamado)
/// no IXC — tickets de suporte/solicitação. O responsável (id_responsavel_tecnico)
/// resolve pela mesma tabela funcionarios usada para o técnico da O.S. (não
/// usuarios, que é a tabela de login/acesso ao sistema, nem cliente).
export async function buscarAtendimentos(idCliente: number, idsContratoAtivos: Set<string>, limite = 10): Promise<AtendimentoEntry[]> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT t.id, t.titulo, t.status, t.data_criacao, t.id_contrato, ft.funcionario AS responsavel_nome
     FROM su_ticket t
       LEFT JOIN funcionarios ft ON ft.id = t.id_responsavel_tecnico
     WHERE t.id_cliente = ?
     ORDER BY t.data_criacao DESC
     LIMIT ?`,
    [idCliente, Math.max(limite * 3, 30)],
  );
  const entradas: AtendimentoEntry[] = rows.map((r) => {
    const idContrato = r.id_contrato ? String(r.id_contrato) : null;
    return {
      id:              r.id,
      titulo:          r.titulo ?? '',
      status:          r.status,
      dataCriacao:     dataValidaOuNula(r.data_criacao),
      responsavelNome: r.responsavel_nome || null,
      idContrato,
      contratoAtivo:   idContrato ? idsContratoAtivos.has(idContrato) : null,
    };
  });
  return ordenarPorRelevanciaEData(entradas, (e) => e.contratoAtivo, (e) => e.dataCriacao).slice(0, limite);
}

export async function buscarMensagensOs(idsOssChamado: number[]): Promise<Record<number, OsMensagemEntry[]>> {
  const result: Record<number, OsMensagemEntry[]> = {};
  if (!idsOssChamado.length) return result;

  const placeholders = idsOssChamado.map(() => '?').join(',');
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT m.id_chamado, m.data, m.status, m.historico, m.mensagem,
            COALESCE(ft.funcionario, '') AS colaborador
     FROM su_oss_chamado_mensagem m
       LEFT JOIN funcionarios ft ON ft.id = m.id_tecnico
     WHERE m.id_chamado IN (${placeholders})
     ORDER BY m.id_chamado, m.data DESC`,
    idsOssChamado,
  );
  for (const r of rows) {
    const key = r.id_chamado;
    if (!result[key]) result[key] = [];
    result[key].push({
      data:        dataValidaOuNula(r.data),
      status:      r.status,
      historico:   r.historico ?? '',
      mensagem:    r.mensagem ?? '',
      colaborador: r.colaborador || null,
    });
  }
  return result;
}

export async function buscarArquivosOs(idsOssChamado: number[]): Promise<Record<number, OsArquivoEntry[]>> {
  const result: Record<number, OsArquivoEntry[]> = {};
  if (!idsOssChamado.length) return result;

  const placeholders = idsOssChamado.map(() => '?').join(',');
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT id, id_oss_chamado, data_envio, nome_arquivo, descricao, classificacao_arquivo, local_arquivo
     FROM su_oss_chamado_arquivos
     WHERE id_oss_chamado IN (${placeholders})
     ORDER BY id_oss_chamado, data_envio DESC`,
    idsOssChamado,
  );
  for (const r of rows) {
    const key = r.id_oss_chamado;
    if (!result[key]) result[key] = [];
    result[key].push({
      id:            r.id,
      dataEnvio:     dataValidaOuNula(r.data_envio),
      nomeArquivo:   r.nome_arquivo,
      descricao:     r.descricao ?? '',
      classificacao: r.classificacao_arquivo,
      localArquivo:  r.local_arquivo,
    });
  }
  return result;
}

// ── Comercial (Postgres próprio — Vendas / BDR / Retenção) ────────────────────

export async function buscarContextoComercial(idCliente: number, idsContrato: string[]): Promise<ContextoComercial> {
  const [vendas, comissoesBdr] = await Promise.all([
    idsContrato.length
      ? prisma.vendasSnapshot.findMany({
          where: { id_contrato: { in: idsContrato } },
          orderBy: { data_snapshot: 'desc' },
        })
      : Promise.resolve([]),
    prisma.commission.findMany({
      where: idsContrato.length ? { id_contrato: { in: idsContrato } } : { id: '__none__' },
      orderBy: { data_registro: 'desc' },
    }),
  ]);

  return {
    vendas: vendas.map((v) => ({
      idContrato:     v.id_contrato,
      plano:          v.plano,
      statusComissao: v.status_comissao,
      motivoBloqueio: v.motivo_bloqueio,
      valorMensal:    Number(v.valor_mensal),
      mesReferencia:  v.mes_referencia,
      dataSnapshot:   v.data_snapshot,
    })),
    comissoesBdr: comissoesBdr.map((c) => ({
      tipoNegociacao: c.tipo_negociacao,
      dataRegistro:   c.data_registro,
      valorComissao:  Number(c.valor_comissao),
    })),
    retencaoNegociacoes: [],
  };
}

/// Negociações de retenção (CS) registradas para as O.S. desse cliente —
/// RetencaoNegociacao.id_chamado é o mesmo id de su_oss_chamado, então
/// reaproveita os ids já buscados em buscarOrdensServico.
export async function buscarRetencaoNegociacoes(idsOssChamado: number[]): Promise<ContextoComercial['retencaoNegociacoes']> {
  if (!idsOssChamado.length) return [];
  const negociacoes = await prisma.retencaoNegociacao.findMany({
    where: { id_chamado: { in: idsOssChamado.map(String) } },
    orderBy: { data_registro: 'desc' },
  });
  return negociacoes.map((n) => ({
    idChamado:      n.id_chamado,
    valorOriginal:  Number(n.valor_original),
    valorNegociado: Number(n.valor_negociado),
    descricao:      n.descricao,
    dataRegistro:   n.data_registro,
  }));
}

// ── Painel de Gestão (agregados, sem cliente específico) ─────────────────────

export async function buscarRankingVendedores(limiteMeses = 6): Promise<RankingVendedorEntry[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      nome_vendedor,
      mes_referencia,
      COUNT(*)::int AS qtd_contratos,
      SUM(valor_mensal)::numeric AS valor_ativos,
      SUM(CASE WHEN status_comissao = 'Liberada' THEN valor_mensal ELSE 0 END)::numeric AS valor_liberado
    FROM bdr.vendas_snapshots
    WHERE mes_referencia >= to_char(now() - make_interval(months => ${limiteMeses}::int), 'YYYY-MM')
    GROUP BY nome_vendedor, mes_referencia
    ORDER BY mes_referencia DESC, valor_ativos DESC
  `;
  return rows.map((r) => ({
    nomeVendedor:  r.nome_vendedor,
    mesReferencia: r.mes_referencia,
    qtdContratos:  Number(r.qtd_contratos),
    valorAtivos:   Number(r.valor_ativos),
    valorLiberado: Number(r.valor_liberado),
  }));
}

export async function buscarEvolucaoVendas(limiteMeses = 12): Promise<EvolucaoMensalEntry[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      mes_referencia,
      segmento,
      COUNT(*)::int AS qtd_contratos,
      SUM(valor_mensal)::numeric AS valor_ativos,
      SUM(CASE WHEN status_comissao = 'Liberada' THEN valor_mensal ELSE 0 END)::numeric AS valor_liberado
    FROM bdr.vendas_snapshots
    WHERE mes_referencia >= to_char(now() - make_interval(months => ${limiteMeses}::int), 'YYYY-MM')
    GROUP BY mes_referencia, segmento
    ORDER BY mes_referencia DESC, segmento ASC
  `;
  return rows.map((r) => ({
    mesReferencia: r.mes_referencia,
    segmento:      r.segmento,
    qtdContratos:  Number(r.qtd_contratos),
    valorAtivos:   Number(r.valor_ativos),
    valorLiberado: Number(r.valor_liberado),
  }));
}

/// Deriva o nome do POP a partir do nome da OLT — a API do OTDR não expõe POP
/// diretamente, mas várias OLTs compartilham um POP (ex: "AGUAS CLARAS-1",
/// "AGUAS CLARAS-2", "AGUAS CLARAS-3" -> POP AGUAS CLARAS), removendo o sufixo
/// numérico/N. Confirmado batendo com os nomes reais de POP já vistos no
/// histórico de sinal (ex: "POP AGUAS CLARAS", "POP TAGUATINGA").
function popDaOlt(olt: string): string {
  return olt.replace(/-N?\d+$/, '').trim();
}

/// /api/onus é uma leitura AO VIVO (cada ONU já vem com cliente_id/cliente_nome
/// resolvidos pelo próprio OTDR) — diferente de /api/historico/piora, que rastreia
/// eventos de degradação dia-a-dia e pode ficar defasado se a ingestão atrasar.
/// Por isso "pior sinal agora" (piorGeral) é calculado aqui, na mesma resposta,
/// e não via buscarPioresClientesHoje.
export async function buscarStatusPops(): Promise<StatusRedeAgora> {
  const { data } = await axios.get(`${OTDR_BASE}/api/onus`, { timeout: 30_000 });
  const onus: any[] = data.onus ?? [];

  const porPop = new Map<string, any[]>();
  for (const onu of onus) {
    const pop = popDaOlt(onu.olt);
    if (!porPop.has(pop)) porPop.set(pop, []);
    porPop.get(pop)!.push(onu);
  }

  const pops: PopStatusEntry[] = [];
  for (const [pop, lista] of porPop) {
    const comLeitura = lista.filter((o) => typeof o.sinal_rx === 'number');
    pops.push({
      pop,
      totalOnus:      lista.length,
      normal:         lista.filter((o) => o.nivel === 'Normal').length,
      atencao:        lista.filter((o) => o.nivel === 'Atencao').length,
      critico:        lista.filter((o) => o.nivel === 'Critico').length,
      foraDeOperacao: lista.filter((o) => o.nivel === 'Fora de Operacao').length,
      semLeitura:     lista.filter((o) => o.nivel === 'Sem leitura').length,
      piorSinalRx:    comLeitura.length ? Math.min(...comLeitura.map((o) => o.sinal_rx)) : null,
    });
  }

  const comClienteEleitura = onus.filter((o) => typeof o.sinal_rx === 'number' && o.cliente_id);
  const piorOnu = comClienteEleitura.length
    ? comClienteEleitura.reduce((pior, atual) => (atual.sinal_rx < pior.sinal_rx ? atual : pior))
    : null;

  return {
    pops: pops.sort((a, b) => a.pop.localeCompare(b.pop)),
    piorGeral: piorOnu ? {
      clienteId: piorOnu.cliente_id,
      nome:      piorOnu.cliente_nome,
      pop:       popDaOlt(piorOnu.olt),
      olt:       piorOnu.olt,
      sinalRx:   piorOnu.sinal_rx,
    } : null,
  };
}

// ── Fotos da instalação (sessão de admin do IXC, ver config/ixcSession.ts) ────

const LIMITE_FOTOS_DIAGNOSTICO = 12;

const EXTENSOES_IMAGEM = /\.(jpe?g|png|webp)$/i;

/// Fotos com essa descrição mostram onde/como o equipamento está posicionado —
/// o dado mais valioso para avaliar qualidade de instalação. Sem essa
/// priorização, a seleção "mais recentes por data" tende a trazer só fotos de
/// visitas de suporte recentes (teste de sinal, speedtest), que nunca mostram
/// a instalação física, enquanto a foto do local (tirada só na instalação
/// original ou troca de equipamento) fica de fora por ser mais antiga.
const DESCRICAO_LOCAL_INSTALADO = /local\s*instalad/i;

/// Seleciona os anexos mais recentes e relevantes (exclui assinatura do cliente
/// e documentos como PDF de O.S., que não ajudam a avaliar qualidade de
/// instalação) e busca o binário de cada um. Falhas individuais são ignoradas
/// (uma foto que não carrega não derruba o diagnóstico inteiro).
///
/// Muitas fotos de vistoria têm nome/descrição genérica no IXC (ex:
/// "os_img_243612300678814882", sem indicar o que mostram) — não dá pra saber
/// qual é "a boa" sem olhar. Por isso a seleção é por LOTE de O.S., não por
/// corte simples de "N mais recentes": pega o lote inteiro da O.S. com foto
/// mais recente (evita cortar no meio de uma sequência de 10+ fotos da mesma
/// visita e acabar só com um recorte arbitrário dela), completando com lotes
/// mais antigos até o limite.
export async function buscarFotosRelevantes(
  osArquivos: Record<number, OsArquivoEntry[]>,
): Promise<ImagemAnexo[]> {
  const fotoLocal = Object.values(osArquivos).flat()
    .filter((a) => a.classificacao !== 'A' && EXTENSOES_IMAGEM.test(a.nomeArquivo))
    .find((a) => DESCRICAO_LOCAL_INSTALADO.test(a.descricao));

  const lotesPorOs = Object.values(osArquivos)
    .map((arquivos) => arquivos.filter((a) => a.classificacao !== 'A' && EXTENSOES_IMAGEM.test(a.nomeArquivo)))
    .filter((lote) => lote.length > 0)
    .map((lote) => ({
      arquivos: lote,
      dataMaisRecente: Math.max(...lote.map((a) => a.dataEnvio?.getTime() ?? 0)),
    }))
    .sort((a, b) => b.dataMaisRecente - a.dataMaisRecente);

  const todos: OsArquivoEntry[] = fotoLocal ? [fotoLocal] : [];
  for (const lote of lotesPorOs) {
    if (todos.length >= LIMITE_FOTOS_DIAGNOSTICO) break;
    for (const a of lote.arquivos) {
      if (todos.length >= LIMITE_FOTOS_DIAGNOSTICO) break;
      if (a === fotoLocal) continue;
      todos.push(a);
    }
  }

  const resultados = await Promise.allSettled(todos.map((a) => buscarArquivoBinario(a.id)));

  const imagens: ImagemAnexo[] = [];
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      imagens.push({
        buffer: r.value.buffer,
        mimeType: r.value.contentType,
        descricao: todos[i].descricao || todos[i].nomeArquivo,
      });
    } else if (r.status === 'rejected') {
      logger.warn('[DIAGNOSTICO] Falha ao buscar foto de instalação', { error: r.reason?.message });
    }
  });

  if (todos.length > 0 && imagens.length === 0) {
    registrarFalhaFotosEsperadas();
  }

  return imagens;
}

// ── Regras de negócio centralizadas (referência para o prompt da IA) ──────────

export async function buscarRegrasNegocio(): Promise<Record<string, string>> {
  const regras = await prisma.diagnosticoRegraNegocio.findMany();
  return Object.fromEntries(regras.map((r) => [r.chave, r.valor]));
}
