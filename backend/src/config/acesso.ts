export const PERFIS_MODULO = {
  atendimentoGestaoQa: ['gestor', 'cs'] as const,
  atendimentoAuditoria: ['gestor'] as const,
  vistoriaPop: ['gestor', 'campo'] as const,
  posAtivacao: ['gestor', 'campo', 'cs'] as const,
  retencaoAuditoria: ['gestor'] as const,
  diagnosticoGestao: ['gestor'] as const,
  bdrGeral: ['consultor', 'gestor', 'cs', 'estoque', 'campo'] as const,
  otdrLink: ['gestor', 'campo'] as const,
  alertasHub: ['gestor', 'cs', 'campo'] as const,
  rh: ['gestor'] as const,
} as const;
