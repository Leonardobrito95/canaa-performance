import fs from 'fs';
import path from 'path';
import pool from '../../config/mysql';
import { RowDataPacket } from 'mysql2';
import prisma from '../../config/prisma';
import { extrairProtocolos, buscarConversasPorProtocolos, ConversaOpaSuite } from '../opasuite/opasuite.service';

// ── Operadoras autorizadas no módulo de Retenção ─────────────────────────────
export const OPERADORES_CS = (process.env.RETENCAO_OPERADORES_CS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ── Mapeamento de IDs de diagnóstico ─────────────────────────────────────────
// IDs de assunto/diagnóstico do IXC são específicos de cada instalação, vêm
// de config/retencao-diagnosticos.json (não commitado, ver .example.json
// pro formato). Mesmo padrão de setores-atendimento.json (2026-07-21).

interface ConfigDiagnosticosArquivo {
  idAssuntoRetencao: string;
  retidoIds:         number[];
  naoRetidoIds:      number[];
}

const CAMINHO_CONFIG_DIAGNOSTICOS = path.join(__dirname, '../../../config/retencao-diagnosticos.json');

function carregarConfigDiagnosticos(): ConfigDiagnosticosArquivo {
  if (!fs.existsSync(CAMINHO_CONFIG_DIAGNOSTICOS)) {
    throw new Error(
      `Arquivo de configuração não encontrado: ${CAMINHO_CONFIG_DIAGNOSTICOS}. Copie ` +
      `backend/config/retencao-diagnosticos.example.json para ` +
      `backend/config/retencao-diagnosticos.json e preencha com os IDs reais ` +
      `de assunto/diagnóstico do IXC desta instalação.`
    );
  }
  return JSON.parse(fs.readFileSync(CAMINHO_CONFIG_DIAGNOSTICOS, 'utf8'));
}

const configDiagnosticos = carregarConfigDiagnosticos();

export const ID_ASSUNTO_RETENCAO = configDiagnosticos.idAssuntoRetencao;
export const RETIDO_IDS          = configDiagnosticos.retidoIds;
export const NAO_RETIDO_IDS      = configDiagnosticos.naoRetidoIds;

// ── Comissão por faixa ────────────────────────────────────────────────────────
export function getComissaoRetencao(qtdRetidas: number): number {
  if (qtdRetidas >= 110) return 750;
  if (qtdRetidas >= 90)  return 550;
  if (qtdRetidas >= 70)  return 400;
  return 0;
}

export function getFaixaRetencao(qtdRetidas: number): string {
  if (qtdRetidas >= 110) return '110+ retenções — R$ 750';
  if (qtdRetidas >= 90)  return '90+ retenções — R$ 550';
  if (qtdRetidas >= 70)  return '70+ retenções — R$ 400';
  return 'Abaixo da meta (mín. 70)';
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RetencaoRecord {
  nome_operador:   string;
  qtd_tratadas:    number;
  qtd_retidas:     number;
  qtd_nao_retidas: number;
  pct_reversao:    number;  // 0–100
  comissao:        number;
  faixa:           string;
}

export interface NegociacaoData {
  valor_original:  number;
  valor_negociado: number;
  descricao:       string | null;
  registrado_por:  string;
  data_registro:   string;
}

export interface AuditoriaData {
  classificacao:        'NEGOCIACAO_REAL' | 'SEM_NEGOCIACAO' | 'INDEFINIDO';
  justificativa:        string;
  negociacao_detectada: string | null;
  divergencia_nota_os:  string | null;
  processo_anterior:    string | null;
}

export interface RetencaoDetalhe {
  id_chamado:       string;
  data_abertura:    string;
  nome_operador:    string;
  nome_cliente:     string;
  valor_mensal:     number;
  id_diagnostico:   number | null;
  desc_diagnostico: string;
  resultado:        'RETIDO' | 'NAO_RETIDO' | 'PENDENTE';
  negociacao:       NegociacaoData | null;
  /// null = ainda não passou pela rotina de auditoria (script incremental) —
  /// não significa "sem negociação", significa "não avaliado ainda".
  auditoria:        AuditoriaData | null;
}

export interface NegociacaoInput {
  id_chamado:      string;
  valor_original:  number;
  valor_negociado: number;
  descricao:       string | null;
  registrado_por:  string;
}

export interface RetencaoFilters {
  dateFrom?:    string;
  dateTo?:      string;
  operadorNome?: string;
}

// ── Query principal ───────────────────────────────────────────────────────────

export async function fetchRetencao(filters: RetencaoFilters): Promise<RetencaoRecord[]> {
  const conditions: string[] = [`id_assunto = '${ID_ASSUNTO_RETENCAO}'`];
  const params: unknown[] = [];

  if (filters.dateFrom) {
    conditions.push('data_abertura >= ?');
    params.push(filters.dateFrom + ' 00:00:00');
  }
  if (filters.dateTo) {
    conditions.push('data_abertura <= ?');
    params.push(filters.dateTo + ' 23:59:59');
  }
  if (filters.operadorNome) {
    conditions.push('id_atendente LIKE ?');
    params.push(`%${filters.operadorNome}%`);
  }

  // Restringe apenas às operadoras autorizadas
  const placeholders = OPERADORES_CS.map(() => '?').join(', ');
  conditions.push(`id_atendente IN (${placeholders})`);
  params.push(...OPERADORES_CS);

  const retidoList    = RETIDO_IDS.join(',');
  const naoRetidoList = NAO_RETIDO_IDS.join(',');

  // id_su_diagnostico está na própria tabela su_oss_chamado
  // id_atendente já contém o nome do operador (string)
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(CONVERT(id_atendente USING utf8mb4), CONCAT('Técnico #', id_tecnico)) AS nome_operador,
       COUNT(*)                                                  AS qtd_tratadas,
       COUNT(CASE WHEN id_su_diagnostico IN (${retidoList})     THEN 1 END) AS qtd_retidas,
       COUNT(CASE WHEN id_su_diagnostico IN (${naoRetidoList})  THEN 1 END) AS qtd_nao_retidas
     FROM su_oss_chamado
     WHERE ${conditions.join(' AND ')}
     GROUP BY id_atendente, id_tecnico
     ORDER BY qtd_retidas DESC`,
    params as any[]
  );

  return rows.map((r) => {
    const qtdTratadas   = Number(r.qtd_tratadas)    || 0;
    const qtdRetidas    = Number(r.qtd_retidas)     || 0;
    const qtdNaoRetidas = Number(r.qtd_nao_retidas) || 0;
    const pctReversao   = qtdTratadas > 0 ? (qtdRetidas / qtdTratadas) * 100 : 0;

    return {
      nome_operador:   String(r.nome_operador),
      qtd_tratadas:    qtdTratadas,
      qtd_retidas:     qtdRetidas,
      qtd_nao_retidas: qtdNaoRetidas,
      pct_reversao:    Math.round(pctReversao * 10) / 10,
      comissao:        getComissaoRetencao(qtdRetidas),
      faixa:           getFaixaRetencao(qtdRetidas),
    };
  });
}

// ── Detalhe por chamado ───────────────────────────────────────────────────────

export async function fetchRetencaoDetalhe(filters: RetencaoFilters): Promise<RetencaoDetalhe[]> {
  const conditions: string[] = [`c.id_assunto = '${ID_ASSUNTO_RETENCAO}'`];
  const params: unknown[] = [];

  if (filters.dateFrom) {
    conditions.push('c.data_abertura >= ?');
    params.push(filters.dateFrom + ' 00:00:00');
  }
  if (filters.dateTo) {
    conditions.push('c.data_abertura <= ?');
    params.push(filters.dateTo + ' 23:59:59');
  }
  if (filters.operadorNome) {
    conditions.push('c.id_atendente LIKE ?');
    params.push(`%${filters.operadorNome}%`);
  }

  // Restringe apenas às operadoras autorizadas
  const placeholders = OPERADORES_CS.map(() => '?').join(', ');
  conditions.push(`c.id_atendente IN (${placeholders})`);
  params.push(...OPERADORES_CS);

  const retidoList    = RETIDO_IDS.join(',');
  const naoRetidoList = NAO_RETIDO_IDS.join(',');

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       c.id                                                                              AS id_chamado,
       c.data_abertura,
       COALESCE(CONVERT(c.id_atendente USING utf8mb4), CONCAT('Técnico #', c.id_tecnico)) AS nome_operador,
       COALESCE(CONVERT(cl.razao      USING utf8mb4), '')                                AS nome_cliente,
       COALESCE(
         (SELECT SUM(vv.valorTotalLiquido)
          FROM view_valor_produtos_contrato_composicao vv
          INNER JOIN cliente_contrato cc ON cc.id = vv.cliente_contrato_id AND cc.status = 'A'
          WHERE vv.cliente_id = c.id_cliente),
         0
       )                                                                                 AS valor_mensal,
       c.id_su_diagnostico,
       CASE
         WHEN c.id_su_diagnostico IN (${retidoList})    THEN 'RETIDO'
         WHEN c.id_su_diagnostico IN (${naoRetidoList}) THEN 'NAO_RETIDO'
         ELSE 'PENDENTE'
       END AS resultado
     FROM su_oss_chamado c
     LEFT JOIN cliente cl ON cl.id = c.id_cliente
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.data_abertura DESC
     LIMIT 2000`,
    params as any[]
  );

  const chamadoIds = rows.map((r) => String(r.id_chamado));

  // Busca negociações registradas manualmente (Postgres) e a auditoria de IA
  // (também Postgres, tabela separada) — em paralelo, apenas para os IDs retornados
  const [negociacoes, auditorias] = chamadoIds.length
    ? await Promise.all([
        prisma.retencaoNegociacao.findMany({ where: { id_chamado: { in: chamadoIds } } }),
        prisma.retencaoAuditoria.findMany({ where: { id_chamado: { in: chamadoIds } } }),
      ])
    : [[], []];

  const negMap = new Map(negociacoes.map((n) => [n.id_chamado, n]));
  const audMap = new Map(auditorias.map((a) => [a.id_chamado, a]));

  return rows.map((r) => {
    const idChamado = String(r.id_chamado);
    const neg = negMap.get(idChamado) ?? null;
    const aud = audMap.get(idChamado) ?? null;

    return {
      id_chamado:       idChamado,
      data_abertura:    r.data_abertura instanceof Date
                          ? r.data_abertura.toISOString()
                          : String(r.data_abertura ?? ''),
      nome_operador:    String(r.nome_operador),
      nome_cliente:     String(r.nome_cliente ?? ''),
      valor_mensal:     parseFloat(r.valor_mensal ?? 0),
      id_diagnostico:   r.id_su_diagnostico != null ? Number(r.id_su_diagnostico) : null,
      desc_diagnostico: '',
      resultado:        (r.resultado as 'RETIDO' | 'NAO_RETIDO' | 'PENDENTE') ?? 'PENDENTE',
      negociacao:       neg
        ? {
            valor_original:  parseFloat(neg.valor_original.toString()),
            valor_negociado: parseFloat(neg.valor_negociado.toString()),
            descricao:       neg.descricao ?? null,
            registrado_por:  neg.registrado_por,
            data_registro:   neg.data_registro.toISOString(),
          }
        : null,
      auditoria: aud
        ? {
            classificacao:        aud.classificacao as AuditoriaData['classificacao'],
            justificativa:        aud.justificativa,
            negociacao_detectada: aud.negociacao_detectada,
            divergencia_nota_os:  aud.divergencia_nota_os,
            processo_anterior:    aud.processo_anterior,
          }
        : null,
    };
  });
}

// ── Negociações (PostgreSQL) ──────────────────────────────────────────────────

export async function upsertNegociacao(input: NegociacaoInput): Promise<NegociacaoData> {
  const result = await prisma.retencaoNegociacao.upsert({
    where:  { id_chamado: input.id_chamado },
    create: {
      id_chamado:      input.id_chamado,
      valor_original:  input.valor_original,
      valor_negociado: input.valor_negociado,
      descricao:       input.descricao,
      registrado_por:  input.registrado_por,
    },
    update: {
      valor_original:  input.valor_original,
      valor_negociado: input.valor_negociado,
      descricao:       input.descricao,
      registrado_por:  input.registrado_por,
    },
  });

  return {
    valor_original:  parseFloat(result.valor_original.toString()),
    valor_negociado: parseFloat(result.valor_negociado.toString()),
    descricao:       result.descricao ?? null,
    registrado_por:  result.registrado_por,
    data_registro:   result.data_registro.toISOString(),
  };
}

export async function deleteNegociacao(idChamado: string): Promise<void> {
  await prisma.retencaoNegociacao.deleteMany({ where: { id_chamado: idChamado } });
}

// ── Auditoria de negociação real (cruza O.S. + atendimento) ──────────────────
// A classificação do IXC (id_su_diagnostico numa lista fixa) não distingue
// "negociou e o cliente aceitou uma concessão real" de "cliente desistiu sem
// negociar" ou "transferência de titularidade" — só o texto livre das
// mensagens (da própria O.S. e de atendimentos do mesmo cliente por perto da
// data) tem essa evidência. Ver diagnostico.prisma model RetencaoAuditoria.

export interface MensagemChamado {
  data:      Date | null;
  mensagem:  string;
  status:    string;
}

export interface AtendimentoRelacionado {
  titulo:      string;
  mensagem:    string;
  dataCriacao: Date | null;
  status:      string | null;
}

/// Outras O.S. do MESMO cliente na janela (qualquer assunto, exceto a
/// retenção sendo classificada). Contexto da jornada até chegar na
/// retenção (ex: instalação sem viabilidade, transferência de setor sem
/// aviso), que o classificador não enxergava antes (2026-07-21, achado real
/// investigando um caso onde o gestor via um processo bem mais grave do que
/// a IA, porque a IA só olhava a O.S. da retenção em si).
export interface OutraOsRelacionada {
  idChamado:        string;
  assunto:          string;
  dataAbertura:     Date | null;
  mensagem:         string;
  mensagemResposta: string | null;
  status:           string;
}

export interface ChamadoParaAuditar {
  idChamado:              string;
  nomeOperador:            string;
  resultadoIxc:            'RETIDO' | 'NAO_RETIDO' | 'PENDENTE';
  dataAberturaOs:          Date;
  idCliente:               number;
  mensagensOs:             MensagemChamado[];
  atendimentosRelacionados: AtendimentoRelacionado[];
  outrasOsRelacionadas:    OutraOsRelacionada[];
  /// Conversa real do OpaSuite (WhatsApp/voz), resolvida pelo protocolo
  /// "OPA..." citado na nota da O.S. — evidência mais confiável que o texto
  /// que o próprio operador escreveu, porque ele não edita depois.
  conversasOpaSuite:      ConversaOpaSuite[];
}

const JANELA_ATENDIMENTO_MS = 3 * 24 * 60 * 60 * 1000; // +-3 dias da data de abertura da O.S.

async function buscarMensagensPorChamado(idsChamado: number[]): Promise<Map<number, MensagemChamado[]>> {
  const map = new Map<number, MensagemChamado[]>();
  if (!idsChamado.length) return map;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id_chamado, data, status, mensagem
     FROM su_oss_chamado_mensagem
     WHERE id_chamado IN (${idsChamado.map(() => '?').join(',')})
     ORDER BY id_chamado, data ASC`,
    idsChamado,
  );
  for (const r of rows) {
    const key = Number(r.id_chamado);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      data:     r.data ? new Date(r.data) : null,
      mensagem: String(r.mensagem ?? ''),
      status:   String(r.status ?? ''),
    });
  }
  return map;
}

async function buscarAtendimentosPorCliente(
  idsCliente: number[],
  dataMin: Date,
  dataMax: Date,
): Promise<Map<number, AtendimentoRelacionado[]>> {
  const map = new Map<number, AtendimentoRelacionado[]>();
  if (!idsCliente.length) return map;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id_cliente, titulo, menssagem, data_criacao, status
     FROM su_ticket
     WHERE id_cliente IN (${idsCliente.map(() => '?').join(',')})
       AND data_criacao BETWEEN ? AND ?
     ORDER BY id_cliente, data_criacao ASC`,
    [...idsCliente, dataMin, dataMax],
  );
  for (const r of rows) {
    const key = Number(r.id_cliente);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      titulo:      String(r.titulo ?? ''),
      mensagem:    String(r.menssagem ?? ''),
      dataCriacao: r.data_criacao ? new Date(r.data_criacao) : null,
      status:      r.status ?? null,
    });
  }
  return map;
}

