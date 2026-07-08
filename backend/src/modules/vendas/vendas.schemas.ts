import { z } from 'zod';

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const dataRegex = /^\d{4}-\d{2}-\d{2}$/;

export const mesParamSchema = z.object({
  mes: z.string().regex(mesRegex, 'Formato esperado: YYYY-MM (ex: 2025-03)'),
});

export const contractsQuerySchema = z.object({
  dateFrom: z.string().regex(dataRegex, 'Formato esperado: YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(dataRegex, 'Formato esperado: YYYY-MM-DD').optional(),
  vendedor: z.string().max(200).optional(),
});
