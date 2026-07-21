import {
  findContractById,
  createCommission,
  listCommissions,
  fetchConsultantsFromIXC,
  clearConsultantsCache,
  fetchPlansFromDB,
  createAdjustment,
  listAdjustments,
  deleteAdjustment,
  ContractData,
  findDuplicateCommission,
} from './bdr.repository';
import { COMISSAO_BDR_REFIDELIZACAO, COMISSAO_BDR_DOWNGRADE } from '../../config/comissoes';

const httpError = (msg: string, status: number) =>
  Object.assign(new Error(msg), { status });

export async function getContract(id_contrato: string): Promise<ContractData> {
  const contract = await findContractById(id_contrato);
  if (!contract) {
    throw httpError(`Contrato ${id_contrato} não encontrado ou inativo.`, 404);
  }
  return contract;
}

export async function registerCommission(payload: {
  id_contrato: string;
  vendedor: string;
  tipo_negociacao: 'Upgrade' | 'Downgrade' | 'Refidelizacao';
  plano_novo?: string;
  valor_novo?: number;
  criado_por?: string;
}) {
  const { id_contrato, vendedor, tipo_negociacao, plano_novo, valor_novo, criado_por } = payload;

  const consultants = await fetchConsultantsFromIXC();
  const vendedorNorm = vendedor.trim().toLowerCase();
  const encontrado = consultants.some((c) => c.trim().toLowerCase() === vendedorNorm);
  if (!encontrado) {
    throw httpError(`Consultor "${vendedor}" não encontrado.`, 400);
  }

  const contract = await findContractById(id_contrato);
  if (!contract) {
    throw httpError(`Contrato ${id_contrato} não encontrado ou inativo.`, 404);
  }

  const duplicate = await findDuplicateCommission(id_contrato, tipo_negociacao);
  if (duplicate) {
    const data = new Date(duplicate.data_registro).toLocaleDateString('pt-BR');
    throw httpError(
      `Já existe um lançamento de ${tipo_negociacao} para o contrato ${id_contrato} neste mês (registrado em ${data}).`,
      409,
    );
  }

  if (tipo_negociacao === 'Upgrade') {
    if (valor_novo == null) {
      throw httpError('O campo valor_novo é obrigatório para Upgrade.', 400);
    }
    if (valor_novo <= contract.valor_atual) {
      throw httpError('Para Upgrade, o valor novo deve ser maior que o valor atual.', 400);
    }
  }

  if (tipo_negociacao === 'Downgrade') {
    if (valor_novo == null) {
      throw httpError('O campo valor_novo é obrigatório para Downgrade.', 400);
    }
    if (valor_novo >= contract.valor_atual) {
      throw httpError('Para Downgrade, o valor novo deve ser menor que o valor atual.', 400);
    }
  }

  const valor_comissao =
    tipo_negociacao === 'Upgrade'       ? (valor_novo! - contract.valor_atual) :
    tipo_negociacao === 'Refidelizacao' ? COMISSAO_BDR_REFIDELIZACAO :
    COMISSAO_BDR_DOWNGRADE;

  const temValorNovo = tipo_negociacao === 'Upgrade' || tipo_negociacao === 'Downgrade';

  return createCommission({
    id_contrato,
    nome_cliente: contract.nome_cliente,
    vendedor,
    tipo_negociacao,
    plano_atual:    contract.plano_atual,
    plano_novo:     plano_novo ?? undefined,
    valor_atual:    contract.valor_atual,
    valor_novo:     temValorNovo ? valor_novo : undefined,
    valor_comissao,
    criado_por,
  });
}

export async function getAllCommissions(
  perfil: 'consultor' | 'gestor' | 'cs' | 'estoque' | 'campo' | 'agente',
  nome: string,
  filter: { dateFrom?: string; dateTo?: string; cursor?: string; take?: number } = {},
) {
  return listCommissions({
    vendedor: perfil === 'consultor' ? nome : undefined,
    ...filter,
  });
}

export async function getConsultants() {
  return fetchConsultantsFromIXC();
}

export async function refreshConsultants() {
  clearConsultantsCache();
  return fetchConsultantsFromIXC();
}

export async function getPlans(): Promise<string[]> {
  return fetchPlansFromDB();
}

// ── Adjustments ───────────────────────────────────────────────────────────────

export async function getAdjustments(perfil: string, nome: string) {
  return listAdjustments(perfil === 'consultor' ? nome : undefined);
}

export async function addAdjustment(
  payload: { vendedor: string; descricao: string; valor: number },
  registrado_por: string,
) {
  if (!payload.vendedor || !payload.descricao || payload.valor == null) {
    throw httpError('Campos obrigatórios: vendedor, descricao, valor.', 400);
  }
  if (payload.valor <= 0) {
    throw httpError('O valor do desconto deve ser positivo.', 400);
  }
  return createAdjustment({ ...payload, registrado_por });
}

export async function removeAdjustment(id: string, deletado_por: string) {
  return deleteAdjustment(id, deletado_por);
}