/// Outras O.S. do cliente na mesma janela (qualquer assunto), pra dar
/// contexto da jornada até a retenção, ex: instalação sem viabilidade,
/// transferência de setor, falha de processo anterior que a IA não via
/// antes (só olhava a O.S. de retenção isolada). Exclui as próprias O.S.
/// de retenção sendo classificadas nesta rodada (`idsChamadoExcluir`).
async function buscarOutrasOsPorCliente(
  idsCliente: number[],
  dataMin: Date,
  dataMax: Date,
  idsChamadoExcluir: number[],
): Promise<Map<number, OutraOsRelacionada[]>> {
  const map = new Map<number, OutraOsRelacionada[]>();
  if (!idsCliente.length) return map;

  const excluir = idsChamadoExcluir.length ? `AND c.id NOT IN (${idsChamadoExcluir.map(() => '?').join(',')})` : '';
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.id_cliente, c.id_assunto, a.assunto, c.data_abertura, c.mensagem, c.mensagem_resposta, c.status
     FROM su_oss_chamado c
     LEFT JOIN su_oss_assunto a ON a.id = c.id_assunto
     WHERE c.id_cliente IN (${idsCliente.map(() => '?').join(',')})
       AND c.data_abertura BETWEEN ? AND ?
       ${excluir}
     ORDER BY c.id_cliente, c.data_abertura ASC`,
    [...idsCliente, dataMin, dataMax, ...idsChamadoExcluir],
  );
  for (const r of rows) {
    const key = Number(r.id_cliente);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      idChamado:        String(r.id),
      assunto:          String(r.assunto ?? `assunto #${r.id_assunto}`),
      dataAbertura:     r.data_abertura ? new Date(r.data_abertura) : null,
      mensagem:         String(r.mensagem ?? ''),
      mensagemResposta: r.mensagem_resposta ? String(r.mensagem_resposta) : null,
      status:           String(r.status ?? ''),
    });
  }
  return map;
}

