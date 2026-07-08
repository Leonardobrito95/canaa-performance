<template>
  <div class="bdr-form-wrap">

    <!-- Warning -->
    <div class="warn-banner">
      <div class="warn-icon-wrap">⚠</div>
      <div class="warn-content">
        <div class="warn-title">Atenção — Upgrade/Downgrade</div>
        <div class="warn-body">
          Registre a comissão <em>antes</em> de atualizar o contrato no IXC.
          Após a atualização o valor atual será sobrescrito e a comissão não poderá ser calculada corretamente.
        </div>
      </div>
    </div>

    <form class="bdr-form" @submit.prevent="handleSubmit">

      <!-- Consultor + ID Contrato -->
      <div class="form-row-2">
        <div class="form-group">
          <div class="label-row">
            <label class="form-label" for="vendedor">Consultor</label>
            <button v-if="isGestor" type="button" class="btn-refresh-list" :disabled="loadingConsultants" @click="doRefreshConsultants" title="Atualizar lista do IXC">
              <svg :class="['refresh-icon', loadingConsultants ? 'spin' : '']" width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ loadingConsultants ? 'Atualizando...' : 'Atualizar lista' }}
            </button>
          </div>
          <!-- Gestor: select com lista do IXC -->
          <select v-if="isGestor" id="vendedor" v-model="form.vendedor" required :disabled="loadingConsultants">
            <option value="" disabled>{{ loadingConsultants ? 'Carregando...' : 'Selecione o consultor' }}</option>
            <option v-for="c in consultants" :key="c" :value="c">{{ c }}</option>
          </select>
          <!-- Consultor: exibe o próprio nome como campo fixo -->
          <input v-else id="vendedor" :value="user?.nome" disabled />
        </div>

        <div class="form-group">
          <label class="form-label" for="id_contrato">ID do Contrato</label>
          <div class="input-row">
            <input
              id="id_contrato"
              v-model="form.id_contrato"
              type="text"
              placeholder="Ex: 44925"
              required
              :disabled="contractLoading"
              @blur="fetchContract"
              @keydown.enter.prevent="fetchContract"
            />
            <span v-if="contractLoading" class="status-pill loading">
              <svg class="spin" width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="14 8" stroke-linecap="round"/>
              </svg>
              Buscando
            </span>
            <span v-else-if="contractOk"    class="status-pill ok">Encontrado</span>
            <span v-else-if="contractError" class="status-pill error">Não encontrado</span>
          </div>
        </div>
      </div>

      <!-- Contract card -->
      <div v-if="contractOk" class="contract-card">
        <div class="ccard-section">
          <div class="ccard-label">Cliente</div>
          <div class="ccard-value">{{ contract?.nome_cliente }}</div>
        </div>
        <div class="ccard-divider"></div>
        <div class="ccard-section">
          <div class="ccard-label">Plano Atual</div>
          <div class="ccard-value">{{ contract?.plano_atual || '—' }}</div>
        </div>
        <div class="ccard-divider"></div>
        <div class="ccard-section ccard-right">
          <div class="ccard-label">Valor Atual</div>
          <div class="ccard-amount">{{ formatCurrency(contract?.valor_atual) }}</div>
        </div>
      </div>

      <!-- Tipo de Negociação -->
      <div class="form-group">
        <label class="form-label">Tipo de Negociação</label>
        <div class="type-pills">
          <label v-for="tipo in tipos" :key="tipo" :class="['type-pill', form.tipo_negociacao === tipo ? `selected-${tipo.toLowerCase()}` : '']">
            <input type="radio" v-model="form.tipo_negociacao" :value="tipo" required />
            {{ tipo }}
          </label>
        </div>
      </div>

      <!-- Novo Plano + Novo Valor -->
      <div v-if="form.tipo_negociacao === 'Upgrade' || form.tipo_negociacao === 'Downgrade'" class="form-row-2">
        <div class="form-group">
          <label class="form-label" for="plano_novo_search">Novo Plano</label>
          <div class="combobox-wrap" ref="comboboxWrap">
            <input
              id="plano_novo_search"
              v-model="planoSearch"
              type="text"
              placeholder="Buscar plano..."
              autocomplete="off"
              :class="['combobox-input', planoSearch && !form.plano_novo ? 'combobox-input--invalid' : '']"
              @focus="planoOpen = true"
              @input="planoOpen = true; form.plano_novo = ''"
              @keydown.escape="planoOpen = false"
              @keydown.enter.prevent="selectFirstPlano"
            />
            <ul v-if="planoOpen && planoFiltered.length" class="combobox-list">
              <li v-for="p in planoFiltered" :key="p" :class="['combobox-item', form.plano_novo === p ? 'combobox-item--selected' : '']" @mousedown.prevent="selectPlano(p)">{{ p }}</li>
            </ul>
            <div v-if="planoOpen && planoSearch && !planoFiltered.length" class="combobox-empty">Nenhum plano encontrado</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="valor_novo">
            Novo Valor (R$)
            <span v-if="form.tipo_negociacao === 'Downgrade'" class="label-hint">— menor que o atual</span>
          </label>
          <input
            id="valor_novo"
            v-model.number="form.valor_novo"
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            required
            style="font-family: var(--font-mono);"
          />
        </div>
      </div>

      <!-- Commission preview -->
      <div v-if="previewComissao !== null" class="commission-box">
        <div>
          <div class="commission-label">Comissão estimada</div>
          <div class="commission-sub">Baseado nos valores informados</div>
        </div>
        <span class="commission-amount">{{ formatCurrency(previewComissao) }}</span>
      </div>

      <button type="submit" :disabled="submitting || !contractOk" class="btn-primary">
        {{ submitting ? 'Salvando...' : 'Registrar Comissão' }}
      </button>

      <div v-if="successMsg" class="alert-msg success">✓ {{ successMsg }}</div>
      <div v-if="errorMsg"   class="alert-msg error">✕ {{ errorMsg }}</div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { bdrApi, type ContractData } from '../services/api';
