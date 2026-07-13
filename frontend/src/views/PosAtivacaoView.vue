<template>
  <div class="view-posativacao">
    <div class="pa-topbar">
      <div class="pa-topbar-left">
        <h1 class="pa-title">Pós-Ativação</h1>
        <div class="pa-tabs">
          <button :class="['pa-tab', { active: aba === 'clientes' }]" @click="aba = 'clientes'">Clientes</button>
          <button :class="['pa-tab', { active: aba === 'governanca' }]" @click="aba = 'governanca'">Governança</button>
        </div>
      </div>
      <div class="pa-topbar-right">
        <div class="janela-toggle">
          <button v-for="j in [30, 60, 90] as const" :key="j" :class="['janela-btn', { active: janela === j }]" @click="mudarJanela(j)">{{ j }} dias</button>
        </div>
        <button class="btn-refresh" @click="carregarTudo" :disabled="loading">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>

    <!-- KPI strip — 1 linha só, denso, mesmo espírito do sistema original -->
    <div class="kpi-strip">
      <div class="kpi-cell kpi-accent-blue">
        <span class="kpi-l">Ativações</span>
        <div class="kpi-main">
          <span class="kpi-v">{{ kpis?.total ?? '—' }}</span>
          <span v-if="kpis && kpis.deltaTotal !== null" class="kpi-delta delta-neutral">{{ fmtDelta(kpis.deltaTotal) }}</span>
        </div>
        <span class="kpi-s">{{ kpis?.instalacoes ?? 0 }} instalação(ões) · {{ kpis?.mudancas ?? 0 }} mudança(s)</span>
      </div>
      <div class="kpi-cell kpi-accent-red">
        <span class="kpi-l">Contataram a Central</span>
        <div class="kpi-main">
          <span class="kpi-v kpi-v-red">{{ kpis?.comContato ?? '—' }}</span>
          <span class="kpi-chip kpi-chip-red">{{ kpis?.pct ?? 0 }}%</span>
          <span v-if="kpis && kpis.deltaPct !== null" :class="['kpi-delta', kpis.deltaPct > 0 ? 'delta-bad' : 'delta-good']">{{ fmtDelta(kpis.deltaPct, 'p.p.') }}</span>
        </div>
        <span class="kpi-s">em até {{ janela }} dias após ativação</span>
      </div>
      <div class="kpi-cell kpi-accent-green">
        <span class="kpi-l">Sem Contato</span>
        <div class="kpi-main"><span class="kpi-v kpi-v-green">{{ kpis?.semContato ?? '—' }}</span></div>
        <span class="kpi-s">clientes sem chamado</span>
      </div>
      <div class="kpi-cell kpi-accent-amber">
        <span class="kpi-l">Total de Tickets</span>
        <div class="kpi-main">
          <span class="kpi-v">{{ kpis?.totalContatos ?? '—' }}</span>
          <span v-if="kpis && kpis.deltaTickets !== null" :class="['kpi-delta', kpis.deltaTickets > 0 ? 'delta-bad' : 'delta-good']">{{ fmtDelta(kpis.deltaTickets, '%') }}</span>
        </div>
        <span class="kpi-s">contatos registrados</span>
      </div>
      <div class="kpi-cell kpi-accent-violet">
        <span class="kpi-l">Média 1º Contato</span>
        <div class="kpi-main"><span class="kpi-v">{{ kpis?.mediaDias ?? '—' }}</span><span class="kpi-s-inline">dias</span></div>
        <span class="kpi-s">após ativação</span>
      </div>
    </div>

    <!-- ═══ Aba Clientes: sidebar (motivos + distribuição) + tabela ═══ -->
    <div v-if="aba === 'clientes'" class="pa-body">
      <aside class="pa-sidebar">
        <ChartRanking title="Top Motivos de Contato" :items="motivosChartData" :max-items="10" monochrome />
        <ChartBars title="Dia do Primeiro Contato" :bars="distribuicaoChartData" />
      </aside>

      <main class="pa-main">
        <div class="pa-filter-bar">
          <input v-model="busca" class="pa-input pa-input-grow" placeholder="Buscar cliente…" @keyup.enter="recarregarClientes" />
          <select v-model="assuntoFiltro" class="pa-input" @change="recarregarClientes">
            <option value="">Todos os motivos</option>
            <option v-for="m in motivos" :key="m.assunto" :value="m.assunto">{{ m.assunto }}</option>
          </select>
          <label class="pa-checkbox"><input type="checkbox" v-model="soContato" @change="recarregarClientes" /> Só com contato</label>
          <span class="pa-contador">{{ clientesPagina?.total ?? 0 }} registros</span>
          <button class="btn-refresh" @click="exportarCsv" :disabled="exportando">{{ exportando ? '…' : '↓ CSV' }}</button>
        </div>

        <div v-if="loadingClientes" class="state-msg">
          <span class="loading-dots"><span/><span/><span/></span> Carregando…
        </div>
        <div v-else class="pa-table-wrap">
          <table class="pa-table">
            <thead>
              <tr>
                <th class="th-chv"></th>
                <th>Contrato</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Ativação</th>
                <th>Tipo</th>
                <th class="th-num">Tickets</th>
                <th>1º Contato</th>
                <th class="th-num">+Dias</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!clientesPagina?.linhas.length"><td colspan="10" class="state-msg">Nenhum cliente encontrado nesse filtro.</td></tr>
              <template v-for="c in clientesPagina?.linhas ?? []" :key="c.contratoId">
                <tr :class="['pa-row', { 'row-clicavel': c.totalContatos > 0 }]" @click="c.totalContatos > 0 && toggleExpandir(c.idCliente)">
                  <td class="th-chv">
                    <svg v-if="c.totalContatos > 0" :class="['chevron', { open: expandido === c.idCliente }]" width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </td>
                  <td class="td-mono td-muted">{{ c.contratoId }}</td>
                  <td class="td-nome">{{ c.nome }}</td>
                  <td class="td-mono">{{ c.telefone ?? '—' }}</td>
                  <td class="td-mono">{{ fmtData(c.dataAtivacao) }}</td>
                  <td><span :class="['pa-tag', c.motivoInclusao === 'I' ? 'tag-instal' : 'tag-mud']">{{ c.motivoInclusao === 'I' ? 'Instal.' : 'Mud. End.' }}</span></td>
                  <td :class="['th-num td-mono', c.totalContatos > 0 ? 'td-contato-sim' : 'td-contato-nao']">{{ c.totalContatos }}</td>
                  <td class="td-mono">{{ c.primeiroContato ? fmtData(c.primeiroContato) : '—' }}</td>
                  <td :class="['th-num td-mono', diasClasse(c.diasPrimeiro)]">{{ c.diasPrimeiro !== null ? `+${c.diasPrimeiro}` : '—' }}</td>
                  <td><span :class="['pa-tag', statusCliente(c).classe]">{{ statusCliente(c).label }}</span></td>
                </tr>
                <tr v-if="expandido === c.idCliente" class="row-expandida">
                  <td colspan="10">
                    <div class="expandido-conteudo">
                      <div v-if="loadingContatos" class="state-msg">Carregando contatos…</div>
                      <div v-else-if="!contatosCliente.length" class="state-msg">Sem contato registrado.</div>
                      <div v-else class="contatos-lista">
                        <div v-for="ct in contatosCliente" :key="ct.ticketId" class="contato-item">
                          <div class="contato-cabecalho">
                            <span class="td-mono">Ticket #{{ ct.ticketId }}</span>
                            <span>{{ fmtData(ct.dataCriacao) }} ({{ ct.diasApos }}d após ativação)</span>
                            <span class="pa-tag tag-neutro">{{ ct.statusLabel }}</span>
                          </div>
                          <p class="contato-assunto"><strong>{{ ct.assunto }}</strong></p>
                          <p v-if="ct.ticketMsg" class="contato-msg">{{ ct.ticketMsg }}</p>
                          <p v-if="ct.osId" class="contato-os">O.S. #{{ ct.osId }} ({{ ct.osAssunto }}) — status {{ ct.osStatus }}</p>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-if="clientesPagina && clientesPagina.pages > 1" class="pagination">
          <button class="btn-refresh" :disabled="page <= 1" @click="mudarPagina(page - 1)">Anterior</button>
          <span>Página {{ clientesPagina.page }} de {{ clientesPagina.pages }}</span>
          <button class="btn-refresh" :disabled="page >= clientesPagina.pages" @click="mudarPagina(page + 1)">Próxima</button>
        </div>
      </main>
    </div>

    <!-- ═══ Aba Governança: churn + tendência + técnicos ═══ -->
    <div v-else class="pa-governanca">
      <div class="gov-kpi-row">
        <div class="gov-kpi-card">
          <span class="kpi-l">Churn — contatou suporte</span>
          <span class="kpi-v kpi-v-red">{{ churn?.taxaChurnCom ?? '—' }}%</span>
          <span class="kpi-s" v-if="churn">{{ churn.comContatoCancelou }} de {{ churn.comContatoTotal }} · últimos 12 meses</span>
        </div>
        <div class="gov-kpi-card">
          <span class="kpi-l">Churn — não contatou</span>
          <span class="kpi-v kpi-v-green">{{ churn?.taxaChurnSem ?? '—' }}%</span>
          <span class="kpi-s" v-if="churn">{{ churn.semContatoCancelou }} de {{ churn.semContatoTotal }} · últimos 12 meses</span>
        </div>
        <div class="gov-kpi-card">
          <span class="kpi-l">Tempo médio resolução</span>
          <span class="kpi-v kpi-v-violet">{{ tempoMedioResolucao ?? '—' }}</span>
          <span class="kpi-s">tickets finalizados (aproximado)</span>
        </div>
        <div class="gov-kpi-card">
          <span class="kpi-l">Canal principal</span>
          <span class="kpi-v kpi-v-canal">{{ canalPrincipal?.canal ?? '—' }}</span>
          <span class="kpi-s" v-if="canalPrincipal">{{ canalPrincipal.pct }}% dos tickets</span>
        </div>
      </div>

      <div class="charts-row charts-2">
        <ChartBars
          title="Tendência Semanal"
          :bars="tendenciaChartData"
          bar-label="Ativações"
          :linha="tendenciaTaxaData"
          linha-label="Taxa de contato"
          linha-cor="var(--error)"
          linha-sufixo="%"
          wide
        />
        <ChartRanking title="Canais de Atendimento" :items="canaisChartData" :max-items="6" monochrome />
      </div>

      <div class="charts-row charts-3">
        <ChartBars title="SLA de Resolução" :bars="slaChartData" />
        <ChartRanking title="Top Bairros por Chamados" :items="bairrosChartData" :max-items="8" monochrome />
        <div class="chart-ranking-wrap">
          <div class="ranking-header"><span class="chart-title">Técnicos com Mais Retorno</span></div>
          <div class="ranking-list">
            <div v-for="(t, i) in tecnicos.slice(0, 8)" :key="t.tecnico" class="rank-row" :style="{ animationDelay: `${i * 0.07}s` }">
              <span class="rank-pos">{{ i + 1 }}</span>
              <div class="rank-info">
                <div class="rank-name-row">
                  <span class="rank-name">{{ t.tecnico }}</span>
                  <span class="rank-val">{{ t.qtd }} contato(s)</span>
                </div>
                <div class="rank-bar-bg">
                  <div class="rank-bar-fill" :style="{ width: `${maiorTecnico ? (t.qtd / maiorTecnico) * 100 : 0}%`, background: 'var(--error)' }" />
                </div>
              </div>
            </div>
            <div v-if="!tecnicos.length" class="rank-empty">Sem dado de técnico no período.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ChartRanking from '../components/ChartRanking.vue';
