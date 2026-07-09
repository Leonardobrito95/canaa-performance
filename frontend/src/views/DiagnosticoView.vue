<template>
  <div class="view-diagnostico">

    <!-- Header -->
    <div class="diag-header">
      <div>
        <h1 class="diag-title">Diagnóstico IA</h1>
        <p class="diag-sub">Cruza rede, instalação e comercial de um cliente em uma única análise</p>
      </div>
      <div v-if="isGestor" class="diag-modes">
        <button :class="['diag-mode-btn', { active: modo === 'consulta' }]" @click="modo = 'consulta'">Consulta</button>
        <button :class="['diag-mode-btn', { active: modo === 'gestao' }]" @click="modo = 'gestao'">Painel de Gestão</button>
      </div>
    </div>

    <!-- ═══════════ MODO CONSULTA ═══════════ -->
    <template v-if="modo === 'consulta'">

      <div class="query-card">
        <div class="query-row">
          <div class="query-field">
            <label>ID do cliente</label>
            <input
              v-model="idClienteInput"
              type="number"
              inputmode="numeric"
              placeholder="Ex: 9911"
              @keydown.enter="analisar()"
            />
          </div>
          <button class="btn-analisar" :disabled="loading || !idValido" @click="analisar()">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1.5v3M7.5 10.5v3M1.5 7.5h3M10.5 7.5h3M3.5 3.5l2 2M9.5 9.5l2 2M11.5 3.5l-2 2M5.5 9.5l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span>{{ loading && !perguntaAtiva ? 'Analisando…' : 'Analisar' }}</span>
          </button>
        </div>

        <div class="query-ask-row">
          <svg class="ask-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2 3h11v7H6l-3 3V10H2V3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
          <input
            v-model="pergunta"
            placeholder="Ou pergunte algo específico sobre esse cliente…"
            :disabled="!idValido"
            @keydown.enter="pergunta && analisar(pergunta)"
          />
          <button class="btn-perguntar" :disabled="loading || !idValido || !pergunta.trim()" @click="analisar(pergunta)">
            Perguntar
          </button>
        </div>
      </div>

      <div v-if="loading" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span>
        {{ perguntaAtiva ? 'Buscando resposta…' : 'Cruzando rede, instalação e comercial…' }}
      </div>
      <div v-else-if="error" class="state-msg" style="color:var(--error)">{{ error }}</div>

      <!-- Resultado estruturado -->
      <div v-if="resultado" class="result-grid" :key="resultadoKey">
        <div class="result-card card-diagnostico" style="--delay:0ms">
          <div class="card-head">
            <span class="card-icon icon-diagnostico">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1 8h2.5l1.5-4 2.5 8 1.5-5 1 1H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            Diagnóstico
          </div>
          <p>{{ resultado.diagnostico }}</p>
        </div>

        <div class="result-card card-erro" style="--delay:90ms">
          <div class="card-head">
            <span class="card-icon icon-erro">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5 14 13H1L7.5 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.5 6v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7.5" cy="10.8" r="0.7" fill="currentColor"/></svg>
            </span>
            Causa identificada
          </div>
          <p>{{ resultado.erro }}</p>
        </div>

        <div class="result-card card-sugestao" style="--delay:180ms">
          <div class="card-head">
            <span class="card-icon icon-sugestao">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1a4 4 0 0 0-2 7.5c.4.3.6.8.6 1.3v.7h2.8v-.7c0-.5.2-1 .6-1.3A4 4 0 0 0 7.5 1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 13h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            </span>
            Sugestão
            <span class="badge-revisao">para avaliação humana</span>
          </div>
          <p>{{ resultado.sugestao }}</p>
        </div>
      </div>

      <!-- Histórico -->
      <div v-if="historico.length" class="historico-section">
        <div class="section-label">Consultas anteriores deste cliente</div>
        <div class="historico-list">
          <button
            v-for="h in historico"
            :key="h.id"
            class="historico-item"
            :class="{ open: abertoId === h.id }"
            @click="abertoId = abertoId === h.id ? null : h.id"
          >
            <div class="hist-row">
              <span class="hist-pergunta">{{ h.pergunta || 'Análise padrão' }}</span>
              <span class="hist-meta">{{ h.ixc_username }} · {{ formatarData(h.criado_em) }}</span>
            </div>
            <p v-if="abertoId === h.id" class="hist-resposta">{{ h.resposta }}</p>
          </button>
        </div>
      </div>
    </template>

    <!-- ═══════════ MODO GESTÃO (agregado) ═══════════ -->
    <template v-else>
      <div v-if="loadingAgregados" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span> Carregando padrões…
      </div>
      <div v-else-if="agregados.length === 0" class="empty-agregado">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="17" stroke="currentColor" stroke-width="1.3" opacity=".35"/>
          <path d="M13 24l5-7 4 4 6-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p class="empty-title">Nenhum padrão calculado ainda</p>
        <p class="empty-sub">
          O painel de gestão mostra correlações validadas em SQL (ex: técnico com reincidência
          acima da média) assim que a rotina de agregação rodar pela primeira vez.
        </p>
      </div>
      <div v-else class="agregado-grid">
        <div v-for="a in agregados" :key="a.chave" class="agregado-card">
          <div class="agregado-dim">{{ a.dimensao }}</div>
          <div class="agregado-chave">{{ a.chave }}</div>
          <p v-if="a.narrativa" class="agregado-narrativa">{{ a.narrativa }}</p>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAuth } from '../composables/useAuth';
