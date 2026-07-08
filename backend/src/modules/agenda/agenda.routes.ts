import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../middlewares/authenticate';
import { AuthPayload } from '../auth/auth.service';
import agendaPool from './agenda.pool';
import { enviarConviteReuniao, enviarNotificacaoRecuso } from './agenda.email';
import logger from '../../config/logger';
import {
  criarPaginaNotion, atualizarStatusNotion, atualizarPaginaNotion,
  cancelarPaginaNotion, arquivarPaginaNotion, sincronizarTodasReservas,
  notionConfigurado,
} from './agenda.notion';

const router = Router();
const TABLE = 'colaboradores';
const SALAS = ['Sala de Reunião', 'Sala do Presidente', 'Sala de Treinamento'];

// ── SSE clients ──────────────────────────────────────────────────────────────
const sseClients = new Set<Response>();

function notificarClientes() {
  for (const client of sseClients) {
    client.write('event: atualizacao\ndata: ok\n\n');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function horaAtual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function temConflito(i1: string, f1: string, i2: string, f2: string): boolean {
  return horaParaMinutos(i1) < horaParaMinutos(f2) && horaParaMinutos(f1) > horaParaMinutos(i2);
}

function isDataValida(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function isHoraValida(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function calcularStatusDinamico(r: any): string {
  if (r.status === 'cancelada') return 'Cancelada';
  const agora = horaAtual();
  const dataHoje = hoje();
  if (r.data < dataHoje) return 'Concluída';
  if (r.data > dataHoje) return 'Agendada';
  const horaIni = r.horainicio || r.horaInicio;
  const horaFi  = r.horafim    || r.horaFim;
  const agoraMin = horaParaMinutos(agora);
  if (agoraMin >= horaParaMinutos(horaFi))  return 'Concluída';
  if (agoraMin >= horaParaMinutos(horaIni)) return 'Em andamento';
  return 'Agendada';
}

// ── Middleware: provisionar usuário CP no schema central_agendamento ──────────
interface AgendaUser { id: number; role: 'admin' | 'gestor' }

async function provisionarUsuario(cpUser: AuthPayload): Promise<AgendaUser> {
  const role: 'admin' | 'gestor' = cpUser.perfil === 'gestor' ? 'admin' : 'gestor';
  const { rows } = await agendaPool.query(
    `INSERT INTO ${TABLE} (nome, email, senha, role)
     VALUES ($1, $2, '$cp_auth', $3)
     ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, role = EXCLUDED.role
     RETURNING id, role`,
    [cpUser.nome, cpUser.email, role]
  );
  return rows[0] as AgendaUser;
}

// Middleware que roda authenticate + provisiona agenda user
function autenticarAgenda(req: Request, res: Response, next: any) {
  authenticate(req, res, async () => {
    try {
      (req as any).agendaUser = await provisionarUsuario(req.user!);
      next();
    } catch (err: any) {
      logger.error('[AGENDA] Falha ao provisionar usuário', { error: err.message });
      res.status(500).json({ erro: true, mensagem: 'Erro interno de autenticação.' });
    }
  });
}

function apenasAdmin(req: Request, res: Response, next: any) {
  const au: AgendaUser = (req as any).agendaUser;
  if (au?.role !== 'admin') {
    return res.status(403).json({ erro: true, mensagem: 'Acesso negado. Somente administradores.' });
  }
  next();
}

// ── GET /eventos (SSE) ────────────────────────────────────────────────────────
router.get('/eventos', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(': conectado\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── GET /status ───────────────────────────────────────────────────────────────
router.get('/status', autenticarAgenda, async (req, res) => {
  try {
    const agora = horaAtual();
    const dataHoje = hoje();

    const salaStatusRes = await agendaPool.query(`
      SELECT r.titulo, r.sala, r.horainicio, r.horafim, u.nome AS gestor
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.data = $1 AND r.status = 'confirmada' AND r.modalidade = 'presencial'
        AND r.horainicio <= $2 AND r.horafim > $3
    `, [dataHoje, agora, agora]);

    const salaOcupadaMap = new Map(
      salaStatusRes.rows.map(r => [String(r.sala || 'Sala de Reunião').trim(), r])
    );

    const salas = SALAS.map(nome => ({
      nome,
      livre: !salaOcupadaMap.has(nome.trim()),
      reservaAtiva: salaOcupadaMap.get(nome.trim()) || null,
    }));

    const reuniaoOnlineRes = await agendaPool.query(`
      SELECT r.*, u.nome AS gestor
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.data = $1 AND r.status = 'confirmada' AND r.modalidade = 'online'
        AND r.horainicio <= $2 AND r.horafim > $3
    `, [dataHoje, agora, agora]);

    const proximaRes = await agendaPool.query(`
      SELECT r.*, u.nome AS gestor
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.data = $1 AND r.status = 'confirmada' AND r.horainicio > $2
      ORDER BY r.horainicio ASC LIMIT 1
    `, [dataHoje, agora]);

    const hojeRes    = await agendaPool.query(`SELECT COUNT(*) AS total FROM reservas WHERE data = $1 AND status = 'confirmada'`, [dataHoje]);
    const pendRes    = await agendaPool.query(`SELECT COUNT(*) AS total FROM reservas WHERE status = 'pendente'`);

    res.json({
      salas,
      salaLivre: salas.every(s => s.livre),
      reservaAtiva: salas.find(s => !s.livre)?.reservaAtiva || null,
      reuniaoOnlineAtiva: reuniaoOnlineRes.rows[0] || null,
      proximaReuniao: proximaRes.rows[0] || null,
      reunioesHoje: parseInt(hojeRes.rows[0].total, 10),
      pendentes: parseInt(pendRes.rows[0].total, 10),
      horaAtual: agora,
    });
  } catch (err) {
    logger.error('[AGENDA] Erro ao buscar status', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno ao buscar status' });
  }
});

// ── GET /reservas ─────────────────────────────────────────────────────────────
router.get('/reservas', autenticarAgenda, async (req, res) => {
  try {
    const agendaUser: AgendaUser = (req as any).agendaUser;
    const dataHoje = hoje();
    const agora = horaAtual();

    const { rows } = await agendaPool.query(`
      SELECT r.*,
             u.nome AS gestor,
             (SELECT COUNT(*) FROM presencas p WHERE p.reserva_id = r.id AND p.status = 'confirmado') AS confirmados,
             (SELECT COUNT(*) FROM presencas p WHERE p.reserva_id = r.id AND p.usuario_id = $1 AND p.status = 'confirmado') AS "euConfirmei",
             (SELECT STRING_AGG(u2.nome || ':' || p2.status, '||') FROM presencas p2
              JOIN ${TABLE} u2 ON u2.id = p2.usuario_id
              WHERE p2.reserva_id = r.id) AS "participantesNomes"
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.status = 'confirmada'
        AND (r.data > $2 OR (r.data = $2 AND r.horafim > $3))
      ORDER BY r.data ASC, r.horainicio ASC
    `, [agendaUser.id, dataHoje, agora]);

    res.json(rows.map(r => ({
      ...r,
      horaInicio: r.horainicio || r.horaInicio,
      horaFim:    r.horafim    || r.horaFim,
      statusDinamico: calcularStatusDinamico(r),
      euConfirmei: parseInt(r.euconfirmei ?? r.euConfirmei, 10) > 0,
      confirmados: parseInt(r.confirmados, 10),
      participantesNomes: r.participantesnomes ? String(r.participantesnomes).split('||') : [],
    })));
  } catch (err) {
    logger.error('[AGENDA] Erro ao listar reservas', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno do servidor' });
  }
});

// ── POST /reservas ────────────────────────────────────────────────────────────
router.post('/reservas', autenticarAgenda, async (req, res) => {
  try {
    const agendaUser: AgendaUser = (req as any).agendaUser;
    const {
      titulo, data, horaInicio, horaFim,
      modalidade = 'presencial', sala = 'Sala de Reunião', link_reuniao,
      pre_ata, participanteIds = [],
    } = req.body;

    if (!titulo || !data || !horaInicio || !horaFim)
      return res.status(400).json({ erro: true, mensagem: 'Todos os campos são obrigatórios.' });
    if (!isDataValida(data))
      return res.status(400).json({ erro: true, mensagem: 'Formato de data inválido.' });
    if (!isHoraValida(horaInicio) || !isHoraValida(horaFim))
      return res.status(400).json({ erro: true, mensagem: 'Formato de hora inválido.' });
    if (modalidade === 'online' && !link_reuniao)
      return res.status(400).json({ erro: true, mensagem: 'Reuniões online exigem um link de acesso.' });
    if (horaParaMinutos(horaInicio) >= horaParaMinutos(horaFim))
      return res.status(400).json({ erro: true, mensagem: 'A hora de início deve ser anterior ao término.' });

    // Conflito de sala
    if (modalidade === 'presencial') {
      const { rows: existentes } = await agendaPool.query(
        `SELECT * FROM reservas WHERE data = $1 AND status = 'confirmada' AND modalidade = 'presencial' AND sala = $2`,
        [data, sala]
      );
      const conflito = existentes.find(r => {
        const rI = r.horainicio || r.horaInicio;
        const rF = r.horafim || r.horaFim;
        return temConflito(horaInicio, horaFim, rI, rF);
      });
      if (conflito) {
        const cI = conflito.horainicio || conflito.horaInicio;
        const cF = conflito.horafim || conflito.horaFim;
        return res.status(409).json({
          erro: true,
          tipoConflito: 'sala',
          mensagem: `Conflito! ${sala} já está ocupada por "${conflito.titulo}" das ${cI} às ${cF}.`,
        });
      }
    }

    // Conflito de participantes
    const idsValidos = Array.isArray(participanteIds)
      ? participanteIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
      : [];

    if (idsValidos.length > 0) {
      const { rows: confPart } = await agendaPool.query(`
        SELECT p.usuario_id, u.nome AS "nomeParticipante", r.titulo AS "tituloConflito",
               r.horainicio, r.horafim
        FROM presencas p
        JOIN reservas r ON r.id = p.reserva_id
        JOIN ${TABLE} u ON u.id = p.usuario_id
        WHERE p.usuario_id = ANY($1::int[]) AND r.data = $2 AND r.status = 'confirmada'
      `, [idsValidos, data]);

      const particConflito = confPart.find(row =>
        temConflito(horaInicio, horaFim, row.horainicio, row.horafim)
      );
      if (particConflito) {
        return res.status(409).json({
          erro: true,
          tipoConflito: 'participante',
          mensagem: `Conflito! ${particConflito.nomeParticipante} já está na reunião "${particConflito.tituloConflito}" das ${particConflito.horainicio} às ${particConflito.horafim}.`,
        });
      }
    }

    const { rows: [nova] } = await agendaPool.query(`
      INSERT INTO reservas (usuario_id, titulo, data, horaInicio, horaFim, status, modalidade, sala, link_reuniao, pre_ata)
      VALUES ($1, $2, $3, $4, $5, 'confirmada', $6, $7, $8, $9)
      RETURNING id
    `, [agendaUser.id, titulo, data, horaInicio, horaFim, modalidade, sala || 'Online', link_reuniao || null, pre_ata || null]);

    const novaId = nova.id;

    for (const pid of idsValidos) {
      await agendaPool.query(
        'INSERT INTO presencas (reserva_id, usuario_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [novaId, pid, 'confirmado']
      );
    }

    const { rows: [novaCompleta] } = await agendaPool.query(`
      SELECT r.*, u.nome AS gestor
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.id = $1
    `, [novaId]);

    const { rows: nomesRows } = await agendaPool.query(`
      SELECT u.nome FROM presencas p JOIN ${TABLE} u ON u.id = p.usuario_id WHERE p.reserva_id = $1
    `, [novaId]);
    const participantesNomes = nomesRows.map(r => r.nome);

    res.status(201).json({
      erro: false,
      mensagem: 'Reserva criada com sucesso!',
      reserva: {
        ...novaCompleta,
        statusDinamico: calcularStatusDinamico(novaCompleta),
        euConfirmei: false,
        confirmados: idsValidos.length,
        participantesNomes,
      },
    });

    notificarClientes();

    // E-mails de convite (assíncrono)
    if (idsValidos.length > 0) {
      agendaPool.query(`SELECT id, nome, email FROM ${TABLE} WHERE id = ANY($1::int[])`, [idsValidos])
        .then(({ rows: participantesInfo }) => {
          const horaInicioEmail = novaCompleta.horainicio || novaCompleta.horaInicio;
          const horaFimEmail    = novaCompleta.horafim    || novaCompleta.horaFim;
          for (const p of participantesInfo) {
            const tokenRecuso = jwt.sign(
              { reservaId: novaCompleta.id, usuarioId: p.id, action: 'recusar' },
              process.env.JWT_SECRET!,
              { expiresIn: '7d' }
            );
            enviarConviteReuniao({
              emailDestinatario: p.email,
              nomeParticipante: p.nome,
              tituloReuniao: novaCompleta.titulo,
              data: novaCompleta.data,
              horaInicio: horaInicioEmail,
              horaFim: horaFimEmail,
              modalidade: novaCompleta.modalidade,
              sala: novaCompleta.sala || undefined,
              linkReuniao: novaCompleta.link_reuniao || undefined,
              nomeOrganizador: novaCompleta.gestor,
              preAta: novaCompleta.pre_ata || undefined,
              tokenRecuso,
              baseUrl: process.env.BASE_URL || 'https://exemplo.com.br',
            });
          }
        })
        .catch(err => logger.error('[AGENDA] Erro ao buscar participantes para e-mail', { error: err.message }));
    }

    // Notion (assíncrono)
    criarPaginaNotion(novaCompleta, participantesNomes, calcularStatusDinamico(novaCompleta))
      .then(async notionPageId => {
        if (notionPageId) {
          await agendaPool.query(
            'UPDATE reservas SET notion_page_id = $1, notion_status_enviado = $2 WHERE id = $3',
            [notionPageId, calcularStatusDinamico(novaCompleta), novaCompleta.id]
          ).catch(() => {});
        }
      }).catch(() => {});

  } catch (err) {
    logger.error('[AGENDA] Erro ao criar reserva', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro ao criar reserva' });
  }
});

// ── DELETE /reservas/multiplas (antes de /:id) ────────────────────────────────
router.delete('/reservas/multiplas', autenticarAgenda, apenasAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ erro: true, mensagem: 'Nenhuma reserva selecionada.' });

    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
    const { rows: reservas } = await agendaPool.query(`SELECT * FROM reservas WHERE id IN (${placeholders})`, ids);
    if (reservas.length === 0)
      return res.status(404).json({ erro: true, mensagem: 'Nenhuma reserva encontrada.' });

    await agendaPool.query(`DELETE FROM reservas WHERE id IN (${placeholders})`, ids);
    notificarClientes();

    res.json({ erro: false, mensagem: `${reservas.length} reunião(ões) apagada(s).`, apagadas: reservas.length });

    reservas.forEach(r => { if (r.notion_page_id) arquivarPaginaNotion(r.notion_page_id).catch(() => {}); });
  } catch (err) {
    logger.error('[AGENDA] Erro ao apagar reservas múltiplas', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno' });
  }
});

// ── PATCH /reservas/multiplas/cancelar ───────────────────────────────────────
router.patch('/reservas/multiplas/cancelar', autenticarAgenda, apenasAdmin, async (req, res) => {
  try {
    const { ids, motivo } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ erro: true, mensagem: 'Nenhuma reserva selecionada.' });

    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
    const { rows: reservas } = await agendaPool.query(`SELECT * FROM reservas WHERE id IN (${placeholders})`, ids);
    if (reservas.length === 0)
      return res.status(404).json({ erro: true, mensagem: 'Nenhuma reserva encontrada.' });

    const justificativa = motivo?.trim() || null;
    await agendaPool.query(
      `UPDATE reservas SET status = 'cancelada', motivo_cancelamento = $${ids.length + 1} WHERE id IN (${placeholders}) AND status != 'cancelada'`,
      [...ids, justificativa]
    );
    notificarClientes();

    res.json({ erro: false, mensagem: `${reservas.length} reunião(ões) cancelada(s).`, canceladas: reservas.length });

    reservas.forEach(r => {
      if (r.status !== 'cancelada' && r.notion_page_id)
        cancelarPaginaNotion(r.notion_page_id, justificativa || '').catch(() => {});
    });
  } catch (err) {
    logger.error('[AGENDA] Erro ao cancelar reservas múltiplas', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno' });
  }
});

// ── PATCH /reservas/:id/cancelar ─────────────────────────────────────────────
router.patch('/reservas/:id/cancelar', autenticarAgenda, async (req, res) => {
  try {
    const agendaUser: AgendaUser = (req as any).agendaUser;
    if (agendaUser.role !== 'admin')
      return res.status(403).json({ erro: true, mensagem: 'Somente administradores podem cancelar reuniões.' });

    const id = parseInt(req.params.id);
    const { motivo } = req.body;
    const { rows: [reserva] } = await agendaPool.query('SELECT * FROM reservas WHERE id = $1', [id]);
    if (!reserva) return res.status(404).json({ erro: true, mensagem: 'Reserva não encontrada.' });
    if (reserva.status === 'cancelada') return res.status(400).json({ erro: true, mensagem: 'Já está cancelada.' });

    await agendaPool.query('UPDATE reservas SET status = $1, motivo_cancelamento = $2 WHERE id = $3',
      ['cancelada', motivo?.trim() || null, id]);

    notificarClientes();
    res.json({ erro: false, mensagem: 'Reunião cancelada com sucesso.' });

    if (reserva.notion_page_id)
      cancelarPaginaNotion(reserva.notion_page_id, motivo?.trim() || '').catch(() => {});
  } catch (err) {
    logger.error('[AGENDA] Erro ao cancelar reserva', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno ao cancelar' });
  }
});

// ── PATCH /reservas/:id/presenca ──────────────────────────────────────────────
router.patch('/reservas/:id/presenca', autenticarAgenda, async (req, res) => {
  try {
    const agendaUser: AgendaUser = (req as any).agendaUser;
    const reservaId = parseInt(req.params.id);

    const { rows: r } = await agendaPool.query('SELECT id FROM reservas WHERE id = $1', [reservaId]);
    if (r.length === 0) return res.status(404).json({ erro: true, mensagem: 'Reserva não encontrada.' });

    const { rows: [existente] } = await agendaPool.query(
      'SELECT id, status FROM presencas WHERE reserva_id = $1 AND usuario_id = $2',
      [reservaId, agendaUser.id]
    );

    if (existente) {
      if (existente.status === 'recusado') {
        await agendaPool.query('UPDATE presencas SET status = $1 WHERE reserva_id = $2 AND usuario_id = $3',
          ['confirmado', reservaId, agendaUser.id]);
      } else {
        await agendaPool.query('DELETE FROM presencas WHERE reserva_id = $1 AND usuario_id = $2',
          [reservaId, agendaUser.id]);
      }
    } else {
      await agendaPool.query('INSERT INTO presencas (reserva_id, usuario_id, status) VALUES ($1, $2, $3)',
        [reservaId, agendaUser.id, 'confirmado']);
    }

    const { rows: [confRow] } = await agendaPool.query(
      "SELECT COUNT(*) AS total FROM presencas WHERE reserva_id = $1 AND status = 'confirmado'", [reservaId]
    );

    res.json({
      erro: false,
      confirmou: !existente || existente.status === 'recusado',
      confirmados: parseInt(confRow.total, 10),
    });
    notificarClientes();

    const { rows: [reservaCompleta] } = await agendaPool.query('SELECT * FROM reservas WHERE id = $1', [reservaId]);
    if (reservaCompleta?.notion_page_id) {
      const { rows: nomesRows } = await agendaPool.query(
        `SELECT u.nome FROM presencas p JOIN ${TABLE} u ON u.id = p.usuario_id WHERE p.reserva_id = $1`, [reservaId]
      );
      atualizarPaginaNotion(reservaCompleta.notion_page_id, nomesRows.map(n => n.nome), calcularStatusDinamico(reservaCompleta)).catch(() => {});
    }
  } catch (err) {
    logger.error('[AGENDA] Erro ao marcar presença', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno ao marcar presença' });
  }
});

// ── DELETE /reservas/:id ──────────────────────────────────────────────────────
router.delete('/reservas/:id', autenticarAgenda, async (req, res) => {
  try {
    const agendaUser: AgendaUser = (req as any).agendaUser;
    if (agendaUser.role !== 'admin')
      return res.status(403).json({ erro: true, mensagem: 'Somente administradores podem apagar reuniões.' });

    const id = parseInt(req.params.id);
    const { rows: [reserva] } = await agendaPool.query('SELECT * FROM reservas WHERE id = $1', [id]);
    if (!reserva) return res.status(404).json({ erro: true, mensagem: 'Reserva não encontrada.' });

    await agendaPool.query('DELETE FROM reservas WHERE id = $1', [id]);
    notificarClientes();
    res.json({ erro: false, mensagem: 'Reserva apagada com sucesso.' });

    if (reserva.notion_page_id) arquivarPaginaNotion(reserva.notion_page_id).catch(() => {});
  } catch (err) {
    logger.error('[AGENDA] Erro ao apagar reserva', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno' });
  }
});

// ── GET /historico ────────────────────────────────────────────────────────────
router.get('/historico', autenticarAgenda, async (req, res) => {
  try {
    const agendaUser: AgendaUser = (req as any).agendaUser;
    const isAdmin = agendaUser.role === 'admin';

    const { rows } = await agendaPool.query(`
      SELECT r.*,
             u.nome AS gestor,
             (SELECT COUNT(*) FROM presencas p WHERE p.reserva_id = r.id AND p.status = 'confirmado') AS confirmados,
             (SELECT COUNT(*) FROM presencas p WHERE p.reserva_id = r.id AND p.usuario_id = $1 AND p.status = 'confirmado') AS "euConfirmei",
             (SELECT STRING_AGG(u2.nome || ':' || p2.status, '||') FROM presencas p2
              JOIN ${TABLE} u2 ON u2.id = p2.usuario_id
              WHERE p2.reserva_id = r.id) AS "participantesNomes"
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      ORDER BY r.data DESC, r.horainicio ASC
      LIMIT 3000
    `, [agendaUser.id]);

    res.json(rows.map(r => ({
      ...r,
      horaInicio: r.horainicio || r.horaInicio,
      horaFim:    r.horafim    || r.horaFim,
      statusDinamico: calcularStatusDinamico(r),
      euConfirmei: parseInt(r.euconfirmei ?? r.euConfirmei, 10) > 0,
      confirmados: parseInt(r.confirmados, 10),
      participantesNomes: r.participantesnomes ? String(r.participantesnomes).split('||') : [],
    })));
  } catch (err) {
    logger.error('[AGENDA] Erro ao buscar histórico', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno ao buscar histórico' });
  }
});

// ── DELETE /historico/concluidas ──────────────────────────────────────────────
router.delete('/historico/concluidas', autenticarAgenda, apenasAdmin, async (req, res) => {
  try {
    const agora = horaAtual();
    const dataHoje = hoje();

    const { rows: paraArquivar } = await agendaPool.query(`
      SELECT notion_page_id FROM reservas
      WHERE status = 'confirmada' AND notion_page_id IS NOT NULL
        AND (data < $1 OR (data = $1 AND horafim < $2))
    `, [dataHoje, agora]);

    const { rowCount } = await agendaPool.query(`
      DELETE FROM reservas
      WHERE status = 'confirmada' AND (data < $1 OR (data = $1 AND horafim < $2))
    `, [dataHoje, agora]);

    res.json({ erro: false, mensagem: `${rowCount} reunião(ões) concluída(s) apagada(s).`, apagadas: rowCount });
    notificarClientes();

    paraArquivar.forEach(r => arquivarPaginaNotion(r.notion_page_id).catch(() => {}));
  } catch (err) {
    logger.error('[AGENDA] Erro ao apagar histórico de concluídas', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro interno' });
  }
});

// ── GET /usuarios ─────────────────────────────────────────────────────────────
router.get('/usuarios', autenticarAgenda, async (req, res) => {
  try {
    const { rows } = await agendaPool.query(`SELECT id, nome FROM ${TABLE} ORDER BY nome ASC`);
    res.json(rows);
  } catch (err) {
    logger.error('[AGENDA] Erro ao buscar usuários', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro ao buscar usuários' });
  }
});

// ── GET /admin/usuarios ───────────────────────────────────────────────────────
router.get('/admin/usuarios', autenticarAgenda, apenasAdmin, async (req, res) => {
  try {
    const { rows } = await agendaPool.query(`SELECT id, nome, email, role FROM ${TABLE} ORDER BY nome ASC`);
    res.json(rows);
  } catch (err) {
    logger.error('[AGENDA] Erro ao listar usuários (admin)', { error: (err as Error).message });
    res.status(500).json({ mensagem: 'Erro ao listar usuários' });
  }
});

// ── POST /admin/usuarios ──────────────────────────────────────────────────────
router.post('/admin/usuarios', autenticarAgenda, apenasAdmin, async (req, res) => {
  const { nome, email, role } = req.body;
  if (!nome || !email || !role)
    return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios.' });
  try {
    await agendaPool.query(
      `INSERT INTO ${TABLE} (nome, email, senha, role) VALUES ($1, $2, '$cp_auth', $3)`,
      [nome, email, role]
    );
    res.status(201).json({ mensagem: 'Usuário criado com sucesso!' });
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ mensagem: 'E-mail já utilizado.' });
    logger.error('[AGENDA] Erro ao cadastrar usuário (admin)', { error: err.message });
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.' });
  }
});

// ── PUT /admin/usuarios/:id ───────────────────────────────────────────────────
router.put('/admin/usuarios/:id', autenticarAgenda, apenasAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, email, role } = req.body;
  if (!nome || !email || !role)
    return res.status(400).json({ mensagem: 'Nome, e-mail e cargo são obrigatórios.' });
  try {
    await agendaPool.query(
      `UPDATE ${TABLE} SET nome=$1, email=$2, role=$3 WHERE id=$4`,
      [nome, email, role, id]
    );
    res.json({ mensagem: 'Usuário atualizado com sucesso!' });
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ mensagem: 'E-mail já em uso.' });
    logger.error('[AGENDA] Erro ao atualizar usuário (admin)', { error: err.message });
    res.status(500).json({ mensagem: 'Erro ao atualizar usuário.' });
  }
});

// ── DELETE /admin/usuarios/:id ────────────────────────────────────────────────
router.delete('/admin/usuarios/:id', autenticarAgenda, apenasAdmin, async (req, res) => {
  const { id } = req.params;
  const agendaUser: AgendaUser = (req as any).agendaUser;
  if (parseInt(id) === agendaUser.id)
    return res.status(400).json({ mensagem: 'Você não pode excluir sua própria conta.' });
  try {
    await agendaPool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
    res.json({ mensagem: 'Usuário removido permanentemente.' });
  } catch (err: any) {
    if (err.code === '23503')
      return res.status(400).json({ mensagem: 'Não é possível excluir: usuário possui reuniões cadastradas.' });
    logger.error('[AGENDA] Erro ao remover usuário (admin)', { error: err.message });
    res.status(500).json({ mensagem: 'Erro ao remover usuário.' });
  }
});

// ── GET /estatisticas ─────────────────────────────────────────────────────────
router.get('/estatisticas', autenticarAgenda, async (req, res) => {
  try {
    const { rows: rankQtd } = await agendaPool.query(`
      SELECT u.nome, COUNT(r.id) AS "totalReservas"
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.status = 'confirmada'
      GROUP BY r.usuario_id, u.nome
      ORDER BY "totalReservas" DESC LIMIT 5
    `);
    const { rows: rankTempo } = await agendaPool.query(`
      SELECT u.nome,
        SUM(
          (CAST(SUBSTRING(r.horafim FROM 1 FOR 2) AS INTEGER) * 60 + CAST(SUBSTRING(r.horafim FROM 4 FOR 2) AS INTEGER)) -
          (CAST(SUBSTRING(r.horainicio FROM 1 FOR 2) AS INTEGER) * 60 + CAST(SUBSTRING(r.horainicio FROM 4 FOR 2) AS INTEGER))
        ) AS "totalMinutos"
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.status = 'confirmada'
      GROUP BY r.usuario_id, u.nome
      ORDER BY "totalMinutos" DESC LIMIT 5
    `);
    res.json({
      rankingQuantidade: rankQtd.map(r => ({ ...r, totalReservas: parseInt(r.totalReservas || r.totalreservas, 10) })),
      rankingTempo: rankTempo.map(r => ({ ...r, totalMinutos: parseInt(r.totalMinutos || r.totalminutos, 10) })),
    });
  } catch (err) {
    logger.error('[AGENDA] Erro ao buscar estatísticas', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro ao buscar estatísticas' });
  }
});

// ── GET /notion/status ────────────────────────────────────────────────────────
router.get('/notion/status', autenticarAgenda, (_req, res) => {
  res.json({ configurado: notionConfigurado() });
});

// ── POST /notion/sync ─────────────────────────────────────────────────────────
router.post('/notion/sync', autenticarAgenda, apenasAdmin, async (req, res) => {
  try {
    const dataHoje = hoje();
    const { rows } = await agendaPool.query(`
      SELECT r.*, u.nome AS gestor,
             (SELECT STRING_AGG(u2.nome || ':' || p2.status, '||') FROM presencas p2
              JOIN ${TABLE} u2 ON u2.id = p2.usuario_id
              WHERE p2.reserva_id = r.id) AS "participantesNomes"
      FROM reservas r JOIN ${TABLE} u ON u.id = r.usuario_id
      WHERE r.data >= $1
      ORDER BY r.data ASC, r.horainicio ASC
    `, [dataHoje]);

    const reservasComStatus = rows.map(r => ({
      ...r,
      horaInicio: r.horainicio || r.horaInicio,
      horaFim:    r.horafim    || r.horaFim,
      statusDinamico: calcularStatusDinamico(r),
      participantesNomes: r.participantesnomes ? String(r.participantesnomes).split('||') : [],
    }));

    const { criadas, atualizadas, novasIds } = await sincronizarTodasReservas(reservasComStatus);

    for (const { id, notionPageId, status } of novasIds) {
      await agendaPool.query('UPDATE reservas SET notion_page_id = $1, notion_status_enviado = $2 WHERE id = $3',
        [notionPageId, status, id]);
    }

    res.json({ erro: false, mensagem: `Sincronização concluída: ${criadas} criada(s), ${atualizadas} atualizada(s).`, total: criadas + atualizadas });
  } catch (err) {
    logger.error('[AGENDA] Erro ao sincronizar com o Notion', { error: (err as Error).message });
    res.status(500).json({ erro: true, mensagem: 'Erro ao sincronizar com o Notion.' });
  }
});

// ── GET /presenca/recusar (link público por token) ────────────────────────────
router.get('/presenca/recusar', async (req, res) => {
  try {
    const { token } = req.query as { token?: string };
    if (!token) return res.status(400).send('<h1>Erro</h1><p>Token não fornecido.</p>');

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    if (decoded.action !== 'recusar') throw new Error('Ação inválida');

    const { reservaId, usuarioId } = decoded;
    const { rows: [info] } = await agendaPool.query(`
      SELECT r.titulo, r.data, u_org.nome AS "nomeOrganizador", u_org.email AS "emailOrganizador",
             u_part.nome AS "nomeParticipante"
      FROM reservas r
      JOIN ${TABLE} u_org ON u_org.id = r.usuario_id
      JOIN ${TABLE} u_part ON u_part.id = $1
      WHERE r.id = $2
    `, [usuarioId, reservaId]);

    if (!info) return res.status(404).send('<h1>Erro</h1><p>Reunião não encontrada.</p>');

    const { rowCount } = await agendaPool.query(
      'UPDATE presencas SET status = $1 WHERE reserva_id = $2 AND usuario_id = $3',
      ['recusado', reservaId, usuarioId]
    );

    if (!rowCount) return res.status(400).send('<h1>Erro</h1><p>Participante não faz parte desta reunião.</p>');

    enviarNotificacaoRecuso({
      emailOrganizador: info.emailOrganizador,
      nomeOrganizador: info.nomeOrganizador,
      nomeParticipante: info.nomeParticipante,
      tituloReuniao: info.titulo,
      data: info.data,
    });
    notificarClientes();

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recusa Confirmada</title><style>body{font-family:sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);text-align:center;max-width:400px}h1{color:#ef4444}p{color:#475569;line-height:1.6}.btn{display:inline-block;margin-top:24px;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold}</style></head><body><div class="card"><h1>Recusa Confirmada</h1><p>Você recusou o convite para <strong>${info.titulo}</strong>.</p><p>O organizador foi notificado.</p><a href="/bdr/" class="btn">Voltar ao sistema</a></div></body></html>`);
  } catch (err: any) {
    logger.error('[AGENDA] Erro ao recusar presença', { error: err.message });
    res.status(401).send('<h1>Erro</h1><p>Link inválido ou expirado.</p>');
  }
});

// ── Periodic Notion sync ──────────────────────────────────────────────────────
async function sincronizarStatusNotionPeriodico() {
  if (!notionConfigurado()) return;
  try {
    const { rows } = await agendaPool.query(`SELECT * FROM reservas WHERE notion_page_id IS NOT NULL`);
    let atualizadas = 0;
    for (const r of rows) {
      const statusAtual = calcularStatusDinamico(r);
      if (statusAtual !== r.notion_status_enviado) {
        const ok = await atualizarStatusNotion(r.notion_page_id, statusAtual);
        if (ok) {
          await agendaPool.query('UPDATE reservas SET notion_status_enviado = $1 WHERE id = $2', [statusAtual, r.id]);
          atualizadas++;
        }
      }
    }
    if (atualizadas > 0) logger.info('[AGENDA] Notion: status atualizados no sync periódico', { atualizadas });
  } catch (err: any) {
    logger.error('[AGENDA] Notion: erro no sync periódico', { error: err.message });
  }
}

if (notionConfigurado()) {
  setTimeout(() => {
    sincronizarStatusNotionPeriodico();
    setInterval(sincronizarStatusNotionPeriodico, 5 * 60 * 1000);
  }, 60 * 1000);
  logger.info('[AGENDA] Sincronização Notion ativada (5 min).');
}

export default router;