import ChartBars from '../components/ChartBars.vue';
import {
  posativacaoApiClient,
  type Janela, type PosAtivacaoKpis, type PosAtivacaoMotivo, type PosAtivacaoDistribuicaoFaixa,
  type PosAtivacaoTendenciaSemana, type PosAtivacaoChurn, type PosAtivacaoTecnico,
  type PosAtivacaoClienteResumo, type PosAtivacaoClientesPagina, type PosAtivacaoContato,
  type PosAtivacaoBairro, type PosAtivacaoCanal, type PosAtivacaoSlaFaixa,
} from '../services/posativacaoApi';

type Aba = 'clientes' | 'governanca';

function fmtData(s: string | null): string { return s ? new Date(s).toLocaleDateString('pt-BR') : '—'; }
function fmtDelta(v: number, sufixo = '%'): string { return `${v > 0 ? '▲' : v < 0 ? '▼' : '–'} ${Math.abs(v)}${sufixo}`; }

/// Mesma classificação do sistema original (index.html): nc=0 é bom (sem
/// contato), quanto mais cedo o 1º contato depois de ativar, pior o sinal
/// (contato no mesmo dia ou em até 3 dias é o pior caso).
function statusCliente(c: PosAtivacaoClienteResumo): { label: string; classe: string } {
  const nc = c.totalContatos;
  const dp = c.diasPrimeiro;
  if (nc === 0) return { label: 'sem contato', classe: 'tag-ok' };
  if (dp !== null && dp <= 3) return { label: 'crítico', classe: 'tag-critico' };
  if (dp !== null && dp <= 7) return { label: 'atenção', classe: 'tag-atencao' };
  return { label: 'monitorar', classe: 'tag-monitorar' };
}
function diasClasse(dp: number | null): string {
  if (dp === null) return 'td-muted';
  if (dp <= 3) return 'td-dias-critico';
  if (dp <= 7) return 'td-dias-atencao';
  return '';
}

