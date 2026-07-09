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
        <button :class="['diag-mode-btn', { active: modo === 'regras' }]" @click="modo = 'regras'">Regras de Negócio</button>
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
    <template v-else-if="modo === 'gestao'">
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

    <!-- ═══════════ MODO REGRAS DE NEGÓCIO ═══════════ -->
    <template v-else>
      <div class="regras-shell">
        <div class="regras-toolbar">
          <p class="regras-info">
            Base de referência lida pela IA ao montar o diagnóstico (metas, faixas, padrões de campo).
            Não altera regras de comissão/cobrança em produção — é só o que a IA enxerga.
          </p>
          <button class="btn-nova-regra" v-if="!formAberto" @click="abrirNovaRegra">+ Nova regra</button>
        </div>

        <div v-if="formAberto" class="regra-form">
          <div class="regra-form-grid">
            <label>Chave
              <input v-model="novaRegra.chave" placeholder="EX_NOME_REGRA" />
            </label>
            <label>Categoria
              <select v-model="novaRegra.categoria">
                <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <label>Valor
              <input v-model="novaRegra.valor" placeholder="Valor ou fato curto" />
            </label>
          </div>
          <label class="regra-form-descricao">Descrição
            <textarea v-model="novaRegra.descricao" rows="2" placeholder="Contexto que a IA deve considerar…"></textarea>
          </label>
          <div v-if="erroRegra" class="regra-erro">{{ erroRegra }}</div>
          <div class="regra-form-acoes">
            <button class="btn-cancelar" @click="cancelarNovaRegra">Cancelar</button>
            <button class="btn-salvar" :disabled="salvandoRegra" @click="salvarNovaRegra">Salvar</button>
          </div>
        </div>

        <div v-if="loadingRegras" class="state-msg">
          <span class="loading-dots"><span/><span/><span/></span> Carregando regras…
        </div>
        <div v-else class="regras-lista">
          <div v-for="r in regras" :key="r.chave" class="regra-row">
            <template v-if="editandoChave === r.chave">
              <div class="regra-form-grid">
                <div class="regra-chave-fixa">{{ r.chave }}</div>
                <label>Categoria
                  <select v-model="regraEmEdicao.categoria">
                    <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
                  </select>
                </label>
                <label>Valor
                  <input v-model="regraEmEdicao.valor" />
                </label>
              </div>
              <label class="regra-form-descricao">Descrição
                <textarea v-model="regraEmEdicao.descricao" rows="2"></textarea>
              </label>
              <div v-if="erroRegra" class="regra-erro">{{ erroRegra }}</div>
              <div class="regra-form-acoes">
                <button class="btn-cancelar" @click="cancelarEdicao">Cancelar</button>
                <button class="btn-salvar" :disabled="salvandoRegra" @click="salvarEdicao(r.chave)">Salvar</button>
              </div>
            </template>
            <template v-else>
              <div class="regra-main">
                <span class="regra-categoria">{{ r.categoria }}</span>
                <span class="regra-chave">{{ r.chave }}</span>
                <span class="regra-valor">{{ r.valor }}</span>
              </div>
              <p class="regra-descricao">{{ r.descricao }}</p>
              <div class="regra-rodape">
                <span class="regra-meta">atualizado por {{ r.atualizado_por }} · {{ formatarDataHora(r.atualizado_em) }}</span>
                <div class="regra-acoes">
                  <button class="link-btn" @click="iniciarEdicao(r)">Editar</button>
                  <button
                    class="link-btn"
                    :class="{ 'link-btn-perigo': excluindoChave === r.chave }"
                    @click="confirmarExclusao(r.chave)"
                  >{{ excluindoChave === r.chave ? 'Confirmar exclusão?' : 'Excluir' }}</button>
                </div>
              </div>
            </template>
          </div>
          <p v-if="regras.length === 0" class="empty-sub">Nenhuma regra cadastrada ainda.</p>
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
  listarRegras,
  criarRegra,
  editarRegra,
  excluirRegra,
  type DiagnosticoResultado,
  type DiagnosticoAgregadoItem,
  type ClienteCandidato,
  type RegraNegocio,
  type CategoriaRegra,
  type HistoricoTurnoConversa,
} from '../services/diagnosticoApi';

const { user, isGestor } = useAuth();

