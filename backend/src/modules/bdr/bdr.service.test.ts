import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks do repositório ──────────────────────────────────────────────────────
vi.mock('./bdr.repository', () => ({
  fetchConsultantsFromIXC: vi.fn(),
  clearConsultantsCache:   vi.fn(),
  findContractById:        vi.fn(),
  findDuplicateCommission: vi.fn(() => Promise.resolve(null)),
  createCommission:        vi.fn((data) => Promise.resolve({ id: 'uuid-mock', ...data })),
  listCommissions:         vi.fn(() => Promise.resolve([])),
  createAdjustment:        vi.fn((data) => Promise.resolve({ id: 'uuid-mock', ...data })),
  listAdjustments:         vi.fn(() => Promise.resolve([])),
  deleteAdjustment:        vi.fn(() => Promise.resolve()),
}));

import * as repo from './bdr.repository';
import {
  registerCommission,
  addAdjustment,
  getAllCommissions,
} from './bdr.service';

// Helpers
const mockConsultants = (names: string[]) =>
  vi.mocked(repo.fetchConsultantsFromIXC).mockResolvedValue(names);

const mockContract = (valorAtual: number) =>
  vi.mocked(repo.findContractById).mockResolvedValue({
    id_contrato:  '12345',
    nome_cliente: 'Cliente Teste',
    plano_atual:  '100 MEGA',
    valor_atual:  valorAtual,
  });

// ─────────────────────────────────────────────────────────────────────────────

describe('registerCommission — Upgrade', () => {
  beforeEach(() => {
    mockConsultants(['Ana Paula']);
    mockContract(100);
  });

  it('calcula comissão = valor_novo − valor_atual', async () => {
    const result = await registerCommission({
      id_contrato:     '12345',
      vendedor:        'Ana Paula',
      tipo_negociacao: 'Upgrade',
      valor_novo:      250,
    });
    expect(Number(result.valor_comissao)).toBe(150); // 250 - 100
  });

  it('rejeita quando valor_novo ausente', async () => {
    await expect(
      registerCommission({ id_contrato: '12345', vendedor: 'Ana Paula', tipo_negociacao: 'Upgrade' })
    ).rejects.toThrow('obrigatório para Upgrade');
  });

  it('rejeita quando valor_novo <= valor_atual', async () => {
    await expect(
      registerCommission({ id_contrato: '12345', vendedor: 'Ana Paula', tipo_negociacao: 'Upgrade', valor_novo: 100 })
    ).rejects.toThrow('maior que o valor atual');
  });

  it('rejeita quando valor_novo < valor_atual (downgrade disfarçado)', async () => {
    await expect(
      registerCommission({ id_contrato: '12345', vendedor: 'Ana Paula', tipo_negociacao: 'Upgrade', valor_novo: 50 })
    ).rejects.toThrow('maior que o valor atual');
  });
});

describe('registerCommission — Downgrade', () => {
  beforeEach(() => {
    mockConsultants(['Ana Paula']);
    mockContract(100);
  });

  it('comissão é sempre R$ 0,00', async () => {
    const result = await registerCommission({
      id_contrato:     '12345',
      vendedor:        'Ana Paula',
      tipo_negociacao: 'Downgrade',
      valor_novo:      60,
    });
    expect(Number(result.valor_comissao)).toBe(0);
  });

  it('rejeita quando valor_novo >= valor_atual', async () => {
    await expect(
      registerCommission({ id_contrato: '12345', vendedor: 'Ana Paula', tipo_negociacao: 'Downgrade', valor_novo: 100 })
    ).rejects.toThrow('menor que o valor atual');
  });

  it('rejeita quando valor_novo ausente', async () => {
    await expect(
      registerCommission({ id_contrato: '12345', vendedor: 'Ana Paula', tipo_negociacao: 'Downgrade' })
    ).rejects.toThrow('obrigatório para Downgrade');
  });
});

describe('registerCommission — Refidelizacao', () => {
  beforeEach(() => {
    mockConsultants(['Ana Paula']);
    mockContract(100);
  });

  it('comissão é sempre R$ 3,00', async () => {
    const result = await registerCommission({
      id_contrato:     '12345',
      vendedor:        'Ana Paula',
      tipo_negociacao: 'Refidelizacao',
    });
    expect(Number(result.valor_comissao)).toBe(3.0);
  });

  it('não envia valor_novo para o repositório', async () => {
    await registerCommission({
      id_contrato:     '12345',
      vendedor:        'Ana Paula',
      tipo_negociacao: 'Refidelizacao',
    });
    const call = vi.mocked(repo.createCommission).mock.calls.at(-1)![0];
    expect(call.valor_novo).toBeUndefined();
  });
});

describe('registerCommission — validações gerais', () => {
  it('rejeita consultor não encontrado na lista IXC', async () => {
    mockConsultants(['Outro Consultor']);
    mockContract(100);

    await expect(
      registerCommission({ id_contrato: '12345', vendedor: 'Fulano', tipo_negociacao: 'Refidelizacao' })
    ).rejects.toThrow('não encontrado');
  });

  it('rejeita contrato inexistente', async () => {
    mockConsultants(['Ana Paula']);
    vi.mocked(repo.findContractById).mockResolvedValue(null);

    await expect(
      registerCommission({ id_contrato: '99999', vendedor: 'Ana Paula', tipo_negociacao: 'Refidelizacao' })
    ).rejects.toThrow('não encontrado ou inativo');
  });

  it('persiste o campo criado_por quando fornecido', async () => {
    mockConsultants(['Ana Paula']);
    mockContract(100);

    await registerCommission({
      id_contrato:     '12345',
      vendedor:        'Ana Paula',
      tipo_negociacao: 'Refidelizacao',
      criado_por:      'Gestor Silva',
    });

    const call = vi.mocked(repo.createCommission).mock.calls.at(-1)![0];
    expect(call.criado_por).toBe('Gestor Silva');
  });
});

describe('addAdjustment', () => {
  it('rejeita valor zero', async () => {
    await expect(
      addAdjustment({ vendedor: 'Ana Paula', descricao: 'Desconto', valor: 0 }, 'Gestor')
    ).rejects.toThrow('positivo');
  });

  it('rejeita valor negativo', async () => {
    await expect(
      addAdjustment({ vendedor: 'Ana Paula', descricao: 'Desconto', valor: -50 }, 'Gestor')
    ).rejects.toThrow('positivo');
  });

  it('cria ajuste com dados corretos', async () => {
    await addAdjustment({ vendedor: 'Ana Paula', descricao: 'Bônus', valor: 100 }, 'Gestor Silva');
    const call = vi.mocked(repo.createAdjustment).mock.calls.at(-1)![0];
    expect(call.registrado_por).toBe('Gestor Silva');
    expect(call.valor).toBe(100);
  });
});

describe('getAllCommissions', () => {
  it('passa filtro de vendedor para consultor', async () => {
    vi.mocked(repo.listCommissions).mockResolvedValue([]);
    await getAllCommissions('consultor', 'Ana Paula');
    expect(vi.mocked(repo.listCommissions)).toHaveBeenCalledWith(
      expect.objectContaining({ vendedor: 'Ana Paula' })
    );
  });

  it('não filtra por vendedor para gestor', async () => {
    vi.mocked(repo.listCommissions).mockResolvedValue([]);
    await getAllCommissions('gestor', 'Gestor Silva');
    expect(vi.mocked(repo.listCommissions)).toHaveBeenCalledWith(
      expect.objectContaining({ vendedor: undefined })
    );
  });
});
