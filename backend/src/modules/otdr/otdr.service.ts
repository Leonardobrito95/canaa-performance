import axios from 'axios';

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

function dataHoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function buscarPiorasHoje(): Promise<ResumoOlt[]> {
  const hoje = dataHoje();
  const { data } = await axios.get(`${OTDR_BASE}/api/historico/piora`, { timeout: 15_000 });
  const pioras = (data.dados ?? []).filter((p: any) => p.snapshot_data === hoje);
  if (!pioras.length) return [];

  const byOlt = new Map<string, any[]>();
  for (const p of pioras) {
    if (!byOlt.has(p.olt_name)) byOlt.set(p.olt_name, []);
    byOlt.get(p.olt_name)!.push(p);
  }

  const resumos: ResumoOlt[] = [];
  for (const [olt, items] of byOlt) {
    const pior = items.sort((a, b) => a.sinal_rx - b.sinal_rx)[0];
    resumos.push({
      olt,
      qtdPioraram: items.length,
      piorRx: pior.sinal_rx,
      piorSn: pior.sn,
      deltaDdBm: pior.sinal_rx - pior.rx_anterior,
    });
  }

  return resumos.sort((a, b) => a.piorRx - b.piorRx);
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
