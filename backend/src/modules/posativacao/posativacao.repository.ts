import mysqlPool from '../../config/mysql';
import {
  FiltrosPosAtivacao, FiltrosClientesPosAtivacao,
  PosAtivacaoKpis, PosAtivacaoMotivo, PosAtivacaoDistribuicaoFaixa, PosAtivacaoTendenciaSemana,
  PosAtivacaoChurn, PosAtivacaoTecnico, PosAtivacaoClienteResumo, PosAtivacaoClientesPagina, PosAtivacaoContato,
  PosAtivacaoFatoCliente, PosAtivacaoBairro, PosAtivacaoCanal, PosAtivacaoSlaFaixa, TICKET_STATUS_LABEL,
} from './posativacao.types';

/// Módulo portado do sistema Flask original (/home/canaa/Campo/app.py, porta
/// 5009) — mesma conexão MariaDB IXC já usada em diagnostico.repository.ts
/// (mysqlPool), nenhuma credencial nova. Lógica de negócio (janelas, filtros
/// de assunto) mantida IDÊNTICA ao original, exceto o fix documentado em
/// buscarChurn() (sentinela de data errado no código original).

const JANELAS_VALIDAS = [30, 60, 90] as const;

function normalizarJanela(janela?: number): number {
  return janela && (JANELAS_VALIDAS as readonly number[]).includes(janela) ? janela : 30;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/// mysql2 devolve DATE/DATETIME como Date já interpretado no fuso LOCAL do
/// processo (America/Sao_Paulo aqui, sem `timezone` custom no pool) — usar
/// toISOString()/getUTC* deslocaria a hora armazenada. Getters locais
/// (getFullYear/getHours/...) reproduzem o valor exato que veio do banco.
function fmtDataMysql(valor: unknown): string | null {
  if (!valor) return null;
  const d = valor as Date;
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/// Mesma lógica, preservando hora:minuto:segundo — pra colunas DATETIME de
/// verdade (data_criacao de ticket), onde só a data sem hora perderia
/// informação que o sistema original expõe.
function fmtDataHoraMysql(valor: unknown): string | null {
  if (!valor) return null;
  const d = valor as Date;
  if (isNaN(d.getTime())) return null;
  return `${fmtDataMysql(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// ── Filtros de ativação — alinhados com o script IXC de referência (mesmo
// critério do sistema original: exclui pendente e cliente de teste, só
// considera instalação/mudança de endereço) ──
const BASE_WHERE = `
  cc.motivo_inclusao IN ('I','M')
  AND cc.data_ativacao >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
  AND cc.data_ativacao <= CURDATE()
  AND cc.status <> 'P'
  AND cc.data_ativacao IS NOT NULL
  AND c.razao NOT LIKE '%TESTE%'
`;

const BASE_WHERE_PREV = `
  cc.motivo_inclusao IN ('I','M')
  AND cc.data_ativacao >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
  AND cc.data_ativacao <  DATE_SUB(CURDATE(), INTERVAL ? DAY)
  AND cc.status <> 'P'
  AND cc.data_ativacao IS NOT NULL
  AND c.razao NOT LIKE '%TESTE%'
`;

// ── Exclusões de tickets internos (agendamento/reagendamento/falta de
// interação/atraso de rota) — não é reclamação real do cliente, é ruído
// logístico interno ──
const EXCLUSOES_ASSUNTO = `
  AND a2.assunto NOT LIKE '%AGENDAMENTO%SERVI%'
  AND a2.assunto NOT LIKE '%REAGENDAMENTO%SERVI%'
  AND a2.assunto NOT LIKE '%FALTA DE INTERA%'
  AND a2.assunto NOT LIKE '%ATRASO%AGENDA%'
  AND a2.assunto NOT LIKE '%ATRASO%ROTA%'
`;

/// Condição de ativação usada só por buscarClientes/buscarClientesExport —
/// normalmente a janela rolante (BASE_WHERE, preso a "hoje"), mas quando o
/// gestor escolhe um período ABSOLUTO de ativação (mês ou dia específico,
/// ex: "quero ver quem ativou em maio", fora do alcance de qualquer janela
/// de 90 dias a partir de hoje), essa condição substitui a janela por
/// inteiro pra essa consulta. KPIs/gráficos do topo da aba (compartilhados
/// com a aba Governança) continuam sempre presos à janela — não fazem parte
/// desse filtro.
function whereAtivacao(filtros: FiltrosClientesPosAtivacao): { sql: string; params: (string | number)[] } {
  if (filtros.dataAtivacaoInicio && filtros.dataAtivacaoFim) {
    return {
      sql: `
        cc.motivo_inclusao IN ('I','M')
        AND cc.data_ativacao >= ?
        AND cc.data_ativacao <= ?
        AND cc.status <> 'P'
        AND cc.data_ativacao IS NOT NULL
        AND c.razao NOT LIKE '%TESTE%'
      `,
      params: [`${filtros.dataAtivacaoInicio} 00:00:00`, `${filtros.dataAtivacaoFim} 23:59:59`],
    };
  }
  return { sql: BASE_WHERE, params: [normalizarJanela(filtros.janela)] };
}

/// Monta o LEFT JOIN de su_ticket dentro da janela de 30 dias pós-ativação,
/// já excluindo ruído logístico — mesma função build_ticket_join() do
/// sistema original.
function joinTicket(filtroAssunto?: string): { sql: string; params: string[] } {
  const condAssunto = filtroAssunto ? 'AND a2.assunto = ?' : '';
  const sql = `
    LEFT JOIN su_ticket t
        ON  t.id_cliente   = cc.id_cliente
        AND t.data_criacao >= cc.data_ativacao
        AND t.data_criacao <  DATE_ADD(cc.data_ativacao, INTERVAL 30 DAY)
        AND t.id_assunto IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM su_oss_assunto a2
            WHERE a2.id = t.id_assunto
              ${EXCLUSOES_ASSUNTO}
              ${condAssunto}
        )
  `;
  return { sql, params: filtroAssunto ? [filtroAssunto] : [] };
}

export async function buscarKpis(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoKpis> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();

  const [avRows]: any = await mysqlPool.query(
    `SELECT COUNT(DISTINCT cc.id) AS total,
            SUM(cc.motivo_inclusao='I') AS inst,
            SUM(cc.motivo_inclusao='M') AS mud
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     WHERE ${BASE_WHERE}`,
    [janela],
  );
  const av = avRows[0];

  const [ctRows]: any = await mysqlPool.query(
    `SELECT COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN cc.id_cliente END) AS com,
            COUNT(t.id) AS tot
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     WHERE ${BASE_WHERE}`,
    [...jp, janela],
  );
  const ct = ctRows[0];

  const [medRows]: any = await mysqlPool.query(
    `SELECT AVG(d) AS media FROM (
        SELECT DATEDIFF(MIN(t.data_criacao), cc.data_ativacao) AS d
        FROM cliente_contrato cc
        JOIN cliente c ON c.id = cc.id_cliente
        ${tj}
        WHERE ${BASE_WHERE}
          AND t.id IS NOT NULL
        GROUP BY cc.id_cliente, cc.data_ativacao
     ) sub`,
    [...jp, janela],
  );
  const med = medRows[0]?.media;

  const [prevRows]: any = await mysqlPool.query(
    `SELECT COUNT(DISTINCT cc.id) AS total,
            COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN cc.id_cliente END) AS com,
            COUNT(t.id) AS tot
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     WHERE ${BASE_WHERE_PREV}`,
    [...jp, janela * 2, janela],
  );
  const prev = prevRows[0];

  const total   = Number(av.total || 0);
  const com     = Number(ct.com || 0);
  const pct     = total ? Math.round((com / total) * 1000) / 10 : 0;
  const pTotal  = Number(prev.total || 0);
  const pCom    = Number(prev.com || 0);
  const pPct    = pTotal ? Math.round((pCom / pTotal) * 1000) / 10 : 0;

  function delta(curr: number, prevVal: number): number | null {
    if (prevVal === 0) return null;
    return Math.round(((curr - prevVal) / prevVal) * 1000) / 10;
  }

  return {
    total, instalacoes: Number(av.inst || 0), mudancas: Number(av.mud || 0),
    comContato: com, semContato: total - com, pct,
    totalContatos: Number(ct.tot || 0),
    mediaDias: med ? Math.round(Number(med) * 10) / 10 : 0,
    janela,
    deltaTotal:   delta(total, pTotal),
    deltaPct:     pTotal ? Math.round((pct - pPct) * 10) / 10 : null,
    deltaTickets: delta(Number(ct.tot || 0), Number(prev.tot || 0)),
    prevTotal: pTotal, prevPct: pPct,
  };
}

export async function buscarMotivos(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoMotivo[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT a2.assunto, COUNT(t.id) AS qtd
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     JOIN su_oss_assunto a2 ON a2.id = t.id_assunto
     WHERE ${BASE_WHERE}
       AND t.id IS NOT NULL
     GROUP BY a2.assunto
     ORDER BY qtd DESC LIMIT 12`,
    [...jp, janela],
  );
  return rows.map((r: any) => ({ assunto: r.assunto, qtd: Number(r.qtd) }));
}