export interface FiltrosAuditoria {
  dataMinima?:   Date;
  apenasRetido?: boolean;
  /// Restringe a UM chamado específico — usado pra reclassificação manual
  /// (botão "Reclassificar" no modal de auditoria), sempre com
  /// idsJaClassificados=[] e limite=1 pra ignorar o filtro de "ainda não
  /// auditada" e reprocessar o mesmo chamado.
  idChamado?:    string;
}

/// Busca até `limite` O.S. de retenção (id_assunto=348) ainda não auditadas
/// (não presentes em RetencaoAuditoria), com as mensagens da própria O.S. e
/// atendimentos do mesmo cliente numa janela de +-3 dias — evidência bruta
/// para o classificador decidir se houve negociação real.
export async function buscarChamadosParaAuditar(
  idsJaClassificados: string[],
  limite = 50,
  filtros: FiltrosAuditoria = {},
): Promise<ChamadoParaAuditar[]> {
  const retidoList    = RETIDO_IDS.join(',');
  const naoRetidoList = NAO_RETIDO_IDS.join(',');
  const placeholdersOperadores = OPERADORES_CS.map(() => '?').join(', ');
  const excluir = idsJaClassificados.length
    ? `AND c.id NOT IN (${idsJaClassificados.map(() => '?').join(',')})`
    : '';
  const filtroData      = filtros.dataMinima ? 'AND c.data_abertura >= ?' : '';
  const filtroRetido    = filtros.apenasRetido ? `AND c.id_su_diagnostico IN (${retidoList})` : '';
  const filtroIdChamado = filtros.idChamado ? 'AND c.id = ?' : '';

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       c.id, c.data_abertura, c.id_cliente,
       COALESCE(CONVERT(c.id_atendente USING utf8mb4), CONCAT('Técnico #', c.id_tecnico)) AS nome_operador,
       CASE
         WHEN c.id_su_diagnostico IN (${retidoList})    THEN 'RETIDO'
         WHEN c.id_su_diagnostico IN (${naoRetidoList}) THEN 'NAO_RETIDO'
         ELSE 'PENDENTE'
       END AS resultado
     FROM su_oss_chamado c
     WHERE c.id_assunto = '${ID_ASSUNTO_RETENCAO}'
       AND c.id_atendente IN (${placeholdersOperadores})
       ${excluir}
       ${filtroData}
       ${filtroRetido}
       ${filtroIdChamado}
     ORDER BY c.data_abertura DESC
     LIMIT ?`,
    [
      ...OPERADORES_CS,
      ...idsJaClassificados,
      ...(filtros.dataMinima ? [filtros.dataMinima] : []),
      ...(filtros.idChamado ? [filtros.idChamado] : []),
      limite,
    ],
  );

  if (!rows.length) return [];

  const idsChamado  = rows.map((r) => Number(r.id));
  const idsClientes = [...new Set(rows.map((r) => Number(r.id_cliente)))];
  const datas       = rows.map((r) => new Date(r.data_abertura).getTime());
  const dataMin     = new Date(Math.min(...datas) - JANELA_ATENDIMENTO_MS);
  const dataMax     = new Date(Math.max(...datas) + JANELA_ATENDIMENTO_MS);

  const [mensagensMap, atendimentosMap, outrasOsMap] = await Promise.all([
    buscarMensagensPorChamado(idsChamado),
    buscarAtendimentosPorCliente(idsClientes, dataMin, dataMax),
    buscarOutrasOsPorCliente(idsClientes, dataMin, dataMax, idsChamado),
  ]);

  return Promise.all(rows.map(async (r) => {
    const idCliente      = Number(r.id_cliente);
    const dataAberturaOs = new Date(r.data_abertura);
    const todosAtendimentos = atendimentosMap.get(idCliente) ?? [];
    const atendimentosRelacionados = todosAtendimentos.filter((a) =>
      a.dataCriacao && Math.abs(a.dataCriacao.getTime() - dataAberturaOs.getTime()) <= JANELA_ATENDIMENTO_MS
    );
    const mensagensOs = mensagensMap.get(Number(r.id)) ?? [];
    const todasOutrasOs = outrasOsMap.get(idCliente) ?? [];
    const outrasOsRelacionadas = todasOutrasOs.filter((os) =>
      os.dataAbertura && Math.abs(os.dataAbertura.getTime() - dataAberturaOs.getTime()) <= JANELA_ATENDIMENTO_MS
    );

    // Protocolo "OPA..." citado na nota da O.S. ou do atendimento aponta pra
    // conversa real no OpaSuite — evidência mais confiável que o texto que o
    // próprio operador escreveu.
    const protocolos = extrairProtocolos([
      ...mensagensOs.map((m) => m.mensagem),
      ...atendimentosRelacionados.map((a) => a.mensagem),
    ]);
    const conversasOpaSuite = protocolos.length ? await buscarConversasPorProtocolos(protocolos) : [];

    return {
      idChamado:       String(r.id),
      nomeOperador:    String(r.nome_operador),
      resultadoIxc:    r.resultado as 'RETIDO' | 'NAO_RETIDO' | 'PENDENTE',
      dataAberturaOs,
      idCliente,
      mensagensOs,
      atendimentosRelacionados,
      outrasOsRelacionadas,
      conversasOpaSuite,
    };
  }));
}

/// Conta quantas O.S. de retenção (id_assunto=348, operadores autorizados)
/// existem no total no IXC — usado pra saber quantas ainda faltam auditar.
export async function contarChamadosRetencaoTotal(): Promise<number> {
  const placeholdersOperadores = OPERADORES_CS.map(() => '?').join(', ');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM su_oss_chamado c
     WHERE c.id_assunto = '${ID_ASSUNTO_RETENCAO}'
       AND c.id_atendente IN (${placeholdersOperadores})`,
    OPERADORES_CS,
  );
  return Number(rows[0]?.total ?? 0);
}

