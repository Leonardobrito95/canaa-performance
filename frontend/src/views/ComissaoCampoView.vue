<template>
  <div class="cc-view">

    <!-- ══ Cabeçalho ══════════════════════════════════════════ -->
    <div class="view-header">
      <div>
        <h1 class="view-title">Comissão Campo</h1>
        <p class="view-sub">Cruzamento e auditoria de OS para comissão de terceirizadas</p>
      </div>
      <div class="header-actions">
        <span :class="['db-badge', mysqlOk ? 'ok' : 'error']">
          <span class="badge-dot"></span>
          {{ mysqlOk ? `IXC conectado · ${mysqlInfo.db}` : 'IXC desconectado' }}
        </span>
        <button class="btn-icon" @click="checkMysql" title="Testar conexão" :disabled="pinging">
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M1.5 7.5a6 6 0 1 1 12 0 6 6 0 0 1-12 0z" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 4v3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="btn-secondary" @click="tab = 'empresas'">
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M2 4h11M2 8h11M2 12h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Tabelas
        </button>
        <button class="btn-secondary" @click="tab = 'auditadas'" v-if="auditsSummary.length">
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M4 2h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5"/><path d="M5 5h5M5 8h5M5 11h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Salvas
          <span class="badge-count">{{ auditsSummary.length }}</span>
        </button>
      </div>
    </div>

    <!-- ══ Tab: Auditoria ══════════════════════════════════════ -->
    <template v-if="tab === 'auditoria'">
      <!-- Passo 1: Configuração -->
      <div class="cc-card">
        <div class="cc-card-title">
          <span class="step-num">1</span>
          Configuração da quinzena
        </div>
        <div class="cc-form-row">
          <div class="form-group">
            <label class="form-label">Data inicial</label>
            <input type="date" v-model="form.dateIni" />
          </div>
          <div class="form-group">
            <label class="form-label">Data final</label>
            <input type="date" v-model="form.dateFim" />
          </div>
          <div class="form-group">
            <label class="form-label">Empresa / Técnico</label>
            <input type="text" v-model="form.empresaNome" placeholder="Ex: KT TELECOM" />
          </div>
          <div class="form-group">
            <label class="form-label">Tabela de preços</label>
            <select v-model="form.selectedCompanyKey">
              <option value="">— Nenhuma —</option>
              <option v-for="emp in empresas" :key="emp.key" :value="emp.key">{{ emp.nome }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Passo 2: Upload -->
      <div class="cc-card">
        <div class="cc-card-title">
          <span class="step-num">2</span>
          Planilha da terceirizada
        </div>
        <div class="cc-form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Arquivo (XLSX / CSV)</label>
            <div
              :class="['drop-zone', dragOver ? 'drag-over' : '', file1 ? 'has-file' : '']"
              @dragover.prevent="dragOver = true"
              @dragleave="dragOver = false"
              @drop.prevent="onDrop"
              @click="(fileInput as HTMLInputElement)?.click()"
            >
              <template v-if="!file1">
                <svg width="24" height="24" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v9M4 6l3.5 4 3.5-4M2 13h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Arraste ou clique para selecionar</span>
              </template>
              <template v-else>
                <svg width="20" height="20" viewBox="0 0 15 15" fill="none"><path d="M3 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="var(--accent)" stroke-width="1.5"/><path d="M5 7l2 2 3-3" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="file-name">{{ file1.name }}</span>
                <button class="btn-remove-file" @click.stop="file1 = null; sheetRows = []">✕</button>
              </template>
            </div>
            <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="onFileChange" />
          </div>
          <div class="form-group" style="flex:1; align-self:flex-end">
            <div class="info-box" v-if="sheetRows.length">
              <div class="info-row"><span>Linhas lidas</span><strong>{{ sheetRows.length }}</strong></div>
              <div class="info-row" v-if="form.selectedCompanyKey">
                <span>Tabela</span><strong>{{ selectedCompany?.nome }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Mapeamento de colunas -->
        <div v-if="columnHeaders.length" class="col-map-section">
          <div class="col-map-title">Mapeamento de colunas</div>
          <div class="col-map-grid">
            <div class="form-group" v-for="field in columnFields" :key="field.key">
              <label class="form-label">{{ field.label }}</label>
              <select v-model="columnMap[field.key]">
                <option value="">— ignorar —</option>
                <option v-for="h in columnHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Passo 3: Processar -->
      <div class="cc-card">
        <div class="cc-card-title">
          <span class="step-num">3</span>
          Processar e exportar
        </div>
        <div class="cc-form-row" style="align-items:center">
          <button class="btn-primary" @click="processar" :disabled="processing || !sheetRows.length">
            <span v-if="processing">Processando…</span>
            <span v-else>Auditar com banco de dados IXC</span>
          </button>
          <button v-if="results.length" class="btn-secondary" @click="exportarExcel">
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M3 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5"/><path d="M5 5l5 5M10 5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            Exportar Excel
          </button>
          <button v-if="results.length && isGestor" class="btn-secondary" @click="salvarAuditoria">
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M2 2h11v11H2z" stroke="currentColor" stroke-width="1.5"/><path d="M5 2v4h5V2M5 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            Salvar auditoria
          </button>
          <span v-if="processError" class="alert-msg error">{{ processError }}</span>
          <span v-if="saveSuccess" class="alert-msg success">Auditoria salva!</span>
        </div>
      </div>

      <!-- Summary cards -->
      <div v-if="results.length" class="summary-row">
        <div class="summary-card">
          <span class="sc-label">Total</span>
          <span class="sc-value">{{ summary.total }}</span>
        </div>
        <div class="summary-card ok-card">
          <span class="sc-label">OK</span>
          <span class="sc-value ok-val">{{ summary.ok }}</span>
        </div>
        <div class="summary-card">
          <span class="sc-label">Auditoria</span>
          <span class="sc-value amber">{{ summary.auditoria }}</span>
        </div>
        <div class="summary-card">
          <span class="sc-label">Divergência</span>
          <span class="sc-value error-val">{{ summary.divergencia }}</span>
        </div>
        <div class="summary-card">
          <span class="sc-label">Pendente</span>
          <span class="sc-value">{{ summary.pendente }}</span>
        </div>
        <div class="summary-card">
          <span class="sc-label">Fora Quinzena</span>
          <span class="sc-value">{{ summary.fora }}</span>
        </div>
        <div class="summary-card">
          <span class="sc-label">A Pagar</span>
          <span class="sc-value accent">{{ fmt(summary.totalPagar) }}</span>
        </div>
        <div class="summary-card" v-if="summary.holidayBonusTotal > 0">
          <span class="sc-label">Adic. Dom/Feriado</span>
          <span class="sc-value accent">{{ fmt(summary.holidayBonusTotal) }}</span>
        </div>
        <div class="summary-card" v-if="summary.holidayBonusTotal > 0">
          <span class="sc-label">Base OS</span>
          <span class="sc-value">{{ fmt(summary.totalPagarBase) }}</span>
        </div>
        <div class="summary-card">
          <span class="sc-label">Solicitado</span>
          <span class="sc-value">{{ fmt(summary.totalSolicitado) }}</span>
        </div>
      </div>

      <div v-if="summary.holidayBonusEntries.length" class="bonus-section">
        <div class="bonus-title">Adicional domingo / feriado</div>
        <div class="bonus-list">
          <div class="bonus-item" v-for="entry in summary.holidayBonusEntries" :key="`${entry.tecnico}-${entry.data}`">
            <span class="bonus-tech">{{ entry.tecnico }}</span>
            <span class="bonus-date">{{ fmtDate(entry.data) }}</span>
            <span class="bonus-reason">{{ entry.motivo }}</span>
            <span class="bonus-value">{{ fmt(entry.valor) }}</span>
          </div>
        </div>
      </div>

      <!-- Filtro de status -->
      <div v-if="results.length" class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">Filtrar status</span>
          <div class="status-filter-pills">
            <button
              v-for="s in statusOptions"
              :key="s.value"
              :class="['filter-pill', { active: statusFilter === s.value }]"
              @click="statusFilter = s.value as typeof statusFilter.value"
            >
              {{ s.label }}
              <span class="pill-count">{{ s.count }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tabela de resultados -->
      <div v-if="filteredResults.length" class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>ID OS</th>
              <th>Dobrada</th>
              <th>Cliente</th>
              <th>Tipo OS</th>
              <th>Tipo IXC</th>
              <th>Cidade</th>
              <th>Técnico</th>
              <th>Data Env.</th>
              <th>Data Fin.</th>
              <th>Status OS</th>
              <th>G.Com.</th>
              <th>Valor Tab.</th>
              <th>Solicitado</th>
              <th>Desc.%</th>
              <th>A Pagar</th>
              <th>Status</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredResults" :key="row.uiKey || row.id + row.seq" :class="['row-' + row.status.toLowerCase()]">
              <td class="td-mono">{{ row.seq }}</td>
              <td class="td-mono">{{ row.id }}</td>
              <td class="td-dobrada">
                <template v-if="row.dobrada">
                  <span class="dobrada-chip">Dobrada</span>
                  <label v-if="isDobradaGestorElegivel(row)" :class="['manager-approval-toggle', { 'is-readonly': !isGestor }]">
                    <input
                      type="checkbox"
                      :checked="getDobradaGestorStatus(row) !== 'indevida'"
                      @change="toggleDobradaGestor(row, ($event.target as HTMLInputElement).checked)"
                      :disabled="!isGestor"
                    />
                    <span>{{ getDobradaGestorStatus(row) === 'indevida' ? 'Indevida' : 'Devida' }}</span>
                  </label>
                  <span v-else class="manager-approval-note">Sem aprov.</span>
                </template>
                <span v-else class="td-muted">â€”</span>
              </td>
              <td>{{ row.clienteDB || row.cliente }}</td>
              <td><span class="tipo-tag">{{ row.tipoOS }}</span></td>
              <td class="td-muted">{{ row.tipoIXC }}</td>
              <td class="td-muted">{{ row.cidadeDB || row.cidade }}</td>
              <td class="td-muted">{{ row.tecnico }}</td>
              <td class="td-date">{{ fmtDate(row.dataEnv) }}</td>
              <td class="td-date">{{ fmtDate(row.dataFin) }}</td>
              <td class="td-mono">{{ row.statusOS }}</td>
              <td class="td-mono">{{ row.geraComissao }}</td>
              <td class="td-amount">{{ row.valorTabela != null ? fmt(row.valorTabela) : '—' }}</td>
              <td class="td-amount">{{ fmt(row.valor) }}</td>
              <td class="td-mono">{{ row.desconto > 0 ? row.desconto.toFixed(0) + '%' : '—' }}</td>
              <td class="td-commission">{{ fmt(row.valorAdj) }}</td>
              <td><span :class="['status-tag', 'status-' + row.status.toLowerCase()]">{{ row.status }}</span></td>
              <td class="td-obs">{{ row.obs }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ══ Tab: Tabelas de preços ══════════════════════════════ -->
    <template v-else-if="tab === 'empresas'">
      <div class="cc-card">
        <div class="cc-card-title" style="justify-content:space-between">
          <span>Tabelas de preços por empresa</span>
          <button class="btn-secondary" @click="tab = 'auditoria'">← Voltar</button>
        </div>

        <!-- Nova empresa -->
        <div class="empresa-form" v-if="isGestor">
          <div class="cc-form-row" style="align-items:flex-end">
            <div class="form-group" style="flex:1">
              <label class="form-label">Nome da empresa</label>
              <input type="text" v-model="novaEmpresaNome" placeholder="Ex: NOVA TELECOM" />
            </div>
            <button class="btn-primary" @click="adicionarEmpresa" :disabled="!novaEmpresaNome.trim()">Adicionar</button>
          </div>
        </div>

        <!-- Lista de empresas -->
        <div v-for="emp in empresas" :key="emp.key" class="empresa-item">
          <div class="empresa-header">
            <span class="empresa-nome">{{ emp.nome }}</span>
            <div class="empresa-actions" v-if="isGestor">
              <button class="btn-icon btn-save" @click="salvarEmpresa(emp)" title="Salvar alterações">
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M2 2h11v11H2z" stroke="currentColor" stroke-width="1.5"/><path d="M5 2v4h5V2M5 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <button class="btn-icon btn-delete" @click="excluirEmpresa(emp.key)" title="Excluir empresa">
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M3 4h9M5 4V2h5v2M6 7v4M9 7v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="2" y="4" width="11" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
            </div>
          </div>
          <div class="precos-grid">
            <div class="preco-item" v-for="key in SERVICE_KEYS" :key="key">
              <label class="form-label">{{ SERVICE_LABELS[key] }}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                :value="emp.precos[key] ?? ''"
                @input="updatePreco(emp, key, ($event.target as HTMLInputElement).value)"
                placeholder="—"
                :disabled="!isGestor"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ══ Tab: Auditorias salvas ══════════════════════════════ -->
    <template v-else-if="tab === 'auditadas'">
      <div class="cc-card">
        <div class="cc-card-title" style="justify-content:space-between">
          <span>Auditorias salvas</span>
          <button class="btn-secondary" @click="tab = 'auditoria'">← Voltar</button>
        </div>

        <div class="audits-list">
          <div
            v-for="a in auditsSummary"
            :key="a.companyKey"
            class="audit-item"
            @click="carregarAuditoriaSalva(a.companyKey)"
          >
            <div class="audit-company">{{ a.companyName }}</div>
            <div class="audit-meta">
              <span>{{ fmtDate(a.dateIni) }} → {{ fmtDate(a.dateFim) }}</span>
              <span class="audit-source">{{ a.source }}</span>
              <span>{{ a.summary.total }} OS</span>
              <span class="audit-pagar">{{ fmt(a.summary.totalPagar) }}</span>
            </div>
            <div class="audit-stats">
              <span class="pill-ok">OK {{ a.summary.ok }}</span>
              <span class="pill-aud">AUD {{ a.summary.auditoria }}</span>
              <span class="pill-div">DIV {{ a.summary.divergencia }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import * as XLSX from 'xlsx';
import { useAuth } from '../composables/useAuth';
import {
  comissaoApi,
  type EmpresaConfig,
  type AuditResult,
  type AuditSummary,
  type AuditStatus,
  SERVICE_KEYS,
  SERVICE_LABELS,
  type ServiceKey,
} from '../services/comissaoApi';

const { isGestor } = useAuth();

const HOLIDAY_BONUS_VALUE = 100;

type ResultFilter = 'ALL' | AuditStatus | 'DOBRADA' | 'DOBRADA_INDEVIDA';
type DobradaGestorStatus = 'devida' | 'indevida' | '';
type SheetRowDraft = {
  seq: string;
  id: string;
  cliente: string;
  colaborador: string;
  tipoOS: string;
  statusPlanilha: string;
  dobrada: boolean;
  valor: number;
  valorFonte: string;
  cidade: string;
  dataEnv: string | null;
};
type ManagedAuditResult = Omit<AuditResult, 'dobradaGestorStatus'> & {
  dobradaGestorStatus?: DobradaGestorStatus;
  valorAdjOriginal?: number;
  valorAdjSemAprovacao?: number;
  obsOriginal?: string;
};

// ── Estado ────────────────────────────────────────────────────

const tab = ref<'auditoria' | 'empresas' | 'auditadas'>('auditoria');
const pinging   = ref(false);
const mysqlOk   = ref(false);
const mysqlInfo = ref({ host: '', db: '' });
const processing = ref(false);
const processError = ref('');
const saveSuccess  = ref(false);
const dragOver = ref(false);
const file1    = ref<File | null>(null);
const fileInput = ref<HTMLInputElement>();

const empresas  = ref<EmpresaConfig[]>([]);
const novaEmpresaNome = ref('');

const auditsSummary = ref<Awaited<ReturnType<typeof comissaoApi.getAuditoriasSalvas>>>([]);

const rawData  = ref<Record<string, unknown>[]>([]);
const sheetRows = ref<SheetRowDraft[]>([]);
const results   = ref<ManagedAuditResult[]>([]);
const statusFilter = ref<ResultFilter>('ALL');

const form = ref({
  dateIni: '',
  dateFim: '',
  empresaNome: '',
  selectedCompanyKey: '',
});

// Mapeamento de colunas
const columnHeaders = ref<string[]>([]);
type ColField = 'seq' | 'id' | 'cliente' | 'colaborador' | 'tipoOS' | 'statusPlanilha' | 'valor' | 'cidade' | 'dataEnv' | 'dobrada';
const columnMap = ref<Record<ColField, string>>({
  seq: '', id: '', cliente: '', colaborador: '', tipoOS: '', statusPlanilha: '', valor: '', cidade: '', dataEnv: '', dobrada: '',
});
const columnFields: { key: ColField; label: string }[] = [
  { key: 'seq',            label: 'NÂ°' },
  { key: 'id',             label: 'ID OS' },
  { key: 'cliente',        label: 'Cliente' },
  { key: 'colaborador',    label: 'Colaborador / Técnico' },
  { key: 'tipoOS',         label: 'Tipo de OS' },
  { key: 'statusPlanilha', label: 'Status (planilha)' },
  { key: 'valor',          label: 'Valor solicitado' },
  { key: 'cidade',         label: 'Cidade' },
  { key: 'dataEnv',        label: 'Data' },
  { key: 'dobrada',        label: 'Dobrada' },
];

// ── Computed ──────────────────────────────────────────────────

const selectedCompany = computed(() =>
  empresas.value.find(e => e.key === form.value.selectedCompanyKey) ?? null,
);

const summary = computed<AuditSummary>(() => calculateSummary(results.value));

const statusOptions = computed(() => {
  const r = results.value;
  return [
    { value: 'ALL',           label: 'Todos',        count: r.length },
    { value: 'OK',            label: 'OK',           count: r.filter(x => x.status === 'OK').length },
    { value: 'AUDITORIA',     label: 'Auditoria',    count: r.filter(x => x.status === 'AUDITORIA').length },
    { value: 'DIVERGENCIA',   label: 'Divergência',  count: r.filter(x => x.status === 'DIVERGENCIA').length },
    { value: 'PENDENTE',      label: 'Pendente',     count: r.filter(x => x.status === 'PENDENTE').length },
    { value: 'FORA_QUINZENA', label: 'Fora Quinzena',count: r.filter(x => x.status === 'FORA_QUINZENA').length },
    { value: 'DOBRADA',       label: 'Dobradas',     count: r.filter(x => x.dobrada).length },
    { value: 'DOBRADA_INDEVIDA', label: 'Indevidas', count: r.filter(x => x.dobrada && getDobradaGestorStatus(x) === 'indevida').length },
  ];
});

const filteredResults = computed(() => {
  if (statusFilter.value === 'ALL') return results.value;
  if (statusFilter.value === 'DOBRADA') return results.value.filter(r => r.dobrada);
  if (statusFilter.value === 'DOBRADA_INDEVIDA') {
    return results.value.filter(r => r.dobrada && getDobradaGestorStatus(r) === 'indevida');
  }
  return results.value.filter(r => r.status === statusFilter.value);
});

// ── Init ──────────────────────────────────────────────────────

function stripText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeText(value: unknown): string {
  return stripText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeCompanyKey(value: unknown): string {
  return normalizeText(value)
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findEmpresaByNameOrKey(value: unknown): EmpresaConfig | null {
  const key = normalizeCompanyKey(value);
  if (!key) return null;
  return empresas.value.find(emp =>
    normalizeCompanyKey(emp.key) === key || normalizeCompanyKey(emp.nome) === key,
  ) ?? null;
}

function isStarkCompanyName(value: unknown): boolean {
  return normalizeText(value).includes('STARK');
}

function parseMoneyInput(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = parseFloat(String(raw ?? '').replace(/[R$\s.]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseExcelSerialDate(raw: unknown): Date | null {
  const serial = Number(raw);
  if (!Number.isFinite(serial)) return null;
  const excelEpochUtc = Date.UTC(1899, 11, 30);
  const utcDate = new Date(excelEpochUtc + Math.round(serial * 86400 * 1000));
  const localDate = new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    utcDate.getUTCHours(),
    utcDate.getUTCMinutes(),
    utcDate.getUTCSeconds(),
    utcDate.getUTCMilliseconds(),
  );
  return Number.isNaN(localDate.getTime()) ? null : localDate;
}

function buildCalendarDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseConfiguredDateValue(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return buildCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (br) return buildCalendarDate(Number(br[3]), Number(br[2]), Number(br[1]));

  return null;
}

function isCalendarDateWithinBounds(date: Date, start: Date | null, end: Date | null): boolean {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (start) {
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    if (target < startDate) return false;
  }
  if (end) {
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (target > endDate) return false;
  }
  return true;
}

function resolveAmbiguousSlashDate(brDate: Date | null, usDate: Date | null): Date | null {
  if (brDate && !usDate) return brDate;
  if (!brDate && usDate) return usDate;
  if (!brDate || !usDate) return null;

  const rangeStart = parseConfiguredDateValue(form.value.dateIni);
  const rangeEnd = parseConfiguredDateValue(form.value.dateFim);

  const withinConfiguredRange = [brDate, usDate].filter(date => isCalendarDateWithinBounds(date, rangeStart, rangeEnd));
  if (withinConfiguredRange.length === 1) return withinConfiguredRange[0];

  if (rangeStart && rangeEnd && rangeStart.getFullYear() === rangeEnd.getFullYear() && rangeStart.getMonth() === rangeEnd.getMonth()) {
    const sameConfiguredMonth = [brDate, usDate].filter(date =>
      date.getFullYear() === rangeStart.getFullYear() && date.getMonth() === rangeStart.getMonth(),
    );
    if (sameConfiguredMonth.length === 1) return sameConfiguredMonth[0];
  }

  return brDate;
}

function parseSlashDateValue(value: string): Date | null {
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!slash) return null;

  const first = Number(slash[1]);
  const second = Number(slash[2]);
  const year = Number(slash[3]);

  const brDate = buildCalendarDate(year, second, first);
  const usDate = buildCalendarDate(year, first, second);

  return resolveAmbiguousSlashDate(brDate, usDate);
}

function parseDateValue(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') return parseExcelSerialDate(raw);

  const value = String(raw).trim();
  const slashDate = parseSlashDateValue(value);
  if (slashDate) return slashDate;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(value);
  if (iso) return buildCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function serializeDateValue(raw: unknown): string | null {
  const date = parseDateValue(raw);
  return date ? toDateKey(date) : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function mergeHolidayName(current: string | undefined, name: string): string {
  if (!current) return name;
  return current.split(' / ').includes(name) ? current : `${current} / ${name}`;
}

function calculateEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getBrazilDistritoFederalHolidays(year: number): Map<string, string> {
  const easter = calculateEasterDate(year);
  const holidays = new Map<string, string>();
  const registerHoliday = (dateKey: string, name: string) => {
    holidays.set(dateKey, mergeHolidayName(holidays.get(dateKey), name));
  };

  [
    [`${year}-01-01`, 'Confraternizacao Universal'],
    [`${year}-04-21`, 'Tiradentes'],
    [`${year}-05-01`, 'Dia do Trabalho'],
    [`${year}-09-07`, 'Independencia do Brasil'],
    [`${year}-10-12`, 'Nossa Senhora Aparecida'],
    [`${year}-11-02`, 'Finados'],
    [`${year}-11-15`, 'Proclamacao da Republica'],
    [`${year}-11-20`, 'Dia da Consciencia Negra'],
    [`${year}-12-25`, 'Natal'],
    [`${year}-04-21`, 'Aniversario de Brasilia'],
    [`${year}-10-12`, 'Padroeira de Brasilia'],
    [`${year}-11-30`, 'Dia do Evangelico'],
    [toDateKey(shiftDate(easter, -2)), 'Paixao de Cristo'],
    [toDateKey(shiftDate(easter, 60)), 'Corpus Christi'],
  ].forEach(([dateKey, name]) => registerHoliday(dateKey, name));

  return holidays;
}

function getHolidayName(date: Date): string {
  return getBrazilDistritoFederalHolidays(date.getFullYear()).get(toDateKey(date)) || '';
}

function normalizeCalendarDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isDateWithinConfiguredQuinzena(date: Date): boolean {
  const target = normalizeCalendarDate(date);
  const start = form.value.dateIni ? parseDateValue(form.value.dateIni) : null;
  const end = form.value.dateFim ? parseDateValue(form.value.dateFim) : null;

  if (start && target < normalizeCalendarDate(start)) return false;
  if (end && target > normalizeCalendarDate(end)) return false;
  return true;
}

function getHolidayBonusReferenceDate(row: ManagedAuditResult): Date | null {
  const dataFin = parseDateValue(row.dataFin);
  return dataFin ? normalizeCalendarDate(dataFin) : null;
}

function rowHasKeyword(row: Record<string, unknown>, keyword: string): boolean {
  const target = normalizeText(keyword);
  return Object.values(row || {}).some(value => normalizeText(value).includes(target));
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  }) as unknown[][];
}

function buildUniqueHeaders(cells: unknown[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, index) => {
    const base = stripText(cell) || `COLUNA_${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function countHeaderMatches(row: unknown[], keywordGroups: string[][]): number {
  const cells = row.map(cell => normalizeText(cell));
  return keywordGroups.reduce((score, group) => {
    const matched = group.some(keyword => {
      const normalizedKeyword = normalizeText(keyword);
      return cells.some(cell => cell.includes(normalizedKeyword));
    });
    return score + (matched ? 1 : 0);
  }, 0);
}

function detectHeaderRowIndex(matrix: unknown[][], keywordGroups: string[][]): number {
  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(matrix.length, 25);
  for (let i = 0; i < limit; i += 1) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const score = countHeaderMatches(row, keywordGroups);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : -1;
}

function sheetToObjects(sheet: XLSX.WorkSheet, keywordGroups: string[][]): Record<string, unknown>[] {
  const matrix = sheetToMatrix(sheet);
  if (!matrix.length) return [];
  const headerRowIndex = detectHeaderRowIndex(matrix, keywordGroups);
  if (headerRowIndex < 0) return [];
  const headers = buildUniqueHeaders(matrix[headerRowIndex] || []);
  return matrix.slice(headerRowIndex + 1)
    .filter(row => Array.isArray(row) && row.some(cell => stripText(cell) !== ''))
    .map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? '';
      });
      return obj;
    });
}

function workbookLooksLikeStarkSheet(wb: XLSX.WorkBook): boolean {
  const keywordGroups = [
    ['ID', 'OS', 'ORDEM'],
    ['STATUS'],
    ['ASSUNTO', 'SERVICO', 'SERVICO'],
    ['COLABORADOR'],
    ['FECHAMENTO', 'DATA'],
  ];

  return wb.SheetNames.some(sheetName => {
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    const headerRowIndex = detectHeaderRowIndex(matrix, keywordGroups);
    return headerRowIndex >= 0 && countHeaderMatches(matrix[headerRowIndex] || [], keywordGroups) >= 4;
  });
}

function getWorkbookRows(wb: XLSX.WorkBook): Record<string, unknown>[] {
  const stark = isStarkCompanyName(form.value.empresaNome) || workbookLooksLikeStarkSheet(wb);
  const keywordGroups = stark
    ? [
      ['ID', 'OS', 'ORDEM'],
      ['CLIENTE', 'CLIENT', 'NOME'],
      ['STATUS', 'SITUACAO'],
      ['ASSUNTO', 'SERVICO', 'SERVICO', 'TIPO', 'SERV'],
      ['VALOR', 'VALUE', 'R$', 'PRICE'],
      ['FECHAMENTO', 'DATA', 'DATE', 'DT'],
    ]
    : [
      ['ID', 'OS', 'ORDEM'],
      ['CLIENTE', 'CLIENT', 'NOME'],
      ['ASSUNTO', 'SERVICO', 'SERVICO', 'TIPO', 'SERV'],
      ['VALOR', 'VALUE', 'R$', 'PRICE'],
      ['FECHAMENTO', 'DATA', 'DATE', 'DT'],
    ];

  const detectedRows = wb.SheetNames.flatMap(sheetName => sheetToObjects(wb.Sheets[sheetName], keywordGroups));
  if (detectedRows.length) return detectedRows;

  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return firstSheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: true })
    : [];
}

onMounted(async () => {
  await Promise.all([
    loadEmpresas(),
    checkMysql(),
    loadAuditoriasSalvas(),
  ]);
});

// ── MySQL ─────────────────────────────────────────────────────

async function checkMysql() {
  pinging.value = true;
  try {
    const r = await comissaoApi.pingMysql();
    mysqlOk.value = r.ok;
    if (r.ok) mysqlInfo.value = { host: r.host ?? '', db: r.db ?? '' };
  } catch {
    mysqlOk.value = false;
  } finally {
    pinging.value = false;
  }
}

// ── Empresas ──────────────────────────────────────────────────

async function loadEmpresas() {
  empresas.value = await comissaoApi.getEmpresas();
}

function updatePreco(emp: EmpresaConfig, key: ServiceKey, raw: string) {
  const val = parseFloat(raw);
  if (!raw || isNaN(val)) {
    delete emp.precos[key];
  } else {
    emp.precos[key] = val;
  }
}

async function salvarEmpresa(emp: EmpresaConfig) {
  await comissaoApi.saveEmpresa({ nome: emp.nome, precos: emp.precos });
  await loadEmpresas();
}

async function adicionarEmpresa() {
  const nome = novaEmpresaNome.value.trim();
  if (!nome) return;
  await comissaoApi.saveEmpresa({ nome, precos: {} });
  novaEmpresaNome.value = '';
  await loadEmpresas();
}

async function excluirEmpresa(key: string) {
  await comissaoApi.deleteEmpresa(key);
  await loadEmpresas();
}

// ── Auditorias salvas ─────────────────────────────────────────

async function loadAuditoriasSalvas() {
  auditsSummary.value = await comissaoApi.getAuditoriasSalvas();
}

async function carregarAuditoriaSalva(key: string) {
  const audit = await comissaoApi.getAuditoriaSalva(key);
  results.value = prepareAuditResults(audit.results);
  form.value.empresaNome      = audit.companyName;
  form.value.dateIni          = audit.dateIni ? audit.dateIni.slice(0, 10) : '';
  form.value.dateFim          = audit.dateFim ? audit.dateFim.slice(0, 10) : '';
  tab.value = 'auditoria';
}

async function salvarAuditoria() {
  if (!results.value.length) return;
  try {
    await comissaoApi.saveAuditoria({
      companyName: form.value.empresaNome || 'Sem nome',
      dateIni: form.value.dateIni || null,
      dateFim: form.value.dateFim || null,
      source: 'database',
      summary: summary.value,
      results: results.value,
    });
    saveSuccess.value = true;
    await loadAuditoriasSalvas();
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  } catch (err: any) {
    processError.value = err.response?.data?.error ?? err.response?.data?.message ?? err.message;
  }
}

// ── Leitura da planilha ───────────────────────────────────────

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const f = e.dataTransfer?.files[0];
  if (f) loadFile(f);
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
}

function loadFile(f: File) {
  file1.value = f;
  rawData.value = [];
  sheetRows.value = [];
  columnHeaders.value = [];
  results.value = [];

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target!.result as ArrayBuffer);
    const wb   = XLSX.read(data, { type: 'array', cellDates: false });
    const rows = getWorkbookRows(wb);
    if (!rows.length) return;

    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
    columnHeaders.value = headers;
    rawData.value = rows;

    // Auto-detect colunas
    autoMapColumns(headers);
  };
  reader.readAsArrayBuffer(f);
}

const COLUMN_HINTS: Record<ColField, string[]> = {
  seq:            ['nÂ°', 'nÂº', 'numero', 'num', '#', 'seq'],
  id:             ['id os', 'id_os', 'idos', 'id', 'os', 'ordem', 'chamado', 'cod'],
  cliente:        ['cliente', 'nome', 'assinante'],
  colaborador:    ['colaborador', 'responsavel', 'tecnico', 'executor', 'funcionario'],
  tipoOS:         ['assunto', 'servico', 'tipo', 'type', 'serv'],
  statusPlanilha: ['status', 'situacao'],
  valor:          ['valor', 'preco', 'comissao', 'r$'],
  cidade:         ['cidade', 'municipio'],
  dataEnv:        ['data', 'dt', 'fechamento', 'finalizacao'],
  dobrada:        ['dobrada'],
};

function autoMapColumns(headers: string[]) {
  const map = { ...columnMap.value };
  for (const [field, hints] of Object.entries(COLUMN_HINTS) as [ColField, string[]][]) {
    const found = headers.find(h =>
      hints.some(hint => normalizeText(h).includes(normalizeText(hint))),
    );
    if (found) map[field] = found;
  }

  if (!map.id) {
    const inferredIdColumn = inferIdColumnFromRows(headers);
    if (inferredIdColumn) map.id = inferredIdColumn;
  }

  columnMap.value = map;
  buildSheetRowsReactive();
}

function isGenericColumnHeader(header: string): boolean {
  return /^COLUNA_\d+$/i.test(stripText(header));
}

function looksLikeOsId(value: unknown): boolean {
  const text = stripText(value);
  if (!/^\d+$/.test(text)) return false;
  const id = Number(text);
  return Number.isInteger(id) && id > 0;
}

function inferIdColumnFromRows(headers: string[]): string {
  const rows = rawData.value.slice(0, 50);
  let bestHeader = '';
  let bestScore = 0;

  for (const header of headers) {
    const values = rows.map(row => row[header]).filter(value => stripText(value) !== '');
    if (!values.length) continue;

    const numericCount = values.filter(looksLikeOsId).length;
    const genericBonus = isGenericColumnHeader(header) ? 1 : 0;
    const score = numericCount + genericBonus;
    const ratio = numericCount / values.length;

    if (numericCount >= 3 && ratio >= 0.8 && score > bestScore) {
      bestHeader = header;
      bestScore = score;
    }
  }

  return bestHeader;
}

watch(columnMap, buildSheetRowsReactive, { deep: true });
watch(() => [form.value.selectedCompanyKey, form.value.empresaNome], () => {
  if (rawData.value.length) buildSheetRowsReactive();
});

function buildSheetRows() {
  return rawData.value.map((row, i) => {
    const get = (field: ColField) => {
      const col = columnMap.value[field];
      return col ? row[col] : undefined;
    };

    const idRaw = parseInt(String(get('id') ?? '').trim(), 10);
    if (!Number.isInteger(idRaw) || idRaw <= 0) return null;

    const dataEnv = serializeDateValue(get('dataEnv'));

    const tipoOS = stripText(get('tipoOS'));
    const statusPlanilha = stripText(get('statusPlanilha'));
    const valor = parseMoneyInput(get('valor'));

    // Preço da tabela se não informado e empresa selecionada
    let finalValor = valor;
    let valorFonte = 'sheet';
    if (!finalValor) {
      const precoTabela = getPrecoForRow(getEffectiveEmpresaConfig(statusPlanilha), tipoOS, statusPlanilha);
      if (precoTabela) { finalValor = precoTabela; valorFonte = 'config'; }
    }

    return {
      seq:            stripText(get('seq')) || String(i + 1),
      id:             String(idRaw),
      cliente:        stripText(get('cliente')),
      colaborador:    stripText(get('colaborador')),
      tipoOS,
      statusPlanilha,
      dobrada:        /s|sim|1|x|true/i.test(String(get('dobrada') ?? '')) || rowHasKeyword(row, 'DOBRADA'),
      valor:          finalValor,
      valorFonte,
      cidade:         stripText(get('cidade')),
      dataEnv,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
}

function buildSheetRowsReactive() {
  sheetRows.value = buildSheetRows();
}

// ── Helpers ───────────────────────────────────────────────────

function getPrecoFromCompany(emp: EmpresaConfig, tipoOS: string): number | null {
  const normalized = tipoOS.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();

  for (const key of SERVICE_KEYS) {
    if (normalized.includes(key.replace(/_/g, ' '))) {
      return emp.precos[key] ?? null;
    }
  }
  return null;
}

const SERVICE_KEYWORDS: { key: ServiceKey; words: string[] }[] = [
  { key: 'INSTALACAO',         words: ['INSTALACAO', 'INSTALL'] },
  { key: 'MUDANCA_PONTO',      words: ['MUDANCA DE PONTO', 'MUD. PONTO', 'MUDAR PONTO', 'MUDANCA PONTO'] },
  { key: 'MUDANCA',            words: ['MUDANCA DE ENDERECO', 'MUDANCA'] },
  { key: 'MESH',               words: ['MESH'] },
  { key: 'REPETIDOR',          words: ['REPETIDOR'] },
  { key: 'MANUTENCAO_EXTERNA', words: ['MANUTENCAO EXTERNA', 'EXTERNA', 'EXTERNO'] },
  { key: 'MANUTENCAO_INTERNA', words: ['MANUTENCAO INTERNA', 'INTERNA', 'INTERNO'] },
  { key: 'MANUTENCAO_TECNICA', words: ['MANUTENCAO TECNICA', 'MANUTENCAO'] },
  { key: 'RETIRADA',           words: ['RETIRADA', 'COLETA', 'PONTO DE INTERNET'] },
  { key: 'CARNES',             words: ['CARNES', 'CARNE'] },
  { key: 'TENTATIVA_RETIRADA', words: ['TENTATIVA RETIRADA', 'TENTATIVA'] },
  { key: 'REFAZER',            words: ['REFAZER', 'REINSTALACAO'] },
];

function normalizeServiceLocal(value: unknown): ServiceKey | null {
  const text = normalizeText(value);
  for (const { key, words } of SERVICE_KEYWORDS) {
    if (words.some(word => text.includes(normalizeText(word)))) return key;
  }
  return null;
}

function getEffectiveEmpresaConfig(statusPlanilha = ''): EmpresaConfig | null {
  if (selectedCompany.value) return selectedCompany.value;
  return findEmpresaByNameOrKey(form.value.empresaNome)
    || (statusPlanilha ? findEmpresaByNameOrKey('STARK') : null);
}

function getStarkPrecoStatus(emp: EmpresaConfig | null, statusPlanilha: string): number | null {
  if (!emp?.precos) return null;
  const status = normalizeText(statusPlanilha);
  if (status.includes('TENTATIVA')) return emp.precos.TENTATIVA_RETIRADA ?? null;
  if (status.includes('RETIRADA') && status.includes('SUCESSO')) return emp.precos.RETIRADA ?? null;
  return null;
}

function getPrecoForRow(emp: EmpresaConfig | null, tipoOS: string, statusPlanilha = ''): number | null {
  if (!emp?.precos) return null;
  const starkPrice = statusPlanilha ? getStarkPrecoStatus(emp, statusPlanilha) : null;
  if (starkPrice != null && starkPrice > 0) return Number(starkPrice);
  const key = normalizeServiceLocal(tipoOS);
  if (!key) return getPrecoFromCompany(emp, tipoOS);
  const value = emp.precos[key];
  return value != null ? Number(value) : null;
}

function isDobradaGestorElegivel(result: ManagedAuditResult): boolean {
  const status = stripText(result.status);
  return Boolean(result.dobrada && Number(result.valor) > 0 && (status === 'OK' || status === 'AUDITORIA'));
}

function getDobradaGestorStatus(result: ManagedAuditResult): DobradaGestorStatus {
  return stripText(result.dobradaGestorStatus) === 'indevida' ? 'indevida' : 'devida';
}

function getDobradaValorAdjSemAprovacao(result: ManagedAuditResult): number {
  const desconto = Number(result.desconto) || 0;
  const valorBase = result.valorTabela != null && result.valorTabela !== undefined
    ? Number(result.valorTabela) || 0
    : Number(result.valor) || 0;
  return Number((valorBase * (1 - desconto / 100)).toFixed(2));
}

function splitObsParts(obs: unknown): string[] {
  return stripText(obs)
    .split('|')
    .map(part => stripText(part))
    .filter(Boolean);
}

function removeDobradaObsParts(parts: string[]): string[] {
  return parts.filter(part => {
    const normalized = normalizeText(part);
    if (!normalized.includes('DOBRADA')) return true;
    if (normalized.includes('GESTOR')) return false;
    return !normalized.includes('MANTIDO VALOR SOLICITADO');
  });
}

function buildDobradaObs(result: ManagedAuditResult): string {
  const parts = removeDobradaObsParts(splitObsParts(result.obsOriginal || result.obs));
  if (!isDobradaGestorElegivel(result)) return parts.join(' | ');

  if (getDobradaGestorStatus(result) === 'indevida') {
    let note = result.valorTabela != null
      ? `OS DOBRADA marcada pelo gestor como indevida: valor recalculado pela tabela da empresa (${fmt(result.valorTabela)})`
      : 'OS DOBRADA marcada pelo gestor como indevida: sem valor tabelado, recalculo aplicado sobre o valor enviado';

    if ((Number(result.desconto) || 0) > 0) {
      note += ` com desconto de ${Number(result.desconto).toFixed(0)}%`;
    }

    parts.push(note);
    return parts.join(' | ');
  }

  parts.push('OS marcada como DOBRADA na planilha: mantido o valor solicitado pela terceirizada');
  return parts.join(' | ');
}

function applyDobradaGestorState(result: ManagedAuditResult): ManagedAuditResult {
  result.obsOriginal = stripText(result.obsOriginal) || stripText(result.obs);
  result.valorAdjOriginal = Number(result.valorAdjOriginal) > 0
    ? Number(result.valorAdjOriginal)
    : Number(result.valorAdj) || 0;
  result.valorAdjSemAprovacao = Number(result.valorAdjSemAprovacao) > 0
    ? Number(result.valorAdjSemAprovacao)
    : getDobradaValorAdjSemAprovacao(result);

  if (!isDobradaGestorElegivel(result)) {
    result.dobradaGestorStatus = '';
    return result;
  }

  result.dobradaGestorStatus = getDobradaGestorStatus(result);
  result.valorAdj = result.dobradaGestorStatus === 'indevida'
    ? result.valorAdjSemAprovacao
    : result.valorAdjOriginal;
  result.obs = buildDobradaObs(result);
  return result;
}

function prepareAuditResults(rawResults: AuditResult[]): ManagedAuditResult[] {
  return (Array.isArray(rawResults) ? rawResults : []).map((result, index) => {
    const prepared: ManagedAuditResult = {
      ...result,
      dobradaGestorStatus: stripText(result.dobradaGestorStatus) === 'indevida'
        ? 'indevida'
        : stripText(result.dobradaGestorStatus) === 'devida' ? 'devida' : '',
      uiKey: stripText(result.uiKey) || `${stripText(result.id)}_${stripText(result.seq)}_${index}`,
    };
    return applyDobradaGestorState(prepared);
  });
}

function toggleDobradaGestor(result: ManagedAuditResult, isDevida: boolean) {
  result.dobradaGestorStatus = isDevida ? 'devida' : 'indevida';
  applyDobradaGestorState(result);
  results.value = [...results.value];
}

function calculateHolidayBonuses(rows: ManagedAuditResult[]) {
  const seen = new Set<string>();
  const entries: AuditSummary['holidayBonusEntries'] = [];

  rows.forEach(row => {
    const tecnico = stripText(row.tecnico);
    const dataRef = getHolidayBonusReferenceDate(row);

    if (!tecnico || !dataRef) return;
    if (row.status === 'PENDENTE' || row.status === 'FORA_QUINZENA') return;
    if ((Number(row.valorAdj) || 0) <= 0) return;
    if (!isDateWithinConfiguredQuinzena(dataRef)) return;

    const isSunday = dataRef.getDay() === 0;
    const holidayName = getHolidayName(dataRef);
    if (!isSunday && !holidayName) return;

    const key = `${normalizeText(tecnico)}|${toDateKey(dataRef)}`;
    if (seen.has(key)) return;
    seen.add(key);

    let motivo = 'Domingo';
    if (isSunday && holidayName) {
      motivo = `Domingo e feriado BR/DF (${holidayName})`;
    } else if (holidayName) {
      motivo = `Feriado BR/DF (${holidayName})`;
    }

    entries.push({
      tecnico,
      data: serializeDateValue(new Date(dataRef.getFullYear(), dataRef.getMonth(), dataRef.getDate())),
      motivo,
      valor: HOLIDAY_BONUS_VALUE,
    });
  });

  entries.sort((a, b) => {
    const da = parseDateValue(a.data)?.getTime() ?? 0;
    const db = parseDateValue(b.data)?.getTime() ?? 0;
    if (da !== db) return da - db;
    return a.tecnico.localeCompare(b.tecnico, 'pt-BR');
  });

  return {
    entries,
    total: entries.length * HOLIDAY_BONUS_VALUE,
  };
}

function calculateSummary(rows: ManagedAuditResult[]): AuditSummary {
  const holidayBonus = calculateHolidayBonuses(rows);
  const totalPagarBase = rows.reduce((sum, row) =>
    sum + (row.status !== 'DIVERGENCIA' && row.status !== 'PENDENTE' && row.status !== 'FORA_QUINZENA' ? Number(row.valorAdj) || 0 : 0), 0);

  return {
    total:              rows.length,
    ok:                 rows.filter(row => row.status === 'OK').length,
    auditoria:          rows.filter(row => row.status === 'AUDITORIA').length,
    divergencia:        rows.filter(row => row.status === 'DIVERGENCIA').length,
    pendente:           rows.filter(row => row.status === 'PENDENTE').length,
    fora:               rows.filter(row => row.status === 'FORA_QUINZENA').length,
    totalPagarBase,
    totalSolicitado:    rows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0),
    holidayBonusEntries: holidayBonus.entries,
    holidayBonusTotal:   holidayBonus.total,
    totalPagar:          totalPagarBase + holidayBonus.total,
  };
}

// ── Processar ─────────────────────────────────────────────────

async function processar() {
  if (!sheetRows.value.length) return;
  processing.value = true;
  processError.value = '';
  try {
    const hasStarkStatus = sheetRows.value.some(row => stripText(row.statusPlanilha));
    const empresaConfig = selectedCompany.value
      ?? (hasStarkStatus ? findEmpresaByNameOrKey(form.value.empresaNome) ?? findEmpresaByNameOrKey('STARK') : findEmpresaByNameOrKey(form.value.empresaNome));
    const companyType = hasStarkStatus || isStarkCompanyName(form.value.empresaNome) || isStarkCompanyName(empresaConfig?.nome) || isStarkCompanyName(empresaConfig?.key)
      ? 'STARK'
      : (empresaConfig?.key ?? '');
    const res = await comissaoApi.auditarPlanilha({
      rows: sheetRows.value,
      dateIni: form.value.dateIni || null,
      dateFim: form.value.dateFim || null,
      empresaNome: form.value.empresaNome,
      companyType,
      empresaConfig,
    });
    results.value = prepareAuditResults(res.data);
    statusFilter.value = 'ALL';
  } catch (err: any) {
    processError.value = err.response?.data?.error ?? err.message;
  } finally {
    processing.value = false;
  }
}

// ── Exportar Excel ────────────────────────────────────────────

function buildSummaryExportRow(items: { label: string; value: unknown }[]): unknown[] {
  const row: unknown[] = [];
  items.forEach((item, index) => {
    if (index > 0) row.push('');
    row.push(item.label, item.value);
  });
  return row;
}

function appendHolidayBonusesToSheet(ws: XLSX.WorkSheet, startRow: number, sum: AuditSummary): number {
  if (!sum.holidayBonusEntries.length) return startRow;

  const rows = [
    ['ADICIONAL DOMINGO / FERIADO'],
    ['Tecnico', 'Data', 'Motivo', 'Valor'],
    ...sum.holidayBonusEntries.map(entry => [
      entry.tecnico,
      fmtDate(entry.data),
      entry.motivo,
      entry.valor,
    ]),
    ['TOTAL ADICIONAL', '', '', sum.holidayBonusTotal],
    [''],
  ];

  XLSX.utils.sheet_add_aoa(ws, rows, { origin: `A${startRow}` });
  return startRow + rows.length;
}

function appendSummaryToSheet(ws: XLSX.WorkSheet, startRow: number, sum: AuditSummary) {
  XLSX.utils.sheet_add_aoa(ws, [
    [''],
    ['RESUMO'],
    [''],
    buildSummaryExportRow([
      { label: 'TOTAL OS', value: sum.total },
      { label: 'OK', value: sum.ok },
      { label: 'AUDITORIA', value: sum.auditoria },
      { label: 'DIVERGENCIAS', value: sum.divergencia },
      { label: 'PENDENTES', value: sum.pendente },
      { label: 'FORA DA QUINZENA', value: sum.fora },
    ]),
    [''],
    buildSummaryExportRow([
      { label: 'BASE OS', value: sum.totalPagarBase },
      { label: 'ADICIONAL DOM/FER', value: sum.holidayBonusTotal },
      { label: 'TOTAL A PAGAR', value: sum.totalPagar },
      { label: 'TOTAL SOLICITADO', value: sum.totalSolicitado },
    ]),
  ], { origin: `A${startRow}` });
}

function exportarExcel() {
  if (!results.value.length) return;
  const sum = summary.value;

  const wsData = results.value.map(r => ({
    '#':           r.seq,
    'ID OS':       r.id,
    'Status Planilha': r.statusPlanilha || '',
    'Dobrada':     r.dobrada ? 'Sim' : 'Nao',
    'Aprovacao Gestor Dobrada': r.dobrada
      ? (getDobradaGestorStatus(r) === 'indevida' ? 'Indevida' : 'Devida')
      : '',
    'Cliente':     r.clienteDB || r.cliente,
    'Tipo OS':     r.tipoOS,
    'Tipo IXC':    r.tipoIXC,
    'Cidade':      r.cidadeDB || r.cidade,
    'Técnico':     r.tecnico,
    'Data Env.':   r.dataEnv ? fmtDate(r.dataEnv) : '',
    'Data Fin.':   r.dataFin ? fmtDate(r.dataFin) : '',
    'Status OS':   r.statusOS,
    'G.Com.':      r.geraComissao,
    'Valor Tab.':  r.valorTabela ?? '',
    'Solicitado':  r.valor,
    'Desc.%':      r.desconto || '',
    'A Pagar':     r.valorAdj,
    'Status':      r.status,
    'Observações': r.obs,
  }));

  const ws = XLSX.utils.json_to_sheet(wsData);
  let nextRow = wsData.length + 3;
  nextRow = appendHolidayBonusesToSheet(ws, nextRow, sum);
  appendSummaryToSheet(ws, nextRow, sum);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');

  const empresa   = form.value.empresaNome || 'comissao';
  const dataLabel = form.value.dateIni && form.value.dateFim
    ? `_${form.value.dateIni}_${form.value.dateFim}`
    : '';
  XLSX.writeFile(wb, `auditoria_${empresa}${dataLabel}.xlsx`);
}

// ── Formatadores ──────────────────────────────────────────────

function fmt(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = parseDateValue(iso);
  return date ? date.toLocaleDateString('pt-BR') : iso;
}
</script>

<style scoped>
.cc-view { max-width: 1400px; }

/* ── Cards ── */
.cc-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.5rem;
  margin-bottom: 1rem;
}
.cc-card-title {
  display: flex;
  align-items: center;
  gap: .5rem;
  font-size: .8rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-2);
  margin-bottom: 1rem;
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--accent);
  color: #000;
  font-size: .7rem;
  font-weight: 800;
  flex-shrink: 0;
}

/* ── Form layout ── */
.cc-form-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.cc-form-row .form-group { flex: 1 1 180px; }

/* ── Badge banco ── */
.db-badge {
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  font-size: .72rem;
  font-weight: 600;
  padding: .3rem .75rem;
  border-radius: 20px;
  letter-spacing: .04em;
}
.db-badge.ok    { background: var(--success-bg); color: var(--success); border: 1px solid rgba(199,255,0,.2); }
.db-badge.error { background: var(--error-bg);   color: var(--error);   border: 1px solid rgba(255,42,95,.2); }
.badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.db-badge.ok .badge-dot { animation: pulse 2s infinite; }

/* ── Header actions ── */
.header-actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }

.btn-secondary {
  display: flex; align-items: center; gap: .4rem;
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  color: var(--text-2);
  border-radius: var(--radius-sm);
  padding: .4rem .85rem;
  font-size: .78rem;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}
.btn-secondary:hover { color: var(--text); border-color: var(--border-2); background: var(--surface-3); }

.btn-icon {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: var(--radius-sm);
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-icon:hover { color: var(--text); }
.btn-icon:disabled { opacity: .4; cursor: not-allowed; }

.badge-count {
  background: var(--surface-3);
  color: var(--text-2);
  font-size: .65rem;
  padding: .1rem .4rem;
  border-radius: 20px;
  font-family: var(--font-mono);
}

/* ── Drop zone ── */
.drop-zone {
  border: 2px dashed var(--border-2);
  border-radius: var(--radius);
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: all var(--transition);
  color: var(--text-2);
  font-size: .85rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .5rem;
  min-height: 90px;
  justify-content: center;
}
.drop-zone:hover, .drop-zone.drag-over {
  border-color: var(--accent);
  background: var(--accent-dim);
  color: var(--text);
}
.drop-zone.has-file {
  border-style: solid;
  border-color: var(--accent);
  background: rgba(0,240,255,.05);
  flex-direction: row;
  padding: 1rem 1.25rem;
}
.file-name { font-size: .82rem; color: var(--accent); font-weight: 500; flex: 1; text-align: left; }
.btn-remove-file {
  background: none; border: none; color: var(--text-3); cursor: pointer;
  font-size: .9rem; padding: .2rem .4rem;
  transition: color var(--transition);
}
.btn-remove-file:hover { color: var(--error); }

/* ── Info box ── */
.info-box {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .75rem 1rem;
}
.info-row {
  display: flex;
  justify-content: space-between;
  font-size: .8rem;
  padding: .2rem 0;
  border-bottom: 1px solid var(--border);
}
.info-row:last-child { border-bottom: none; }
.info-row span { color: var(--text-2); }
.info-row strong { color: var(--text); font-family: var(--font-mono); }

/* ── Column mapping ── */
.col-map-section {
  margin-top: 1.25rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.col-map-title {
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: .75rem;
}
.col-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: .75rem;
}

/* ── Summary ── */
.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: .75rem;
  margin-bottom: 1rem;
}
.summary-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .75rem 1rem;
}
.sc-label { font-size: .68rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); display: block; margin-bottom: .2rem; }
.sc-value { font-family: var(--font-mono); font-size: 1.15rem; font-weight: 700; color: var(--text); display: block; }
.sc-value.ok-val    { color: var(--success); }
.sc-value.amber     { color: #f59e0b; }
.sc-value.error-val { color: var(--error); }
.sc-value.accent    { color: var(--accent); }

.bonus-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .9rem 1rem;
  margin-bottom: 1rem;
}
.bonus-title {
  font-size: .72rem;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: .65rem;
}
.bonus-list { display: grid; gap: .4rem; }
.bonus-item {
  display: grid;
  grid-template-columns: minmax(160px, 1.5fr) 90px minmax(180px, 2fr) 90px;
  gap: .7rem;
  align-items: center;
  font-size: .78rem;
}
.bonus-tech { color: var(--text); font-weight: 600; }
.bonus-date, .bonus-reason { color: var(--text-2); }
.bonus-value { color: var(--accent); font-family: var(--font-mono); font-weight: 700; text-align: right; }

/* ── Status filters ── */
.status-filter-pills { display: flex; gap: .4rem; flex-wrap: wrap; }
.filter-pill {
  display: flex; align-items: center; gap: .3rem;
  padding: .3rem .75rem;
  border-radius: 20px;
  border: 1px solid var(--border-2);
  background: none;
  color: var(--text-2);
  font-size: .75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  font-family: var(--font-body);
}
.filter-pill:hover { color: var(--text); background: var(--surface-2); }
.filter-pill.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
.pill-count {
  font-family: var(--font-mono);
  font-size: .7rem;
  background: var(--surface-3);
  color: var(--text-2);
  padding: .05rem .4rem;
  border-radius: 20px;
}

/* ── Tabela ── */
.table-wrapper { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; font-size: .78rem; }
thead { background: var(--surface); position: sticky; top: 0; z-index: 1; }
thead th { color: var(--text-2); text-align: left; padding: .5rem .65rem; font-weight: 600; font-size: .65rem; letter-spacing: .07em; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody tr { border-bottom: 1px solid var(--border); transition: background var(--transition); }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: var(--surface-2); }
tbody td { padding: .35rem .65rem; vertical-align: top; }

.row-ok          { border-left: 2px solid rgba(199,255,0,.25); }
.row-auditoria   { border-left: 2px solid rgba(245,158,11,.35); }
.row-divergencia { border-left: 2px solid rgba(255,42,95,.35); }
.row-pendente    { border-left: 2px solid rgba(100,116,139,.35); }
.row-fora_quinzena { border-left: 2px solid rgba(100,116,139,.2); }

.td-mono   { font-family: var(--font-mono); font-size: .75rem; color: var(--text-2); white-space: nowrap; }
.td-muted  { color: var(--text-2); font-size: .78rem; }
.td-date   { font-size: .75rem; color: var(--text-2); white-space: nowrap; }
.td-amount { font-family: var(--font-mono); font-size: .78rem; white-space: nowrap; }
.td-commission { font-family: var(--font-mono); font-weight: 700; color: var(--accent); white-space: nowrap; }
.td-obs    { font-size: .72rem; color: var(--text-2); max-width: 320px; line-height: 1.4; }
.td-dobrada { min-width: 118px; }

.dobrada-chip {
  display: inline-block;
  padding: .12rem .4rem;
  border-radius: 3px;
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  background: rgba(245,158,11,.12);
  color: #f59e0b;
  margin-bottom: .25rem;
}
.manager-approval-toggle {
  display: flex;
  align-items: center;
  gap: .3rem;
  color: var(--text-2);
  font-size: .7rem;
  white-space: nowrap;
}
.manager-approval-toggle input { accent-color: var(--accent); }
.manager-approval-note {
  display: block;
  color: var(--text-3);
  font-size: .68rem;
}

.tipo-tag {
  display: inline-block;
  padding: .15rem .5rem;
  border-radius: 3px;
  font-size: .68rem;
  font-weight: 700;
  background: var(--surface-3);
  color: var(--text-2);
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: .04em;
}

.status-tag {
  display: inline-block;
  padding: .2rem .55rem;
  border-radius: 20px;
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.status-ok            { background: var(--success-bg); color: var(--success); }
.status-auditoria     { background: rgba(245,158,11,.12); color: #f59e0b; }
.status-divergencia   { background: var(--error-bg); color: var(--error); }
.status-pendente      { background: var(--surface-3); color: var(--text-2); }
.status-fora_quinzena { background: var(--surface-3); color: var(--text-3); }

/* ── Tabelas de preços ── */
.empresa-form { margin-bottom: 1.5rem; }
.empresa-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin-bottom: .75rem;
}
.empresa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: .75rem;
}
.empresa-nome { font-weight: 700; font-size: .9rem; color: var(--text); }
.empresa-actions { display: flex; gap: .4rem; }
.btn-save { color: var(--accent); }
.btn-delete { color: var(--error); }

.precos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: .6rem;
}
.preco-item input { padding: .4rem .65rem; font-family: var(--font-mono); font-size: .82rem; }

/* ── Auditorias salvas ── */
.audits-list { display: flex; flex-direction: column; gap: .6rem; }
.audit-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .85rem 1.1rem;
  cursor: pointer;
  transition: all var(--transition);
}
.audit-item:hover { border-color: var(--accent); background: var(--accent-dim); }
.audit-company { font-weight: 700; font-size: .9rem; color: var(--text); margin-bottom: .3rem; }
.audit-meta { display: flex; gap: 1rem; flex-wrap: wrap; font-size: .78rem; color: var(--text-2); margin-bottom: .35rem; }
.audit-source { text-transform: uppercase; font-size: .68rem; letter-spacing: .06em; }
.audit-pagar { font-family: var(--font-mono); color: var(--accent); font-weight: 600; }
.audit-stats { display: flex; gap: .4rem; }
.pill-ok  { display: inline-block; padding: .1rem .5rem; border-radius: 20px; font-size: .65rem; font-weight: 700; background: var(--success-bg); color: var(--success); }
.pill-aud { display: inline-block; padding: .1rem .5rem; border-radius: 20px; font-size: .65rem; font-weight: 700; background: rgba(245,158,11,.12); color: #f59e0b; }
.pill-div { display: inline-block; padding: .1rem .5rem; border-radius: 20px; font-size: .65rem; font-weight: 700; background: var(--error-bg); color: var(--error); }

/* ── Alerts ── */
.alert-msg {
  padding: .5rem .9rem; border-radius: var(--radius-sm);
  font-size: .82rem; font-weight: 500;
  display: flex; align-items: center; gap: .4rem;
}
.alert-msg.success { background: var(--success-bg); color: var(--success); border: 1px solid rgba(199,255,0,.2); }
.alert-msg.error   { background: var(--error-bg); color: var(--error); border: 1px solid rgba(255,42,95,.2); }
</style>