export async function buscarDistribuicao(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoDistribuicaoFaixa[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT
        CASE
            WHEN d=0                THEN 'Dia 0'
            WHEN d BETWEEN 1 AND 3   THEN '1–3 dias'
            WHEN d BETWEEN 4 AND 7   THEN '4–7 dias'
            WHEN d BETWEEN 8 AND 14  THEN '8–14 dias'
            WHEN d BETWEEN 15 AND 21 THEN '15–21 dias'
            ELSE '22–30 dias'
        END AS faixa, COUNT(*) AS qtd
     FROM (
        SELECT DATEDIFF(MIN(t.data_criacao), cc.data_ativacao) AS d
        FROM cliente_contrato cc
        JOIN cliente c ON c.id = cc.id_cliente
        ${tj}
        WHERE ${BASE_WHERE}
          AND t.id IS NOT NULL
        GROUP BY cc.id_cliente, cc.data_ativacao
     ) sub
     GROUP BY faixa
     ORDER BY FIELD(faixa,'Dia 0','1–3 dias','4–7 dias','8–14 dias','15–21 dias','22–30 dias')`,
    [...jp, janela],
  );
  return rows.map((r: any) => ({ faixa: r.faixa, qtd: Number(r.qtd) }));
}

export async function buscarTendencia(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoTendenciaSemana[]> {
  const janela = normalizarJanela(filtros.janela);
  const semanas = { 30: 13, 60: 20, 90: 26 }[janela] ?? 13;
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT
        YEARWEEK(cc.data_ativacao, 1)          AS semana,
        DATE(MIN(cc.data_ativacao))             AS inicio,
        COUNT(DISTINCT cc.id)                   AS ativacoes,
        COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN cc.id END) AS com_contato
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     WHERE cc.motivo_inclusao IN ('I','M')
       AND cc.status <> 'P'
       AND cc.data_ativacao IS NOT NULL
       AND c.razao NOT LIKE '%TESTE%'
       AND cc.data_ativacao >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
       AND cc.data_ativacao <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY semana ORDER BY semana`,
    [...jp, semanas],
  );
  return rows.map((r: any) => {
    const a = Number(r.ativacoes), ct = Number(r.com_contato);
    return {
      semana: String(r.semana), inicio: fmtDataMysql(r.inicio) ?? '',
      ativacoes: a, comContato: ct,
      taxa: a ? Math.round((ct / a) * 1000) / 10 : 0,
    };
  });
}

