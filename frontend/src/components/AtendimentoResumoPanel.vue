<template>
  <div class="view-atendimento">
    <div class="atendimento-header">
      <div>
        <h1 class="atendimento-title">{{ titulo }}</h1>
        <p class="atendimento-sub">{{ subtitulo }}</p>
      </div>
      <div class="header-actions">
        <PeriodFilter
          v-if="aba === 'dashboard'"
          v-model:model-period="period"
          v-model:model-month="customMonth"
          v-model:model-year="customYear"
          @change="onPeriodChange"
        />
        <button class="btn-refresh" @click="carregarTudo" :disabled="loadingKpis">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Atualizar
        </button>
      </div>
    </div>

    <div class="atd-tabs">
      <button :class="['atd-tab', { active: aba === 'dashboard' }]" @click="aba = 'dashboard'">Dashboard</button>
      <button :class="['atd-tab', { active: aba === 'alertas' }]" @click="aba = 'alertas'">
        Alertas
        <span v-if="alertas.length" class="atd-tab-badge">{{ alertas.length }}</span>
      </button>
      <button :class="['atd-tab', { active: aba === 'operadores' }]" @click="aba = 'operadores'">
        Operadores Ao Vivo
      </button>
      <button :class="['atd-tab', { active: aba === 'jornada' }]" @click="abrirJornada">
        Jornada e Produtividade
      </button>
    </div>

    <template v-if="aba === 'dashboard'">
    <!-- Cards por setor -->
    <div v-if="loadingKpis" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando indicadores…
    </div>
    <div v-else class="setor-cards">
      <div v-for="k in kpis" :key="k.setor" class="setor-card">
        <div class="setor-card-header">
          <span class="setor-nome">{{ nomeSetor(k.setor) }}</span>
          <div class="setor-volume-bloco">
            <span class="setor-volume">{{ k.volume }}</span>
            <span class="setor-volume-label">Volume total</span>
          </div>
        </div>
        <div class="setor-stat-row">
          <div class="setor-stat" title="TMR — quanto tempo o atendente HUMANO demora pra responder uma mensagem do cliente (nunca conta resposta da URA/IZA, nem mensagem que o atendente manda por conta própria)">
            <span class="setor-stat-label">TMR · resposta</span>
            <span class="setor-stat-valor">{{ formatarDuracao(k.tmrMs) }}</span>
            <span class="setor-stat-detalhe">{{ amostraPequena(k.volume) }}</span>
          </div>
          <div class="setor-stat" title="TME — tempo em fila/URA/IZA até um atendente HUMANO de verdade assumir o atendimento (mede fila/espera)">
            <span class="setor-stat-label">TME · espera</span>
            <span class="setor-stat-valor">{{ formatarDuracao(k.tmeMs) }}</span>
            <span class="setor-stat-detalhe">{{ amostraPequena(k.volume) }}</span>
          </div>
          <div class="setor-stat" title="TMA — só o tempo que o atendente humano passou de fato com o cliente">
            <span class="setor-stat-label">TMA · atendimento</span>
            <span class="setor-stat-valor">{{ formatarDuracao(k.tmaMs) }}</span>
            <span class="setor-stat-detalhe">{{ amostraPequena(k.volume) }}</span>
          </div>
          <div class="setor-stat">
            <span class="setor-stat-label">Satisfação</span>
            <span class="setor-stat-valor">{{ k.notaMediaSatisfacao !== null ? `${k.notaMediaSatisfacao}/5` : '—' }}</span>
            <span class="setor-stat-detalhe">{{ k.qtdAvaliados }} avaliações{{ k.qtdAvaliados > 0 && k.qtdAvaliados < AMOSTRA_MINIMA ? ' · amostra pequena' : '' }}</span>
          </div>
          <div v-if="k.pctEscalonamento !== null" class="setor-stat">
            <span class="setor-stat-label">Escalonado</span>
            <span class="setor-stat-valor">{{ k.escalonamentos }}</span>
            <span class="setor-stat-detalhe">{{ k.pctEscalonamento ?? 0 }}% do volume</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Volume por setor + composição -->
    <div v-if="!loadingKpis && kpis.length" class="charts-row charts-4">
      <ChartBars title="Volume de Atendimentos por Setor" :bars="volumeBarData" />
      <ChartRanking title="Qtd de Atendimentos" :items="rankingAtendentesData" :max-items="8" monochrome />
      <ChartRanking title="Índice de Satisfação" :items="rankingAvaliacoesData" :max-items="8" monochrome />
      <ChartRanking title="Motivos de Atendimento" :items="motivosData" :max-items="8" monochrome />
    </div>
    </template>

    <!-- Alertas operacionais em tempo real -->
    <template v-if="aba === 'alertas'">
    <p class="atd-aviso">
      Conversa parada, fila sem 1ª resposta, agente ausente demais, fila acumulada — atualiza a
      cada 30s. Feed interno, não manda e-mail nem WhatsApp.
    </p>
    <div v-if="loadingAlertas" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando alertas…
    </div>
    <div v-else class="alertas-lista">
      <div v-if="!alertas.length" class="state-msg">Nenhum alerta aberto agora. 🎉</div>
      <AlertaCard
        v-for="a in alertas"
        :key="a.id"
        :alerta="{ ...a, origem: 'atendimento', contexto: a.setor }"
        :podeResolver="true"
        :resolvendo="resolvendoId === a.id"
        @resolver="resolver(a.id)"
      />
    </div>
    </template>

    <!-- Sala de Controle: Operadores Ao Vivo -->
    <template v-if="aba === 'operadores'">
      <AtendimentoOperadoresAoVivo :setores="setores" />
    </template>

    <!-- Indicadores de RH: jornada por operador num período configurável -->
    <template v-if="aba === 'jornada'">
      <div class="jornada-header-row">
        <p class="jornada-desc">
          Tempo real logado por operador no período (produtivo, pausa, ausente) e volume atendido,
          para RH e gestão acompanharem jornada e ociosidade. Diferente de "Operadores Ao Vivo"
          (que é só o status de agora), aqui é histórico e soma o período inteiro.
        </p>
        <PeriodFilter
          v-model:model-period="periodJornada"
          v-model:model-month="customMonthJornada"
          v-model:model-year="customYearJornada"
          @change="carregarIndicadoresJornada"
        />
      </div>

      <div v-if="loadingJornada" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span> Calculando jornada (pode levar alguns segundos)…
      </div>
      <IndicadorJornadaTable v-else :indicadores="indicadoresJornada" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import PeriodFilter from './PeriodFilter.vue';
