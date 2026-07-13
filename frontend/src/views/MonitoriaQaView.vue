<template>
  <div class="view-monitoria-qa">
    <div class="mqa-header">
      <div>
        <h1 class="mqa-title">Monitoria de Qualidade (QA)</h1>
        <p class="mqa-sub">
          Avaliação humana de 22 critérios, migrada do sistema legado — cobre hoje SAC, Suporte N2 e Retenção.
          O C.A.I.O. sinaliza na aba Triagem IA quais atendimentos merecem olhar e por quê, mas o preenchimento
          dos 22 critérios é sempre feito manualmente pelo QA humano.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" @click="carregarTudo" :disabled="loadingDashboard || loadingLista">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Atualizar
        </button>
        <button class="btn-primary" @click="abrirNovaMonitoria">+ Nova Monitoria</button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <label class="filter-label">Agente</label>
        <select v-model="filtroAgente" @change="carregarTudo">
          <option value="">Todos</option>
          <option v-for="a in agentesAtivos" :key="a.id" :value="a.nome">{{ a.nome }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Equipe</label>
        <select v-model="filtroEquipe" @change="carregarTudo">
          <option value="">Todas</option>
          <option v-for="e in equipes" :key="e" :value="e">{{ e }}</option>
        </select>
      </div>
      <PeriodFilter
        v-model:model-period="period"
        v-model:model-month="customMonth"
        v-model:model-year="customYear"
        @change="carregarTudo"
      />
    </div>

    <div class="mqa-tabs">
      <button :class="['mqa-tab', { active: aba === 'dashboard' }]" @click="aba = 'dashboard'">Dashboard</button>
      <button :class="['mqa-tab', { active: aba === 'lancamentos' }]" @click="aba = 'lancamentos'">Lançamentos</button>
      <button :class="['mqa-tab', { active: aba === 'triagem' }]" @click="aba = 'triagem'">
        Triagem IA
        <span v-if="triagem.length" class="mqa-tab-badge">{{ triagem.length }}</span>
      </button>
    </div>

    <template v-if="aba === 'dashboard'">
    <!-- KPIs -->
    <div v-if="loadingLista" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando avaliações…
    </div>
    <div v-else class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">Avaliações no período</span>
        <span class="kpi-value">{{ monitorias.length }}{{ monitorias.length === 300 ? '+' : '' }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Pontuação média</span>
        <span class="kpi-value">{{ pontuacaoMediaPeriodo !== null ? `${pontuacaoMediaPeriodo}/10` : '—' }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Erro crítico</span>
        <span class="kpi-value kpi-danger">{{ pctErroCritico }}%</span>
      </div>
      <div class="kpi-card kpi-distribuicao">
        <span class="kpi-label">Distribuição</span>
        <div class="kpi-dist-row">
          <span class="dist-badge dist-otimo">Ótimo {{ distribuicao.otimo }}</span>
          <span class="dist-badge dist-bom">Bom {{ distribuicao.bom }}</span>
          <span class="dist-badge dist-naoconforme">Não Conforme {{ distribuicao.naoConforme }}</span>
        </div>
      </div>
    </div>

    <!-- Gráficos -->
    <div v-if="!loadingDashboard" class="charts-row charts-3">
      <ChartRanking title="Critérios Mais Reprovados" :items="criteriosChartData" :max-items="8" monochrome />
      <ChartRanking title="Motivos de Atendimento" :items="motivosChartData" :max-items="8" monochrome />
      <div class="chart-ranking-wrap">
        <div class="ranking-header">
          <span class="chart-title">Ranking de Qualidade por Agente</span>
        </div>
        <div class="ranking-list">
          <div v-for="(r, i) in ranking.slice(0, 8)" :key="r.nomeAgente" class="rank-row" :style="{ animationDelay: `${i * 0.07}s` }">
            <span class="rank-pos">{{ i + 1 }}</span>
            <div class="rank-info">
              <div class="rank-name-row">
                <span class="rank-name">{{ r.nomeAgente }}</span>
                <span class="rank-val">{{ r.pontuacaoMedia }}/10</span>
              </div>
              <div class="rank-bar-bg">
                <div class="rank-bar-fill" :style="{ width: `${(r.pontuacaoMedia / 10) * 100}%`, background: corClassificacao(r.classificacao) }" />
              </div>
            </div>
          </div>
          <div v-if="!ranking.length" class="rank-empty">Sem agentes com avaliações suficientes (mínimo 15) no período.</div>
        </div>
      </div>
    </div>

    <!-- Camada analítica de IA em massa — sinal de triagem, não QA humano confirmado -->
    <h2 class="mqa-secao-titulo">Camada Analítica de IA (sinal de triagem, não é QA confirmado)</h2>
    <div v-if="!loadingAnaliseIa" class="charts-row charts-2">
      <div class="chart-ranking-wrap">
        <div class="ranking-header">
          <span class="chart-title">TMA x Sentimento por Setor</span>
        </div>
        <div class="table-wrapper tma-sentimento-wrapper">
          <table>
            <thead>
              <tr>
                <th class="th-ordenavel" @click="ordenarTmaSentimentoPor('setor')">Setor<span class="sort-icon">{{ iconeOrdenacao('setor') }}</span></th>
                <th class="th-ordenavel" @click="ordenarTmaSentimentoPor('tmaMs')">TMA médio<span class="sort-icon">{{ iconeOrdenacao('tmaMs') }}</span></th>
                <th class="th-ordenavel" @click="ordenarTmaSentimentoPor('sentimentoMedio')">Sentimento médio<span class="sort-icon">{{ iconeOrdenacao('sentimentoMedio') }}</span></th>
                <th class="th-ordenavel" @click="ordenarTmaSentimentoPor('adesaoMedia')">Adesão média<span class="sort-icon">{{ iconeOrdenacao('adesaoMedia') }}</span></th>
                <th class="th-ordenavel" @click="ordenarTmaSentimentoPor('qtd')">Qtd<span class="sort-icon">{{ iconeOrdenacao('qtd') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!tmaXSentimento.length"><td colspan="5" class="state-msg">Sem dado de análise de IA no período.</td></tr>
              <tr v-for="r in tmaXSentimento" :key="r.setor">
                <td>{{ nomeSetorLocal(r.setor) }}</td>
                <td class="td-mono">{{ r.tmaMs !== null ? fmtDuracao(r.tmaMs) : '—' }}</td>
                <td class="td-mono" :style="{ color: r.sentimentoMedio !== null ? corSentimentoIndice(r.sentimentoMedio) : undefined }">
                  {{ r.sentimentoMedio !== null ? r.sentimentoMedio.toFixed(2) : '—' }}
                </td>
                <td class="td-mono">{{ r.adesaoMedia !== null ? `${r.adesaoMedia}/10` : '—' }}</td>
                <td class="td-mono">{{ r.qtd }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <ChartRanking title="Motivos (classificados por IA)" :items="motivosIaChartData" :max-items="8" monochrome />
    </div>
    </template>

    <!-- Lançamentos -->
    <template v-if="aba === 'lancamentos'">
    <h2 class="mqa-secao-titulo">Lançamentos</h2>
    <div v-if="loadingLista" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando…
    </div>
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Protocolo</th>
            <th>Agente</th>
            <th>Equipe</th>
            <th>Data</th>
            <th>Motivo</th>
            <th>Pontuação</th>
            <th>Origem</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="monitorias.length === 0">
            <td colspan="9" class="state-msg">Nenhuma avaliação de QA encontrada nesse filtro.</td>
          </tr>
          <template v-for="m in monitorias" :key="m.id">
            <tr class="row-clicavel" @click="toggleExpandir(m.id)">
              <td class="td-expandir">
                <svg :class="['chevron', { open: expandido === m.id }]" width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </td>
              <td class="td-mono">{{ m.protocolo }}</td>
              <td>{{ m.nome_agente }}</td>
              <td>{{ m.equipe }}</td>
              <td class="td-date">{{ m.data_atendimento ? fmtDate(m.data_atendimento) : '—' }}</td>
              <td>{{ m.motivo_atendimento || '—' }}</td>
              <td>
                <span v-if="m.erro_critico" class="mqa-badge mqa-badge-naoconforme">Erro crítico (0/10)</span>
                <span v-else-if="m.pontuacao !== null" :class="['mqa-badge', badgeClasse(m.pontuacao)]">{{ m.pontuacao }}/10</span>
                <span v-else class="mqa-badge mqa-badge-neutro">—</span>
              </td>
              <td>{{ m.origem === 'legado' ? 'Legado' : 'Canaã Performance' }}</td>
              <td class="td-acoes"><button class="btn-editar" @click.stop="abrirEdicao(m)">Editar</button></td>
            </tr>
            <tr v-if="expandido === m.id" class="row-expandida">
              <td colspan="9">
                <div class="expandido-conteudo">
                  <div class="criterios-grid-view">
                    <div v-for="c in CRITERIOS_QA" :key="c" class="criterio-view-item">
                      <span class="criterio-view-label">{{ c }}</span>
                      <span :class="['criterio-view-resposta', respostaClasse(m.criterios[c])]">{{ m.criterios[c] || 'não avaliado' }}</span>
                    </div>
                  </div>
                  <p v-if="m.observacoes" class="mqa-observacoes"><strong>Observações:</strong> {{ m.observacoes }}</p>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    </template>

    <!-- Triagem IA -->
    <template v-if="aba === 'triagem'">
    <p class="mqa-aviso mqa-aviso-triagem">
      {{ verTodosLancamentos
        ? 'Todos os atendimentos de texto já processados pela camada analítica de IA no período — não é avaliação de QA confirmada.'
        : 'Fila priorizada pela camada analítica de IA (pior sinal primeiro) — não é avaliação de QA confirmada, é só uma sugestão de onde olhar.' }}
      Clique em "Avaliar" pra abrir a monitoria com o motivo já preenchido.
    </p>
    <div class="mqa-tabs mqa-subtoggle">
      <button :class="['mqa-tab', { active: !verTodosLancamentos }]" @click="alternarVisaoTriagem(false)">Fila de Triagem</button>
      <button :class="['mqa-tab', { active: verTodosLancamentos }]" @click="alternarVisaoTriagem(true)">Todos os Lançamentos</button>
    </div>
    <div v-if="loadingTriagem" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando…
    </div>
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Protocolo</th>
            <th>Setor</th>
            <th>Data</th>
            <th>Motivo (IA)</th>
            <th>Adesão ao Script</th>
            <th>Sentimento</th>
            <th v-if="verTodosLancamentos">Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="triagem.length === 0">
            <td :colspan="verTodosLancamentos ? 8 : 7" class="state-msg">
              {{ verTodosLancamentos ? 'Nenhum atendimento processado nesse período ainda.' : 'Nenhum caso na fila de triagem nesse período — sinal bom, ou o job noturno ainda não rodou.' }}
            </td>
          </tr>
          <tr v-for="t in triagem" :key="t.id">
            <td class="td-mono">{{ t.protocolo }}</td>
            <td>{{ nomeSetorLocal(t.setor) }}</td>
            <td class="td-date">{{ fmtDate(t.data_atendimento) }}</td>
            <td>{{ t.motivo_classificado || '—' }}</td>
            <td class="td-mono">{{ t.adesao_script !== null ? `${t.adesao_script}/10` : '—' }}</td>
            <td>
              <span v-if="t.sentimento_categoria" :class="['mqa-badge', badgeClasseSentimento(t.sentimento_categoria)]">{{ t.sentimento_categoria.replace('_', ' ') }}</span>
              <span v-else class="mqa-badge mqa-badge-neutro">—</span>
            </td>
            <td v-if="verTodosLancamentos">
              <span v-if="t.flag_triagem" class="mqa-badge mqa-badge-naoconforme">Triagem</span>
              <span v-else-if="t.confianca_insuficiente" class="mqa-badge mqa-badge-neutro">Sem confiança</span>
              <span v-else class="mqa-badge mqa-badge-otimo">OK</span>
            </td>
            <td class="td-acoes"><button class="btn-editar" @click="abrirAvaliacaoDeTriagem(t)">Avaliar</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>

    <!-- Modal Nova/Editar Monitoria -->
    <div v-if="modal.open" class="modal-overlay" @click.self="fecharModal">
      <div class="modal-content modal-monitoria">
        <h3 class="modal-title">{{ modal.isEdit ? 'Editar Monitoria' : 'Nova Monitoria' }}</h3>
        <p class="modal-sub">{{ modal.isEdit ? `Registro #${modal.id}` : 'Preenchimento manual pelo QA' }}</p>

        <p v-if="contextoTriagem" class="mqa-aviso mqa-aviso-triagem-contexto">
          <strong>Por que este atendimento está na triagem:</strong> {{ contextoTriagem }}
        </p>

        <form @submit.prevent="salvar" class="modal-form">
          <div class="form-row">
            <div class="form-group">
              <label>Protocolo</label>
              <input v-model="form.protocolo" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Data do Atendimento</label>
              <input type="date" v-model="form.dataAtendimento" required />
            </div>
            <div class="form-group">
              <label>Data da Monitoria</label>
              <input type="date" v-model="form.dataMonitoria" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Agente</label>
              <select v-model="form.nomeAgente" @change="onAgenteChange" required>
                <option value="" disabled>Selecione</option>
                <option v-for="a in agentesAtivos" :key="a.id" :value="a.nome">{{ a.nome }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Equipe</label>
              <select v-model="form.equipe" required>
                <option value="" disabled>Selecione</option>
                <option v-for="e in equipes" :key="e" :value="e">{{ e }}</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Motivo do Atendimento</label>
              <select v-model="form.motivoAtendimento">
                <option value="">Não informado</option>
                <option v-for="mo in MOTIVOS_CONHECIDOS" :key="mo" :value="mo">{{ mo }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Monitoria Zero</label>
              <select v-model="form.monitoriaZero">
                <option v-for="mz in MONITORIA_ZERO_OPCOES" :key="mz" :value="mz">{{ mz }}</option>
              </select>
            </div>
            <div class="form-group form-group-sm">
              <label>Avaliação ATD (0-5)</label>
              <input type="number" min="0" max="5" step="0.1" v-model.number="form.avaliacaoAtd" />
            </div>
          </div>

          <!-- Pontuação ao vivo -->
          <div class="pontuacao-preview" :class="{ 'pontuacao-critica': previewPontuacao.erroCritico }">
            <span class="pp-valor">{{ previewPontuacao.pontuacao }}/10</span>
            <span class="pp-detalhe">
              {{ previewPontuacao.erroCritico ? 'Erro crítico — "Omissão de atendimento" zera a nota inteira' : `${previewPontuacao.itensAplicaveis} critério(s) avaliado(s)` }}
            </span>
          </div>

          <div class="criterios-grid-form">
            <div v-for="c in CRITERIOS_QA" :key="c" class="criterio-form-item">
              <label>{{ c }}</label>
              <select v-model="form.criterios[c]">
                <option value="">—</option>
                <option value="Conforme">Conforme</option>
                <option value="Não Conforme">Não Conforme</option>
                <option value="Não se aplica">Não se aplica</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Observações</label>
            <textarea v-model="form.observacoes" rows="3"></textarea>
          </div>

          <p v-if="erroSalvar" class="form-erro">{{ erroSalvar }}</p>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="fecharModal" :disabled="salvando">Cancelar</button>
            <button type="submit" class="btn-submit" :disabled="salvando">{{ salvando ? 'Salvando…' : 'Salvar' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue';
import PeriodFilter from '../components/PeriodFilter.vue';
import ChartRanking from '../components/ChartRanking.vue';
import { type Period, getPeriodRange } from '../composables/useDateRange';
import {
  atendimentoQaApiClient,
  CRITERIOS_QA,
  calcularPontuacaoLocal,
  classificarPontuacao,
  type CriterioQa,
  type RespostaCriterio,
  type MonitoriaQa,
  type MonitoriaQaInput,
  type CriterioNaoConformeResumo,
  type MotivoQaResumo,
  type AgenteQaRanking,
  type AgenteQa,
} from '../services/atendimentoQaApi';
import {
  atendimentoAnaliseIaApiClient,
  type AtendimentoAnaliseIa,
  type SentimentoPorSetor,
  type MotivoIaResumo,
  type SentimentoCategoria,
} from '../services/atendimentoAnaliseIaApi';
import { atendimentoApiClient, NOMES_SETOR, SETORES_CENTRO_SOLUCAO, type SetorAtendimento, type KpisAtendimento } from '../services/atendimentoApi';

type Aba = 'dashboard' | 'lancamentos' | 'triagem';

// Opções conhecidas historicamente na base migrada (ver validação por SQL
// direto na base — 5 valores reais em 7.861 registros, não invenção).
const MOTIVOS_CONHECIDOS = ['Conexão', 'Outros Assuntos', 'Financeiro', 'Cancelamento', 'Reclamação'];
const MONITORIA_ZERO_OPCOES = ['Nenhum', 'Erro de Procedimento', 'Inf. Protocolo', 'Confirmação de dados', 'Omissão de Atendimento'];

function fmtDate(s: string) { return new Date(s).toLocaleDateString('pt-BR'); }
function hoje(): string { return new Date().toISOString().slice(0, 10); }

function badgeClasse(pontuacao: number): string {
  const c = classificarPontuacao(pontuacao);
  if (c === 'Ótimo') return 'mqa-badge-otimo';
  if (c === 'Bom') return 'mqa-badge-bom';
  return 'mqa-badge-naoconforme';
}
function corClassificacao(classificacao: string): string {
  if (classificacao === 'Ótimo') return 'var(--success)';
  if (classificacao === 'Bom') return 'var(--accent)';
  return 'var(--error)';
}
function respostaClasse(resposta: RespostaCriterio | undefined): string {
  if (resposta === 'Conforme') return 'resposta-conforme';
  if (resposta === 'Não Conforme') return 'resposta-naoconforme';
  if (resposta === 'Não se aplica') return 'resposta-naplica';
  return 'resposta-vazia';
}

function nomeSetorLocal(s: string): string { return NOMES_SETOR[s as SetorAtendimento] ?? s; }

function fmtDuracao(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}min` : ''}`;
}

function corSentimentoIndice(indice: number): string {
  if (indice >= 0.2) return 'var(--success)';
  if (indice <= -0.2) return 'var(--error)';
  return 'var(--text-2)';
}

function badgeClasseSentimento(categoria: SentimentoCategoria): string {
  if (categoria === 'muito_positivo' || categoria === 'positivo') return 'mqa-badge-otimo';
  if (categoria === 'muito_negativo' || categoria === 'negativo') return 'mqa-badge-naoconforme';
  return 'mqa-badge-neutro';
}

// ── Filtros e período ──────────────────────────────────────────
const aba         = ref<Aba>('dashboard');
const period      = ref<Period>('last_3months');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());
const filtroAgente = ref('');
const filtroEquipe = ref('');

// ── Dados do dashboard/lista ───────────────────────────────────
const criterios       = ref<CriterioNaoConformeResumo[]>([]);
const motivos         = ref<MotivoQaResumo[]>([]);
const ranking          = ref<AgenteQaRanking[]>([]);
const agentesAtivos    = ref<AgenteQa[]>([]);
const equipes          = ref<string[]>([]);
const monitorias       = ref<MonitoriaQa[]>([]);
const loadingDashboard = ref(false);
const loadingLista     = ref(false);
const expandido         = ref<string | null>(null);

// ── Camada analítica de IA em massa (sinal de triagem) ─────────
const sentimentoPorSetor = ref<SentimentoPorSetor[]>([]);
const motivosIa           = ref<MotivoIaResumo[]>([]);
const kpisAtendimento      = ref<KpisAtendimento[]>([]);
const triagem              = ref<AtendimentoAnaliseIa[]>([]);
const loadingAnaliseIa    = ref(false);
const loadingTriagem      = ref(false);
/// false = só a fila de triagem (flagados, pior sinal primeiro); true =
/// todos os lançamentos do período — onde gestão/QA audita o que a IA
/// processou de forma geral, não só o que foi sinalizado.
const verTodosLancamentos = ref(false);

function toggleExpandir(id: string) {
  expandido.value = expandido.value === id ? null : id;
}

function filtrosAtuais() {
  const range = getPeriodRange(period.value, customYear.value, customMonth.value);
  return { agente: filtroAgente.value || undefined, equipe: filtroEquipe.value || undefined, ...range };
}

/// AtendimentoAnaliseIa não tem agente/equipe (é por atendimento, não por
/// avaliação de QA) — filtro próprio, só período + setores. `setores` é
/// obrigatório aqui pra não misturar Comercial (VENDAS/POS_VENDAS) nesta
/// tela, que só cobre Centro de Solução (mesma mistura já corrigida no
/// resumo de KPIs de atendimento).
function filtrosAnaliseIa() {
  return { ...getPeriodRange(period.value, customYear.value, customMonth.value), setores: SETORES_CENTRO_SOLUCAO };
}

async function carregarDashboard() {
  loadingDashboard.value = true;
  try {
    const r = await atendimentoQaApiClient.getDashboard(filtrosAtuais());
    criterios.value = r.criterios;
    motivos.value = r.motivos;
    ranking.value = r.ranking;
    agentesAtivos.value = r.agentesAtivos;
    equipes.value = r.equipes;
  } finally {
    loadingDashboard.value = false;
  }
}

async function carregarLista() {
  loadingLista.value = true;
  expandido.value = null;
  try {
    const r = await atendimentoQaApiClient.listar(filtrosAtuais());
    monitorias.value = r.monitorias;
  } finally {
    loadingLista.value = false;
  }
}

async function carregarAnaliseIaDashboard() {
  loadingAnaliseIa.value = true;
  try {
    const range = filtrosAnaliseIa();
    const [analiseIa, resumo] = await Promise.all([
      atendimentoAnaliseIaApiClient.getDashboard(range),
      atendimentoApiClient.getResumo(range),
    ]);
    sentimentoPorSetor.value = analiseIa.porSetor;
    motivosIa.value = analiseIa.motivos;
    kpisAtendimento.value = resumo.kpis;
  } finally {
    loadingAnaliseIa.value = false;
  }
}

async function carregarTriagem() {
  loadingTriagem.value = true;
  try {
    const r = await atendimentoAnaliseIaApiClient.getTriagem({ ...filtrosAnaliseIa(), todos: verTodosLancamentos.value });
    triagem.value = r.itens;
  } finally {
    loadingTriagem.value = false;
  }
}

function alternarVisaoTriagem(todos: boolean) {
  verTodosLancamentos.value = todos;
  carregarTriagem();
}

function carregarTudo() {
  carregarDashboard();
  carregarLista();
  carregarAnaliseIaDashboard();
  carregarTriagem();
}

onMounted(carregarTudo);

// ── KPIs derivados da lista carregada ──────────────────────────
const pontuacaoMediaPeriodo = computed(() => {
  const comNota = monitorias.value.filter((m) => m.pontuacao !== null);
  if (!comNota.length) return null;
  const soma = comNota.reduce((acc, m) => acc + (m.pontuacao ?? 0), 0);
  return Math.round((soma / comNota.length) * 100) / 100;
});
const pctErroCritico = computed(() => {
  if (!monitorias.value.length) return 0;
  const qtd = monitorias.value.filter((m) => m.erro_critico).length;
  return Math.round((qtd / monitorias.value.length) * 1000) / 10;
});
const distribuicao = computed(() => {
  const acc = { otimo: 0, bom: 0, naoConforme: 0 };
  for (const m of monitorias.value) {
    if (m.pontuacao === null) continue;
    const c = classificarPontuacao(m.pontuacao);
    if (c === 'Ótimo') acc.otimo++;
    else if (c === 'Bom') acc.bom++;
    else acc.naoConforme++;
  }
  return acc;
});

const criteriosChartData = computed(() =>
  criterios.value.map((c) => ({ name: c.criterio, count: c.naoConforme, value: c.naoConforme })),
);
const motivosChartData = computed(() =>
  motivos.value.map((m) => ({ name: m.motivo, count: m.total, value: m.total })),
);

// ── Camada analítica de IA: cruzamento TMA x Sentimento ────────
// TMA vem de kpisAtendimento (fonte já existente, atendimentoApiClient.getResumo)
// e sentimento/adesão vem da tabela nova — cada fonte mantida separada, só
// cruzadas aqui na exibição, não misturadas no backend.
type ColunaTmaSentimento = 'setor' | 'tmaMs' | 'sentimentoMedio' | 'adesaoMedia' | 'qtd';
const ordenacaoTmaSentimento = reactive<{ coluna: ColunaTmaSentimento; direcao: 'asc' | 'desc' }>({ coluna: 'qtd', direcao: 'desc' });

function ordenarTmaSentimentoPor(coluna: ColunaTmaSentimento) {
  if (ordenacaoTmaSentimento.coluna === coluna) {
    ordenacaoTmaSentimento.direcao = ordenacaoTmaSentimento.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    ordenacaoTmaSentimento.coluna = coluna;
    ordenacaoTmaSentimento.direcao = coluna === 'setor' ? 'asc' : 'desc';
  }
}

function iconeOrdenacao(coluna: ColunaTmaSentimento): string {
  if (ordenacaoTmaSentimento.coluna !== coluna) return '';
  return ordenacaoTmaSentimento.direcao === 'asc' ? ' ▲' : ' ▼';
}

const tmaXSentimento = computed(() => {
  const { coluna, direcao } = ordenacaoTmaSentimento;
  const sinal = direcao === 'asc' ? 1 : -1;
  return sentimentoPorSetor.value
    .map((s) => ({
      setor: s.setor,
      tmaMs: kpisAtendimento.value.find((k) => k.setor === s.setor)?.tmaMs ?? null,
      sentimentoMedio: s.sentimentoMedio,
      adesaoMedia: s.adesaoMedia,
      qtd: s.qtd,
    }))
    .sort((a, b) => {
      const va = a[coluna];
      const vb = b[coluna];
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') return sinal * String(va).localeCompare(String(vb));
      return sinal * ((va as number) - (vb as number));
    });
});
const motivosIaChartData = computed(() =>
  motivosIa.value.map((m) => ({ name: m.motivo, count: m.qtd, value: m.qtd })),
);

// ── Modal Nova/Editar ───────────────────────────────────────────
// O copiloto "Sugestão do CAIO" (preenchimento automático dos 22 critérios)
// foi desabilitado por decisão do usuário (2026-07-11): a rotina agora é o
// QA humano preencher manualmente, partindo da fila de Triagem IA (que já
// diz O QUE olhar e POR QUÊ via `contextoTriagem`) em vez de pedir uma
// segunda opinião automática da IA por cima. O endpoint
// GET /atendimento/qa/sugestao/:protocolo continua existindo no backend,
// só não é mais chamado por aqui.
const modal = reactive({ open: false, isEdit: false, id: '' });
const salvando = ref(false);
const erroSalvar = ref('');
/// Justificativa vinda da Triagem IA (por que esse atendimento foi
/// flagado) — só preenchido quando o modal é aberto via "Avaliar" na aba
/// Triagem IA, null nos outros fluxos (Nova Monitoria / Editar).
const contextoTriagem = ref<string | null>(null);

function formVazio(): MonitoriaQaInput {
  return {
    protocolo: '', dataAtendimento: hoje(), dataMonitoria: hoje(),
    nomeAgente: '', equipe: '', motivoAtendimento: '', monitoriaZero: 'Nenhum',
    avaliacaoAtd: undefined, observacoes: '', criterios: {},
  };
}
const form = reactive<MonitoriaQaInput>(formVazio());

function resetModalState() {
  erroSalvar.value = '';
  contextoTriagem.value = null;
}

function abrirNovaMonitoria() {
  Object.assign(form, formVazio());
  resetModalState();
  modal.open = true;
  modal.isEdit = false;
  modal.id = '';
}

function abrirEdicao(m: MonitoriaQa) {
  Object.assign(form, {
    protocolo: m.protocolo,
    dataAtendimento: m.data_atendimento ? m.data_atendimento.slice(0, 10) : hoje(),
    dataMonitoria: m.data_monitoria ? m.data_monitoria.slice(0, 10) : hoje(),
    nomeAgente: m.nome_agente,
    equipe: m.equipe,
    motivoAtendimento: m.motivo_atendimento || '',
    monitoriaZero: m.monitoria_zero || 'Nenhum',
    avaliacaoAtd: m.avaliacao_atd ?? undefined,
    observacoes: m.observacoes || '',
    criterios: { ...m.criterios },
  });
  resetModalState();
  modal.open = true;
  modal.isEdit = true;
  modal.id = m.id;
}

/// Vindo da fila de Triagem IA: pré-preenche protocolo/data e mostra a
/// justificativa da IA (por que esse caso foi flagado) como contexto pro
/// QA, substituindo a necessidade de pedir uma sugestão separada. NÃO
/// pré-preenche motivo (a lista de motivos do OpaSuite real, que alimenta a
/// classificação da IA, não é a mesma lista fechada MOTIVOS_CONHECIDOS deste
/// formulário, herdada do sistema legado — forçar um valor que não bate com
/// as opções do select ficaria em branco silenciosamente).
function abrirAvaliacaoDeTriagem(item: AtendimentoAnaliseIa) {
  Object.assign(form, formVazio());
  form.protocolo = item.protocolo;
  form.dataAtendimento = item.data_atendimento.slice(0, 10);
  resetModalState();
  contextoTriagem.value = item.justificativa;
  modal.open = true;
  modal.isEdit = false;
  modal.id = '';
}

function fecharModal() {
  modal.open = false;
}

function onAgenteChange() {
  const agente = agentesAtivos.value.find((a) => a.nome === form.nomeAgente);
  if (agente) form.equipe = agente.equipe;
}

const previewPontuacao = computed(() => calcularPontuacaoLocal(form.criterios));

async function salvar() {
  salvando.value = true;
  erroSalvar.value = '';
  try {
    const criteriosLimpos: Partial<Record<CriterioQa, RespostaCriterio>> = {};
    for (const c of CRITERIOS_QA) {
      const v = form.criterios[c];
      if (v) criteriosLimpos[c] = v;
    }
    const input: MonitoriaQaInput = { ...form, criterios: criteriosLimpos };
    if (modal.isEdit) {
      await atendimentoQaApiClient.atualizar(modal.id, input);
    } else {
      await atendimentoQaApiClient.criar(input);
    }
    modal.open = false;
    carregarTudo();
  } catch (err: any) {
    if (err?.response?.status === 409) {
      erroSalvar.value = err.response.data?.message || 'Este protocolo já tem uma monitoria registrada.';
    } else {
      erroSalvar.value = 'Falha ao salvar a monitoria. Tente novamente.';
    }
  } finally {
    salvando.value = false;
  }
}
</script>

<style scoped>
.view-monitoria-qa { width: 100%; }

.mqa-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
.mqa-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.mqa-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; max-width: 760px; line-height: 1.5; }
.header-actions { display: flex; align-items: flex-end; gap: .75rem; flex-wrap: wrap; }
.header-actions .btn-refresh { height: 38px; }
.header-actions .btn-primary { padding: .6rem 1.2rem; font-size: .85rem; }

.mqa-tabs { display: flex; gap: .3rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; }
.mqa-tab {
  background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-2);
  padding: .6rem .9rem; font-size: .82rem; font-weight: 600; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition); display: flex; align-items: center; gap: .4rem;
}
.mqa-tab:hover { color: var(--text); }
.mqa-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.mqa-tab-badge { background: var(--error-bg); color: var(--error); font-size: .68rem; font-weight: 700; padding: .1rem .4rem; border-radius: 10px; }

.mqa-aviso-triagem { margin-bottom: 1rem; max-width: 100%; }
.mqa-subtoggle { margin-bottom: 1rem; }
.mqa-subtoggle .mqa-tab { padding: .4rem .7rem; font-size: .76rem; }

.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .8rem; margin-bottom: 1.25rem; }
.kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .85rem 1.1rem; display: flex; flex-direction: column; gap: .3rem; }
.kpi-label { font-size: .68rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.kpi-value { font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; color: var(--text); }
.kpi-danger { color: var(--error); }
.kpi-distribuicao { grid-column: span 1; }
.kpi-dist-row { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .15rem; }
.dist-badge { font-size: .68rem; font-weight: 700; padding: .18rem .5rem; border-radius: 20px; white-space: nowrap; }
.dist-otimo { background: var(--success-bg); color: var(--success); }
.dist-bom { background: var(--accent-dim); color: var(--accent); }
.dist-naoconforme { background: var(--error-bg); color: var(--error); }

/* Grid de 6 colunas compartilhado entre charts-3 (2 colunas cada) e
   charts-2 (3 colunas cada) — garante que as bordas dos contêineres da
   linha de baixo alinhem exatamente com as "calhas" da linha de cima, em
   vez de cada linha ter seu próprio grid independente com frações diferentes. */
.charts-3, .charts-2 { display: grid; grid-template-columns: repeat(6, 1fr); gap: .8rem; margin-bottom: 1.5rem; }
.charts-3 > * { grid-column: span 2; }
.charts-2 > * { grid-column: span 3; }
@media (max-width: 1100px) { .charts-3 > * { grid-column: span 3; } }
@media (max-width: 900px)  { .charts-2 > * { grid-column: span 6; } }
@media (max-width: 700px)  { .charts-3 > * { grid-column: span 6; } }

.tma-sentimento-wrapper { border: none; }
.tma-sentimento-wrapper table { min-width: 0; }
.tma-sentimento-wrapper th, .tma-sentimento-wrapper td { padding: .35rem .5rem; font-size: .78rem; }
.th-ordenavel { cursor: pointer; user-select: none; white-space: nowrap; }
.th-ordenavel:hover { color: var(--text); }
.sort-icon { font-size: .6rem; color: var(--accent); display: inline-block; width: .8rem; }

.mqa-secao-titulo { font-family: var(--font-mono); font-size: .85rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text); margin: 1.75rem 0 .8rem; }

/* Ranking de qualidade custom (não usa ChartRanking — nota não é Qtd/Valor) */
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

.row-clicavel { cursor: pointer; }
.row-clicavel:hover { background: var(--surface-2); }
.td-expandir { width: 24px; padding-right: 0 !important; }
.chevron { color: var(--text-3); transition: transform .18s ease; }
.chevron.open { transform: rotate(180deg); color: var(--accent); }
.td-acoes { text-align: right; }
.btn-editar { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); padding: .3rem .7rem; font-size: .74rem; cursor: pointer; }
.btn-editar:hover { color: var(--text); border-color: var(--border-2); }

.row-expandida td { padding: 0 !important; background: var(--surface); }
.expandido-conteudo { padding: .9rem 1.4rem 1.1rem; border-left: 2px solid var(--accent); }
.criterios-grid-view { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .5rem .9rem; }
.criterio-view-item { display: flex; justify-content: space-between; gap: .6rem; font-size: .78rem; border-bottom: 1px dashed var(--border); padding-bottom: .25rem; }
.criterio-view-label { color: var(--text-2); }
.criterio-view-resposta { font-weight: 700; white-space: nowrap; }
.resposta-conforme { color: var(--success); }
.resposta-naoconforme { color: var(--error); }
.resposta-naplica { color: var(--text-3); }
.resposta-vazia { color: var(--text-3); font-style: italic; font-weight: 400; }
.mqa-observacoes { margin-top: .8rem; font-size: .82rem; color: var(--text); line-height: 1.5; }

.mqa-badge { display: inline-block; padding: .2rem .55rem; border-radius: 20px; font-size: .7rem; font-weight: 700; white-space: nowrap; }
.mqa-badge-otimo { background: var(--success-bg); color: var(--success); }
.mqa-badge-bom { background: var(--accent-dim); color: var(--accent); }
.mqa-badge-naoconforme { background: var(--error-bg); color: var(--error); }
.mqa-badge-neutro { background: var(--surface-3); color: var(--text-2); }

.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

/* Modal */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0, .6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.modal-content { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 100%; padding: 1.5rem; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.modal-monitoria { max-width: 780px; max-height: 90vh; overflow-y: auto; }
.modal-title { font-size: 1.25rem; font-weight: 700; margin-bottom: .25rem; color: var(--text); }
.modal-sub { font-size: .85rem; color: var(--text-3); margin-bottom: 1.25rem; font-family: var(--font-mono); }
.modal-form { display: flex; flex-direction: column; gap: 1rem; }

.form-row { display: flex; gap: 1rem; flex-wrap: wrap; }
.form-group { display: flex; flex-direction: column; gap: .4rem; flex: 1 1 200px; }
.form-group-sm { flex: 0 1 160px; }
.form-group label { font-size: .8rem; font-weight: 600; color: var(--text-2); display: flex; align-items: center; gap: .4rem; }
.form-group input, .form-group select, .form-group textarea {
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
  padding: .6rem .65rem; border-radius: var(--radius-sm); font-family: var(--font-body); outline: none; font-size: .85rem;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--accent); }

.mqa-aviso { font-size: .8rem; color: #f59e0b; background: rgba(245, 158, 11, .1); border: 1px solid rgba(245, 158, 11, .3); border-radius: var(--radius-sm); padding: .55rem .7rem; }
.mqa-aviso-triagem-contexto { color: var(--accent); background: var(--accent-dim); border-color: rgba(0,240,255,.3); margin-bottom: 1rem; }
.mqa-aviso-triagem-contexto strong { color: var(--text); }
.form-erro { font-size: .8rem; color: var(--error); background: var(--error-bg); border: 1px solid rgba(255,42,95,.3); border-radius: var(--radius-sm); padding: .55rem .7rem; }

.pontuacao-preview { display: flex; align-items: baseline; gap: .8rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .7rem 1rem; }
.pontuacao-critica { border-color: rgba(255,42,95,.4); background: var(--error-bg); }
.pp-valor { font-family: var(--font-mono); font-size: 1.3rem; font-weight: 700; color: var(--text); }
.pontuacao-critica .pp-valor { color: var(--error); }
.pp-detalhe { font-size: .78rem; color: var(--text-2); }

.criterios-grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .7rem .9rem; }
.criterio-form-item { display: flex; flex-direction: column; gap: .3rem; }
.criterio-form-item label { font-size: .74rem; font-weight: 600; color: var(--text-2); }
.criterio-form-item select { padding: .45rem .55rem; font-size: .8rem; }

.modal-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: .5rem; }
.btn-cancel, .btn-submit { padding: .5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: .85rem; cursor: pointer; transition: all .2s; border: none; }
.btn-cancel { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
.btn-cancel:hover { background: var(--surface-3); color: var(--text); }
.btn-submit { background: var(--accent); color: var(--surface); }
.btn-submit:hover { opacity: .9; }
.btn-submit:disabled, .btn-cancel:disabled { opacity: .5; cursor: not-allowed; }
</style>
