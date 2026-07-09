import axios from 'axios';
import mysqlPool from '../../config/mysql';

const OTDR_BASE = process.env.OTDR_API_URL ?? 'http://127.0.0.1:5008';

export interface ResumoOlt {
  olt: string;
  qtdPioraram: number;
  piorRx: number;
  piorSn: string;
  deltaDdBm: number; // negativo = piorou
}

export interface EstadoOlt {
  fora: number;
  critico: number;
  total: number;
}

export interface ClienteDegradadoHoje {
  idCliente: number;
  nome: string;
  sn: string;
  olt: string;
  rxHoje: number;
  rxAnterior: number;
}

function dataHoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/// Busca o histórico de pioras direto na API do OTDR — o campo de data real da
/// resposta é `data_queda` (formato dd/mm/aaaa), não `snapshot_data` (esse campo
/// não existe na resposta e o filtro antigo sempre dava vazio, silenciosamente
/// zerando o resumo diário desde sempre).
async function buscarPiorasDoDia(): Promise<any[]> {
  const hoje = dataHoje();
  const { data } = await axios.get(`${OTDR_BASE}/api/historico/piora`, { timeout: 15_000 });
  return (data.dados ?? []).filter((p: any) => p.data_queda === hoje);
}

export async function buscarPiorasHoje(): Promise<ResumoOlt[]> {
  const pioras = await buscarPiorasDoDia();
  if (!pioras.length) return [];

  const byOlt = new Map<string, any[]>();
  for (const p of pioras) {
    if (!byOlt.has(p.olt_name)) byOlt.set(p.olt_name, []);
    byOlt.get(p.olt_name)!.push(p);
  }

  const resumos: ResumoOlt[] = [];
  for (const [olt, items] of byOlt) {
    const pior = items.sort((a, b) => a.rx_hoje - b.rx_hoje)[0];
    resumos.push({
      olt,
      qtdPioraram: items.length,
      piorRx: pior.rx_hoje,
      piorSn: pior.sn,
      deltaDdBm: pior.rx_hoje - pior.rx_anterior,
    });
  }

  return resumos.sort((a, b) => a.piorRx - b.piorRx);
}

/// Resolve os N clientes com pior sinal hoje, para permitir uma análise de
/// causa (Diagnóstico IA) só nos piores casos — "poucos, fundamentados na
/// causa", não um por ONU degradada. Resolve SN -> cliente via movimento_
/// comodatos/movimento_produtos (mesma fonte autoritativa usada no Diagnóstico
/// individual), não via nome (que pode ter múltiplos clientes homônimos).
export async function buscarPioresClientesHoje(limite = 3): Promise<ClienteDegradadoHoje[]> {
  const pioras = await buscarPiorasDoDia();
  if (!pioras.length) return [];

  const ordenadas = [...pioras].sort((a, b) => a.rx_hoje - b.rx_hoje);
  const resultado: ClienteDegradadoHoje[] = [];

  for (const p of ordenadas) {
    if (resultado.length >= limite) break;
    const [rows] = await mysqlPool.query<any[]>(
      `SELECT mc.id_cliente, c.razao
       FROM movimento_produtos mp
         JOIN movimento_comodatos mc ON mc.id_movimento_produtos = mp.id
         JOIN cliente c ON c.id = mc.id_cliente
       WHERE mp.numero_serie = ? AND mp.status_comodato = 'E'
       LIMIT 1`,
      [p.sn],
    );
    if (!rows.length) continue; // SN não resolvido para um cliente — pula, não adivinha
    resultado.push({
      idCliente: rows[0].id_cliente,
      nome: rows[0].razao,
      sn: p.sn,
      olt: p.olt_name,
      rxHoje: p.rx_hoje,
      rxAnterior: p.rx_anterior,
    });
  }

  return resultado;
}

export async function buscarEstadoPorOlt(): Promise<Map<string, EstadoOlt>> {
  const { data } = await axios.get(`${OTDR_BASE}/api/onus`, { timeout: 30_000 });
  const onus: any[] = data.onus ?? [];

  const byOlt = new Map<string, EstadoOlt>();
  for (const onu of onus) {
    if (!byOlt.has(onu.olt)) byOlt.set(onu.olt, { fora: 0, critico: 0, total: 0 });
    const s = byOlt.get(onu.olt)!;
    s.total++;
    if (onu.nivel === 'Fora de Operacao') s.fora++;
    else if (onu.nivel === 'Critico') s.critico++;
  }

  return byOlt;
}
