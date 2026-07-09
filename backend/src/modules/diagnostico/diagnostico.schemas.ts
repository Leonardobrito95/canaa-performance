import { z } from 'zod';

export const consultaBodySchema = z.object({
  id_cliente: z.number().int().positive(),
  pergunta: z.string().max(2000).optional(),
});

export const historicoParamsSchema = z.object({
  id_cliente: z.string().regex(/^\d+$/, 'id_cliente deve ser numérico'),
});