import { useAuth } from '../composables/useAuth';

const { user, isGestor } = useAuth();

const emit = defineEmits<{ (e: 'registered'): void }>();

const tipos = ['Upgrade', 'Downgrade', 'Refidelizacao'] as const;

const consultants        = ref<string[]>([]);
const loadingConsultants = ref(false);
const plans              = ref<string[]>([]);
const planoSearch        = ref('');
const planoOpen          = ref(false);
const comboboxWrap       = ref<HTMLElement | null>(null);
const contract           = ref<ContractData | null>(null);
const contractLoading    = ref(false);
const contractOk         = ref(false);
const contractError      = ref(false);
const submitting         = ref(false);
const successMsg         = ref('');
const errorMsg           = ref('');

const planoFiltered = computed(() =>
  plans.value.filter((p) => p.toLowerCase().includes(planoSearch.value.toLowerCase()))
);

function selectPlano(p: string) {
  form.value.plano_novo = p;
  planoSearch.value = p;
  planoOpen.value = false;
}

function selectFirstPlano() {
  if (planoFiltered.value.length) selectPlano(planoFiltered.value[0]);
}

function handleOutsideClick(e: MouseEvent) {
  if (comboboxWrap.value && !comboboxWrap.value.contains(e.target as Node)) {
    planoOpen.value = false;
  }
}

onUnmounted(() => document.removeEventListener('mousedown', handleOutsideClick));

const form = ref({
  vendedor: '',
  id_contrato: '',
  tipo_negociacao: '' as 'Upgrade' | 'Downgrade' | 'Refidelizacao' | '',
  plano_novo: '',
  valor_novo: undefined as number | undefined,
});

const previewComissao = computed(() => {
  if (!contractOk.value || !form.value.tipo_negociacao) return null;
  if (form.value.tipo_negociacao === 'Upgrade') {
    if (!form.value.valor_novo || !contract.value) return null;
    return form.value.valor_novo - contract.value.valor_atual;
  }
  if (form.value.tipo_negociacao === 'Refidelizacao') return 3.0;
  if (form.value.tipo_negociacao === 'Downgrade')     return 0.0;
  return null;
});

onMounted(async () => {
  document.addEventListener('mousedown', handleOutsideClick);
  loadingConsultants.value = true;
  try {
    [consultants.value, plans.value] = await Promise.all([
      bdrApi.getConsultants(),
      bdrApi.getPlans(),
    ]);
    if (!isGestor.value && user.value) {
      form.value.vendedor = user.value.nome;
    }
  } finally {
    loadingConsultants.value = false;
  }
});

async function doRefreshConsultants() {
  loadingConsultants.value = true;
  try {
    const r = await bdrApi.refreshConsultants();
    consultants.value = r.consultants;
  } finally {
    loadingConsultants.value = false;
  }
}

async function fetchContract() {
  const id = form.value.id_contrato.trim();
  if (!id) return;
  contractOk.value = false;
  contractError.value = false;
  contract.value = null;
  contractLoading.value = true;
  try {
    contract.value = await bdrApi.getContract(id);
    contractOk.value = true;
  } catch {
    contractError.value = true;
  } finally {
    contractLoading.value = false;
  }
}