import {
  consultarDiagnostico,
  buscarHistoricoConsultas,
  buscarAgregados,
  type DiagnosticoResultado,
  type DiagnosticoHistoricoItem,
  type DiagnosticoAgregadoItem,
} from '../services/diagnosticoApi';

const { isGestor } = useAuth();

type Modo = 'consulta' | 'gestao';
const modo = ref<Modo>('consulta');

const idClienteInput = ref<string>('');
const idValido = computed(() => /^\d+$/.test(idClienteInput.value));

const pergunta = ref('');
const perguntaAtiva = ref(false);
const loading = ref(false);
const error = ref('');
const resultado = ref<DiagnosticoResultado | null>(null);
const resultadoKey = ref(0);
const historico = ref<DiagnosticoHistoricoItem[]>([]);
const abertoId = ref<string | null>(null);

async function analisar(perguntaLivre?: string) {
  if (!idValido.value) return;
  loading.value = true;
  error.value = '';
  perguntaAtiva.value = !!perguntaLivre;
  try {
    const idCliente = Number(idClienteInput.value);
    resultado.value = await consultarDiagnostico(idCliente, perguntaLivre || undefined);
    resultadoKey.value++;
    if (perguntaLivre) pergunta.value = '';
    historico.value = await buscarHistoricoConsultas(idCliente);
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Não foi possível gerar o diagnóstico agora.';
  } finally {
    loading.value = false;
  }
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const agregados = ref<DiagnosticoAgregadoItem[]>([]);
const loadingAgregados = ref(false);

async function carregarAgregados() {
  loadingAgregados.value = true;
  try {
    agregados.value = await buscarAgregados();
  } finally {
    loadingAgregados.value = false;
  }
}

watch(modo, (m) => { if (m === 'gestao' && agregados.value.length === 0) carregarAgregados(); });
</script>

<style scoped>
.view-diagnostico { padding: 1.75rem 2rem 3rem; max-width: 1080px; margin: 0 auto; }

/* ── Header ── */
.diag-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.diag-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.diag-sub { font-size: .85rem; color: var(--text-2); margin-top: .3rem; }

.diag-modes { display: flex; gap: .25rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px; }
.diag-mode-btn {
  font-family: var(--font-body); font-size: .8rem; font-weight: 600; color: var(--text-2);
  background: transparent; border: none; padding: .45rem .9rem; border-radius: var(--radius-sm);
  cursor: pointer; transition: var(--transition);
}
.diag-mode-btn.active { background: var(--surface-3); color: var(--text); }
.diag-mode-btn:hover:not(.active) { color: var(--text); }

/* ── Query card ── */
.query-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 1.25rem 1.4rem; margin-bottom: 1.5rem;
}
.query-row { display: flex; align-items: flex-end; gap: .9rem; }
.query-field { display: flex; flex-direction: column; gap: .35rem; flex: 0 0 200px; }
.query-field label { font-size: .72rem; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.query-field input {
  font-family: var(--font-mono); font-size: .95rem; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .55rem .7rem; outline: none;
  transition: border-color .15s;
}
.query-field input:focus { border-color: var(--accent); }

.btn-analisar {
  display: flex; align-items: center; gap: .45rem; font-family: var(--font-body); font-weight: 700;
  font-size: .85rem; color: #04141a; background: var(--accent); border: none; border-radius: var(--radius-sm);
  padding: .6rem 1.1rem; cursor: pointer; transition: var(--transition); white-space: nowrap;
}
.btn-analisar:hover:not(:disabled) { filter: brightness(1.1); box-shadow: var(--shadow); }
.btn-analisar:disabled { opacity: .4; cursor: not-allowed; }

.query-ask-row {
  display: flex; align-items: center; gap: .6rem; margin-top: .9rem; padding-top: .9rem;
  border-top: 1px dashed var(--border);
}
.ask-icon { color: var(--text-3); flex-shrink: 0; }
.query-ask-row input {
  flex: 1; font-family: var(--font-body); font-size: .85rem; background: transparent; color: var(--text);
  border: none; outline: none;
}
.query-ask-row input::placeholder { color: var(--text-3); }
.btn-perguntar {
  font-family: var(--font-body); font-weight: 600; font-size: .78rem; color: var(--text-2);
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm);
  padding: .4rem .8rem; cursor: pointer; transition: var(--transition); white-space: nowrap;
}
.btn-perguntar:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
.btn-perguntar:disabled { opacity: .35; cursor: not-allowed; }