const aba = ref<Aba>('clientes');
const janela = ref<Janela>(30);
const loading = ref(false);
const kpis = ref<PosAtivacaoKpis | null>(null);
const motivos = ref<PosAtivacaoMotivo[]>([]);
const distribuicao = ref<PosAtivacaoDistribuicaoFaixa[]>([]);
const tendencia = ref<PosAtivacaoTendenciaSemana[]>([]);
const churn = ref<PosAtivacaoChurn | null>(null);
const tecnicos = ref<PosAtivacaoTecnico[]>([]);
const bairros = ref<PosAtivacaoBairro[]>([]);
const canais = ref<PosAtivacaoCanal[]>([]);
const sla = ref<PosAtivacaoSlaFaixa[]>([]);

const motivosChartData = computed(() => motivos.value.map((m) => ({ name: m.assunto, count: m.qtd, value: m.qtd })));
const distribuicaoChartData = computed(() => distribuicao.value.map((d) => ({ label: d.faixa, value: d.qtd, color: 'var(--accent)' })));
const tendenciaChartData = computed(() => tendencia.value.map((t) => ({ label: t.inicio.slice(5), value: t.ativacoes, color: 'var(--accent)' })));
const tendenciaTaxaData = computed(() => tendencia.value.map((t) => t.taxa));
const maiorTecnico = computed(() => Math.max(0, ...tecnicos.value.map((t) => t.qtd)));
const bairrosChartData = computed(() => bairros.value.map((b) => ({ name: b.bairro, count: b.qtd, value: b.qtd })));
const canaisChartData = computed(() => canais.value.map((c) => ({ name: c.canal, count: c.qtd, value: c.qtd })));

