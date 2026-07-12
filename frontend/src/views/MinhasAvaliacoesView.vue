<template>
  <div class="view-minhas-avaliacoes">
    <div class="mav-header">
      <div>
        <h1 class="mav-title">Minhas Avaliações</h1>
        <p class="mav-sub" v-if="agente">
          {{ agente.nome }} · {{ agente.equipe }} — avaliações de qualidade (QA) registradas em seu nome.
          Dar ciência não é concordar com a nota, é confirmar que você viu — discorde no comentário se quiser.
        </p>
      </div>
      <button class="btn-refresh" @click="carregar" :disabled="loading">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Atualizar
      </button>
    </div>

    <div v-if="loading" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando…
    </div>

    <div v-else-if="erro" class="state-msg mav-erro">{{ erro }}</div>

    <div v-else-if="!monitorias.length" class="state-msg">Nenhuma avaliação de QA registrada em seu nome ainda.</div>

    <div v-else class="mav-lista">
      <div v-for="m in monitorias" :key="m.id" class="mav-card">
        <div class="mav-card-header" @click="toggleExpandir(m.id)">
          <svg :class="['chevron', { open: expandido === m.id }]" width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="mav-card-info">
            <span class="mav-card-protocolo">Protocolo {{ m.protocolo }}</span>
            <span class="mav-card-data">{{ m.data_atendimento ? fmtDate(m.data_atendimento) : '—' }} · {{ m.motivo_atendimento || 'Motivo não informado' }}</span>
          </div>
          <span v-if="m.erro_critico" class="mqa-badge mqa-badge-naoconforme">Erro crítico (0/10)</span>
          <span v-else-if="m.pontuacao !== null" :class="['mqa-badge', badgeClasse(m.pontuacao)]">{{ m.pontuacao }}/10</span>
          <span v-else class="mqa-badge mqa-badge-neutro">—</span>
          <span v-if="m.comunicado_em" class="mav-ciencia-badge mav-ciencia-ok">Ciência dada</span>
          <span v-else class="mav-ciencia-badge mav-ciencia-pendente">Aguardando ciência</span>
        </div>

        <div v-if="expandido === m.id" class="mav-card-body">
          <div class="criterios-grid-view">
            <div v-for="c in CRITERIOS_QA" :key="c" class="criterio-view-item">
              <span class="criterio-view-label">{{ c }}</span>
              <span :class="['criterio-view-resposta', respostaClasse(m.criterios[c])]">{{ m.criterios[c] || 'não avaliado' }}</span>
            </div>
          </div>
          <p v-if="m.observacoes" class="mqa-observacoes"><strong>Observações do QA:</strong> {{ m.observacoes }}</p>

          <div class="mav-ciencia-area">
            <template v-if="m.comunicado_em">
              <p class="mav-ciencia-info">
                Ciência dada em {{ fmtDateHora(m.comunicado_em) }}.
                <template v-if="m.comunicado_nota">Comentário: "{{ m.comunicado_nota }}"</template>
              </p>
            </template>
            <template v-else>
              <textarea
                v-model="comentarios[m.id]"
                class="mav-comentario"
                rows="2"
                placeholder="Comentário opcional (ex: discordo do critério X porque...)"
              ></textarea>
              <button class="btn-primary" :disabled="enviando === m.id" @click="darCiencia(m)">
                {{ enviando === m.id ? 'Enviando…' : 'Dar ciência' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  atendimentoQaApiClient, CRITERIOS_QA, classificarPontuacao,
  type MonitoriaQa, type RespostaCriterio,
} from '../services/atendimentoQaApi';

function fmtDate(s: string) { return new Date(s).toLocaleDateString('pt-BR'); }
function fmtDateHora(s: string) { return new Date(s).toLocaleString('pt-BR'); }

function badgeClasse(pontuacao: number): string {
  const c = classificarPontuacao(pontuacao);
  if (c === 'Ótimo') return 'mqa-badge-otimo';
  if (c === 'Bom') return 'mqa-badge-bom';
  return 'mqa-badge-naoconforme';
}
function respostaClasse(resposta: RespostaCriterio | undefined): string {
  if (resposta === 'Conforme') return 'resposta-conforme';
  if (resposta === 'Não Conforme') return 'resposta-naoconforme';
  if (resposta === 'Não se aplica') return 'resposta-naplica';
  return 'resposta-vazia';
}

const agente     = ref<{ nome: string; equipe: string } | null>(null);
const monitorias = ref<MonitoriaQa[]>([]);
const loading    = ref(false);
const erro       = ref('');
const expandido  = ref<string | null>(null);
const enviando   = ref<string | null>(null);
const comentarios = reactive<Record<string, string>>({});

function toggleExpandir(id: string) {
  expandido.value = expandido.value === id ? null : id;
}

async function carregar() {
  loading.value = true;
  erro.value = '';
  try {
    const r = await atendimentoQaApiClient.minhasAvaliacoes();
    agente.value = r.agente;
    monitorias.value = r.monitorias;
  } catch (err: any) {
    erro.value = err?.response?.status === 403
      ? 'Seu usuário não corresponde a um agente de QA ativo.'
      : 'Falha ao carregar suas avaliações. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

async function darCiencia(m: MonitoriaQa) {
  enviando.value = m.id;
  try {
    const atualizada = await atendimentoQaApiClient.darCiencia(m.id, comentarios[m.id]?.trim() || undefined);
    const idx = monitorias.value.findIndex((x) => x.id === m.id);
    if (idx !== -1) monitorias.value[idx] = atualizada;
  } catch {
    erro.value = 'Falha ao registrar a ciência. Tente novamente.';
  } finally {
    enviando.value = null;
  }
}

onMounted(carregar);
</script>

<style scoped>
.view-minhas-avaliacoes { width: 100%; }

.mav-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
.mav-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.mav-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; max-width: 720px; line-height: 1.5; }

.btn-refresh {
  display: inline-flex; align-items: center; gap: .4rem; height: 38px; padding: 0 .9rem;
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  border-radius: var(--radius-sm); font-size: .8rem; font-weight: 600; cursor: pointer; transition: all var(--transition);
}
.btn-refresh:hover:not(:disabled) { color: var(--text); border-color: var(--border-2); }
.btn-refresh:disabled { opacity: .5; cursor: not-allowed; }

.state-msg { color: var(--text-3); font-size: .85rem; text-align: center; padding: 2rem; }
.mav-erro { color: var(--error); }
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

.mav-lista { display: flex; flex-direction: column; gap: .6rem; }
.mav-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.mav-card-header { display: flex; align-items: center; gap: .8rem; padding: .8rem 1rem; cursor: pointer; }
.mav-card-header:hover { background: var(--surface-2); }
.chevron { color: var(--text-3); transition: transform .18s ease; flex-shrink: 0; }
.chevron.open { transform: rotate(180deg); color: var(--accent); }
.mav-card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
.mav-card-protocolo { font-family: var(--font-mono); font-size: .85rem; font-weight: 600; color: var(--text); }
.mav-card-data { font-size: .75rem; color: var(--text-3); }

.mav-ciencia-badge { font-size: .68rem; font-weight: 700; padding: .18rem .55rem; border-radius: 20px; white-space: nowrap; }
.mav-ciencia-ok { background: var(--success-bg); color: var(--success); }
.mav-ciencia-pendente { background: rgba(245, 158, 11, .12); color: #f59e0b; }

.mav-card-body { padding: 0 1rem 1rem; border-top: 1px solid var(--border); }
.criterios-grid-view { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .5rem .9rem; padding-top: .9rem; }
.criterio-view-item { display: flex; justify-content: space-between; gap: .6rem; font-size: .78rem; border-bottom: 1px dashed var(--border); padding-bottom: .25rem; }
.criterio-view-label { color: var(--text-2); }
.criterio-view-resposta { font-weight: 700; white-space: nowrap; }
.resposta-conforme { color: var(--success); }
.resposta-naoconforme { color: var(--error); }
.resposta-naplica { color: var(--text-3); }
.resposta-vazia { color: var(--text-3); font-style: italic; font-weight: 400; }
.mqa-observacoes { margin-top: .8rem; font-size: .82rem; color: var(--text); line-height: 1.5; }

.mqa-badge { display: inline-block; padding: .2rem .55rem; border-radius: 20px; font-size: .7rem; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
.mqa-badge-otimo { background: var(--success-bg); color: var(--success); }
.mqa-badge-bom { background: var(--accent-dim); color: var(--accent); }
.mqa-badge-naoconforme { background: var(--error-bg); color: var(--error); }
.mqa-badge-neutro { background: var(--surface-3); color: var(--text-2); }

.mav-ciencia-area { margin-top: 1rem; padding-top: .9rem; border-top: 1px dashed var(--border); display: flex; flex-direction: column; gap: .6rem; align-items: flex-start; }
.mav-ciencia-info { font-size: .82rem; color: var(--text-2); line-height: 1.5; }
.mav-comentario {
  width: 100%; background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
  padding: .55rem .65rem; border-radius: var(--radius-sm); font-family: var(--font-body); font-size: .82rem; outline: none; resize: vertical;
}
.mav-comentario:focus { border-color: var(--accent); }
.btn-primary { padding: .5rem 1.1rem; font-size: .82rem; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; border: none; background: var(--accent); color: var(--surface); transition: opacity .2s; }
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
