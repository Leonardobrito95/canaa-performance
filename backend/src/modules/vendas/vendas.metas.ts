/// Meta de vendas B2C — fonte única, usada tanto pelo relatório de comissão
/// (gate real de pagamento, comissao-relatorio.service.ts) quanto pelo card
/// de KPI do dashboard (vendas.service.ts). Antes duplicada como constante
/// solta nos dois arquivos — risco real de ficarem dessincronizados (é
/// exatamente o que gerou a confusão de 2026-07-19: o snapshot/relatório
/// automático do dia 19 já tinha saído com a meta antiga antes da correção).
const META_B2C_PADRAO = 10_000;

/// Exceções pontuais por mês de referência ('YYYY-MM') — a meta B2C não tem
/// histórico por mês no banco, é sempre a mesma constante até alguém mudar o
/// código. Quando a gestão revoga a meta pra um mês específico (em vez de
/// mudar em definitivo), a exceção entra aqui.
///
/// 2026-06: revogada de volta pra R$8.000 (valor vigente antes de
/// junho/2026, quando passou a R$10.000) — pedido explícito do usuário
/// 2026-07-19, só pra esse mês. A partir de julho/2026 o setor de Vendas
/// entra em reestruturação e o método de comissão deve mudar de novo (não
/// necessariamente vai ser mais essa mesma conta de meta/gate binário) —
/// não antecipar essa mudança aqui, só tratar quando ela vier definida.
const EXCECOES_META_B2C: Record<string, number> = {
  '2026-06': 8_000,
};

export function metaB2CParaMes(mesReferencia: string | undefined): number {
  if (mesReferencia && mesReferencia in EXCECOES_META_B2C) {
    return EXCECOES_META_B2C[mesReferencia];
  }
  return META_B2C_PADRAO;
}

export const META_B2B = 7_000;
