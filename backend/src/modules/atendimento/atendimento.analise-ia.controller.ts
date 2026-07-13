import { Request, Response, NextFunction } from 'express';
import { getFilaDeTriagem, getLancamentosAnaliseIa, getResumoPorSetor, getRankingMotivosIa } from './atendimento.analise-ia.service';

function parseData(valor: unknown, fallback: Date): Date {
  if (typeof valor !== 'string' || !valor) return fallback;
  const d = new Date(`${valor}T00:00:00`);
  return isNaN(d.getTime()) ? fallback : d;
}

function parseFiltros(req: Request) {
  const { setor, setores: setoresRaw, dateFrom, dateTo } = req.query as Record<string, string>;
  return {
    setor,
    setores:  setoresRaw ? setoresRaw.split(',') : undefined,
    dateFrom: dateFrom ? parseData(dateFrom, new Date(0)) : undefined,
    dateTo:   dateTo ? parseData(dateTo, new Date()) : undefined,
  };
}

export async function triagemAnaliseIa(req: Request, res: Response, next: NextFunction) {
  try {
    const todos = req.query.todos === 'true';
    const itens = todos
      ? await getLancamentosAnaliseIa(parseFiltros(req))
      : await getFilaDeTriagem(parseFiltros(req));
    res.json({ itens });
  } catch (err) { next(err); }
}

export async function dashboardAnaliseIa(req: Request, res: Response, next: NextFunction) {
  try {
    const filtros = parseFiltros(req);
    const [porSetor, motivos] = await Promise.all([
      getResumoPorSetor(filtros),
      getRankingMotivosIa(filtros),
    ]);
    res.json({ porSetor, motivos });
  } catch (err) { next(err); }
}
