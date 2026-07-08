// ============================================================
// COMISSAO CAMPO — Service principal
// ============================================================

import mysqlPool from '../../config/mysql';
import {
  SheetRow,
  AuditResult,
  EmpresaConfig,
  DbOsRow,
} from './comissao.types';
import {
  stripStr,
  parseDateInput,
  startOfDay,
  endOfDay,
  addDays,
  serializeDate,
  parseMoney,
  parsePercent,
  sameDay,
  normalizeService,
  isImprodutivaService,
  isMaintenanceSubtypeMatch,
  shouldPayExternalMaintenance,
  getPrecoServico,
  textMatches,
  parseIds,
} from './comissao.utils';
import {
  isStarkCompanyName,
  isStarkTentativaStatus,
  isStarkSuccessStatus,
  isStarkServiceMatch,
  getStarkStatusPrice,
  fetchStarkAttemptData,
  compareStarkRows,
} from './stark.service';

// ── Sanitização das linhas da planilha ──────────────────────

export function sanitizeSheetRows(rawRows: unknown): SheetRow[] {
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .map((row: any, index: number) => {
      const id = parseInt(String(row?.id ?? '').trim(), 10);
      if (!Number.isInteger(id) || id <= 0) return null;
      return {
        seq:            stripStr(row?.seq) || String(index + 1),
        id:             String(id),
        cliente:        stripStr(row?.cliente),
        colaborador:    stripStr(row?.colaborador),
        tipoOS:         stripStr(row?.tipoOS),
        statusPlanilha: stripStr(row?.statusPlanilha),
        dobrada:        Boolean(row?.dobrada),
        valor:          parseMoney(row?.valor),
        valorFonte:     stripStr(row?.valorFonte) || 'sheet',
        cidade:         stripStr(row?.cidade),
        dataEnv:        parseDateInput(row?.dataEnv),
      } as SheetRow;
    })
    .filter((r): r is SheetRow => r !== null);
}

// ── Busca OS no MySQL (IXC) ──────────────────────────────────

export async function fetchOsDetails(ids: number[]): Promise<DbOsRow[]> {
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');
  const sql = `
    SELECT
      o.id                                AS id_os,
      o.status                            AS status_os,
      o.gera_comissao                     AS gera_comissao,
      o.valor_unit_comissao               AS valor_unit_comissao_os,
      o.valor_total_comissao              AS valor_total_comissao_os,
      o.data_abertura                     AS data_abertura,
      o.data_fechamento                   AS data_fechamento,
      a.assunto                           AS servico,
      a.valor_comissao                    AS valor_comissao_assunto,
      COALESCE(NULLIF(cl.razao, ''), NULLIF(cl.fantasia, ''), '') AS cliente_nome,
      COALESCE(NULLIF(ci.nome, ''), NULLIF(cl.cidade, ''), NULLIF(o.endereco, ''), '') AS cidade_nome,
      f.funcionario                       AS tecnico,
      COALESCE(com.valor_comissao_max, 0) AS su_oss_chamado_comissao,
      COALESCE(com.qtd_registros, 0)      AS qtd_registros_comissao
    FROM su_oss_chamado o
      LEFT JOIN su_oss_assunto a    ON o.id_assunto = a.id
      LEFT JOIN cliente cl          ON o.id_cliente = cl.id
      LEFT JOIN cidade ci           ON o.id_cidade = ci.id
      LEFT JOIN funcionarios f      ON o.id_tecnico = f.id
      LEFT JOIN (
        SELECT id_oss_chamado,
               MAX(valor_comissao) AS valor_comissao_max,
               COUNT(*)            AS qtd_registros
        FROM su_oss_chamado_comissao
        GROUP BY id_oss_chamado
      ) com ON com.id_oss_chamado = o.id
    WHERE o.id IN (${placeholders})
    ORDER BY o.id
  `;

  const [rows] = await mysqlPool.query<any[]>(sql, ids);
  return rows as DbOsRow[];
}

function companyTypeMatchesStark(empresaNome: string, empresaConfig: EmpresaConfig | null): boolean {
  return isStarkCompanyName(empresaNome)
    || isStarkCompanyName(empresaConfig?.nome)
    || isStarkCompanyName(empresaConfig?.key);
}

// ── Comparação base (todos exceto STARK) ────────────────────

