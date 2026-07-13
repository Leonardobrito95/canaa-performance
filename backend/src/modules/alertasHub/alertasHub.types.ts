export interface AlertaHubItem {
  id: string;
  origem: 'atendimento' | 'vistoria';
  tipo: string;
  severidade: string;
  titulo: string;
  descricao: string;
  contexto: string | null;
  criado_em: Date;
  resolvido_em: Date | null;
  status: string;
}