type Modo = 'consulta' | 'gestao' | 'regras';
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
// Backend não guarda sessão — mantemos aqui as últimas perguntas/respostas
// dessa conversa para a IA entender referências curtas ("e os atendimentos?").
const historicoConversa = ref<HistoricoTurnoConversa[]>([]);
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

  const pareceOutroIdCliente =
    clienteAtivo.value && /^\d+$/.test(texto) && Number(texto) !== clienteAtivo.value.id;

  if (!clienteAtivo.value || pareceOutroIdCliente) {
    clienteAtivo.value = null;
    historicoConversa.value = [];
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
  historicoConversa.value = [];
  rodarAnalise();
}

async function rodarAnalise(pergunta?: string) {
  if (!clienteAtivo.value) return;
  loading.value = true;
  loadingLabel.value = pergunta ? 'Buscando resposta…' : 'Cruzando rede, instalação e comercial…';
  try {
    const resultado = await consultarDiagnostico(clienteAtivo.value.id, pergunta, historicoConversa.value);
    adicionarTurno({ tipo: 'assistente', resultado });
    historicoConversa.value.push({ pergunta: pergunta || 'Diagnóstico geral do cliente', resposta: resultado.textoCompleto });
    if (historicoConversa.value.length > 6) historicoConversa.value.shift();
  } catch (e: any) {
    const msg = e?.response?.data?.message || 'Não consegui gerar o diagnóstico agora.';
    adicionarTurno({ tipo: 'assistente', texto: msg });
  } finally {
    loading.value = false;
  }
}