/// Correlação entre contato pós-ativação e cancelamento do contrato — fonte:
/// cliente_contrato.data_cancelamento. Janela: contratos ativados entre 30 e
/// 365 dias atrás (a janela de 30d já precisa estar encerrada pra saber se
/// teve contato ou não). Exclui id_assunto=313 na própria data de ativação
/// (mesma regra do Power BI, ver sistema original).
///
/// FIX vs o sistema original: o código Python comparava
/// `data_cancelamento <> '0001-01-01'` pra detectar "nunca cancelado" — mas
/// o sentinela REAL de contrato nunca cancelado, confirmado direto no banco
/// (2026-07-13), é `1899-11-30 03:06:28`, não `0001-01-01`. O resultado do
/// sistema original não quebrava por acaso (a segunda condição,
/// `data_cancelamento > data_ativacao`, já filtra contrato ativo sozinha,
/// já que 1899 nunca é maior que a data de ativação) — mas aqui comparamos
/// direto contra `data_ativacao`, sem depender de nenhum literal de data.
export async function buscarChurn(): Promise<PosAtivacaoChurn> {
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT
        SUM(CASE WHEN com_contato=1 AND cancelou=1 THEN 1 ELSE 0 END) AS cc_cancel,
        SUM(CASE WHEN com_contato=1                THEN 1 ELSE 0 END) AS cc_total,
        SUM(CASE WHEN com_contato=0 AND cancelou=1 THEN 1 ELSE 0 END) AS sc_cancel,
        SUM(CASE WHEN com_contato=0                THEN 1 ELSE 0 END) AS sc_total
     FROM (
        SELECT cc.id,
            CASE WHEN COUNT(t.id) > 0 THEN 1 ELSE 0 END AS com_contato,
            CASE WHEN cc.data_cancelamento IS NOT NULL
                      AND cc.data_cancelamento > cc.data_ativacao
                 THEN 1 ELSE 0 END AS cancelou
        FROM cliente_contrato cc
        JOIN cliente c ON c.id = cc.id_cliente
        ${tj}
        WHERE cc.motivo_inclusao IN ('I','M')
          AND cc.data_ativacao >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
          AND cc.data_ativacao <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          AND cc.data_ativacao IS NOT NULL
          AND c.razao NOT LIKE '%TESTE%'
          AND NOT EXISTS (
              SELECT 1 FROM su_oss_chamado os
              WHERE os.id_cliente = cc.id_cliente
                AND os.id_assunto = 313
                AND DATE(os.data_abertura) = cc.data_ativacao
          )
        GROUP BY cc.id, cc.id_cliente, cc.data_cancelamento, cc.data_ativacao
     ) sub`,
    jp,
  );
  const r = rows[0];
  const ccT = Number(r.cc_total || 0), ccC = Number(r.cc_cancel || 0);
  const scT = Number(r.sc_total || 0), scC = Number(r.sc_cancel || 0);
  return {
    comContatoTotal: ccT, comContatoCancelou: ccC,
    semContatoTotal: scT, semContatoCancelou: scC,
    taxaChurnCom: ccT ? Math.round((ccC / ccT) * 1000) / 10 : 0,
    taxaChurnSem: scT ? Math.round((scC / scT) * 1000) / 10 : 0,
  };
}

/// Técnico responsável pela instalação mais recente do cliente — ranking de
/// quantos contatos pós-ativação cada um "gerou", accountability de campo.
export async function buscarTecnicos(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoTecnico[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT f.funcionario AS tecnico,
            COUNT(DISTINCT cc.id_cliente) AS clientes,
            COUNT(t.id) AS qtd
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     JOIN (
         SELECT oc.id_cliente,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(oc.id_tecnico ORDER BY oc.id DESC), ',', 1
                ) AS id_tecnico
         FROM su_oss_chamado oc
         JOIN su_oss_assunto a ON a.id = oc.id_assunto
         WHERE (a.assunto LIKE '%INSTALA%INTERNET%'
                OR a.assunto = 'INSTALACAO INTERNET'
                OR a.assunto = '0.1.1 INSTALACAO DE INTERNET')
           AND oc.id_tecnico > 0
         GROUP BY oc.id_cliente
     ) inst ON inst.id_cliente = cc.id_cliente
     JOIN funcionarios f ON f.id = inst.id_tecnico
     ${tj}
     WHERE ${BASE_WHERE}
       AND t.id IS NOT NULL
     GROUP BY f.funcionario
     ORDER BY qtd DESC LIMIT 10`,
    [...jp, janela],
  );
  return rows.map((r: any) => ({ tecnico: r.tecnico, clientes: Number(r.clientes), qtd: Number(r.qtd) }));
}