import ChartBars from './ChartBars.vue';
import ChartRanking from './ChartRanking.vue';
import AlertaCard from './shared/AlertaCard.vue';
import AtendimentoOperadoresAoVivo from './AtendimentoOperadoresAoVivo.vue';
import IndicadorJornadaTable from './shared/IndicadorJornadaTable.vue';
import { type Period, getPeriodRange } from '../composables/useDateRange';
import {
  atendimentoApiClient,
  NOMES_SETOR,
  CORES_SETOR,
  type KpisAtendimento,
  type SetorAtendimento,
  type RankingAtendenteEntry,
  type RankingAvaliacaoEntry,
  type MotivoAtendimentoEntry,
  type AlertaOperacional,
  type IndicadorJornadaOperador,
} from '../services/atendimentoApi';

type Aba = 'dashboard' | 'alertas' | 'operadores' | 'jornada';

const props = defineProps<{
  titulo:    string;
  subtitulo: string;
  /// Só os setores desse grupo aparecem — cada página (Centro de Solução,
  /// Comercial) passa o seu próprio subconjunto, ver SETORES_CENTRO_SOLUCAO
  /// / SETORES_COMERCIAL em atendimentoApi.ts.
  setores:   SetorAtendimento[];
}>();

// Abaixo disso, mediana/nota fica ruidosa demais pra ser um número
// representativo (ex: N2 com só 2 atendimentos no mês, um deles um outlier
// gigante) — sinaliza em vez de mostrar como se fosse um valor confiável.
const AMOSTRA_MINIMA = 5;
function amostraPequena(n: number): string { return n < AMOSTRA_MINIMA ? 'amostra pequena' : 'mediana'; }
function nomeSetor(s: SetorAtendimento) { return NOMES_SETOR[s] ?? s; }

