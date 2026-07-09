import { z } from 'zod';

export const buscarClienteQuerySchema = z.object({
  termo: z.string().min(3, 'Digite ao menos 3 caracteres.').max(100),
});

const historicoTurnoSchema = z.object({
  pergunta: z.string().max(2000),
  resposta: z.string().max(4000),
});

export const consultaBodySchema = z.object({
  id_cliente: z.number().int().positive(),
  pergunta: z.string().max(2000).optional(),
  // Últimas perguntas/respostas dessa mesma conversa (o backend não guarda
  // sessão) — permite a IA resolver referências como "e os atendimentos?"
  // que só fazem sentido junto da pergunta anterior.
  historico: z.array(historicoTurnoSchema).max(8).optional(),
});

export const historicoParamsSchema = z.object({
  id_cliente: z.string().regex(/^\d+$/, 'id_cliente deve ser numérico'),
});

const CATEGORIAS_REGRA = ['VENDAS', 'RETENCAO', 'REDE', 'COMISSAO'] as const;

export const regraNegocioBodySchema = z.object({
  chave: z.string().min(2).max(80).regex(/^[A-Z0-9_]+$/, 'Use apenas maiúsculas, números e _'),
  valor: z.string().min(1).max(500),
  descricao: z.string().min(1).max(1000),
  categoria: z.enum(CATEGORIAS_REGRA),
});

export const regraNegocioUpdateBodySchema = regraNegocioBodySchema.omit({ chave: true });

export const regraNegocioParamsSchema = z.object({
  chave: z.string().min(2).max(80),
});