export interface ResumoAuditoriaOperador {
  nomeOperador:      string;
  totalClassificado: number;
  negociacaoReal:    number;
  semNegociacao:     number;
  indefinido:        number;
  divergencias:      number;
}

export async function resumoAuditoriaPorOperador(): Promise<ResumoAuditoriaOperador[]> {
  const registros = await prisma.retencaoAuditoria.findMany({
    select: { nome_operador: true, classificacao: true, divergencia_nota_os: true },
  });

  const porOperador = new Map<string, ResumoAuditoriaOperador>();
  for (const r of registros) {
    if (!porOperador.has(r.nome_operador)) {
      porOperador.set(r.nome_operador, {
        nomeOperador: r.nome_operador, totalClassificado: 0, negociacaoReal: 0, semNegociacao: 0, indefinido: 0, divergencias: 0,
      });
    }
    const acc = porOperador.get(r.nome_operador)!;
    acc.totalClassificado++;
    if (r.classificacao === 'NEGOCIACAO_REAL') acc.negociacaoReal++;
    else if (r.classificacao === 'SEM_NEGOCIACAO') acc.semNegociacao++;
    else acc.indefinido++;
    if (r.divergencia_nota_os) acc.divergencias++;
  }

  return [...porOperador.values()].sort((a, b) => b.totalClassificado - a.totalClassificado);
}

