<template>
  <div class="view-comissao">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Comissões</h1>
        <p class="page-sub">Resumo de comissões no período selecionado</p>
      </div>
      <div class="header-actions">
        <!-- Ações de snapshot (apenas gestor + mês específico) -->
        <template v-if="isGestor && mesReferencia">
          <transition name="fade-msg">
            <span v-if="snapMsg" class="snap-msg">{{ snapMsg }}</span>
          </transition>
          <!-- Sem snapshot: botão para gerar -->
          <button v-if="!snapMeta || snapMeta.source === 'live'" class="btn-snap" @click="gerarSnapshot" :disabled="snapSaving || loading">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3.5 6.5l3 3 3-3M2 11h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ snapSaving ? 'Gerando...' : 'Gerar Snapshot' }}
          </button>
          <!-- Snapshot existe, ainda não enviado: botão para enviar -->
          <button v-else-if="snapMeta.source === 'snapshot' && !snapMeta.enviado_pagamento" class="btn-pagar" @click="enviarParaPagamento" :disabled="snapSaving">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l3.5 3.5L11 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ snapSaving ? 'Enviando...' : 'Enviar para Pagamento' }}
          </button>
          <!-- Já enviado: badge informativo -->
          <span v-else-if="snapMeta?.enviado_pagamento" class="badge-enviado">
            ✓ Enviado em {{ fmtDate(snapMeta.data_envio!) }} por {{ snapMeta.enviado_por }}
          </span>
        </template>

        <button class="btn-refresh" @click="load" :disabled="loading">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Atualizar
        </button>
      </div>
    </div>

    <!-- Banner de fonte dos dados -->
    <div v-if="mesReferencia && snapMeta" :class="['source-banner', snapMeta.source]">
      <span v-if="snapMeta.source === 'snapshot'">
        <strong>Dados históricos</strong> · Snapshot salvo em {{ fmtDate(snapMeta.data_snapshot!) }}
      </span>
      <span v-else>
        <strong>Dados ao vivo (IXC)</strong> · Nenhum snapshot salvo para {{ mesLabel }}
      </span>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <PeriodFilter
        v-model:model-period="period"
        v-model:model-month="customMonth"
        v-model:model-year="customYear"
        @change="onPeriodChange"
      />
      <div v-if="isGestor" class="filter-group">
        <label class="filter-label">Consultor</label>
        <select v-model="f.vendedor" @change="load">
          <option value="">Todos</option>
          <option v-for="v in vendedores" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
      <button class="btn-filter-clear" @click="clearFilters">Limpar</button>
    </div>

    <div v-if="loading" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Calculando comissões...
    </div>
    <div v-else-if="error" class="state-msg" style="color:var(--error)">{{ error }}</div>

    <template v-else>

      <!-- Grand total -->
      <div class="grand-total-bar">
        <div class="gt-left">
          <div class="gt-label">Total Líquido a Pagar</div>
          <div class="gt-value">{{ fmt(totalLiquido) }}</div>
        </div>
        <div class="gt-breakdown">
          <div class="gt-item vendas">
            <span class="gt-item-label">Vendas</span>
            <span class="gt-item-val">{{ fmt(comissaoVendasLiberada) }}</span>
          </div>
          <span class="gt-sep">+</span>
          <div class="gt-item bdr">
            <span class="gt-item-label">BDR</span>
            <span class="gt-item-val">{{ fmt(comissaoBdrTotal) }}</span>
          </div>
          <template v-if="totalDescontos > 0">
            <span class="gt-sep">−</span>
            <div class="gt-item desconto">
              <span class="gt-item-label">Descontos</span>
              <span class="gt-item-val">{{ fmt(totalDescontos) }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Charts -->
      <div v-if="vendasContracts.length || bdrFiltered.length" :class="['charts-row', isGestor ? 'charts-3' : 'charts-2']">
        <ChartDonut
          title="Composição da Comissão"
          center-label="total"
          :segments="[
            { label: 'Vendas', value: Math.round(comissaoVendasLiberada * 100) / 100, color: '#c7ff00' },
            { label: 'BDR',    value: Math.round(comissaoBdrTotal * 100)       / 100, color: '#a855f7' },
          ]"
        />
        <ChartDonut
          title="Status das Vendas"
          center-label="contratos"
          :segments="[
            { label: 'Liberadas',  value: vendasStatusData.liberadas,  color: '#c7ff00' },
            { label: 'Bloqueadas', value: vendasStatusData.bloqueadas, color: '#ff2a5f' },
            { label: 'Pendentes',  value: vendasStatusData.pendentes,  color: '#f59e0b' },
          ]"
        />
        <ChartRanking
          v-if="isGestor"
          title="Ranking de Comissões"
          :items="rankingTotalData"
          :max-items="8"
          :highlight-name="user?.nome"
        />
      </div>

      <!-- Resumo por consultor (gestor) -->
      <template v-if="isGestor">
        <div class="section-label">Resumo por Consultor</div>
        <div class="consultant-grid">
          <div v-for="c in summaryByConsultor" :key="c.nome" class="consultant-card" :class="c.metaAtingida ? 'cc-ok' : 'cc-nok'">

            <!-- Header: nome + tag de meta -->
            <div class="cc-header">
              <span class="cc-name">{{ c.nome }}</span>
              <span :class="['cc-meta-tag', c.metaAtingida ? 'ok' : 'nok']">
                {{ c.metaAtingida ? 'META ✓' : 'ABAIXO' }}
              </span>
            </div>

            <!-- Barra de progresso da meta -->
            <div class="cc-meta-bar-wrap">
              <div
                class="cc-meta-bar-fill"
                :class="c.metaAtingida ? 'ok' : 'nok'"
                :style="{ width: Math.min((c.valorAtivadoMensal / c.metaAlvo) * 100, 100) + '%' }"
              />
            </div>
            <div class="cc-meta-info">
              <span>{{ fmt(c.valorAtivadoMensal) }} / {{ fmt(c.metaAlvo) }}</span>
              <span class="cc-meta-dim">base ativada</span>
            </div>

            <!-- Composição -->
            <div class="cc-rows">
              <div class="cc-row">
                <span class="cc-key">Vendas</span>
                <span class="cc-val success">{{ fmt(c.vendas) }}</span>
              </div>
              <div class="cc-row">
                <span class="cc-key">BDR</span>
                <span class="cc-val refid">{{ fmt(c.bdr) }}</span>
              </div>
              <div v-if="c.descontos > 0" class="cc-row">
                <span class="cc-key">Descontos</span>
                <span class="cc-val error">-{{ fmt(c.descontos) }}</span>
              </div>
            </div>

            <!-- Comissão real a pagar -->
            <div class="cc-total-row" :class="c.metaAtingida ? '' : 'cc-zero'">
              <span class="cc-total-label">Comissão a Pagar</span>
              <span class="cc-total-val">{{ fmt(c.comissaoReal) }}</span>
            </div>
            <div v-if="!c.metaAtingida" class="cc-zero-hint">
              Meta não atingida. Comissão bloqueada.
            </div>

          </div>
          <div v-if="summaryByConsultor.length === 0" class="state-msg">
            Nenhuma comissão no período.
          </div>
        </div>
      </template>

      <!-- Resumo pessoal (consultor) -->
      <template v-else>
        <div class="section-label">Meu Resumo</div>
        <div class="personal-summary">
          <div class="ps-card vendas-card">
            <div class="ps-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 11L5.5 7.5L8.5 10.5L14 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="ps-body">
              <span class="ps-label">Comissão Vendas</span>
              <span class="ps-value success">{{ fmt(comissaoVendasLiberada) }}</span>
              <span class="ps-detail">{{ vendasContracts.filter(c => c.status_comissao === 'Liberada').length }} contrato(s) liberado(s)</span>
            </div>
          </div>
          <div class="ps-card bdr-card">
            <div class="ps-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h6M5 5.5h6M5 10.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
            <div class="ps-body">
              <span class="ps-label">Comissão BDR</span>
              <span class="ps-value refid">{{ fmt(comissaoBdrTotal) }}</span>
              <span class="ps-detail">{{ bdrFiltered.length }} lançamento(s)</span>
            </div>
          </div>
          <div v-if="totalDescontos > 0" class="ps-card desconto-card">
            <div class="ps-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
            <div class="ps-body">
              <span class="ps-label">Descontos Aplicados</span>
              <span class="ps-value error">-{{ fmt(totalDescontos) }}</span>
              <span class="ps-detail">{{ adjustmentsFiltered.length }} ajuste(s)</span>
            </div>
          </div>
          <div class="ps-card total-card">
            <div class="ps-body">
              <span class="ps-label">Total Líquido</span>
              <span class="ps-value accent large">{{ fmt(totalLiquido) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Seção de Descontos / Ajustes ── -->
      <div class="section-label" style="margin-top:1.5rem">
        Descontos / Ajustes
        <button v-if="isGestor" class="btn-add-adj" @click="showAdjForm = !showAdjForm">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Registrar desconto
        </button>
      </div>

      <!-- Formulário de ajuste (gestor) -->
      <Transition name="slide">
        <div v-if="isGestor && showAdjForm" class="adj-form">
          <div class="adj-form-grid">
            <div class="filter-group">
              <label class="filter-label">Consultor</label>
              <select v-model="adjForm.vendedor">
                <option value="">Selecione...</option>
                <option v-for="v in vendedores" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>
            <div class="filter-group">
              <label class="filter-label">Valor do Desconto (R$)</label>
              <input type="number" min="0.01" step="0.01" v-model="adjForm.valor" placeholder="0,00" />
            </div>
            <div class="filter-group adj-desc-group">
              <label class="filter-label">Motivo / Descrição</label>
              <input type="text" v-model="adjForm.descricao" placeholder="Ex: Pagamento duplicado em março" />
            </div>
            <div class="adj-actions">
              <button class="btn-primary" @click="submitAdjustment" :disabled="adjSaving">
                {{ adjSaving ? 'Salvando...' : 'Confirmar' }}
              </button>
              <button class="btn-filter-clear" @click="showAdjForm = false">Cancelar</button>
            </div>
          </div>
          <div v-if="adjError" class="alert-msg error" style="margin-top:.5rem">{{ adjError }}</div>
        </div>
      </Transition>

      <!-- Tabela de ajustes -->
      <div v-if="adjustmentsFiltered.length === 0" class="adj-empty">
        Nenhum desconto registrado no período.
      </div>
      <div v-else class="table-wrapper adj-table">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th v-if="isGestor">Consultor</th>
              <th>Descrição</th>
              <th>Registrado por</th>
              <th>Valor</th>
              <th v-if="isGestor"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in adjustmentsFiltered" :key="a.id">
              <td class="td-date">{{ fmtDate(a.data_registro) }}</td>
              <td v-if="isGestor"><span class="vendedor-badge">{{ a.vendedor }}</span></td>
              <td>{{ a.descricao }}</td>
              <td class="td-date">{{ a.registrado_por }}</td>
              <td class="td-commission" style="color:var(--downgrade)">-{{ fmt(parseFloat(a.valor)) }}</td>
              <td v-if="isGestor">
                <button class="btn-del" @click="removeAdj(a.id)" title="Remover">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </template>
  </div>

  <!-- Modal: confirmar envio para pagamento -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showConfirmModal" class="modal-backdrop" @click.self="showConfirmModal = false">
        <div class="modal-box" role="dialog" aria-modal="true">
          <div class="modal-header">
            <span class="modal-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2a7 7 0 1 1 0 14A7 7 0 0 1 9 2zm0 4v4m0 2.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </span>
            <h3 class="modal-title">Confirmar Envio para Pagamento</h3>
          </div>

          <p class="modal-month">{{ mesLabel }}</p>

          <div class="modal-summary">
            <div class="ms-row">
              <span class="ms-label">Contratos liberados</span>
              <span class="ms-val">{{ vendasStatusData.liberadas }}</span>
            </div>
            <div class="ms-row">
              <span class="ms-label">Lançamentos BDR</span>
              <span class="ms-val">{{ bdrFiltered.length }}</span>
            </div>
            <div v-if="totalDescontos > 0" class="ms-row">
              <span class="ms-label">Descontos</span>
              <span class="ms-val error">− {{ fmt(totalDescontos) }}</span>
            </div>
            <div class="ms-row total-row">
              <span class="ms-label">Total líquido a pagar</span>
              <span class="ms-val accent">{{ fmt(totalLiquido) }}</span>
            </div>
          </div>

          <p class="modal-warning">
            Esta ação é <strong>irreversível</strong>. Após confirmar, o snapshot ficará somente-leitura e será marcado com seu nome e data de envio.
          </p>

          <div class="modal-actions">
            <button class="btn-modal-cancel" @click="showConfirmModal = false" :disabled="snapSaving">
              Cancelar
            </button>
            <button class="btn-modal-confirm" @click="confirmarEnvio" :disabled="snapSaving">
              <svg v-if="!snapSaving" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l3.5 3.5L11 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {{ snapSaving ? 'Enviando...' : 'Confirmar Envio' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { vendasApiClient, bdrApi, type ContractRecord, type Commission, type Adjustment, type ComissoesMesResult } from '../services/api';
import { useAuth } from '../composables/useAuth';
import { type Period, getPeriodRange, MONTH_NAMES } from '../composables/useDateRange';
import PeriodFilter from '../components/PeriodFilter.vue';
import ChartDonut   from '../components/ChartDonut.vue';
import ChartRanking from '../components/ChartRanking.vue';

const props = defineProps<{ refresh: number }>();
watch(() => props.refresh, load);

const { user, isGestor } = useAuth();

const vendasContracts = ref<ContractRecord[]>([]);
const bdrAll          = ref<Commission[]>([]);
const adjustments     = ref<Adjustment[]>([]);
const loading         = ref(false);
const error           = ref('');

// Metadados do snapshot (quando fonte = Postgres)
const snapMeta = ref<Pick<ComissoesMesResult, 'source' | 'enviado_pagamento' | 'data_envio' | 'enviado_por' | 'data_snapshot'> | null>(null);
const snapSaving       = ref(false);
const snapMsg          = ref('');
const showConfirmModal = ref(false);

// Helpers de mês de referência
const mesReferencia = computed(() => {
  if (period.value !== 'custom_month') return null;
  return `${customYear.value}-${String(customMonth.value + 1).padStart(2, '0')}`;
});

const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());
const f = ref({ ...getPeriodRange('this_month'), vendedor: '' });

function onPeriodChange() {
  const range = getPeriodRange(period.value, customYear.value, customMonth.value);
  f.value.dateFrom = range.dateFrom;
  f.value.dateTo   = range.dateTo;
  load();
}

// ── Filters ───────────────────────────────────────────────────────────────────
// Datas já filtradas no servidor; apenas o filtro de vendedor permanece client-side
// (pois o backend já filtra vendedor para consultores via JWT)
const bdrFiltered = computed(() =>
  isGestor.value && f.value.vendedor
    ? bdrAll.value.filter((r) => r.vendedor === f.value.vendedor)
    : bdrAll.value
);

const adjustmentsFiltered = computed(() =>
  adjustments.value.filter((a) => {
    const d = a.data_registro.slice(0, 10);
    if (f.value.dateFrom && d < f.value.dateFrom) return false;
    if (f.value.dateTo   && d > f.value.dateTo)   return false;
    if (isGestor.value && f.value.vendedor && a.vendedor !== f.value.vendedor) return false;
    return true;
  })
);

// ── Totals ────────────────────────────────────────────────────────────────────
const comissaoVendasLiberada = computed(() =>
  vendasContracts.value.filter((c) => c.status_comissao === 'Liberada').reduce((s, c) => s + c.comissao, 0)
);
const comissaoBdrTotal = computed(() =>
  bdrFiltered.value.reduce((s, r) => s + Number(r.valor_comissao), 0)
);
const totalDescontos = computed(() =>
  adjustmentsFiltered.value.reduce((s, a) => s + parseFloat(a.valor), 0)
);
const totalLiquido = computed(() =>
  comissaoVendasLiberada.value + comissaoBdrTotal.value - totalDescontos.value
);

// Mapa canônico: resolve prefixos de nomes.
// Ex: "MARIA" e "MARIA SILVA" → ambos mapeiam para "MARIA SILVA"
const canonicalKeyMap = computed(() => {
  const allNames = [
    ...vendasContracts.value.map(c => c.nome_vendedor),
    ...bdrAll.value.map(r => r.vendedor),
  ].filter(Boolean).map(n => (n as string).trim().toUpperCase());

  // Ordena do mais longo para o mais curto para processar nomes completos primeiro
  const unique = [...new Set(allNames)].sort((a, b) => b.length - a.length);
  const map = new Map<string, string>();

  for (const name of unique) {
    if (map.has(name)) continue;
    // Marca versões mais curtas (prefixos) para apontar para este nome completo
    for (const other of unique) {
      if (other !== name && name.startsWith(other + ' ') && !map.has(other)) {
        map.set(other, name);
      }
    }
    if (!map.has(name)) map.set(name, name);
  }
  return map;
});

const normKey = (nome: string): string => {
  const upper = nome.trim().toUpperCase();
  return canonicalKeyMap.value.get(upper) ?? upper;
};

// Mapa canônico → nome de exibição (usa a versão mais longa/completa encontrada)
const nomeDisplay = computed(() => {
  const map = new Map<string, string>();
  const allRaw = [
    ...vendasContracts.value.map(c => c.nome_vendedor),
    ...bdrAll.value.map(r => r.vendedor),
  ].filter(Boolean) as string[];

  for (const raw of allRaw) {
    const key = normKey(raw);
    const existing = map.get(key);
    if (!existing || raw.trim().length > existing.length) map.set(key, raw.trim());
  }
  return map;
});

const vendedores = computed(() => {
  const keys = [
    ...vendasContracts.value.map((c) => c.nome_vendedor ? normKey(c.nome_vendedor) : ''),
    ...bdrAll.value.map((r) => r.vendedor ? normKey(r.vendedor) : ''),
  ].filter(Boolean) as string[];
  return [...new Set(keys)].sort().map((k) => nomeDisplay.value.get(k) ?? k);
});

// ── Chart data ────────────────────────────────────────────────────────────────
const vendasStatusData = computed(() => ({
  liberadas:  vendasContracts.value.filter((c) => c.status_comissao === 'Liberada').length,
  bloqueadas: vendasContracts.value.filter((c) => c.status_comissao.startsWith('Bloqueada')).length,
  pendentes:  vendasContracts.value.filter((c) => c.status_comissao.startsWith('Pendente')).length,
}));

const rankingTotalData = computed(() => {
  const map = new Map<string, { count: number; value: number }>();
  for (const c of vendasContracts.value) {
    if (!c.nome_vendedor || c.status_comissao !== 'Liberada') continue;
    const key = normKey(c.nome_vendedor);
    const cur = map.get(key) ?? { count: 0, value: 0 };
    map.set(key, { count: cur.count + 1, value: cur.value + c.comissao });
  }
  for (const r of bdrFiltered.value) {
    if (!r.vendedor) continue;
    const key = normKey(r.vendedor);
    const cur = map.get(key) ?? { count: 0, value: 0 };
    map.set(key, { count: cur.count + 1, value: cur.value + parseFloat(r.valor_comissao) });
  }
  for (const a of adjustmentsFiltered.value) {
    const key = normKey(a.vendedor);
    const cur = map.get(key);
    if (cur) map.set(key, { ...cur, value: cur.value - parseFloat(a.valor) });
  }
  return [...map.entries()].map(([key, d]) => ({
    name:  nomeDisplay.value.get(key) ?? key,
    count: d.count,
    value: Math.max(d.value, 0),
  }));
});

const META_B2C = 10_000; // meta sobre valor total ativado
const META_B2B = 7_000;

// ── Summary per consultant ────────────────────────────────────────────────────
const summaryByConsultor = computed(() => {
  const map = new Map<string, {
    vendas: number; bdr: number; descontos: number;
    valorAtivadoMensal: number; qtdB2b: number; qtdTotal: number;
  }>();

  for (const c of vendasContracts.value) {
    if (!c.nome_vendedor) continue;
    const key = normKey(c.nome_vendedor);
    const cur = map.get(key) ?? { vendas: 0, bdr: 0, descontos: 0, valorAtivadoMensal: 0, qtdB2b: 0, qtdTotal: 0 };
    cur.qtdTotal++;
    if (c.segmento === 'B2B') cur.qtdB2b++;
    cur.valorAtivadoMensal += c.valor_mensal; // todos os contratos contam para meta
    if (c.status_comissao === 'Liberada') {
      cur.vendas += c.comissao; // comissão só sobre liberados
    }
    map.set(key, cur);
  }
  for (const r of bdrFiltered.value) {
    if (!r.vendedor) continue;
    const key = normKey(r.vendedor);
    const cur = map.get(key) ?? { vendas: 0, bdr: 0, descontos: 0, valorAtivadoMensal: 0, qtdB2b: 0, qtdTotal: 0 };
    cur.bdr += parseFloat(r.valor_comissao);
    map.set(key, cur);
  }
  for (const a of adjustmentsFiltered.value) {
    if (!a.vendedor) continue;
    const key = normKey(a.vendedor);
    const cur = map.get(key);
    if (cur) cur.descontos += parseFloat(a.valor);
  }

  return [...map.entries()].map(([key, d]) => {
    const metaAlvo      = d.qtdB2b > d.qtdTotal / 2 ? META_B2B : META_B2C;
    const metaAtingida  = d.valorAtivadoMensal >= metaAlvo; // meta sobre ativado
    const comissaoReal  = metaAtingida ? d.vendas + d.bdr - d.descontos : 0;
    return {
      nome: nomeDisplay.value.get(key) ?? key,
      vendas: d.vendas, bdr: d.bdr, descontos: d.descontos,
      valorAtivadoMensal: d.valorAtivadoMensal,
      metaAlvo, metaAtingida, comissaoReal,
      total: d.vendas + d.bdr - d.descontos,
    };
  }).sort((a, b) => b.total - a.total);
});

// ── Adjustment form ───────────────────────────────────────────────────────────
const showAdjForm = ref(false);
const adjSaving   = ref(false);
const adjError    = ref('');
const adjForm     = ref({ vendedor: '', descricao: '', valor: '' });

async function submitAdjustment() {
  adjError.value = '';
  if (!adjForm.value.vendedor || !adjForm.value.descricao || !adjForm.value.valor) {
    adjError.value = 'Preencha todos os campos.';
    return;
  }
  adjSaving.value = true;
  try {
    await bdrApi.createAdjustment({
      vendedor:  adjForm.value.vendedor,
      descricao: adjForm.value.descricao,
      valor:     parseFloat(adjForm.value.valor),
    });
    adjForm.value   = { vendedor: '', descricao: '', valor: '' };
    showAdjForm.value = false;
    adjustments.value = await bdrApi.listAdjustments();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    adjError.value = err.response?.data?.message ?? 'Erro ao registrar ajuste.';
  } finally { adjSaving.value = false; }
}

async function removeAdj(id: string) {
  if (!confirm('Remover este desconto?')) return;
  await bdrApi.deleteAdjustment(id);
  adjustments.value = await bdrApi.listAdjustments();
}

// ── Load ──────────────────────────────────────────────────────────────────────
onMounted(load);

async function load() {
  loading.value = true; error.value = ''; snapMeta.value = null;
  try {
    const mes = mesReferencia.value;

    const [vendasResult, bdrResult, adjResult] = await Promise.all([
      mes
        // Mês específico → endpoint unificado (Postgres ou IXC)
        ? vendasApiClient.getComissoesMes(mes, isGestor.value ? f.value.vendedor || undefined : undefined)
        // Período relativo → sempre ao vivo do IXC
        : vendasApiClient.getContracts({
            dateFrom: f.value.dateFrom || undefined,
            dateTo:   f.value.dateTo   || undefined,
            vendedor: isGestor.value && f.value.vendedor ? f.value.vendedor : undefined,
          }),
      bdrApi.listCommissions({
        dateFrom: f.value.dateFrom || undefined,
        dateTo:   f.value.dateTo   || undefined,
      }),
      bdrApi.listAdjustments(),
    ]);

    if (mes && 'source' in vendasResult) {
      // Resposta do endpoint unificado
      const r = vendasResult as ComissoesMesResult;
      vendasContracts.value = r.contracts;
      snapMeta.value = {
        source:            r.source,
        enviado_pagamento: r.enviado_pagamento,
        data_envio:        r.data_envio,
        enviado_por:       r.enviado_por,
        data_snapshot:     r.data_snapshot,
      };
    } else {
      // Resposta do endpoint padrão (ContractsResult)
      vendasContracts.value = (vendasResult as { contracts: ContractRecord[] }).contracts;
    }

    bdrAll.value      = bdrResult;
    adjustments.value = adjResult;
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message ?? 'Erro ao carregar comissões.';
  } finally { loading.value = false; }
}

async function gerarSnapshot() {
  if (!mesReferencia.value) return;
  snapSaving.value = true; snapMsg.value = '';
  try {
    const r = await vendasApiClient.gerarSnapshot(mesReferencia.value);
    snapMsg.value = `✓ Snapshot gerado — ${r.total} contratos (${r.liberadas} liberadas)`;
    await load();
  } catch { snapMsg.value = '✗ Erro ao gerar snapshot.'; }
  finally { snapSaving.value = false; }
}

function enviarParaPagamento() {
  if (!mesReferencia.value) return;
  showConfirmModal.value = true;
}

async function confirmarEnvio() {
  if (!mesReferencia.value) return;
  snapSaving.value = true; snapMsg.value = '';
  try {
    const r = await vendasApiClient.enviarParaPagamento(mesReferencia.value);
    snapMsg.value = `✓ ${r.enviados} comissões marcadas como enviadas para pagamento`;
    showConfirmModal.value = false;
    await load();
  } catch { snapMsg.value = '✗ Erro ao registrar envio.'; }
  finally { snapSaving.value = false; }
}

const mesLabel = computed(() => {
  if (!mesReferencia.value) return '';
  const [y, m] = mesReferencia.value.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
});

function clearFilters() {
  period.value      = 'this_month';
  customMonth.value = new Date().getMonth();
  customYear.value  = new Date().getFullYear();
  f.value = { ...getPeriodRange('this_month'), vendedor: '' };
  load();
}

const fmt     = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR');
</script>

<style scoped>
.view-comissao { width: 100%; }

.page-header  { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1rem; flex-wrap:wrap; gap:1rem; }
.page-title   { font-family:var(--font-display); font-size:1.6rem; font-weight:700; letter-spacing:-.01em; }
.page-sub     { font-size:.875rem; color:var(--text-2); margin-top:.25rem; }
.header-actions { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }

/* Botões de snapshot */
.btn-snap, .btn-pagar {
  display:flex; align-items:center; gap:.4rem;
  padding:.45rem .9rem; border-radius:var(--radius-sm);
  font-size:.8rem; font-weight:600; cursor:pointer;
  transition:all var(--transition); white-space:nowrap;
}
.btn-snap  { background:var(--surface-2); border:1px solid var(--border); color:var(--text-2); }
.btn-snap:hover:not(:disabled)  { border-color:var(--accent); color:var(--accent); }
.btn-pagar { background:rgba(199,255,0,.08); border:1px solid rgba(199,255,0,.25); color:var(--success); }
.btn-pagar:hover:not(:disabled) { background:rgba(199,255,0,.15); }
.btn-snap:disabled, .btn-pagar:disabled { opacity:.35; cursor:not-allowed; }

.badge-enviado {
  font-size:.75rem; color:var(--success); background:rgba(199,255,0,.08);
  border:1px solid rgba(199,255,0,.2); border-radius:var(--radius-sm);
  padding:.3rem .7rem; white-space:nowrap;
}

.snap-msg {
  font-size:.78rem; color:var(--text-2); white-space:nowrap;
  padding:.3rem .6rem; background:var(--surface-2);
  border:1px solid var(--border); border-radius:var(--radius-sm);
}
.fade-msg-enter-active, .fade-msg-leave-active { transition:opacity .3s; }
.fade-msg-enter-from, .fade-msg-leave-to { opacity:0; }

/* Banner fonte dos dados */
.source-banner {
  display:flex; align-items:center; gap:.5rem;
  font-size:.8rem; padding:.55rem 1rem;
  border-radius:var(--radius-sm); margin-bottom:1rem;
}
.source-banner.snapshot { background:rgba(96,165,250,.08); border:1px solid rgba(96,165,250,.2); color:#60a5fa; }
.source-banner.live     { background:rgba(245,158,11,.07); border:1px solid rgba(245,158,11,.2); color:#f59e0b; }

/* Grand Total */
.grand-total-bar {
  background: var(--surface);
  border: 1px solid rgba(0,240,255,.3);
  box-shadow: 0 0 24px rgba(0,240,255,.05);
  border-radius: var(--radius);
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 2rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.gt-left    { display:flex; flex-direction:column; gap:.15rem; }
.gt-label   { font-size:.7rem; font-weight:600; color:var(--text-2); text-transform:uppercase; letter-spacing:.07em; }
.gt-value   { font-family:var(--font-mono); font-size:1.8rem; font-weight:700; color:var(--accent); }
.gt-breakdown { display:flex; align-items:center; gap:1rem; margin-left:auto; flex-wrap:wrap; }
.gt-sep     { color:var(--text-3); font-size:1.1rem; font-weight:300; }
.gt-item    { display:flex; flex-direction:column; align-items:center; gap:.1rem; }
.gt-item-label { font-size:.65rem; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--text-3); }
.gt-item-val   { font-family:var(--font-mono); font-size:.95rem; font-weight:700; }
.gt-item.vendas .gt-item-val  { color:var(--success); }
.gt-item.bdr    .gt-item-val  { color:var(--refid); }
.gt-item.desconto .gt-item-val { color:var(--downgrade); }

/* Mobile */
@media(max-width:600px) {
  .page-title { font-size: 1.25rem; }
  .grand-total-bar { padding: .85rem 1rem; gap: 1rem; }
  .gt-value { font-size: 1.4rem; }
  .gt-breakdown { margin-left: 0; gap: .75rem; }
}

/* Charts */
.charts-row { display:grid; gap:.65rem; margin-bottom:1.25rem; align-items:stretch; }
.charts-3   { grid-template-columns: 210px 210px 1fr; }
.charts-2   { grid-template-columns: 210px 210px; }
@media(max-width:1000px){ .charts-3, .charts-2 { grid-template-columns: 1fr 1fr; } }
@media(max-width:600px){  .charts-3, .charts-2 { grid-template-columns: 1fr; } }

/* Section label */
.section-label {
  font-size:.72rem; font-weight:700; color:var(--text-2);
  text-transform:uppercase; letter-spacing:.08em;
  display:flex; align-items:center; gap:.75rem;
  margin-bottom:.75rem;
}

/* Consultant grid */
.consultant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: .65rem;
  margin-bottom: 1.5rem;
}
.consultant-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: .4rem;
}
.consultant-card.cc-ok  { border-color: rgba(0,200,83,.25); }
.consultant-card.cc-nok { border-color: rgba(255,42,95,.15); }

/* Header */
.cc-header { display:flex; align-items:center; justify-content:space-between; gap:.4rem; }
.cc-name { font-weight:700; font-size:.88rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cc-meta-tag { font-size:.58rem; font-weight:700; letter-spacing:.05em; padding:.1rem .35rem; border-radius:3px; white-space:nowrap; flex-shrink:0; }
.cc-meta-tag.ok  { background:rgba(0,200,83,.15); color:var(--success); }
.cc-meta-tag.nok { background:rgba(255,42,95,.12); color:var(--downgrade); }

/* Barra de meta */
.cc-meta-bar-wrap { height:3px; background:var(--border); border-radius:2px; overflow:hidden; }
.cc-meta-bar-fill { height:100%; border-radius:2px; transition:width .4s ease; }
.cc-meta-bar-fill.ok  { background:var(--success); }
.cc-meta-bar-fill.nok { background:#f59e0b; }
.cc-meta-info { display:flex; justify-content:space-between; font-size:.65rem; color:var(--text-3); }
.cc-meta-dim  { color:var(--text-3); opacity:.7; }

/* Linhas de composição */
.cc-rows { display:flex; flex-direction:column; gap:.2rem; border-top:1px solid var(--border); padding-top:.35rem; margin-top:.05rem; }
.cc-row  { display:flex; justify-content:space-between; font-size:.78rem; }
.cc-key  { color:var(--text-2); }
.cc-val  { font-family:var(--font-mono); font-weight:600; }
.cc-val.success { color:var(--success); }
.cc-val.refid   { color:var(--refid); }
.cc-val.error   { color:var(--downgrade); }

/* Total */
.cc-total-row {
  display: flex; justify-content: space-between; align-items: center;
  border-top: 1px solid var(--border); padding-top: .4rem; margin-top: .05rem;
}
.cc-total-row.cc-zero .cc-total-val { color: var(--text-3); }
.cc-total-label { font-size:.68rem; font-weight:600; color:var(--text-2); text-transform:uppercase; letter-spacing:.04em; }
.cc-total-val   { font-family:var(--font-mono); font-size:.95rem; font-weight:700; color:var(--accent); }
.cc-zero-hint   { font-size:.62rem; color:var(--downgrade); opacity:.8; text-align:center; }

/* Personal summary */
.personal-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: .65rem;
  margin-bottom: 1.5rem;
}
.ps-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .9rem 1rem;
  display: flex;
  align-items: flex-start;
  gap: .75rem;
}
.ps-card.total-card { border-color: rgba(0,240,255,.3); align-items:center; justify-content:center; }
.ps-icon  { width:28px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.vendas-card .ps-icon  { background:rgba(199,255,0,.1);  color:var(--success);   border:1px solid rgba(199,255,0,.2); }
.bdr-card .ps-icon     { background:rgba(168,85,247,.1); color:var(--refid);     border:1px solid rgba(168,85,247,.2); }
.desconto-card .ps-icon{ background:rgba(255,42,95,.1);  color:var(--downgrade); border:1px solid rgba(255,42,95,.2); }
.ps-body  { display:flex; flex-direction:column; gap:.15rem; }
.ps-label { font-size:.68rem; font-weight:600; color:var(--text-2); text-transform:uppercase; letter-spacing:.05em; }
.ps-value { font-family:var(--font-mono); font-size:1.1rem; font-weight:700; }
.ps-value.success { color:var(--success); }
.ps-value.refid   { color:var(--refid); }
.ps-value.error   { color:var(--downgrade); }
.ps-value.accent  { color:var(--accent); }
.ps-value.large   { font-size:1.4rem; }
.ps-detail { font-size:.68rem; color:var(--text-3); }

/* Adjustment form */
.btn-add-adj {
  display:inline-flex; align-items:center; gap:.35rem;
  background:var(--surface-2); border:1px solid var(--border-2);
  color:var(--text-2); border-radius:var(--radius-sm);
  padding:.25rem .7rem; font-size:.72rem; font-weight:600;
  font-family:var(--font-body); cursor:pointer;
  text-transform:uppercase; letter-spacing:.05em;
  transition:all var(--transition);
}
.btn-add-adj:hover { color:var(--accent); border-color:var(--accent); }

.adj-form {
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
  margin-bottom: .75rem;
}
.adj-form-grid {
  display: flex;
  gap: .6rem;
  flex-wrap: wrap;
  align-items: flex-end;
}
.adj-desc-group { flex: 2; min-width: 200px; }
.adj-actions    { display:flex; gap:.5rem; align-items:flex-end; }

.adj-empty { font-size:.85rem; color:var(--text-3); padding:.75rem 0; }

.adj-table { margin-top:.5rem; }

/* Delete button */
.btn-del {
  background:none; border:1px solid transparent; color:var(--text-3);
  border-radius:3px; width:24px; height:24px;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .15s;
}
.btn-del:hover { color:var(--downgrade); border-color:rgba(255,42,95,.3); background:var(--error-bg); }

/* Loading */
.loading-dots { display:inline-flex; gap:4px; margin-right:.5rem; }
.loading-dots span { width:5px; height:5px; border-radius:50%; background:var(--text-2); animation:ldot .8s ease-in-out infinite; }
.loading-dots span:nth-child(2){ animation-delay:.16s; }
.loading-dots span:nth-child(3){ animation-delay:.32s; }
@keyframes ldot{ 0%,80%,100%{transform:scale(.5);opacity:.3} 40%{transform:scale(1);opacity:1} }

/* Shared */
.vendedor-badge { display:inline-block; background:var(--surface-3); border:1px solid var(--border-2); border-radius:4px; padding:.1rem .45rem; font-size:.75rem; }
.td-date       { font-size:.8rem; color:var(--text-2); }
.td-commission { font-family:var(--font-mono); font-weight:700; }

/* Transitions */
.slide-enter-active, .slide-leave-active { transition: all .2s ease; }
.slide-enter-from, .slide-leave-to { opacity:0; transform:translateY(-6px); }

/* Modal de confirmação */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(8, 10, 20, 0.75);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.modal-box {
  background: var(--surface);
  border: 1px solid rgba(199,255,0,.25);
  border-radius: var(--radius);
  box-shadow: 0 8px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(199,255,0,.05);
  width: 100%; max-width: 420px;
  padding: 1.5rem;
  display: flex; flex-direction: column; gap: 1rem;
}
.modal-header {
  display: flex; align-items: center; gap: .6rem;
}
.modal-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(199,255,0,.08); border: 1px solid rgba(199,255,0,.2);
  color: var(--success);
}
.modal-title {
  font-family: var(--font-display); font-size: 1rem; font-weight: 700;
  color: var(--text); line-height: 1.3;
}
.modal-month {
  font-size: .8rem; font-weight: 600; color: var(--accent);
  text-transform: uppercase; letter-spacing: .07em;
  margin: -.25rem 0;
}
.modal-summary {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: .75rem 1rem;
  display: flex; flex-direction: column; gap: .45rem;
}
.ms-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: .82rem;
}
.ms-label { color: var(--text-2); }
.ms-val   { font-family: var(--font-mono); font-weight: 700; color: var(--text); }
.ms-val.error  { color: var(--downgrade); }
.ms-val.accent { color: var(--accent); font-size: .95rem; }
.total-row {
  border-top: 1px solid var(--border);
  padding-top: .4rem;
  margin-top: .1rem;
}
.modal-warning {
  font-size: .78rem; color: var(--text-3); line-height: 1.5;
  padding: .6rem .8rem;
  background: rgba(255,42,95,.05); border: 1px solid rgba(255,42,95,.15);
  border-radius: var(--radius-sm);
}
.modal-warning strong { color: var(--downgrade); }
.modal-actions {
  display: flex; gap: .6rem; justify-content: flex-end;
}
.btn-modal-cancel {
  padding: .5rem 1rem; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text-2); font-size: .82rem; font-weight: 600; cursor: pointer;
  transition: all var(--transition);
}
.btn-modal-cancel:hover:not(:disabled) { border-color: var(--border-2); color: var(--text); }
.btn-modal-cancel:disabled { opacity: .4; cursor: not-allowed; }
.btn-modal-confirm {
  display: flex; align-items: center; gap: .4rem;
  padding: .5rem 1.1rem; border-radius: var(--radius-sm);
  background: rgba(199,255,0,.1); border: 1px solid rgba(199,255,0,.3);
  color: var(--success); font-size: .82rem; font-weight: 600; cursor: pointer;
  transition: all var(--transition);
}
.btn-modal-confirm:hover:not(:disabled) { background: rgba(199,255,0,.18); }
.btn-modal-confirm:disabled { opacity: .4; cursor: not-allowed; }

/* Modal transition */
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .modal-box, .modal-fade-leave-active .modal-box { transition: transform .2s ease; }
.modal-fade-enter-from .modal-box, .modal-fade-leave-to .modal-box { transform: scale(.96) translateY(8px); }
</style>
