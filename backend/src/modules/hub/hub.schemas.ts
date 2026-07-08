import { z } from 'zod';

// Ações de "visualizei este módulo" — logadas uma vez por navegação, não por
// chamada de API (evita poluir o log a cada refresh/filtro dentro do módulo).
export const MODULE_VIEW_ACTIONS = [
  'VIEW_VENDAS',
  'VIEW_COMISSAO',
  'VIEW_CAMPO',
  'VIEW_REGISTRO_BDR',
  'VIEW_BDR_DASHBOARD',
  'VIEW_RETENCAO',
  'VIEW_HUB',
  'VIEW_HUB_ADMIN',
  'VIEW_SALA_REUNIAO',
  'VIEW_OTDR',
] as const;

export const logModuleViewSchema = z.object({
  action: z.enum(MODULE_VIEW_ACTIONS),
  detail: z.string().max(200).optional(),
});
