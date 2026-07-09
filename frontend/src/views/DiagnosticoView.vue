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

    <!-- ═══════════ MODO CONSULTA (chat) ═══════════ -->
    <template v-if="modo === 'consulta'">
      <div class="chat-shell">
        <div class="chat-scroll" ref="scrollRef">
          <div v-for="(turno, i) in turnos" :key="i" class="turno">
            <div class="turno-label">{{ turno.tipo === 'assistente' ? 'IA' : (user?.nome?.split(' ')[0] || 'Você') }}</div>

            <p v-if="turno.texto" class="turno-texto">{{ turno.texto }}</p>

            <!-- candidatos pra escolher -->
            <div v-if="turno.candidatos" class="candidatos-lista">
              <button
                v-for="c in turno.candidatos"
                :key="c.id"
                class="candidato-btn"
                @click="escolherCandidato(c)"
              >
                <span class="candidato-nome">{{ c.nome }}</span>
                <span class="candidato-doc">{{ c.cpfCnpj }}<span v-if="c.endereco"> · {{ c.endereco }}</span></span>
              </button>
            </div>

            <!-- resultado: estruturado (3 seções) ou texto livre (fora de escopo) -->
            <div v-if="turno.resultado?.estruturado" class="result-secoes">
              <div class="result-secao">
                <span class="result-label label-diagnostico">Diagnóstico</span>
                <p>{{ turno.resultado.diagnostico }}</p>
              </div>
              <div class="result-secao">
                <span class="result-label label-erro">Causa identificada</span>
                <p>{{ turno.resultado.erro }}</p>
              </div>
              <div class="result-secao">
                <span class="result-label label-sugestao">Sugestão <em>(para avaliação humana)</em></span>
                <p>{{ turno.resultado.sugestao }}</p>
              </div>
            </div>
            <p v-else-if="turno.resultado" class="turno-texto">{{ turno.resultado.textoCompleto }}</p>
          </div>

          <div v-if="loading" class="turno">
            <div class="turno-label">IA</div>
            <span class="loading-dots"><span/><span/><span/></span>
            <span class="loading-label">{{ loadingLabel }}</span>
          </div>
        </div>

        <div class="chat-input-shell">
          <div v-if="clienteAtivo" class="chat-cliente-ativo">
            <span>Analisando: <strong>{{ clienteAtivo.nome }}</strong></span>
            <button class="btn-trocar" @click="trocarCliente">Trocar cliente</button>
          </div>
          <div class="chat-input-row">
            <input
              v-model="inputAtual"
              :placeholder="placeholderInput"
              :disabled="loading"
              @keydown.enter="enviar"
            />
            <button class="btn-enviar" :disabled="loading || !inputAtual.trim()" @click="enviar">
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M1.5 7.5 13 2 8.5 13 6.5 8.5 1.5 7.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>
            </button>
          </div>
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
import { ref, computed, watch, nextTick } from 'vue';
import { useAuth } from '../composables/useAuth';
import {
  buscarCliente,
  consultarDiagnostico,
  buscarAgregados,
  type DiagnosticoResultado,
  type DiagnosticoAgregadoItem,
  type ClienteCandidato,
} from '../services/diagnosticoApi';

const { user, isGestor } = useAuth();

type Modo = 'consulta' | 'gestao';
const modo = ref<Modo>('consulta');

interface Turno {
  tipo: 'usuario' | 'assistente';
  texto?: string;
  candidatos?: ClienteCandidato[];
  resultado?: DiagnosticoResultado;
}

const turnos = ref<Turno[]>([
  { tipo: 'assistente', texto: 'Olá! Me diga o nome ou o ID do cliente que você quer analisar.' },
]);
const clienteAtivo = ref<{ id: number; nome: string } | null>(null);
const inputAtual = ref('');
const loading = ref(false);
const loadingLabel = ref('Analisando…');
const scrollRef = ref<HTMLElement | null>(null);

const placeholderInput = computed(() =>
  clienteAtivo.value ? 'Pergunte algo sobre esse cliente…' : 'Nome ou ID do cliente…'
);

function rolarParaFinal() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  });
}

function adicionarTurno(t: Turno) {
  turnos.value.push(t);
  rolarParaFinal();
}

async function enviar() {
  const texto = inputAtual.value.trim();
  if (!texto || loading.value) return;
  inputAtual.value = '';
  adicionarTurno({ tipo: 'usuario', texto });

  if (!clienteAtivo.value) {
    await resolverCliente(texto);
  } else {
    await rodarAnalise(texto);
  }
}

async function resolverCliente(termo: string) {
  if (/^\d+$/.test(termo)) {
    clienteAtivo.value = { id: Number(termo), nome: `cliente #${termo}` };
    await rodarAnalise();
    return;
  }

  loading.value = true;
  loadingLabel.value = 'Procurando cliente…';
  try {
    const candidatos = await buscarCliente(termo);
    if (candidatos.length === 0) {
      adicionarTurno({ tipo: 'assistente', texto: 'Não encontrei nenhum cliente com esse nome ou documento. Tente novamente (nome completo, CPF/CNPJ ou ID).' });
    } else if (candidatos.length === 1) {
      clienteAtivo.value = { id: candidatos[0].id, nome: candidatos[0].nome };
      loading.value = false;
      await rodarAnalise();
      return;
    } else {
      adicionarTurno({ tipo: 'assistente', texto: 'Encontrei mais de um cliente com esse nome. Qual deles?', candidatos });
    }
  } catch {
    adicionarTurno({ tipo: 'assistente', texto: 'Não consegui buscar o cliente agora. Tente de novo em instantes.' });
  } finally {
    loading.value = false;
  }
}