export function compareRowsWithDatabase(
  sheetRows: SheetRow[],
  dbRows: DbOsRow[],
  dateIni: Date | null,
  dateFim: Date | null,
  empresaNome: string,
  empresaConfig: EmpresaConfig | null,
): AuditResult[] {
  const dbMap = new Map(dbRows.map(r => [String(r.id_os), r]));
  const startDate       = startOfDay(dateIni);
  const endDate         = endOfDay(dateFim);
  const endDateExtended = addDays(endDate, 10);
  const starkCompany    = companyTypeMatchesStark(empresaNome, empresaConfig);

  return sheetRows.map(row => {
    const db = dbMap.get(row.id);

    const base: Omit<AuditResult, 'status' | 'obs' | 'valorAdj' | 'clienteDB' | 'cidadeDB' | 'tipoIXC' | 'tecnico' | 'statusOS' | 'geraComissao' | 'desconto' | 'valorTabela' | 'valorComissaoAssunto' | 'valorUnitComissaoOS' | 'valorTotalComissaoOS' | 'qtdRegistrosComissao' | 'dataAbertura' | 'dataFin'> = {
      seq:            row.seq,
      id:             row.id,
      cliente:        row.cliente,
      tipoOS:         row.tipoOS,
      statusPlanilha: row.statusPlanilha,
      cidade:         row.cidade,
      colaborador:    row.colaborador,
      dobrada:        row.dobrada,
      dobradaGestorStatus: '',
      valor:          row.valor,
      valorFonte:     row.valorFonte,
      dataEnv:        row.dataEnv ? serializeDate(row.dataEnv) : null,
      valorAdjOriginal: 0,
      valorAdjSemAprovacao: 0,
      obsOriginal:    '',
    };

    if (!db) {
      return {
        ...base,
        clienteDB: '', cidadeDB: '', tipoIXC: '', tecnico: '',
        statusOS: '', geraComissao: '',
        desconto: 0, valorTabela: null,
        valorComissaoAssunto: 0, valorUnitComissaoOS: 0, valorTotalComissaoOS: 0,
        qtdRegistrosComissao: 0,
        dataAbertura: null, dataFin: null,
        valorAdj: 0,
        status: 'PENDENTE',
        obs: 'OS nao encontrada no banco de dados',
      };
    }

    const dataFin       = parseDateInput(db.data_fechamento);
    const statusOS      = stripStr(db.status_os);
    const geraComissao  = stripStr(db.gera_comissao) || 'S';
    const desconto      = parsePercent(db.su_oss_chamado_comissao);
    const improdutiva   = isImprodutivaService(row.tipoOS) || isImprodutivaService(db.servico);
    const manterValor   = improdutiva || (row.dobrada && row.valor > 0);
    const manutCompat   = isMaintenanceSubtypeMatch(row.tipoOS, db.servico);
    const pagarExtMaint = shouldPayExternalMaintenance(row.tipoOS, db.servico);
    const starkServicoCompat = starkCompany && isStarkServiceMatch(row.tipoOS, db.servico);
    const servicoDiverg = !starkServicoCompat && !improdutiva && !manutCompat && !pagarExtMaint
      && Boolean(row.tipoOS) && Boolean(db.servico)
      && normalizeService(row.tipoOS) !== normalizeService(db.servico);

    const tipoParaTabela = improdutiva ? null
      : pagarExtMaint ? 'MANUTENCAO_EXTERNA'
      : manutCompat   ? row.tipoOS
      : servicoDiverg ? db.servico
      : (db.servico || row.tipoOS);

    const valorTabela = tipoParaTabela ? getPrecoServico(empresaConfig, tipoParaTabela) : null;

    const dbPartial = {
      clienteDB: stripStr(db.cliente_nome),
      cidadeDB:  stripStr(db.cidade_nome),
      tipoIXC:   stripStr(db.servico),
      tecnico:   stripStr(db.tecnico),
      statusOS,
      geraComissao,
      desconto,
      valorTabela,
      valorComissaoAssunto: parseMoney(db.valor_comissao_assunto),
      valorUnitComissaoOS:  parseMoney(db.valor_unit_comissao_os),
      valorTotalComissaoOS: parseMoney(db.valor_total_comissao_os),
      qtdRegistrosComissao: Number(db.qtd_registros_comissao) || 0,
      dataAbertura:         serializeDate(db.data_abertura),
      dataFin:              serializeDate(dataFin),
    };

    if (!dataFin || statusOS !== 'F') {
      return {
        ...base, ...dbPartial,
        valorAdj: 0,
        status: 'PENDENTE',
        obs: dataFin
          ? `OS localizada no banco com status ${statusOS} e ainda nao finalizada para comissao`
          : `OS localizada no banco com status ${statusOS || 'sem status'} e sem data de finalizacao`,
      };
    }

    const insideQuinzena  = startDate && endDate ? dataFin >= startDate && dataFin <= endDate : true;
    const insideExtension = !insideQuinzena && endDate && endDateExtended
      ? dataFin > endDate && dataFin <= endDateExtended : false;

    if (!insideQuinzena) {
      return {
        ...base, ...dbPartial,
        valorAdj: 0,
        status: 'FORA_QUINZENA',
        obs: insideExtension
          ? `Finalizada em ${dataFin.toLocaleDateString('pt-BR')} - sera paga na proxima quinzena (janela de 10 dias)`
          : `Finalizada em ${dataFin.toLocaleDateString('pt-BR')} - fora da quinzena e alem da janela de 10 dias`,
      };
    }

    const valorBase = manterValor ? row.valor : (valorTabela != null ? valorTabela : row.valor);
    const valorAdj  = manterValor ? valorBase  : valorBase * (1 - desconto / 100);

    const divergencias: string[] = [];
    const auditorias:   string[] = [];
    const infos:        string[] = [];

    if (servicoDiverg) {
      if (row.dobrada && row.valor > 0) {
        auditorias.push(`Servico divergente: terceirizada "${row.tipoOS}" / banco "${stripStr(db.servico)}" | OS marcada como DOBRADA, mantido valor solicitado ${row.valor.toFixed(2)}`);
      } else if (valorTabela != null) {
        auditorias.push(`Servico divergente: pago pelo assunto do banco "${stripStr(db.servico)}" conforme tabela da terceirizada (${valorTabela.toFixed(2)})`);
      } else {
        divergencias.push(`Servico divergente: terceirizada "${row.tipoOS}" / banco "${stripStr(db.servico)}"`);
      }
    }

    if (row.cliente && db.cliente_nome && !textMatches(row.cliente, db.cliente_nome)) {
      auditorias.push(`Cliente divergente: terceirizada "${row.cliente}" / banco "${stripStr(db.cliente_nome)}"`);
    }

    if (row.cidade && db.cidade_nome && !textMatches(row.cidade, db.cidade_nome)) {
      divergencias.push(`Cidade divergente: terceirizada "${row.cidade}" / banco "${stripStr(db.cidade_nome)}"`);
    }

    if (row.dataEnv && !sameDay(row.dataEnv, dataFin)) {
      auditorias.push(`Data divergente: terceirizada ${row.dataEnv.toLocaleDateString('pt-BR')} / banco ${dataFin.toLocaleDateString('pt-BR')}`);
    }

    if (pagarExtMaint && valorTabela != null) {
      auditorias.push(`Instalacao na terceirizada e manutencao no banco: pago pela tabela de manutencao externa (${valorTabela.toFixed(2)})`);
    }

    if (empresaNome && !empresaConfig && db.tecnico && !textMatches(empresaNome, db.tecnico)) {
      auditorias.push(`Tecnico divergente: informado "${empresaNome}" / banco "${stripStr(db.tecnico)}"`);
    }

    if (!manterValor && !manutCompat && !servicoDiverg && valorTabela != null && Math.abs(row.valor - valorTabela) > 0.01) {
      auditorias.push(`Valor enviado ${row.valor.toFixed(2)} difere da tabela da empresa ${valorTabela.toFixed(2)}`);
    }

    if ((Number(db.qtd_registros_comissao) || 0) > 1) {
      auditorias.push(`OS possui ${db.qtd_registros_comissao} registros de comissao no banco`);
    }

    if (!manterValor && desconto > 0) {
      const deducao = valorBase - valorAdj;
      auditorias.push(`Desconto ${desconto.toFixed(0)}% no banco: ${valorBase.toFixed(2)} - ${deducao.toFixed(2)} = ${valorAdj.toFixed(2)}`);
    }

    if (row.valorFonte === 'config' && Math.abs(valorBase - row.valor) < 0.01) {
      auditorias.push('Valor preenchido automaticamente pela tabela da empresa');
    }

    if (improdutiva)             auditorias.push('Servico improdutiva: mantido o valor enviado na planilha');
    if (row.dobrada && row.valor > 0) auditorias.push('OS marcada como DOBRADA na planilha: mantido o valor solicitado pela terceirizada');

    if (dataFin.getDay() === 0) infos.push('Plantao de domingo');

    const status: AuditResult['status'] = divergencias.length ? 'DIVERGENCIA' : auditorias.length ? 'AUDITORIA' : 'OK';

    return {
      ...base, ...dbPartial,
      valorAdj,
      status,
      obs: [...divergencias, ...auditorias, ...infos].join(' | '),
    };
  });
}

