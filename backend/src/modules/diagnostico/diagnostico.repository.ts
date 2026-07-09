import mysqlPool from '../../config/mysql';
import prisma from '../../config/prisma';
import {
  HistoricoSinalEntry,
  OsEntry,
  OsMensagemEntry,
  OsArquivoEntry,
  ContextoComercial,
} from './diagnostico.types';

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

export async function buscarIdsContratoPorCliente(idCliente: number): Promise<string[]> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT id FROM cliente_contrato WHERE id_cliente = ?`,
    [idCliente],
  );
  return rows.map((r) => String(r.id));
}

// ── O.S. / instalação (MariaDB IXC, somente leitura) ──────────────────────────

export async function buscarOrdensServico(idCliente: number, limite = 10): Promise<OsEntry[]> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT id AS id_oss_chamado, mensagem, mensagem_resposta, status, data_abertura, data_fechamento, id_tecnico, endereco
     FROM su_oss_chamado
     WHERE id_cliente = ?
     ORDER BY data_abertura DESC
     LIMIT ?`,
    [idCliente, limite],
  );
  return rows.map((r) => ({
    idOssChamado:    r.id_oss_chamado,
    mensagem:        r.mensagem ?? '',
    mensagemResposta: r.mensagem_resposta,
    status:          r.status,
    dataAbertura:    dataValidaOuNula(r.data_abertura),
    dataFechamento:  dataValidaOuNula(r.data_fechamento),
    tecnicoId:       r.id_tecnico || null,
    endereco:        r.endereco,
  }));
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
    `SELECT id_oss_chamado, data_envio, nome_arquivo, descricao, classificacao_arquivo, local_arquivo
     FROM su_oss_chamado_arquivos
     WHERE id_oss_chamado IN (${placeholders})
     ORDER BY id_oss_chamado, data_envio DESC`,
    idsOssChamado,
  );
  for (const r of rows) {
    const key = r.id_oss_chamado;
    if (!result[key]) result[key] = [];
    result[key].push({
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
    })),
    comissoesBdr: comissoesBdr.map((c) => ({
      tipoNegociacao: c.tipo_negociacao,
      dataRegistro:   c.data_registro,
      valorComissao:  Number(c.valor_comissao),
    })),
    retencaoNegociacoes: [],
  };
}

// ── Regras de negócio centralizadas (referência para o prompt da IA) ──────────

export async function buscarRegrasNegocio(): Promise<Record<string, string>> {
  const regras = await prisma.diagnosticoRegraNegocio.findMany();
  return Object.fromEntries(regras.map((r) => [r.chave, r.valor]));
}