export interface DivergenciaRecente {
  idChamado:       string;
  nomeOperador:    string;
  resultadoIxc:    string;
  classificacao:   string;
  divergencia:     string;
  dataAberturaOs:  Date;
}

/// Divergências mais recentes (nota da O.S. vs. conversa real do OpaSuite) —
/// alimenta o chat de Gestão com o CONTEÚDO, não só a contagem, pra ele poder
/// responder "quais foram as divergências" com detalhe de verdade.
export async function buscarDivergenciasRecentes(limite = 10): Promise<DivergenciaRecente[]> {
  const registros = await prisma.retencaoAuditoria.findMany({
    where:   { divergencia_nota_os: { not: null } },
    orderBy: { data_abertura_os: 'desc' },
    take:    limite,
  });

  return registros.map((r) => ({
    idChamado:      r.id_chamado,
    nomeOperador:   r.nome_operador,
    resultadoIxc:   r.resultado_ixc,
    classificacao:  r.classificacao,
    divergencia:    r.divergencia_nota_os!,
    dataAberturaOs: r.data_abertura_os,
  }));
}

/// Busca a(s) conversa(s) reais do OpaSuite por trás de uma O.S. específica —
/// pro gestor conferir o caso flagado sem precisar pedir por fora do sistema.
export async function buscarConversasOpaSuitePorChamado(idChamado: string): Promise<ConversaOpaSuite[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT mensagem FROM su_oss_chamado_mensagem WHERE id_chamado = ?`,
    [idChamado],
  );
  const protocolos = extrairProtocolos(rows.map((r) => String(r.mensagem ?? '')));
  if (!protocolos.length) return [];
  return buscarConversasPorProtocolos(protocolos);
}