// ── Ponto de entrada: auditar planilha ──────────────────────

export async function auditarPlanilha(params: {
  rows: SheetRow[];
  dateIni: Date | null;
  dateFim: Date | null;
  empresaNome: string;
  companyType: string;
  empresaConfig: EmpresaConfig | null;
}): Promise<AuditResult[]> {
  const { rows, dateIni, dateFim, empresaNome, companyType, empresaConfig } = params;

  const starkMode = companyType === 'STARK'
    || isStarkCompanyName(empresaNome)
    || rows.some(r => stripStr(r.statusPlanilha));

  const effectiveRows = starkMode
    ? rows.map(row => {
      if ((Number(row.valor) || 0) > 0) return row;
      const starkPrice = getStarkStatusPrice(empresaConfig, row.statusPlanilha);
      if (starkPrice == null || starkPrice <= 0) return row;
      return { ...row, valor: starkPrice, valorFonte: 'config' };
    })
    : rows;

  const dbRows = await fetchOsDetails(parseIds(effectiveRows.map(r => r.id)));

  const baseResults = compareRowsWithDatabase(effectiveRows, dbRows, dateIni, dateFim, empresaNome, empresaConfig);

  if (!starkMode) return baseResults;

  const starkSupportIds = parseIds(
    effectiveRows
      .filter(r => isStarkTentativaStatus(r.statusPlanilha) || isStarkSuccessStatus(r.statusPlanilha))
      .map(r => r.id),
  );
  const starkAttemptData = await fetchStarkAttemptData(starkSupportIds);

  return compareStarkRows(effectiveRows, dbRows, baseResults, dateIni, dateFim, empresaConfig, starkAttemptData);
}
