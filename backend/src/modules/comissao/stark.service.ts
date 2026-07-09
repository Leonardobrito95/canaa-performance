// ============================================================
// COMISSAO CAMPO — Lógica especial STARK
// ============================================================

import mysqlPool from '../../config/mysql';
import {
  StarkAttemptData,
  StarkMessageEntry,
  StarkFileEntry,
  StarkFinalizationEntry,
  SheetRow,
  AuditResult,
  EmpresaConfig,
} from './comissao.types';
import {
  stripStr,
  normalize,
  parseDateInput,
  startOfDay,
  endOfDay,
  addDays,
  serializeDate,
  parseMoney,
  parsePercent,
  sameDay,
  isDateWithinRange,
  textMatches,
  normalizeService,
  getPrecoServicoPorChave,
} from './comissao.utils';

// ── Helpers STARK ─────────────────────────────────────────────

export function isStarkCompanyName(value: unknown): boolean {
  return normalize(value).includes('STARK');
}

export function isStarkTentativaStatus(value: unknown): boolean {
  return normalize(value).includes('TENTATIVA');
}

export function isStarkAttemptMessageStatus(value: unknown): boolean {
  const status = normalize(value);
  return status === 'RAG' || status === 'AG';
}

export function isStarkSuccessStatus(value: unknown): boolean {
  const status = normalize(value);
  return status.includes('RETIRADA') && status.includes('SUCESSO');
}

function isStarkExpressCollaborator(value: unknown): boolean {
  return normalize(value).includes('STARK EXPRESS');
}

const STARK_VALIDADOR_NOME = normalize(process.env.STARK_VALIDADOR_NOME || 'VALIDADOR STARK');
const STARK_VALIDADOR_NOME_COMPLETO = process.env.STARK_VALIDADOR_NOME_COMPLETO || 'VALIDADOR STARK (NAO CONFIGURADO)';

function isDaviMoraesCollaborator(value: unknown): boolean {
  return normalize(value).includes(STARK_VALIDADOR_NOME);
}

function isStarkSuccessCollaboratorMatch(expected: unknown, actual: unknown): boolean {
  if (textMatches(expected, actual)) return true;
  return isStarkExpressCollaborator(expected) && isDaviMoraesCollaborator(actual);
}

function getStarkServiceKey(value: unknown): string {
  const text = normalize(value);
  if (!text) return '';
  if (text.includes('COLETA') || text.includes('PONTO DE INTERNET') || text.includes('RETIRADA')) return 'RETIRADA_STARK';
  return '';
}

export function isStarkServiceMatch(rowTipo: unknown, bancoTipo: unknown): boolean {
  const rowKey = getStarkServiceKey(rowTipo);
  const bancoKey = getStarkServiceKey(bancoTipo);
  return Boolean(rowKey) && rowKey === bancoKey;
}

export function getStarkStatusPrice(empresaConfig: EmpresaConfig | null, statusPlanilha: unknown): number | null {
  const status = normalize(statusPlanilha);
  if (status.includes('TENTATIVA')) return getPrecoServicoPorChave(empresaConfig, 'TENTATIVA_RETIRADA');
  if (status.includes('RETIRADA') && status.includes('SUCESSO')) return getPrecoServicoPorChave(empresaConfig, 'RETIRADA');
  return null;
}

// ── Busca dados de tentativa STARK no MySQL ───────────────────

