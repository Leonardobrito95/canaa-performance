import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../auth/auth.service';
import { getResumoKpisAtendimento, getRankingsAtendimento, auditarAtendimentoIndividual } from './atendimento.service';
import { SetorAtendimento } from './atendimento.types';

type AuthRequest = Request & { user: AuthPayload };

function parseData(valor: unknown, fallback: Date): Date {
  if (typeof valor !== 'string' || !valor) return fallback;
  const d = new Date(`${valor}T00:00:00`);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function resumoAtendimento(req: Request, res: Response, next: NextFunction) {
  try {
    const { dateFrom, dateTo, setores: setoresRaw } = req.query as Record<string, string>;
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const from = parseData(dateFrom, inicioMes);
    const to   = parseData(dateTo, hoje);
    to.setHours(23, 59, 59, 999);
    // Sem ?setores=, os dois lados usam o default (todos os 8) — mantém o
    // chat de gestão (que não passa esse param) com a visão completa de sempre.
    const setores = setoresRaw ? (setoresRaw.split(',') as SetorAtendimento[]) : undefined;

    const [kpis, rankings] = await Promise.all([
      getResumoKpisAtendimento(from, to, setores),
      getRankingsAtendimento(from, to, setores),
    ]);
    res.json({ kpis, rankings });
  } catch (err) { next(err); }
}

export async function auditarAtendimento(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, nome } = (req as AuthRequest).user;
    const { protocolo } = req.params;
    const { pergunta } = req.body as { pergunta?: string };

    const resultado = await auditarAtendimentoIndividual(protocolo, { ixcUserId: id, ixcUsername: nome }, pergunta);
    if (!resultado) {
      res.status(404).json({ message: 'Atendimento não encontrado (protocolo não localizado ou não é de um setor de atendimento coberto).' });
      return;
    }
    res.json(resultado);
  } catch (err) { next(err); }
}