function mapearLinhaCliente(r: any): PosAtivacaoClienteResumo {
  return {
    contratoId:      r.contrato_id,
    idCliente:       r.id_cliente,
    nome:            r.nome,
    telefone:        r.telefone_celular || r.fone || null,
    dataAtivacao:    fmtDataMysql(r.data_ativacao),
    motivoInclusao:  r.motivo_inclusao,
    totalContatos:   Number(r.total_contatos),
    primeiroContato: fmtDataHoraMysql(r.primeiro_contato),
    diasPrimeiro:    r.dias_primeiro !== null ? Number(r.dias_primeiro) : null,
  };
}

export async function buscarClientes(filtros: FiltrosClientesPosAtivacao): Promise<PosAtivacaoClientesPagina> {
  const page     = Math.max(1, filtros.page ?? 1);
  const perPage  = 25;
  const offset   = (page - 1) * perPage;
  const soContato   = !!filtros.soContato;
  const busca       = (filtros.busca ?? '').trim();
  const minTickets  = Math.max(0, filtros.minTickets ?? 0);

  const { sql: tj, params: jp } = joinTicket(filtros.assunto);
  const { sql: whereAtiv, params: wp } = whereAtivacao(filtros);
  let extraWhere = '';
  const extraParams: string[] = [];
  if (busca) {
    extraWhere = ' AND c.razao LIKE ?';
    extraParams.push(`%${busca}%`);
  }

  let having = '';
  if (minTickets > 0) having = `HAVING COUNT(t.id) >= ${minTickets}`;
  else if (soContato) having = 'HAVING COUNT(t.id) > 0';

  const baseParams = [...jp, ...wp, ...extraParams];

  const [rows]: any = await mysqlPool.query(
    `SELECT cc.id AS contrato_id, cc.id_cliente,
            c.razao AS nome, c.telefone_celular, c.fone,
            cc.data_ativacao, cc.motivo_inclusao,
            COUNT(t.id)                               AS total_contatos,
            MIN(t.data_criacao)                       AS primeiro_contato,
            DATEDIFF(MIN(t.data_criacao), cc.data_ativacao) AS dias_primeiro
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     WHERE ${whereAtiv}
     ${extraWhere}
     GROUP BY cc.id, cc.id_cliente, c.razao, c.telefone_celular,
              c.fone, cc.data_ativacao, cc.motivo_inclusao
     ${having}
     ORDER BY total_contatos DESC, cc.data_ativacao DESC
     LIMIT ? OFFSET ?`,
    [...baseParams, perPage, offset],
  );

  const [cntRows]: any = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM (
        SELECT cc.id
        FROM cliente_contrato cc
        JOIN cliente c ON c.id = cc.id_cliente
        ${tj}
        WHERE ${whereAtiv}
        ${extraWhere}
        GROUP BY cc.id
        ${having}
     ) sub`,
    baseParams,
  );
  const total = Number(cntRows[0].total);

  const linhas: PosAtivacaoClienteResumo[] = rows.map(mapearLinhaCliente);

  return { linhas, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

/// Mesma consulta de buscarClientes, sem paginação — usado só pelo export
/// CSV (mesmo comportamento do endpoint /api/clientes/export original).
export async function buscarClientesExport(filtros: FiltrosClientesPosAtivacao): Promise<PosAtivacaoClienteResumo[]> {
  const soContato    = !!filtros.soContato;
  const busca        = (filtros.busca ?? '').trim();
  const minTickets   = Math.max(0, filtros.minTickets ?? 0);

  const { sql: tj, params: jp } = joinTicket(filtros.assunto);
  const { sql: whereAtiv, params: wp } = whereAtivacao(filtros);
  let extraWhere = '';
  const extraParams: string[] = [];
  if (busca) {
    extraWhere = ' AND c.razao LIKE ?';
    extraParams.push(`%${busca}%`);
  }

  let having = '';
  if (minTickets > 0) having = `HAVING COUNT(t.id) >= ${minTickets}`;
  else if (soContato) having = 'HAVING COUNT(t.id) > 0';

  const [rows]: any = await mysqlPool.query(
    `SELECT cc.id AS contrato_id, cc.id_cliente,
            c.razao AS nome, c.telefone_celular, c.fone,
            cc.data_ativacao, cc.motivo_inclusao,
            COUNT(t.id)                               AS total_contatos,
            MIN(t.data_criacao)                       AS primeiro_contato,
            DATEDIFF(MIN(t.data_criacao), cc.data_ativacao) AS dias_primeiro
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     WHERE ${whereAtiv}
     ${extraWhere}
     GROUP BY cc.id, cc.id_cliente, c.razao, c.telefone_celular,
              c.fone, cc.data_ativacao, cc.motivo_inclusao
     ${having}
     ORDER BY total_contatos DESC, cc.data_ativacao DESC`,
    [...jp, ...wp, ...extraParams],
  );
  return rows.map(mapearLinhaCliente);
}

export async function buscarContatosCliente(idCliente: number, filtros: FiltrosPosAtivacao): Promise<PosAtivacaoContato[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  // id_ticket em su_oss_chamado é o vínculo direto com o ticket que gerou a O.S.
  const [rows]: any = await mysqlPool.query(
    `SELECT
        t.id            AS ticket_id,
        t.data_criacao,
        t.status,
        t.protocolo,
        a2.assunto,
        DATEDIFF(t.data_criacao, cc.data_ativacao) AS dias_apos,
        LEFT(t.menssagem, 200)                     AS ticket_msg,
        oc.id           AS os_id,
        a3.assunto      AS os_assunto,
        oc.status       AS os_status,
        LEFT(oc.mensagem, 200)                     AS os_msg,
        LEFT(oc.mensagem_resposta, 200)             AS os_resposta
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     JOIN su_oss_assunto a2 ON a2.id = t.id_assunto
     LEFT JOIN su_oss_chamado oc ON oc.id_ticket = t.id
     LEFT JOIN su_oss_assunto a3 ON a3.id = oc.id_assunto
     WHERE cc.id_cliente = ?
       AND ${BASE_WHERE}
       AND t.id IS NOT NULL
     GROUP BY t.id, t.data_criacao, t.status, t.protocolo,
              a2.assunto, t.menssagem,
              oc.id, a3.assunto, oc.status, oc.mensagem, oc.mensagem_resposta
     ORDER BY t.data_criacao`,
    [...jp, idCliente, janela],
  );
  return rows.map((r: any) => ({
    ticketId:    r.ticket_id,
    dataCriacao: fmtDataHoraMysql(r.data_criacao),
    status:      r.status,
    statusLabel: TICKET_STATUS_LABEL[r.status] ?? r.status,
    protocolo:   r.protocolo,
    assunto:     r.assunto,
    diasApos:    r.dias_apos !== null ? Number(r.dias_apos) : 0,
    ticketMsg:   r.ticket_msg,
    osId:        r.os_id,
    osAssunto:   r.os_assunto,
    osStatus:    r.os_status,
    osMsg:       r.os_msg,
    osResposta:  r.os_resposta,
  }));
}

/// Fato resumido de pós-ativação pra UM cliente — usado pelo Diagnóstico
/// (contexto por cliente, ver diagnostico.repository.ts) e pela fonte do
/// CAIO. A janela de 30 dias aqui é sobre QUANDO o contato aconteceu em
/// relação à ativação (definição de "pós-ativação", igual ao resto do
/// módulo) — não sobre quão recente é a ativação em si: um contrato ativado
/// há 6 meses que teve contato nos primeiros 30 dias continua sendo um fato
/// relevante hoje.
///
/// `idsContratoAtivos` (mesmo Set já calculado em montarContextoCliente,
/// diagnostico.service.ts) prioriza o contrato VIGENTE quando o cliente tem
/// mais de um — mesma disciplina de buscarOrdensServico/buscarAtendimentos,
/// pra não repetir a mistura de contrato corrigida nesta mesma sessão.
export async function buscarFatoPosAtivacaoCliente(idCliente: number, idsContratoAtivos: Set<string>): Promise<PosAtivacaoFatoCliente | null> {
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT cc.id AS contrato_id, cc.data_ativacao,
            COUNT(t.id) AS total_contatos,
            MIN(t.data_criacao) AS primeiro_contato,
            DATEDIFF(MIN(t.data_criacao), cc.data_ativacao) AS dias_primeiro,
            GROUP_CONCAT(DISTINCT a2.assunto SEPARATOR '|') AS motivos
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     LEFT JOIN su_oss_assunto a2 ON a2.id = t.id_assunto
     WHERE cc.id_cliente = ?
       AND cc.motivo_inclusao IN ('I','M')
       AND cc.status <> 'P'
       AND cc.data_ativacao IS NOT NULL
       AND c.razao NOT LIKE '%TESTE%'
       AND t.id IS NOT NULL
     GROUP BY cc.id, cc.data_ativacao
     ORDER BY cc.data_ativacao DESC`,
    [...jp, idCliente],
  );
  if (!rows.length) return null;

  const linha = rows.find((r: any) => idsContratoAtivos.has(String(r.contrato_id))) ?? rows[0];
  return {
    dataAtivacao:  fmtDataMysql(linha.data_ativacao) ?? '',
    totalContatos: Number(linha.total_contatos),
    diasPrimeiro:  linha.dias_primeiro !== null ? Number(linha.dias_primeiro) : null,
    motivos:       linha.motivos ? String(linha.motivos).split('|') : [],
  };
}