export async function fetchStarkAttemptData(ids: number[]): Promise<StarkAttemptData> {
  const messageMap = new Map<string, StarkMessageEntry[]>();
  const fileMap = new Map<string, StarkFileEntry[]>();
  const finalizationMap = new Map<string, StarkFinalizationEntry[]>();
  if (!ids.length) return { messageMap, fileMap, finalizationMap };

  const placeholders = ids.map(() => '?').join(',');

  const messageSql = `
    SELECT id_chamado, data, status, historico, mensagem
    FROM su_oss_chamado_mensagem
    WHERE id_chamado IN (${placeholders})
      AND historico LIKE ?
      AND status IN ('RAG', 'AG')
    ORDER BY id_chamado, data DESC
  `;
  const fileSql = `
    SELECT id_oss_chamado, data_envio, nome_arquivo, descricao, classificacao_arquivo, tipo
    FROM su_oss_chamado_arquivos
    WHERE id_oss_chamado IN (${placeholders})
    ORDER BY id_oss_chamado, data_envio DESC
  `;
  const finalizationSql = `
    SELECT m.id_chamado, m.data, m.status, m.historico, m.mensagem,
           COALESCE(ft.funcionario, '') AS colaborador
    FROM su_oss_chamado_mensagem m
      LEFT JOIN funcionarios ft ON ft.id = m.id_tecnico
    WHERE m.id_chamado IN (${placeholders})
      AND m.status = 'F'
    ORDER BY m.id_chamado, m.data DESC
  `;

  const [messageRows] = await mysqlPool.query<any[]>(messageSql, [...ids, `%${STARK_VALIDADOR_NOME}%`]);
  const [fileRows]    = await mysqlPool.query<any[]>(fileSql, ids);
  const [finRows]     = await mysqlPool.query<any[]>(finalizationSql, ids);

  for (const row of messageRows) {
    const key = String(row.id_chamado);
    if (!messageMap.has(key)) messageMap.set(key, []);
    messageMap.get(key)!.push({
      data:      parseDateInput(row.data),
      status:    stripStr(row.status),
      historico: stripStr(row.historico),
      mensagem:  stripStr(row.mensagem),
    });
  }

  for (const row of fileRows) {
    const key = String(row.id_oss_chamado);
    if (!fileMap.has(key)) fileMap.set(key, []);
    fileMap.get(key)!.push({
      dataEnvio:    parseDateInput(row.data_envio),
      nomeArquivo:  stripStr(row.nome_arquivo),
      descricao:    stripStr(row.descricao),
      classificacao: stripStr(row.classificacao_arquivo),
      tipo:         stripStr(row.tipo),
    });
  }

  for (const row of finRows) {
    const key = String(row.id_chamado);
    if (!finalizationMap.has(key)) finalizationMap.set(key, []);
    finalizationMap.get(key)!.push({
      data:       parseDateInput(row.data),
      status:     stripStr(row.status),
      historico:  stripStr(row.historico),
      mensagem:   stripStr(row.mensagem),
      colaborador: stripStr(row.colaborador),
    });
  }

  return { messageMap, fileMap, finalizationMap };
}

// ── Ajuste de linhas DB para serviços STARK ───────────────────

function alignStarkDbRows(sheetRows: SheetRow[], dbRows: any[]): any[] {
  const sheetMap = new Map(sheetRows.map(r => [String(r.id), r]));
  return dbRows.map(row => {
    const sheetRow = sheetMap.get(String(row.id_os));
    if (!sheetRow || !isStarkServiceMatch(sheetRow.tipoOS, row.servico)) return row;
    return { ...row, servico: sheetRow.tipoOS };
  });
}

// ── Comparação STARK (estende a comparação base) ──────────────