function trocarCliente() {
  clienteAtivo.value = null;
  historicoConversa.value = [];
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

const CATEGORIAS: CategoriaRegra[] = ['VENDAS', 'RETENCAO', 'REDE', 'COMISSAO'];

const regras = ref<RegraNegocio[]>([]);
const loadingRegras = ref(false);
const formAberto = ref(false);
const salvandoRegra = ref(false);
const erroRegra = ref('');
const novaRegra = ref({ chave: '', valor: '', descricao: '', categoria: 'REDE' as CategoriaRegra });
const editandoChave = ref<string | null>(null);
const regraEmEdicao = ref({ valor: '', descricao: '', categoria: 'REDE' as CategoriaRegra });
const excluindoChave = ref<string | null>(null);

async function carregarRegras() {
  loadingRegras.value = true;
  try {
    regras.value = await listarRegras();
  } finally {
    loadingRegras.value = false;
  }
}

function abrirNovaRegra() {
  formAberto.value = true;
  erroRegra.value = '';
  novaRegra.value = { chave: '', valor: '', descricao: '', categoria: 'REDE' };
}

function cancelarNovaRegra() {
  formAberto.value = false;
  erroRegra.value = '';
}

async function salvarNovaRegra() {
  const chave = novaRegra.value.chave.trim().toUpperCase();
  if (!chave || !novaRegra.value.valor.trim() || !novaRegra.value.descricao.trim()) {
    erroRegra.value = 'Preencha chave, valor e descrição.';
    return;
  }
  if (!/^[A-Z0-9_]+$/.test(chave)) {
    erroRegra.value = 'Chave deve usar apenas maiúsculas, números e _.';
    return;
  }
  salvandoRegra.value = true;
  erroRegra.value = '';
  try {
    const criada = await criarRegra({ ...novaRegra.value, chave });
    regras.value = [...regras.value, criada].sort((a, b) => a.chave.localeCompare(b.chave));
    formAberto.value = false;
  } catch (e: any) {
    erroRegra.value = e?.response?.data?.message || 'Não consegui salvar a regra agora.';
  } finally {
    salvandoRegra.value = false;
  }
}

function iniciarEdicao(r: RegraNegocio) {
  editandoChave.value = r.chave;
  regraEmEdicao.value = { valor: r.valor, descricao: r.descricao, categoria: r.categoria };
  erroRegra.value = '';
}

function cancelarEdicao() {
  editandoChave.value = null;
  erroRegra.value = '';
}

async function salvarEdicao(chave: string) {
  if (!regraEmEdicao.value.valor.trim() || !regraEmEdicao.value.descricao.trim()) {
    erroRegra.value = 'Preencha valor e descrição.';
    return;
  }
  salvandoRegra.value = true;
  erroRegra.value = '';
  try {
    const atualizada = await editarRegra(chave, regraEmEdicao.value);
    const idx = regras.value.findIndex((r) => r.chave === chave);
    if (idx !== -1) regras.value[idx] = atualizada;
    editandoChave.value = null;
  } catch (e: any) {
    erroRegra.value = e?.response?.data?.message || 'Não consegui salvar a alteração agora.';
  } finally {
    salvandoRegra.value = false;
  }
}

async function confirmarExclusao(chave: string) {
  if (excluindoChave.value !== chave) {
    excluindoChave.value = chave;
    return;
  }
  try {
    await excluirRegra(chave);
    regras.value = regras.value.filter((r) => r.chave !== chave);
  } finally {
    excluindoChave.value = null;
  }
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

watch(modo, (m) => {
  if (m === 'gestao' && agregados.value.length === 0) carregarAgregados();
  if (m === 'regras' && regras.value.length === 0) carregarRegras();
});
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

/* ── Regras de negócio ── */
.regras-shell { display: flex; flex-direction: column; gap: 1.1rem; overflow-y: auto; padding-bottom: 1rem; }
.regras-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.regras-info { font-size: .82rem; color: var(--text-2); line-height: 1.5; max-width: 560px; }
.btn-nova-regra {
  font-family: var(--font-body); font-size: .78rem; font-weight: 600; color: var(--text);
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm);
  padding: .45rem .8rem; cursor: pointer; transition: var(--transition); flex-shrink: 0; white-space: nowrap;
}
.btn-nova-regra:hover { border-color: var(--accent); }

.regra-form {
  border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .9rem 1rem;
  display: flex; flex-direction: column; gap: .7rem; background: var(--surface);
}
.regra-form-grid { display: grid; grid-template-columns: 1fr 140px 1fr; gap: .7rem; }
.regra-form label, .regra-form-descricao {
  display: flex; flex-direction: column; gap: .3rem; font-size: .7rem; color: var(--text-3);
  font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
}
.regra-form input, .regra-form select, .regra-form textarea {
  font-family: var(--font-body); font-size: .85rem; font-weight: 400; text-transform: none;
  letter-spacing: normal; color: var(--text); background: var(--surface-2);
  border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .5rem .7rem; outline: none;
}
.regra-form input:focus, .regra-form select:focus, .regra-form textarea:focus { border-color: var(--accent); }
.regra-form textarea { resize: vertical; }
.regra-erro { font-size: .78rem; color: var(--error); }
.regra-form-acoes { display: flex; justify-content: flex-end; gap: .5rem; }
.btn-cancelar, .btn-salvar {
  font-family: var(--font-body); font-size: .78rem; font-weight: 600; border-radius: var(--radius-sm);
  padding: .4rem .85rem; cursor: pointer; transition: var(--transition); border: 1px solid transparent;
}
.btn-cancelar { color: var(--text-2); background: transparent; border-color: var(--border-2); }
.btn-cancelar:hover { color: var(--text); }
.btn-salvar { color: #04141a; background: var(--accent); }
.btn-salvar:hover:not(:disabled) { filter: brightness(1.1); }
.btn-salvar:disabled { opacity: .5; cursor: not-allowed; }

.regras-lista { display: flex; flex-direction: column; }
.regra-row { padding: .9rem .2rem; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: .35rem; }
.regra-row:last-child { border-bottom: none; }
.regra-main { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
.regra-categoria {
  font-family: var(--font-mono); font-size: .65rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-3); border: 1px solid var(--border-2); border-radius: 3px; padding: .1rem .4rem;
}
.regra-chave { font-family: var(--font-mono); font-size: .85rem; font-weight: 700; color: var(--text); }
.regra-chave-fixa { font-family: var(--font-mono); font-size: .85rem; font-weight: 700; color: var(--text); display: flex; align-items: center; }
.regra-valor { font-size: .84rem; color: var(--accent); font-weight: 600; }
.regra-descricao { font-size: .82rem; color: var(--text-2); line-height: 1.5; }
.regra-rodape { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: .1rem; flex-wrap: wrap; }
.regra-meta { font-size: .7rem; color: var(--text-3); }
.regra-acoes { display: flex; gap: .9rem; flex-shrink: 0; }
.link-btn {
  font-family: var(--font-body); font-size: .74rem; font-weight: 600; color: var(--text-3);
  background: transparent; border: none; padding: 0; cursor: pointer; transition: color .15s;
}
.link-btn:hover { color: var(--accent); }
.link-btn-perigo, .link-btn-perigo:hover { color: var(--error); }
</style>