const CORES_SLA: Record<string, string> = {
  '≤ 4h': 'var(--success)', '4–24h': 'var(--success)',
  '1–3 dias': '#f59e0b', '3–7 dias': 'var(--error)', '> 7 dias': 'var(--error)',
};
const slaChartData = computed(() => sla.value.map((s) => ({ label: s.faixa, value: s.qtd, color: CORES_SLA[s.faixa] ?? 'var(--accent)' })));

/// Aproximação por ponto médio de cada faixa do histograma de SLA — mesma
/// metodologia (e mesma imprecisão assumida) do dashboard original, que
/// nunca calculou uma média exata em segundos, só estimou a partir das
/// faixas já agregadas.
const MEDIA_FAIXA_SLA: Record<string, number> = { '≤ 4h': 2, '4–24h': 14, '1–3 dias': 48, '3–7 dias': 120, '> 7 dias': 200 };
const tempoMedioResolucao = computed(() => {
  let soma = 0, qtd = 0;
  for (const s of sla.value) { soma += (MEDIA_FAIXA_SLA[s.faixa] ?? 0) * s.qtd; qtd += s.qtd; }
  return qtd ? `${Math.round(soma / qtd)}h` : null;
});

const canalPrincipal = computed(() => {
  if (!canais.value.length) return null;
  const total = canais.value.reduce((acc, c) => acc + c.qtd, 0);
  const top = canais.value[0];
  return { canal: top.canal, pct: total ? Math.round((top.qtd / total) * 100) : 0 };
});

