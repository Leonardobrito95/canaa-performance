// ============================================================
// VISTORIA DE POP — Tipos do módulo de inspeção técnica de POP
// Lê public.vistoria_pop/vistoria_pendencias (porta 5002, sistema externo,
// mesma instância Postgres sistema_db) — ver vistoriaPop.repository.ts.
// ============================================================

/// Categorias de segurança crítica — mesmas usadas em vistoria_pendencias.categoria
/// no dado real (confirmado 2026-07-13: Extintor, Gerador, Banco de Baterias).
export const CATEGORIAS_SEGURANCA = ['Extintor', 'Gerador', 'Banco de Baterias'] as const;

export interface VistoriaResumoPop {
  popName:           string;
  ultimaVistoria:    string | null;
  inspetor:          string | null;
  diasDesde:         number | null;
  pendenciasAbertas: number;
}

export interface VistoriaPendencia {
  id:                number;
  popName:           string;
  categoria:         string;
  descricao:         string;
  dataIdentificacao: string | null;
  status:            string;
  observacoes:       string | null;
  diasAberta:        number | null;
}

export interface VistoriaHistoricoItem {
  submissionId:   number;
  popName:        string;
  inspectorName:  string;
  submissionTime: string | null;
  formData:       Record<string, unknown>;
  photos:         string[];
}