function formatarDuracao(ms: number | null): string {
  if (ms === null) return '—';
  // TMR normalmente é questão de segundos — arredondar pra minuto mostraria
  // "0min" pra quase todo mundo.
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}min` : ''}`;
}

const aba         = ref<Aba>('dashboard');
const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());

const kpis = ref<KpisAtendimento[]>([]);
const rankingAtendentes = ref<RankingAtendenteEntry[]>([]);
const rankingAvaliacoes = ref<RankingAvaliacaoEntry[]>([]);
const rankingMotivos    = ref<MotivoAtendimentoEntry[]>([]);
const loadingKpis = ref(false);

const alertas        = ref<AlertaOperacional[]>([]);
const loadingAlertas = ref(false);
const resolvendoId   = ref<string | null>(null);

async function carregarKpis() {
  loadingKpis.value = true;
  try {
    const d = getPeriodRange(period.value, customYear.value, customMonth.value);
    const r = await atendimentoApiClient.getResumo({ dateFrom: d.dateFrom, dateTo: d.dateTo, setores: props.setores });
    kpis.value = r.kpis;
    rankingAtendentes.value = r.rankings.atendentes;
    rankingAvaliacoes.value = r.rankings.avaliacoes;
    rankingMotivos.value = r.rankings.motivos;
  } finally {
    loadingKpis.value = false;
  }
}

function onPeriodChange() {
  carregarKpis();
}

const volumeBarData = computed(() =>
  kpis.value.map((k) => ({ label: nomeSetor(k.setor), value: k.volume, color: CORES_SETOR[k.setor] })),
);

// Aprimorar é empresa terceirizada que reforça o Centro de Solução (não é
// conta de teste) — marcada visualmente pra não confundir com quadro próprio.
const REGEX_TERCEIRIZADO = /^aprimorar/i;
function tagTerceirizado(nome: string): string | undefined {
  return REGEX_TERCEIRIZADO.test(nome) ? 'Terceirizado' : undefined;
}

const rankingAtendentesData = computed(() =>
  rankingAtendentes.value.map((r) => ({ name: r.nome, count: r.qtd, value: r.qtd, displayValue: String(r.qtd), tag: tagTerceirizado(r.nome) }))
);

const rankingAvaliacoesData = computed(() =>
  rankingAvaliacoes.value.map((r) => ({ name: r.nome, count: r.notaMedia, value: r.notaMedia, displayValue: `${r.notaMedia}/5 (${r.qtdAvaliacoes})`, tag: tagTerceirizado(r.nome) }))
);

const motivosData = computed(() =>
  rankingMotivos.value.map((r) => ({ name: r.motivo, count: r.qtd, value: r.qtd, displayValue: String(r.qtd) }))
);

async function carregarAlertas() {
  loadingAlertas.value = true;
  try {
    const r = await atendimentoApiClient.getAlertasOperacionais();
    alertas.value = r.itens;
  } finally {
    loadingAlertas.value = false;
  }
}

async function resolver(id: string) {
  resolvendoId.value = id;
  try {
    await atendimentoApiClient.resolverAlertaOperacional(id);
    alertas.value = alertas.value.filter((a) => a.id !== id);
  } finally {
    resolvendoId.value = null;
  }
}