function escolherCandidato(c: ClienteCandidato) {
  clienteAtivo.value = { id: c.id, nome: c.nome };
  rodarAnalise();
}

async function rodarAnalise(pergunta?: string) {
  if (!clienteAtivo.value) return;
  loading.value = true;
  loadingLabel.value = pergunta ? 'Buscando resposta…' : 'Cruzando rede, instalação e comercial…';
  try {
    const resultado = await consultarDiagnostico(clienteAtivo.value.id, pergunta);
    adicionarTurno({ tipo: 'assistente', resultado });
  } catch (e: any) {
    const msg = e?.response?.data?.message || 'Não consegui gerar o diagnóstico agora.';
    adicionarTurno({ tipo: 'assistente', texto: msg });
  } finally {
    loading.value = false;
  }
}

function trocarCliente() {
  clienteAtivo.value = null;
  adicionarTurno({ tipo: 'assistente', texto: 'Beleza. Qual o próximo cliente (nome ou ID)?' });
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
.view-diagnostico { padding: 1.75rem 2rem 3rem; max-width: 1080px; margin: 0 auto; height: calc(100vh - var(--header-h, 62px) - 2.75rem); display: flex; flex-direction: column; }

/* ── Header ── */
.diag-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; flex-shrink: 0; }
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

/* ── Chat shell ── */
.chat-shell { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.chat-scroll { flex: 1; overflow-y: auto; padding: .5rem .25rem 1rem; display: flex; flex-direction: column; gap: 1.35rem; }

.turno { max-width: 720px; }

.turno-label {
  font-family: var(--font-mono); font-size: .68rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-3); margin-bottom: .3rem;
}

.turno-texto { font-size: .88rem; line-height: 1.6; color: var(--text); white-space: pre-line; }

/* ── Candidatos ── */
.candidatos-lista { display: flex; flex-direction: column; gap: .3rem; margin-top: .3rem; }
.candidato-btn {
  display: flex; flex-direction: column; gap: .1rem; text-align: left; background: transparent;
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .5rem .7rem;
  cursor: pointer; transition: border-color .15s;
}
.candidato-btn:hover { border-color: var(--accent); }
.candidato-nome { font-size: .83rem; font-weight: 600; color: var(--text); }
.candidato-doc { font-size: .71rem; color: var(--text-3); font-family: var(--font-mono); }

/* ── Loading ── */
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span {
  width: 4px; height: 4px; border-radius: 50%; background: var(--text-3);
  animation: dot-pulse 1.1s ease-in-out infinite;
}
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
.loading-label { font-size: .8rem; color: var(--text-3); margin-left: .5rem; }

.state-msg { display: flex; align-items: center; gap: .6rem; color: var(--text-2); font-size: .85rem; padding: 1.2rem 0; }

/* ── Resultado: seções simples, sem cartão ── */
.result-secoes { display: flex; flex-direction: column; gap: .85rem; margin-top: .1rem; }
.result-secao { display: flex; flex-direction: column; gap: .25rem; }
.result-secao p { font-size: .87rem; line-height: 1.6; color: var(--text); }
.result-label {
  font-family: var(--font-mono); font-size: .7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em;
}
.result-label em { font-style: normal; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text-3); margin-left: .3rem; }

.label-diagnostico { color: var(--accent); }
.label-erro { color: var(--error); }
.label-sugestao { color: var(--success); }

/* ── Input do chat ── */
.chat-input-shell { flex-shrink: 0; border-top: 1px solid var(--border); padding-top: .9rem; margin-top: .25rem; }
.chat-cliente-ativo {
  display: flex; justify-content: space-between; align-items: center; padding: 0 .25rem .7rem;
  font-size: .78rem; color: var(--text-2);
}
.chat-cliente-ativo strong { color: var(--text); }
.btn-trocar {
  font-family: var(--font-body); font-size: .72rem; font-weight: 600; color: var(--text-2);
  background: transparent; border: 1px solid var(--border-2); border-radius: var(--radius-sm);
  padding: .25rem .6rem; cursor: pointer; transition: var(--transition);
}
.btn-trocar:hover { color: var(--text); border-color: var(--accent); }

.chat-input-row { display: flex; align-items: center; gap: .6rem; padding: 0 .25rem; }
.chat-input-row input {
  flex: 1; font-family: var(--font-body); font-size: .88rem; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .65rem .9rem; outline: none;
  transition: border-color .15s;
}
.chat-input-row input:focus { border-color: var(--accent); }
.chat-input-row input::placeholder { color: var(--text-3); }
.btn-enviar {
  display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex-shrink: 0;
  color: #04141a; background: var(--accent); border: none; border-radius: var(--radius-sm);
  cursor: pointer; transition: var(--transition);
}
.btn-enviar:hover:not(:disabled) { filter: brightness(1.1); box-shadow: var(--shadow); }
.btn-enviar:disabled { opacity: .35; cursor: not-allowed; }

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