/* ── Estado ── */
.state-msg { display: flex; align-items: center; gap: .6rem; color: var(--text-2); font-size: .85rem; padding: 1.2rem 0; }
.loading-dots { display: inline-flex; gap: 3px; }
.loading-dots span {
  width: 5px; height: 5px; border-radius: 50%; background: var(--accent);
  animation: dot-pulse 1.1s ease-in-out infinite;
}
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

/* ── Result cards ── */
.result-grid { display: flex; flex-direction: column; gap: .8rem; margin-top: .5rem; }
.result-card {
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border-2);
  border-radius: var(--radius-sm); padding: 1.1rem 1.3rem;
  opacity: 0; animation: card-reveal .45s cubic-bezier(.2,1,.2,1) forwards;
  animation-delay: var(--delay);
}
@keyframes card-reveal { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.result-card p { font-size: .88rem; line-height: 1.55; color: var(--text); }
.card-head { display: flex; align-items: center; gap: .5rem; font-family: var(--font-display); font-size: .82rem; font-weight: 700; margin-bottom: .55rem; letter-spacing: .01em; }
.card-icon { display: inline-flex; }

.card-diagnostico { border-left-color: var(--accent); }
.card-diagnostico .icon-diagnostico { color: var(--accent); }

.card-erro { border-left-color: var(--error); }
.card-erro .icon-erro { color: var(--error); }

.card-sugestao { border-left-color: var(--success); }
.card-sugestao .icon-sugestao { color: var(--success); }
.badge-revisao {
  font-family: var(--font-body); font-size: .65rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: .03em; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border-2);
  border-radius: var(--radius-sm); padding: .15rem .45rem; margin-left: auto;
}

/* ── Histórico ── */
.historico-section { margin-top: 2rem; }
.section-label { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-3); margin-bottom: .7rem; }
.historico-list { display: flex; flex-direction: column; gap: .4rem; }
.historico-item {
  display: block; width: 100%; text-align: left; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: .7rem .9rem; cursor: pointer; transition: border-color .15s;
}
.historico-item:hover, .historico-item.open { border-color: var(--border-2); }
.hist-row { display: flex; justify-content: space-between; align-items: center; gap: .8rem; }
.hist-pergunta { font-size: .82rem; color: var(--text); font-weight: 500; }
.hist-meta { font-size: .72rem; color: var(--text-3); font-family: var(--font-mono); white-space: nowrap; }
.hist-resposta { margin-top: .6rem; font-size: .8rem; color: var(--text-2); line-height: 1.5; white-space: pre-line; }

/* ── Painel de gestão ── */
.empty-agregado {
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: .6rem;
  padding: 3.5rem 1rem; color: var(--text-2);
}
.empty-agregado svg { color: var(--text-3); }
.empty-title { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: var(--text); }
.empty-sub { font-size: .82rem; max-width: 380px; line-height: 1.5; }

.agregado-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .8rem; }
.agregado-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1rem 1.2rem; }
.agregado-dim { font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); font-weight: 700; }
.agregado-chave { font-family: var(--font-mono); font-size: .95rem; margin-top: .2rem; }
.agregado-narrativa { font-size: .82rem; color: var(--text-2); margin-top: .5rem; line-height: 1.5; }
</style>