function mudarJanela(j: Janela) {
  janela.value = j;
  carregarTudo();
}

async function carregarTudo() {
  loading.value = true;
  try {
    const [k, m, d, t, c, tec, b, cn, s] = await Promise.all([
      posativacaoApiClient.getKpis({ janela: janela.value }),
      posativacaoApiClient.getMotivos({ janela: janela.value }),
      posativacaoApiClient.getDistribuicao({ janela: janela.value }),
      posativacaoApiClient.getTendencia({ janela: janela.value }),
      posativacaoApiClient.getChurn(),
      posativacaoApiClient.getTecnicos({ janela: janela.value }),
      posativacaoApiClient.getBairros({ janela: janela.value }),
      posativacaoApiClient.getCanais({ janela: janela.value }),
      posativacaoApiClient.getResolucaoSla({ janela: janela.value }),
    ]);
    kpis.value = k; motivos.value = m; distribuicao.value = d; tendencia.value = t; churn.value = c; tecnicos.value = tec;
    bairros.value = b; canais.value = cn; sla.value = s;
  } finally {
    loading.value = false;
  }
  await recarregarClientes();
}

// ── Clientes ────────────────────────────────────────────────────
const clientesPagina = ref<PosAtivacaoClientesPagina | null>(null);
const loadingClientes = ref(false);
const busca = ref('');
const assuntoFiltro = ref('');
const soContato = ref(false);
const page = ref(1);
const expandido = ref<number | null>(null);
const contatosCliente = ref<PosAtivacaoContato[]>([]);
const loadingContatos = ref(false);
const exportando = ref(false);

async function recarregarClientes() {
  loadingClientes.value = true;
  expandido.value = null;
  page.value = 1;
  try {
    clientesPagina.value = await posativacaoApiClient.getClientes({
      janela: janela.value, page: page.value, busca: busca.value || undefined,
      assunto: assuntoFiltro.value || undefined, soContato: soContato.value,
    });
  } finally {
    loadingClientes.value = false;
  }
}

async function mudarPagina(p: number) {
  page.value = p;
  loadingClientes.value = true;
  expandido.value = null;
  try {
    clientesPagina.value = await posativacaoApiClient.getClientes({
      janela: janela.value, page: page.value, busca: busca.value || undefined,
      assunto: assuntoFiltro.value || undefined, soContato: soContato.value,
    });
  } finally {
    loadingClientes.value = false;
  }
}

async function toggleExpandir(idCliente: number) {
  if (expandido.value === idCliente) { expandido.value = null; return; }
  expandido.value = idCliente;
  loadingContatos.value = true;
  try {
    contatosCliente.value = await posativacaoApiClient.getContatosCliente(idCliente, { janela: janela.value });
  } finally {
    loadingContatos.value = false;
  }
}