// Jornada e Produtividade: período próprio, independente do filtro da aba
// Dashboard, pra trocar de aba não resetar o filtro um do outro.
const periodJornada      = ref<Period>('this_month');
const customMonthJornada = ref(new Date().getMonth());
const customYearJornada  = ref(new Date().getFullYear());
const indicadoresJornada = ref<IndicadorJornadaOperador[]>([]);
const loadingJornada     = ref(false);
let jornadaJaCarregada   = false;

async function carregarIndicadoresJornada() {
  loadingJornada.value = true;
  try {
    const d = getPeriodRange(periodJornada.value, customYearJornada.value, customMonthJornada.value);
    const r = await atendimentoApiClient.getIndicadoresJornada({ dateFrom: d.dateFrom, dateTo: d.dateTo, setores: props.setores });
    indicadoresJornada.value = r.indicadores;
  } finally {
    loadingJornada.value = false;
  }
}

// Lazy: só busca (pode levar alguns segundos) na primeira vez que a aba é aberta.
function abrirJornada() {
  aba.value = 'jornada';
  if (!jornadaJaCarregada) {
    jornadaJaCarregada = true;
    carregarIndicadoresJornada();
  }
}

function carregarTudo() {
  carregarKpis();
  carregarAlertas();
}

let pollingId: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  carregarTudo();
  // Alertas operacionais são "tempo real" — atualiza sozinho sem precisar
  // clicar em Atualizar. Não usa WebSocket (sem essa infra no projeto ainda),
  // polling é suficiente pro cron de 2 em 2 min que gera os alertas.
  pollingId = setInterval(carregarAlertas, 30000);
});
onUnmounted(() => { if (pollingId) clearInterval(pollingId); });
</script>

<style scoped>
.view-atendimento { width: 100%; }

.atendimento-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
.atendimento-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.atendimento-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; }
.header-actions { display: flex; align-items: flex-end; gap: .75rem; flex-wrap: wrap; }
.header-actions .btn-refresh { height: 38px; }

.atd-tabs { display: flex; gap: .3rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; }
.atd-tab {
  background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-2);
  padding: .6rem .9rem; font-size: .82rem; font-weight: 600; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition); display: flex; align-items: center; gap: .4rem;
}
.atd-tab:hover { color: var(--text); }
.atd-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.atd-tab-badge { background: var(--error-bg); color: var(--error); font-size: .68rem; font-weight: 700; padding: .1rem .4rem; border-radius: 10px; }

.atd-aviso { font-size: .8rem; color: var(--text-2); margin-bottom: 1rem; max-width: 720px; line-height: 1.5; }

.alertas-lista { display: flex; flex-direction: column; gap: .7rem; }

.setor-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: .8rem; margin-bottom: 1.25rem; }
@media (max-width: 1100px) { .setor-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px)  { .setor-cards { grid-template-columns: 1fr; } }
.setor-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: .8rem; }
.setor-card-header { display: flex; align-items: flex-start; justify-content: space-between; }
.setor-nome { font-family: var(--font-mono); font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); padding-top: .2rem; }
.setor-volume-bloco { display: flex; flex-direction: column; align-items: flex-end; gap: .1rem; }
.setor-volume { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--text); line-height: 1; }
.setor-volume-label { font-size: .64rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.setor-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: .9rem .7rem; }
.setor-stat { display: flex; flex-direction: column; gap: .1rem; }
.setor-stat-label { font-size: .68rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.setor-stat-valor { font-family: var(--font-mono); font-size: 1rem; font-weight: 700; color: var(--text); }
.setor-stat-detalhe { font-size: .7rem; color: var(--text-2); }

.charts-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .8rem; margin-bottom: 1.5rem; }
@media (max-width: 1400px) { .charts-4 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 700px)  { .charts-4 { grid-template-columns: 1fr; } }

.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

.jornada-header-row { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
.jornada-desc { font-size: .85rem; color: var(--text-2); max-width: 700px; line-height: 1.5; }
</style>
