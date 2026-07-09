import axios from 'axios';
import mysqlPool from '../../config/mysql';
import prisma from '../../config/prisma';
import logger from '../../config/logger';
import { buscarArquivoBinario } from '../../config/ixcSession';
import {
  HistoricoSinalEntry,
  OsEntry,
  OsMensagemEntry,
  OsArquivoEntry,
  ContextoComercial,
  ImagemAnexo,
  OscilacaoRede,
} from './diagnostico.types';

const OTDR_BASE = process.env.OTDR_API_URL ?? 'http://127.0.0.1:5008';

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
  let termoBusca = equipamentoAtual.find((e) => /onu/i.test(e.descricao))?.numeroSerie || null;

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
    })),
    comissoesBdr: comissoesBdr.map((c) => ({
      tipoNegociacao: c.tipo_negociacao,
      dataRegistro:   c.data_registro,
      valorComissao:  Number(c.valor_comissao),
    })),
    retencaoNegociacoes: [],
  };
}

// ── Fotos da instalação (sessão de admin do IXC, ver config/ixcSession.ts) ────

const LIMITE_FOTOS_DIAGNOSTICO = 5;

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
export async function buscarFotosRelevantes(
  osArquivos: Record<number, OsArquivoEntry[]>,
): Promise<ImagemAnexo[]> {
  const candidatos = Object.values(osArquivos).flat()
    .filter((a) => a.classificacao !== 'A' && EXTENSOES_IMAGEM.test(a.nomeArquivo))
    .sort((a, b) => (b.dataEnvio?.getTime() ?? 0) - (a.dataEnvio?.getTime() ?? 0));

  const fotoLocal = candidatos.find((a) => DESCRICAO_LOCAL_INSTALADO.test(a.descricao));
  const outras = candidatos.filter((a) => a !== fotoLocal).slice(0, LIMITE_FOTOS_DIAGNOSTICO - (fotoLocal ? 1 : 0));
  const todos = fotoLocal ? [fotoLocal, ...outras] : outras;

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
  return imagens;
}

// ── Regras de negócio centralizadas (referência para o prompt da IA) ──────────

export async function buscarRegrasNegocio(): Promise<Record<string, string>> {
  const regras = await prisma.diagnosticoRegraNegocio.findMany();
  return Object.fromEntries(regras.map((r) => [r.chave, r.valor]));
}