async function exportarCsv() {
  exportando.value = true;
  try {
    const blob = await posativacaoApiClient.exportarClientesCsv({
      janela: janela.value, busca: busca.value || undefined, soContato: soContato.value,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos_ativacao_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exportando.value = false;
  }
}

onMounted(carregarTudo);
</script>

<style scoped>
.view-posativacao { width: 100%; display: flex; flex-direction: column; gap: .8rem; }

.pa-topbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
.pa-topbar-left { display: flex; align-items: center; gap: 1.2rem; }
.pa-title { font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; letter-spacing: -.01em; }
.pa-topbar-right { display: flex; align-items: center; gap: .6rem; }

.pa-tabs { display: flex; gap: .2rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px; }
.pa-tab { background: none; border: none; color: var(--text-2); padding: .4rem .8rem; font-size: .78rem; font-weight: 600; border-radius: calc(var(--radius-sm) - 2px); cursor: pointer; transition: all var(--transition); }
.pa-tab:hover { color: var(--text); }
.pa-tab.active { background: var(--accent); color: var(--surface); }

.janela-toggle { display: flex; gap: .2rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px; }
.janela-btn { background: none; border: none; color: var(--text-2); padding: .35rem .65rem; font-size: .72rem; font-weight: 600; border-radius: calc(var(--radius-sm) - 2px); cursor: pointer; }
.janela-btn.active { background: var(--accent-dim); color: var(--accent); }
.janela-btn:hover { color: var(--text); }

.btn-refresh {
  display: inline-flex; align-items: center; gap: .4rem; height: 32px; padding: 0 .7rem;
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  border-radius: var(--radius-sm); font-size: .76rem; font-weight: 600; cursor: pointer; transition: all var(--transition);
}
.btn-refresh:hover:not(:disabled) { color: var(--text); border-color: var(--border-2); }
.btn-refresh:disabled { opacity: .5; cursor: not-allowed; }

/* ── KPI strip: 1 linha densa, mesmo espírito do sistema original ── */
.kpi-strip { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.kpi-cell { flex: 1; padding: .6rem .9rem; border-right: 1px solid var(--border); position: relative; min-width: 0; }
.kpi-cell:last-child { border-right: none; }
.kpi-cell::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px; }
.kpi-accent-blue::after { background: var(--accent); }
.kpi-accent-red::after { background: var(--error); }
.kpi-accent-green::after { background: var(--success); }
.kpi-accent-amber::after { background: #f59e0b; }
.kpi-accent-violet::after { background: #8b5cf6; }
.kpi-l { display: block; font-size: .6rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); margin-bottom: .25rem; }
.kpi-main { display: flex; align-items: baseline; gap: .4rem; flex-wrap: wrap; }
.kpi-v { font-family: var(--font-mono); font-size: 1.35rem; font-weight: 700; line-height: 1; color: var(--text); }
.kpi-v-red { color: var(--error); }
.kpi-v-green { color: var(--success); }
.kpi-v-violet { color: #8b5cf6; }
.kpi-v-canal { font-size: 1rem; color: var(--accent); }
.kpi-chip { font-family: var(--font-mono); font-size: .64rem; font-weight: 700; padding: .1rem .4rem; border-radius: 3px; }
.kpi-chip-red { background: var(--error-bg); color: var(--error); }
.kpi-s { display: block; font-size: .62rem; color: var(--text-3); margin-top: .2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-s-inline { font-size: .68rem; color: var(--text-3); }
.kpi-delta { display: inline-flex; align-items: center; font-family: var(--font-mono); font-size: .6rem; font-weight: 700; padding: .05rem .3rem; border-radius: 3px; }
.delta-bad { background: var(--error-bg); color: var(--error); }
.delta-good { background: var(--success-bg); color: var(--success); }
.delta-neutral { background: var(--surface-3); color: var(--text-3); }

/* ── Body: sidebar fixa + main flexível (2 colunas de verdade, não empilhado) ── */
.pa-body { display: flex; gap: .8rem; align-items: flex-start; min-height: 0; }
.pa-sidebar { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: .8rem; }
.sb-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .8rem .9rem; }
.sb-titulo { display: block; font-size: .68rem; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: .06em; margin-bottom: .5rem; }
.pa-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .6rem; }

.pa-filter-bar { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.pa-input { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: .45rem .6rem; border-radius: var(--radius-sm); font-size: .78rem; outline: none; height: 32px; }
.pa-input:focus { border-color: var(--accent); }
.pa-input-grow { flex: 1 1 200px; }
.pa-checkbox { display: flex; align-items: center; gap: .35rem; font-size: .76rem; color: var(--text-2); white-space: nowrap; }
.pa-contador { font-size: .72rem; color: var(--text-3); white-space: nowrap; margin-left: auto; }

.state-msg { color: var(--text-3); font-size: .82rem; text-align: center; padding: 1.5rem; }
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

/* ── Tabela densa ── */
.pa-table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; }
.pa-table { width: 100%; border-collapse: collapse; font-size: .76rem; }
.pa-table th { text-align: left; padding: .5rem .6rem; font-size: .64rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); border-bottom: 1px solid var(--border); white-space: nowrap; position: sticky; top: 0; background: var(--surface); }
.pa-table td { padding: .4rem .6rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
.th-chv { width: 20px; }
.th-num { text-align: right; }
.td-mono { font-family: var(--font-mono); font-size: .74rem; }
.td-muted { color: var(--text-3); }
.td-nome { max-width: 220px; overflow: hidden; text-overflow: ellipsis; color: var(--text); font-weight: 500; }
.td-contato-sim { color: var(--error); font-weight: 700; }
.td-contato-nao { color: var(--text-3); }
.td-dias-critico { color: var(--error); font-weight: 700; }
.td-dias-atencao { color: #f59e0b; font-weight: 700; }

.pa-row.row-clicavel { cursor: pointer; }
.pa-row.row-clicavel:hover { background: var(--surface-2); }
.chevron { color: var(--text-3); transition: transform .18s ease; }
.chevron.open { transform: rotate(180deg); color: var(--accent); }

.pa-tag { display: inline-block; padding: .12rem .45rem; border-radius: 3px; font-size: .66rem; font-weight: 700; white-space: nowrap; }
.tag-instal { background: var(--accent-dim); color: var(--accent); }
.tag-mud { background: var(--surface-3); color: var(--text-2); }
.tag-neutro { background: var(--surface-3); color: var(--text-2); }
.tag-ok { background: var(--success-bg); color: var(--success); }
.tag-critico { background: var(--error-bg); color: var(--error); }
.tag-atencao { background: rgba(245, 158, 11, .14); color: #f59e0b; }
.tag-monitorar { background: rgba(139, 92, 246, .14); color: #8b5cf6; }

.row-expandida td { padding: 0 !important; background: var(--surface); }
.expandido-conteudo { padding: .8rem 1.2rem 1rem; border-left: 2px solid var(--accent); }
.contatos-lista { display: flex; flex-direction: column; gap: .7rem; }
.contato-item { border-bottom: 1px dashed var(--border); padding-bottom: .5rem; }
.contato-item:last-child { border-bottom: none; }
.contato-cabecalho { display: flex; gap: .7rem; align-items: center; font-size: .74rem; color: var(--text-3); margin-bottom: .25rem; }
.contato-assunto { font-size: .8rem; color: var(--text); margin-bottom: .15rem; }
.contato-msg, .contato-os { font-size: .76rem; color: var(--text-2); margin-top: .15rem; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; font-size: .8rem; color: var(--text-2); padding: .3rem 0; }

/* ── Governança ── */
.pa-governanca { display: flex; flex-direction: column; gap: .8rem; }
.gov-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: .8rem; }
.gov-kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .7rem .9rem; display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
.gov-kpi-card .kpi-v { font-family: var(--font-mono); font-weight: 700; }
.gov-kpi-card .kpi-v-canal { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.charts-2 { display: grid; grid-template-columns: 2fr 1fr; gap: .8rem; }
.charts-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: .8rem; }
@media (max-width: 1100px) { .charts-3 { grid-template-columns: 1fr; } }
@media (max-width: 900px) {
  .charts-2, .gov-kpi-row { grid-template-columns: 1fr; }
  .pa-body { flex-direction: column; }
  .pa-sidebar { width: 100%; }
}

.chart-ranking-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: .7rem; }
.ranking-header { display: flex; align-items: center; justify-content: space-between; }
.chart-title { font-size: .7rem; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: .08em; }
.ranking-list { display: flex; flex-direction: column; gap: .45rem; }
.rank-row { display: flex; align-items: center; gap: .6rem; animation: rankSlide .35s cubic-bezier(.4,0,.2,1) both; }
@keyframes rankSlide { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }
.rank-pos { font-family: var(--font-mono); font-size: .7rem; color: var(--text-3); width: 14px; text-align: right; flex-shrink: 0; }
.rank-info { flex: 1; min-width: 0; }
.rank-name-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: .2rem; }
.rank-name { font-size: .78rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
.rank-val { font-family: var(--font-mono); font-size: .75rem; font-weight: 700; color: var(--text); flex-shrink: 0; }
.rank-bar-bg { height: 8px; background: var(--surface-3); border-radius: 4px; overflow: hidden; }
.rank-bar-fill { height: 100%; border-radius: 4px; animation: barGrow .6s cubic-bezier(.4,0,.2,1) both; }
@keyframes barGrow { from { width: 0 !important; } }
.rank-empty { color: var(--text-3); font-size: .8rem; text-align: center; padding: 1rem; }
</style>
