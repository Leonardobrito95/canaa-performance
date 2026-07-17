import { Request, Response, NextFunction } from 'express';
import { getFilaDeTriagem, getResumoPorSetor, getRankingMotivosIa, marcarRevisaoManual } from './atendimento.analise-ia.service';

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
    const itens = await getFilaDeTriagem(parseFiltros(req));
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

export async function revisaoManual(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const valor = req.body?.valor === true;
    const atualizado = await marcarRevisaoManual(id, valor);
    res.json(atualizado);
  } catch (err) { next(err); }
}