async function handleSubmit() {
  successMsg.value = '';
  errorMsg.value = '';
  const needsPlano = form.value.tipo_negociacao === 'Upgrade' || form.value.tipo_negociacao === 'Downgrade';
  if (needsPlano && !form.value.plano_novo) {
    errorMsg.value = 'Selecione o novo plano na lista.';
    return;
  }
  submitting.value = true;
  try {
    const temValorNovo = needsPlano;
    await bdrApi.registerCommission({
      id_contrato:     form.value.id_contrato,
      vendedor:        form.value.vendedor,
      tipo_negociacao: form.value.tipo_negociacao as 'Upgrade' | 'Downgrade' | 'Refidelizacao',
      plano_novo:      form.value.plano_novo || undefined,
      valor_novo:      temValorNovo ? form.value.valor_novo : undefined,
    });
    successMsg.value = 'Comissão registrada com sucesso!';
    emit('registered');
    resetForm();
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string } } };
    errorMsg.value = e.response?.data?.message ?? 'Erro ao registrar comissão.';
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  const vendedor = !isGestor.value && user.value ? user.value.nome : '';
  form.value = { vendedor, id_contrato: '', tipo_negociacao: '', plano_novo: '', valor_novo: undefined };
  planoSearch.value = '';
  planoOpen.value = false;
  contract.value = null;
  contractOk.value = false;
  contractError.value = false;
}

function formatCurrency(value?: number | null) {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
</script>

<style scoped>
/* ── Layout ── */
.bdr-form-wrap { display: flex; flex-direction: column; gap: 1.25rem; }
.bdr-form { display: flex; flex-direction: column; gap: 1.25rem; }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

/* ── Warning ── */
.warn-banner {
  display: flex; gap: 1rem; align-items: flex-start;
  background: rgba(245,158,11,.11);
  background-image: radial-gradient(ellipse 80% 100% at 0% 50%, rgba(245,158,11,.18), transparent 70%);
  border-radius: var(--radius-sm);
  padding: 1rem 1.25rem;
}
.warn-icon-wrap {
  width: 34px; height: 34px; flex-shrink: 0;
  background: rgba(245,158,11,.18);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
  filter: drop-shadow(0 0 8px rgba(245,158,11,.45));
  color: #e8a825;
  margin-top: 1px;
}
.warn-title {
  font-size: .88rem; font-weight: 700; color: #e8a825;
  letter-spacing: .01em; margin-bottom: .25rem;
}
.warn-body {
  font-size: .81rem; color: #c8891a; line-height: 1.6;
}
.warn-body em { font-style: normal; font-weight: 700; color: #e8a825; text-decoration: underline; text-underline-offset: 2px; }

/* ── Labels ── */
.label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: .35rem; }
.label-row .form-label { margin-bottom: 0; }

/* ── Refresh button ── */
.btn-refresh-list {
  display: inline-flex; align-items: center; gap: .3rem;
  background: none; border: none; cursor: pointer;
  font-size: .7rem; font-weight: 600; color: var(--text-3);
  font-family: var(--font-body); transition: color .15s; padding: 0;
}
.btn-refresh-list:hover:not(:disabled) { color: var(--accent); }
.btn-refresh-list:disabled { opacity: .4; cursor: not-allowed; }
.refresh-icon { flex-shrink: 0; }

/* ── Spinner ── */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .7s linear infinite; flex-shrink: 0; }

/* ── Status pill ── */
.status-pill { display: inline-flex; align-items: center; gap: .3rem; }

/* ── Contract card ── */
.contract-card {
  display: flex; align-items: center; gap: 0;
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  padding: 0;
  overflow: hidden;
  animation: slideDown .15s ease;
}
@keyframes slideDown { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }

.ccard-section { flex: 1; padding: .9rem 1.1rem; }
.ccard-right { text-align: right; background: rgba(0,240,255,.04); }
.ccard-divider { width: 1px; background: var(--border); align-self: stretch; flex-shrink: 0; }

/* ── Combobox ── */
.combobox-wrap { position: relative; }
.combobox-input { width: 100%; }
.combobox-input--invalid { border-color: var(--error) !important; }
.combobox-list {
  position: absolute; z-index: 100; width: 100%;
  background: var(--surface-2); border: 1px solid var(--border-2);
  border-radius: var(--radius-sm); margin-top: 3px; padding: 4px 0;
  max-height: 220px; overflow-y: auto; list-style: none;
  box-shadow: 0 12px 32px rgba(0,0,0,.5);
}
.combobox-item {
  padding: .48rem .85rem; cursor: pointer; font-size: .86rem;
  color: var(--text); transition: background .1s;
}
.combobox-item:hover { background: var(--surface-3); }
.combobox-item--selected { background: var(--accent-dim); color: var(--accent); }
.combobox-empty { padding: .55rem .85rem; font-size: .8rem; color: var(--text-3); font-style: italic; }

/* ── Commission box ── */
.commission-sub { font-size: .72rem; color: var(--text-3); margin-top: .15rem; }
</style>