// ── Aba Governança (dados adicionais, mesmas queries do sistema original) ──

export async function buscarBairros(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoBairro[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT TRIM(UPPER(cc.bairro)) AS bairro, COUNT(t.id) AS qtd
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     WHERE ${BASE_WHERE}
       AND t.id IS NOT NULL
       AND cc.bairro IS NOT NULL AND cc.bairro <> ''
     GROUP BY TRIM(UPPER(cc.bairro))
     ORDER BY qtd DESC LIMIT 10`,
    [...jp, janela],
  );
  return rows.map((r: any) => ({ bairro: r.bairro, qtd: Number(r.qtd) }));
}

export async function buscarCanais(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoCanal[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT COALESCE(ca.descricao, 'Não informado') AS canal, COUNT(t.id) AS qtd
     FROM cliente_contrato cc
     JOIN cliente c ON c.id = cc.id_cliente
     ${tj}
     LEFT JOIN su_canal_atendimento ca ON ca.id = t.id_canal_atendimento
     WHERE ${BASE_WHERE}
       AND t.id IS NOT NULL
     GROUP BY canal
     ORDER BY qtd DESC`,
    [...jp, janela],
  );
  return rows.map((r: any) => ({ canal: r.canal, qtd: Number(r.qtd) }));
}

/// Histograma de tempo até finalização (t.status='F') — faixas fixas iguais
/// ao sistema original. O KPI "tempo médio" no frontend é uma APROXIMAÇÃO
/// calculada em cima dessas faixas (ponto médio de cada uma), não uma média
/// exata — mesma metodologia do dashboard original, não é imprecisão nova
/// introduzida aqui.
export async function buscarResolucaoSla(filtros: FiltrosPosAtivacao): Promise<PosAtivacaoSlaFaixa[]> {
  const janela = normalizarJanela(filtros.janela);
  const { sql: tj, params: jp } = joinTicket();
  const [rows]: any = await mysqlPool.query(
    `SELECT
        CASE
            WHEN h <= 4   THEN '≤ 4h'
            WHEN h <= 24  THEN '4–24h'
            WHEN h <= 72  THEN '1–3 dias'
            WHEN h <= 168 THEN '3–7 dias'
            ELSE '> 7 dias'
        END AS faixa,
        COUNT(*) AS qtd
     FROM (
        SELECT TIMESTAMPDIFF(HOUR, t.data_criacao, t.data_ultima_alteracao) AS h
        FROM cliente_contrato cc
        JOIN cliente c ON c.id = cc.id_cliente
        ${tj}
        WHERE ${BASE_WHERE}
          AND t.id IS NOT NULL
          AND t.status = 'F'
          AND t.data_ultima_alteracao IS NOT NULL
          AND TIMESTAMPDIFF(HOUR, t.data_criacao, t.data_ultima_alteracao) >= 0
     ) sub
     GROUP BY faixa
     ORDER BY FIELD(faixa,'≤ 4h','4–24h','1–3 dias','3–7 dias','> 7 dias')`,
    [...jp, janela],
  );
  return rows.map((r: any) => ({ faixa: r.faixa, qtd: Number(r.qtd) }));
}
