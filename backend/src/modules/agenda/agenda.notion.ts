import axios from 'axios';
import logger from '../../config/logger';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const notionAtivo = !!(NOTION_TOKEN && DATABASE_ID);

if (!notionAtivo) {
  logger.warn('[AGENDA] Notion: NOTION_TOKEN ou NOTION_DATABASE_ID não configurado. Integração desativada.');
}

export function notionConfigurado(): boolean {
  return notionAtivo;
}

const STATUS_MAP: Record<string, string> = {
  'Agendada':     'Agendado',
  'Em andamento': 'Agendado',
  'Concluída':    'Realizada',
  'Cancelada':    'Cancelado',
};

function tzOffset(): string {
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };
}

function montarPropriedades(reserva: any, participantes: string[] = [], statusDinamico = 'Agendada') {
  const statusNotion = STATUS_MAP[statusDinamico];
  const horaInicio = reserva.horainicio || reserva.horaInicio || '';
  const horaFim    = reserva.horafim    || reserva.horaFim    || '';

  const linhas: string[] = [];
  if (reserva.gestor) linhas.push(`Responsável: ${reserva.gestor}`);
  if (participantes.length > 0) linhas.push(`Participantes: ${participantes.join(', ')}`);
  const observacoesTexto = linhas.join('\n');

  const props: any = {
    'Qual o objetivo da reunião?': {
      title: [{ text: { content: reserva.titulo || 'Sem título' } }]
    },
    '27/04/2026': {
      date: reserva.data ? {
        start: horaInicio ? `${reserva.data}T${horaInicio}:00${tzOffset()}` : reserva.data,
        end:   horaFim    ? `${reserva.data}T${horaFim}:00${tzOffset()}`    : null
      } : null
    },
    'Observações': {
      rich_text: [{ text: { content: observacoesTexto } }]
    },
    'Motivo do agendamento': {
      rich_text: [{ text: { content: reserva.pre_ata || '' } }]
    },
    'Link da reunião:': {
      rich_text: [{ text: { content: reserva.link_reuniao || '' } }]
    },
  };

  if (statusNotion) {
    props['Status'] = { status: { name: statusNotion } };
  }

  return props;
}

export async function criarPaginaNotion(reserva: any, participantes: string[] = [], statusDinamico = 'Agendada'): Promise<string | null> {
  if (!notionConfigurado()) return null;
  try {
    const { data } = await axios.post(
      'https://api.notion.com/v1/pages',
      { parent: { database_id: DATABASE_ID }, properties: montarPropriedades(reserva, participantes, statusDinamico) },
      { headers: notionHeaders() }
    );
    logger.info('[AGENDA] Notion: página criada', { reservaId: reserva.id, titulo: reserva.titulo });
    return data.id;
  } catch (err: any) {
    logger.error('[AGENDA] Notion: erro ao criar página', { reservaId: reserva.id, error: err.response?.data || err.message });
    return null;
  }
}

export async function atualizarStatusNotion(notionPageId: string, statusDinamico: string): Promise<boolean> {
  if (!notionConfigurado() || !notionPageId) return false;
  const statusNotion = STATUS_MAP[statusDinamico];
  if (!statusNotion) return false;
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${notionPageId}`,
      { properties: { 'Status': { status: { name: statusNotion } } } },
      { headers: notionHeaders() }
    );
    return true;
  } catch (err: any) {
    logger.error('[AGENDA] Notion: erro ao atualizar status', { notionPageId, error: err.response?.data || err.message });
    return false;
  }
}

export async function atualizarPaginaNotion(notionPageId: string, participantes: string[] = [], statusDinamico = 'Agendada'): Promise<void> {
  if (!notionConfigurado() || !notionPageId) return;
  const statusNotion = STATUS_MAP[statusDinamico];
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${notionPageId}`,
      { properties: { ...(statusNotion ? { 'Status': { status: { name: statusNotion } } } : {}) } },
      { headers: notionHeaders() }
    );
  } catch (err: any) {
    logger.error('[AGENDA] Notion: erro ao atualizar página', { notionPageId, error: err.response?.data || err.message });
  }
}

export async function cancelarPaginaNotion(notionPageId: string, motivo = ''): Promise<void> {
  if (!notionConfigurado() || !notionPageId) return;
  const statusNotion = STATUS_MAP['Cancelada'];
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${notionPageId}`,
      {
        properties: {
          ...(statusNotion ? { 'Status': { status: { name: statusNotion } } } : {}),
          'Observações': { rich_text: [{ text: { content: motivo ? `Cancelada: ${motivo}` : 'Reunião cancelada.' } }] }
        }
      },
      { headers: notionHeaders() }
    );
  } catch (err: any) {
    logger.error('[AGENDA] Notion: erro ao cancelar página', { notionPageId, error: err.response?.data || err.message });
  }
}

export async function arquivarPaginaNotion(notionPageId: string): Promise<void> {
  if (!notionConfigurado() || !notionPageId) return;
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${notionPageId}`,
      { archived: true },
      { headers: notionHeaders() }
    );
  } catch (err: any) {
    logger.error('[AGENDA] Notion: erro ao arquivar página', { notionPageId, error: err.response?.data || err.message });
  }
}

export async function sincronizarTodasReservas(reservas: any[]): Promise<{ criadas: number; atualizadas: number; novasIds: any[] }> {
  if (!notionConfigurado()) return { criadas: 0, atualizadas: 0, novasIds: [] };

  let criadas = 0, atualizadas = 0;
  const novasIds: any[] = [];

  for (const r of reservas) {
    const nomes: string[] = Array.isArray(r.participantesNomes)
      ? r.participantesNomes
      : (r.participantesNomes ? String(r.participantesNomes).split('||') : []);
    const status = r.statusDinamico || 'Agendada';

    if (r.notion_page_id) {
      await atualizarPaginaNotion(r.notion_page_id, nomes, status);
      atualizadas++;
    } else {
      const notionPageId = await criarPaginaNotion(r, nomes, status);
      if (notionPageId) { criadas++; novasIds.push({ id: r.id, notionPageId, status }); }
    }
  }

  return { criadas, atualizadas, novasIds };
}
