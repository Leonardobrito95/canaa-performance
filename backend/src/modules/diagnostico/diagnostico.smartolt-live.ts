import axios from 'axios';
import logger from '../../config/logger';
import { StatusSmartOltCompleto, PortaEthernetOnu } from './diagnostico.types';

/// Consulta AO VIVO na OLT via SmartOLT (get_onu_full_status_info): traz MAC
/// do equipamento conectado, contador de desconexão por porta Ethernet
/// (Status changes) e a causa real reportada pela OLT no último evento de
/// queda (ex: "Power Fail"), nada disso existe no snapshot diário
/// (otdr.historico_smartolt). Confirmado 2026-07-20 com chamada de teste real.
///
/// A própria doc do SmartOLT descreve essa chamada como "resource-intensive"
/// (~5s por ONU), o mesmo padrão já usado no botão "Analisar causa provável"
/// do dashboard OTDR (OTDR/dashboard/app.py, _smartolt_onu_detalhe): cache
/// com TTL e trava de concorrência por SN, pra nunca disparar 2 chamadas
/// simultâneas pro mesmo cliente nem virar polling disfarçado. Espelhamos
/// esse mesmo cuidado aqui em vez de reinventar.
const SMARTOLT_URL = process.env.SMARTOLT_URL ?? '';
const SMARTOLT_KEY = process.env.SMARTOLT_KEY ?? '';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10min, mesmo valor do OTDR (CACHE_TTL_MIN)

interface EntradaCache {
  data:      StatusSmartOltCompleto | null;
  timestamp: number;
}

const cache = new Map<string, EntradaCache>();
const chamadasEmAndamento = new Map<string, Promise<StatusSmartOltCompleto | null>>();

/// A API às vezes omite do JSON estruturado colunas com valor 0 (confirmado
/// na chamada de teste: "Status changes" sumiu do full_status_json quando
/// todas as portas tinham 0 desconexões). Por isso "Status changes" é
/// extraído do texto bruto (full_status_info), que sempre traz a tabela
/// completa, em vez de confiar só no JSON pra esse campo específico.
const REGEX_LINHA_PORTA = /^(eth_\d+\/\d+)\s+(\S+)\s+(?:unlock|lock)\s+\d+\s+(\d+)\s*$/gm;

function extrairPortas(textoBruto: string): PortaEthernetOnu[] {
  // full_status_info da API mistura \r sozinho (sem \n) como separador entre
  // a maioria das linhas dentro de uma seção, confirmado na chamada de
  // teste real. O ^/$ do regex em JS só reconhece \n como quebra de linha,
  // então sem essa normalização só a primeira porta seria capturada.
  const normalizado = textoBruto.replace(/\r\n?/g, '\n');
  const portas: PortaEthernetOnu[] = [];
  for (const m of normalizado.matchAll(REGEX_LINHA_PORTA)) {
    portas.push({ porta: m[1], speed: m[2], statusChanges: Number(m[3]) });
  }
  return portas;
}

function extrairMac(json: any): string | null {
  const wan = json?.['ONU WAN Interfaces'];
  if (wan) {
    for (const entrada of Object.values<any>(wan)) {
      if (entrada?.['MAC address']) return entrada['MAC address'];
    }
  }
  const macsOlt = json?.['MACs on OLT from this ONU'];
  if (macsOlt) {
    const primeiro = Object.values<any>(macsOlt)[0];
    if (primeiro?.['MAC address']) return primeiro['MAC address'];
  }
  return null;
}

/// O último evento do History costuma ser só "ONU is currently online" (o
/// registro de volta, sem "Offline at" preenchido). Não é causa de falha,
/// é status atual. A causa real da última queda fica no evento anterior
/// (que tem "Offline at" preenchido). Confirmado 2026-07-20 com dado real.
function extrairUltimaCausa(json: any): { causa: string | null; data: Date | null } {
  const historico = json?.History;
  if (!historico) return { causa: null, data: null };
  const eventos = Object.values<any>(historico).reverse();
  const ultimaQueda = eventos.find((e: any) => e['Offline at']);
  if (!ultimaQueda) return { causa: null, data: null };
  return {
    causa: ultimaQueda.Cause ?? null,
    data:  new Date(ultimaQueda['Offline at'].replace(' ', 'T')),
  };
}

async function consultarSmartOlt(sn: string): Promise<StatusSmartOltCompleto | null> {
  if (!SMARTOLT_URL || !SMARTOLT_KEY) return null;
  try {
    const url = `${SMARTOLT_URL}/api/onu/get_onu_full_status_info/${sn}`;
    const { data } = await axios.get(url, { headers: { 'X-Token': SMARTOLT_KEY }, timeout: 20_000 });
    if (!data?.status || !data?.full_status_json) return null;

    const json = data.full_status_json;
    const { causa, data: dataCausa } = extrairUltimaCausa(json);

    return {
      sn,
      macWan:               extrairMac(json),
      portas:               extrairPortas(String(data.full_status_info ?? '')),
      ultimaCausaReportada: causa,
      ultimaCausaData:      dataCausa,
    };
  } catch (e: any) {
    logger.warn('[DIAGNOSTICO] Falha ao consultar status completo no SmartOLT (ao vivo)', { error: e.message, sn });
    return null;
  }
}

/// Cache de 10min + trava de concorrência por SN: chamar repetido pro mesmo
/// cliente numa mesma janela de conversa (pergunta de acompanhamento) não
/// gera chamada nova à API.
export async function buscarStatusSmartOltCompleto(sn: string | null): Promise<StatusSmartOltCompleto | null> {
  if (!sn) return null;

  const emCache = cache.get(sn);
  if (emCache && Date.now() - emCache.timestamp < CACHE_TTL_MS) {
    return emCache.data;
  }

  const emAndamento = chamadasEmAndamento.get(sn);
  if (emAndamento) return emAndamento;

  const promessa = consultarSmartOlt(sn).then((resultado) => {
    cache.set(sn, { data: resultado, timestamp: Date.now() });
    chamadasEmAndamento.delete(sn);
    return resultado;
  });
  chamadasEmAndamento.set(sn, promessa);
  return promessa;
}
