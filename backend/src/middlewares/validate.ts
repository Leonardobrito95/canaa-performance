import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

type Source = 'params' | 'query' | 'body';

/** Valida req[source] contra um schema zod. Em caso de falha, responde 400 sem chegar ao controller. */
export function validate(source: Source, schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      res.status(400).json({
        message: 'Parâmetros inválidos.',
        erros: result.error.issues.map((i) => ({ campo: i.path.join('.'), motivo: i.message })),
      });
      return;
    }
    req[source] = result.data as any;
    next();
  };
}