export function compareStarkRows(
  sheetRows: SheetRow[],
  dbRows: any[],
  baseResults: AuditResult[],
  dateIni: Date | null,
  dateFim: Date | null,
  empresaConfig: EmpresaConfig | null,
  starkAttemptData: StarkAttemptData,
): AuditResult[] {
  const adjustedDbRows = alignStarkDbRows(sheetRows, dbRows);
  const baseMap = new Map(baseResults.map(r => [String(r.id), r]));
  const dbMap   = new Map(adjustedDbRows.map((r: any) => [String(r.id_os), r]));
  const startDate = startOfDay(dateIni);
  const endDate   = endOfDay(dateFim);
  const endDateExtended = addDays(endDate, 10);

  return sheetRows.map(row => {
    const baseResult = baseMap.get(String(row.id))!;
    const db = dbMap.get(String(row.id));

    // ── Retirada com sucesso ──────────────────────────────────
    if (isStarkSuccessStatus(row.statusPlanilha)) {
      if (!db || !baseResult || ['PENDENTE', 'FORA_QUINZENA'].includes(baseResult.status)) return baseResult;

      const finEntries = starkAttemptData.finalizationMap.get(String(row.id)) ?? [];
      const periodFinEntries = finEntries.filter(e => isDateWithinRange(e.data, startDate, endDate));
      const matchingFin = row.colaborador
        ? periodFinEntries.find(e => isStarkSuccessCollaboratorMatch(row.colaborador, e.colaborador))
        : null;

      const obsParts = baseResult.obs ? baseResult.obs.split(' | ').filter(Boolean) : [];

      if (!row.colaborador) {
        obsParts.push('Retirada STARK sem colaborador informado na planilha para validar a finalizacao');
        return {
          ...baseResult,
          tecnico: stripStr(baseResult.tecnico) || stripStr(periodFinEntries[0]?.colaborador),
          status: baseResult.status === 'OK' ? 'AUDITORIA' : baseResult.status,
          obs: obsParts.join(' | '),
        };
      }

      if (!matchingFin) {
        const colIXC = stripStr(periodFinEntries[0]?.colaborador);
        obsParts.push(colIXC
          ? `Retirada STARK finalizada no IXC por "${colIXC}" dentro do periodo filtrado; esperado "${row.colaborador}"`
          : `Retirada STARK sem finalizacao no IXC pelo colaborador "${row.colaborador}" dentro do periodo filtrado`);
        return {
          ...baseResult,
          tecnico: stripStr(baseResult.tecnico) || colIXC,
          valorAdj: 0,
          status: 'DIVERGENCIA',
          obs: obsParts.join(' | '),
        };
      }

      const dataStr = matchingFin.data ? matchingFin.data.toLocaleDateString('pt-BR') : 'data nao informada';
      obsParts.push(`Retirada STARK finalizada por "${matchingFin.colaborador}" em ${dataStr}`);
      return {
        ...baseResult,
        tecnico: stripStr(matchingFin.colaborador) || stripStr(baseResult.tecnico),
        obs: obsParts.join(' | '),
      };
    }

    // ── Tentativa ─────────────────────────────────────────────
    if (!isStarkTentativaStatus(row.statusPlanilha)) return baseResult;

    if (!db) {
      return {
        ...baseResult,
        valorAdj: 0,
        status: 'PENDENTE',
        obs: 'Tentativa STARK sem OS correspondente no banco de dados',
      };
    }

    const tentativaDate   = parseDateInput(row.dataEnv);
    const dataFin         = parseDateInput(db.data_fechamento);
    const statusOS        = stripStr(db.status_os);
    const desconto        = parsePercent(db.su_oss_chamado_comissao);
    const valorTabela     = baseResult?.valorTabela ?? null;
    const valorBase       = row.valor > 0 ? row.valor : (valorTabela != null ? valorTabela : 0);
    const valorAdjCalc    = valorBase * (1 - desconto / 100);

    const finEntries       = starkAttemptData.finalizationMap.get(String(row.id)) ?? [];
    const periodFinEntries = finEntries.filter(e => isDateWithinRange(e.data, startDate, endDate));
    const successFin       = periodFinEntries.find(e => isDaviMoraesCollaborator(e.colaborador));

    const msgEntries       = (starkAttemptData.messageMap.get(String(row.id)) ?? [])
      .filter(e => isStarkAttemptMessageStatus(e.status));
    const periodMsgEntries = msgEntries.filter(e => isDateWithinRange(e.data, startDate, endDate));
    const validationMsg    = periodMsgEntries[0] ?? null;
    const validationDate   = validationMsg?.data ?? tentativaDate;
    const fileEntries      = validationDate
      ? (starkAttemptData.fileMap.get(String(row.id)) ?? []).filter(e => sameDay(e.dataEnvio, validationDate))
      : [];

    const divergencias: string[] = [];
    const auditorias: string[]   = [];
    const infos: string[]        = [];

    const referenceDate   = validationDate ?? dataFin;
    const insideQuinzena  = startDate && endDate && referenceDate
      ? referenceDate >= startDate && referenceDate <= endDate
      : true;
    const insideExtension = !insideQuinzena && endDate && endDateExtended && referenceDate
      ? referenceDate > endDate && referenceDate <= endDateExtended
      : false;

    // Tentativa com sucesso de finalização pelo validador STARK
    if (successFin) {
      const valorRetirada = getPrecoServicoPorChave(empresaConfig, 'RETIRADA');
      const valorBaseSuc  = valorRetirada != null && valorRetirada > 0 ? valorRetirada : valorBase;
      const valorAdjSuc   = valorBaseSuc * (1 - desconto / 100);
      const dataStr       = successFin.data ? successFin.data.toLocaleDateString('pt-BR') : 'data nao informada';
      const obs = [
        `Tentativa STARK reclassificada como retirada com sucesso: OS finalizada por "${successFin.colaborador}" em ${dataStr}`,
        valorRetirada != null && valorRetirada > 0 ? `Pago pela tabela de retirada com sucesso (${valorRetirada.toFixed(2)})` : null,
        desconto > 0 ? `Desconto ${desconto.toFixed(0)}% no banco: ${valorBaseSuc.toFixed(2)} - ${(valorBaseSuc - valorAdjSuc).toFixed(2)} = ${valorAdjSuc.toFixed(2)}` : null,
      ].filter(Boolean).join(' | ');

      return {
        ...baseResult,
        tecnico:    stripStr(successFin.colaborador) || stripStr(baseResult.tecnico),
        valorTabela: valorRetirada != null ? valorRetirada : baseResult.valorTabela,
        valorAdj:   valorAdjSuc,
        status:     'AUDITORIA',
        obs,
      };
    }

    if (!referenceDate) {
      divergencias.push('Tentativa STARK sem data valida para conferencia');
    } else if (!insideQuinzena) {
      const dateStr = referenceDate.toLocaleDateString('pt-BR');
      return {
        ...baseResult,
        valorAdj: 0,
        status:   'FORA_QUINZENA',
        obs: insideExtension
          ? `Tentativa informada em ${dateStr} - sera paga na proxima quinzena (janela de 10 dias)`
          : `Tentativa informada em ${dateStr} - fora da quinzena e alem da janela de 10 dias`,
      };
    }

    if (row.tipoOS && db.servico && !isStarkServiceMatch(row.tipoOS, db.servico) && normalizeService(row.tipoOS) !== normalizeService(db.servico)) {
      divergencias.push(`Servico divergente: terceirizada "${row.tipoOS}" / banco "${stripStr(db.servico)}"`);
    }

    if (row.cliente && db.cliente_nome && !textMatches(row.cliente, db.cliente_nome)) {
      auditorias.push(`Cliente divergente: terceirizada "${row.cliente}" / banco "${stripStr(db.cliente_nome)}"`);
    }

    if (row.cidade && db.cidade_nome && !textMatches(row.cidade, db.cidade_nome)) {
      divergencias.push(`Cidade divergente: terceirizada "${row.cidade}" / banco "${stripStr(db.cidade_nome)}"`);
    }

    if (!tentativaDate && !validationMsg) {
      divergencias.push('Tentativa STARK sem data de fechamento na planilha');
    } else if (!tentativaDate && validationMsg?.data) {
      auditorias.push(`Tentativa STARK sem data valida na planilha: considerada a interacao do IXC em ${validationMsg.data.toLocaleDateString('pt-BR')}`);
    }

    if (!periodMsgEntries.length) {
      divergencias.push(`Tentativa STARK sem interacao de ${STARK_VALIDADOR_NOME_COMPLETO} em aguardando agendamento dentro do periodo filtrado`);
    }

    if (!fileEntries.length) {
      auditorias.push(validationMsg
        ? 'Tentativa STARK sem anexo no IXC na mesma data da interacao validada'
        : 'Tentativa STARK sem anexo no IXC na mesma data informada pela terceirizada');
    }

    if (validationMsg) {
      const label = validationMsg.status === 'RAG' ? 'Reagendada' : 'Agendada';
      infos.push(`Tentativa STARK validada por ${STARK_VALIDADOR_NOME_COMPLETO} em ${label}${validationMsg.data ? ` (${validationMsg.data.toLocaleDateString('pt-BR')})` : ''}`);
    }

    if (validationMsg && fileEntries.length && validationDate) {
      infos.push(`Anexo localizado no IXC em ${validationDate.toLocaleDateString('pt-BR')}`);
    }

    if (dataFin && tentativaDate && !sameDay(dataFin, tentativaDate)) {
      infos.push(`OS finalizada posteriormente em ${dataFin.toLocaleDateString('pt-BR')}`);
    }

    if (desconto > 0) {
      const deducao = valorBase - valorAdjCalc;
      auditorias.push(`Desconto ${desconto.toFixed(0)}% no banco: ${valorBase.toFixed(2)} - ${deducao.toFixed(2)} = ${valorAdjCalc.toFixed(2)}`);
    }

    if (statusOS && !['RAG', 'AG', 'F'].includes(statusOS)) {
      auditorias.push(`Status atual da OS no banco: ${statusOS}`);
    }

    if (dataFin && dataFin.getDay() === 0) {
      infos.push('Plantao de domingo');
    }

    const status = divergencias.length ? 'DIVERGENCIA' : auditorias.length ? 'AUDITORIA' : 'OK';

    return {
      ...baseResult,
      tecnico:    stripStr(baseResult.tecnico) || (validationMsg ? STARK_VALIDADOR_NOME_COMPLETO : ''),
      geraComissao: stripStr(db.gera_comissao) || 'S',
      valorAdj:   divergencias.length ? 0 : valorAdjCalc,
      status,
      obs: [...divergencias, ...auditorias, ...infos].join(' | '),
    };
  });
}
