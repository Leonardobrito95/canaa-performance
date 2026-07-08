import { z } from 'zod';

export const registerCommissionBodySchema = z.object({
  id_contrato:     z.string().min(1),
  vendedor:        z.string().min(1),
  tipo_negociacao: z.enum(['Upgrade', 'Downgrade', 'Refidelizacao']),
  plano_novo:      z.string().min(1).nullish(),
  valor_novo:      z.coerce.number().finite().nullish(),
});

export const createAdjustmentBodySchema = z.object({
  vendedor:  z.string().min(1),
  descricao: z.string().min(1),
  valor:     z.coerce.number().finite(),
});

export type RegisterCommissionBody = z.infer<typeof registerCommissionBodySchema>;
export type CreateAdjustmentBody   = z.infer<typeof createAdjustmentBodySchema>;
