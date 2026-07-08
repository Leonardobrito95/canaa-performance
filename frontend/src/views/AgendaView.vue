<template>
  <div class="agenda-view">

    <!-- BANNER STATUS -->
    <div :class="['ag-banner-status', todasSalasLivres ? 'ag-banner-livre' : 'ag-banner-ocupada']">
      <span :class="['ag-dot', todasSalasLivres ? 'ag-dot-verde' : 'ag-dot-vermelho']"></span>
      <span class="ag-banner-titulo">{{ bannerTitulo }}</span>
      <div class="ag-chips">
        <span v-for="s in salas" :key="s.nome" :class="['ag-chip', s.livre ? 'ag-chip-livre' : 'ag-chip-ocup']">
          <span :class="['ag-chip-dot', s.livre ? 'ag-dot-verde' : 'ag-dot-vermelho']"></span>
          {{ s.nome }}
          <span v-if="!s.livre && s.reservaAtiva" class="ag-chip-detalhe">
            · {{ s.reservaAtiva.titulo }} até {{ s.reservaAtiva.horafim || s.reservaAtiva.horaFim }}
          </span>
        </span>
      </div>
    </div>

    <!-- BANNER ONLINE -->
    <div v-if="reuniaoOnlineAtiva" class="ag-banner-online">
      <div class="ag-banner-online-icon">
        <svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
        </svg>
      </div>
      <div class="ag-banner-online-info">
        <div class="ag-banner-online-label">● EM ANDAMENTO · Reunião Online</div>
        <p class="ag-banner-online-titulo">{{ reuniaoOnlineAtiva.titulo }}</p>
        <p class="ag-banner-online-gestor">por {{ reuniaoOnlineAtiva.gestor }}</p>
      </div>
      <a v-if="reuniaoOnlineAtiva.link_reuniao" :href="reuniaoOnlineAtiva.link_reuniao" target="_blank" class="ag-banner-online-btn">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Entrar
      </a>
    </div>

    <!-- MAIN -->
    <div class="ag-main">

      <!-- KPIs -->
      <div class="ag-kpi-grid">
        <div class="ag-kpi-cell ag-kpi-sep">
          <div class="ag-kpi-row-label">
            <span :class="['ag-kpi-dot', todasSalasLivres ? 'ag-dot-verde' : 'ag-dot-vermelho']"></span>
            <p class="ag-label">STATUS DAS SALAS</p>
          </div>
          <p :class="['ag-kpi-val', todasSalasLivres ? 'ag-val-verde' : 'ag-val-vermelho']">{{ statusSalasTexto }}</p>
        </div>
        <div class="ag-kpi-cell ag-kpi-sep">
          <p class="ag-label">REUNIÃO ATIVA</p>
          <p class="ag-kpi-val ag-val-text ag-truncate">{{ reuniaoAtivaTexto }}</p>
        </div>
        <div class="ag-kpi-cell ag-kpi-sep">
          <p class="ag-label">REUNIÕES HOJE</p>
          <p class="ag-kpi-val ag-val-azul">{{ reunioesHoje ?? '—' }}</p>
        </div>
        <div class="ag-kpi-cell">
          <p class="ag-label">PENDENTES</p>
          <p class="ag-kpi-val ag-val-amarelo">{{ pendentes ?? '—' }}</p>
        </div>
      </div>

      <!-- GRID FORM + LISTA -->
      <div class="ag-grid">

        <!-- FORMULÁRIO -->
        <form @submit.prevent="agendarReuniao" class="ag-form">
          <input v-model="form.titulo" type="text" placeholder="Título da Reunião" class="ag-input" required />
          <input v-model="form.data" type="date" :min="hoje" class="ag-input" required />

          <div class="ag-row-2">
            <div class="ag-time-wrap">
              <span class="ag-time-label">INI</span>
              <input v-model="form.horaInicio" type="time" class="ag-input ag-input-time" required />
            </div>
            <div class="ag-time-wrap">
              <span class="ag-time-label">FIM</span>
              <input v-model="form.horaFim" type="time" class="ag-input ag-input-time" required />
            </div>
          </div>

          <select v-model="form.modalidade" class="ag-input ag-select">
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>

          <select v-if="form.modalidade === 'presencial'" v-model="form.sala" class="ag-input ag-select">
            <option value="Sala de Reunião">Sala de Reunião</option>
            <option value="Sala do Presidente">Sala do Presidente</option>
            <option value="Sala de Treinamento">Sala de Treinamento</option>
          </select>
          <input v-else v-model="form.linkReuniao" type="url" placeholder="https://meet.google.com/..." class="ag-input" />

          <div class="ag-preata-wrap">
            <textarea v-model="form.preAta" rows="3" placeholder="Pré-Ata / Pauta da Reunião (opcional)" maxlength="600" class="ag-input ag-textarea"></textarea>
            <span :class="['ag-char-count', form.preAta.length > 550 ? 'ag-char-red' : form.preAta.length > 450 ? 'ag-char-yellow' : '']">
              {{ form.preAta.length }} / 600
            </span>
          </div>

          <!-- Participantes -->
          <div>
            <p class="ag-label" style="margin-bottom:.5rem">Participantes</p>
            <div class="ag-chips-area" @click="dropdownAberto = !dropdownAberto">
              <span v-if="form.participanteIds.length === 0" class="ag-chips-placeholder">Clique para selecionar...</span>
              <span v-for="id in form.participanteIds" :key="id" class="ag-part-chip">
                {{ nomeParticipante(id) }}
                <button type="button" @click.stop="removerParticipante(id)" class="ag-part-chip-del">×</button>
              </span>
            </div>
            <div v-if="dropdownAberto" class="ag-dropdown">
              <label v-for="u in usuarios" :key="u.id" class="ag-dropdown-item">
                <input type="checkbox" :value="u.id" v-model="form.participanteIds" class="ag-checkbox" />
                <span>{{ u.nome }}</span>
              </label>
            </div>
          </div>

          <button type="submit" :disabled="enviando" class="ag-btn-agendar">
            {{ enviando ? 'Aguarde...' : 'Confirmar Agendamento' }}
          </button>
        </form>

        <!-- PAINEL LISTA -->
        <div class="ag-painel">

          <!-- Tabs -->
          <div class="ag-tabs">
            <button :class="['ag-tab', abaAtiva === 'proximos' ? 'ag-tab-ativo' : '']" @click="trocarAba('proximos')">Próximos</button>
            <button :class="['ag-tab', abaAtiva === 'historico' ? 'ag-tab-ativo' : '']" @click="trocarAba('historico')">Histórico</button>
          </div>

          <!-- Filtros -->
          <div v-if="abaAtiva === 'historico'" class="ag-filtros-bar">
            <button @click="filtrosAbertos = !filtrosAbertos" class="ag-filtros-toggle">
              <svg :style="{ transform: filtrosAbertos ? 'rotate(90deg)' : '', transition: 'transform .2s' }" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Filtros
            </button>
            <button v-if="temFiltroAtivo" @click="limparFiltros" class="ag-filtros-limpar">× Limpar</button>
          </div>
          <div v-if="abaAtiva === 'historico' && filtrosAbertos" class="ag-filtros-corpo">
            <div class="ag-filtros-grid">
              <div>
                <label class="ag-label" style="display:block;margin-bottom:.25rem">De</label>
                <input v-model="filtros.dataInicio" type="date" @change="aplicarFiltros" class="ag-input ag-input-sm" />
              </div>
              <div>
                <label class="ag-label" style="display:block;margin-bottom:.25rem">Até</label>
                <input v-model="filtros.dataFim" type="date" @change="aplicarFiltros" class="ag-input ag-input-sm" />
              </div>
              <div>
                <label class="ag-label" style="display:block;margin-bottom:.25rem">Status</label>
                <select v-model="filtros.status" @change="aplicarFiltros" class="ag-input ag-input-sm ag-select">
                  <option value="">Todos</option>
                  <option value="Concluída">Concluída</option>
                  <option value="Cancelada">Cancelada</option>
                  <option value="Em andamento">Em andamento</option>
                  <option value="Agendada">Agendada</option>
                </select>
              </div>
              <div>
                <label class="ag-label" style="display:block;margin-bottom:.25rem">Sala</label>
                <select v-model="filtros.sala" @change="aplicarFiltros" class="ag-input ag-input-sm ag-select">
                  <option value="">Todas</option>
                  <option value="Sala de Reunião">Sala de Reunião</option>
                  <option value="Sala do Presidente">Sala do Presidente</option>
                  <option value="Sala de Treinamento">Sala de Treinamento</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Header lista -->
          <div v-if="abaAtiva === 'proximos'" class="ag-lista-header">
            <span>Horário</span><span>Reunião</span><span style="text-align:center">Status</span><span style="text-align:center">Local</span>
          </div>

          <!-- Lista -->
          <div class="ag-lista-scroll">
            <div v-if="carregando" class="ag-lista-vazia">Carregando...</div>
            <div v-else-if="listaExibida.length === 0" class="ag-lista-vazia">Nenhum agendamento encontrado.</div>

            <!-- Próximos -->
            <template v-else-if="abaAtiva === 'proximos'">
              <div v-for="r in listaExibida" :key="r.id" :class="['ag-card', r.statusDinamico === 'Cancelada' ? 'ag-card-cancelada' : '']">
                <div class="ag-card-row">
                  <div v-if="isAdmin" class="ag-card-check">
                    <input type="checkbox" :value="r.id" v-model="selecionadas" class="ag-checkbox" />
                  </div>
                  <div class="ag-card-hora">
                    <p class="ag-card-data">{{ formatarData(r.data) }}</p>
                    <p class="ag-card-time">{{ r.horaInicio || r.horainicio }}<span class="ag-card-ate">→{{ r.horaFim || r.horafim }}</span></p>
                  </div>
                  <div class="ag-card-info">
                    <p :class="['ag-card-titulo', r.statusDinamico === 'Cancelada' ? 'ag-strikethrough' : '']">{{ r.titulo }}</p>
                    <p class="ag-card-gestor">{{ r.gestor }}</p>
                  </div>
                  <div class="ag-card-right">
                    <span :class="statusClass(r.statusDinamico)">{{ statusLabel(r.statusDinamico) }}</span>
                    <a v-if="r.modalidade === 'online' && r.link_reuniao" :href="r.link_reuniao" target="_blank" class="ag-link-online">Online ↗</a>
                    <span v-else-if="r.modalidade === 'online'" class="ag-text-muted" style="font-size:.7rem">Online</span>
                    <span v-else class="ag-text-muted ag-truncate" style="font-size:.7rem;max-width:70px" :title="r.sala">{{ r.sala || 'Sala de Reunião' }}</span>
                  </div>
                  <div class="ag-card-acoes">
                    <button v-if="r.pre_ata" @click="togglePreAta(r.id)" class="ag-acao-btn">
                      <svg :style="{ transform: pautasAbertas.has(r.id) ? 'rotate(90deg)' : '', transition: 'transform .2s' }" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <span v-else style="width:24px;flex-shrink:0"></span>
                    <span v-if="r.confirmados > 0" class="ag-confirmados">✓{{ r.confirmados }}</span>
                    <button v-if="isAdmin && (r.statusDinamico === 'Agendada' || r.statusDinamico === 'Em andamento')"
                      @click="solicitarCancelamento(r.id, r.titulo)" class="ag-acao-btn ag-acao-cancel">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                    <button v-if="isAdmin" @click="confirmarExclusao(r.id, r.titulo)" class="ag-acao-btn ag-acao-del">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div v-if="pautasAbertas.has(r.id)" class="ag-preata-box">
                  <p class="ag-preata-text">{{ r.pre_ata }}</p>
                </div>

                <div v-if="r.participantesNomes && r.participantesNomes.length > 0" class="ag-participantes">
                  <span v-for="pInfo in r.participantesNomes" :key="pInfo"
                    :class="['ag-part-tag', pInfo.endsWith(':recusado') ? 'ag-part-recusado' : '']">
                    {{ pInfo.split(':')[0] }}
                  </span>
                </div>

                <div v-if="r.statusDinamico === 'Cancelada' && r.motivo_cancelamento" class="ag-motivo">
                  Motivo: {{ r.motivo_cancelamento }}
                </div>
              </div>
            </template>

            <!-- Histórico -->
            <template v-else>
              <div v-for="r in listaExibida" :key="r.id" class="ag-hist-card">
                <div class="ag-hist-row">
                  <div v-if="isAdmin" style="flex-shrink:0">
                    <input type="checkbox" :value="r.id" v-model="selecionadas" class="ag-checkbox" />
                  </div>
                  <div class="ag-card-info">
                    <p :class="['ag-card-titulo', r.statusDinamico === 'Cancelada' ? 'ag-strikethrough ag-opacity-60' : '']">{{ r.titulo }}</p>
                    <p class="ag-card-gestor" style="font-family:var(--font-mono)">
                      {{ formatarData(r.data) }} · {{ r.horaInicio || r.horainicio }}→{{ r.horaFim || r.horafim }}
                      · {{ r.modalidade === 'online' ? 'Online' : (r.sala || 'Sala de Reunião') }}
                    </p>
                  </div>
                  <span :class="histBadgeClass(r.statusDinamico)">{{ r.statusDinamico }}</span>
                </div>
                <div v-if="r.statusDinamico === 'Cancelada' && r.motivo_cancelamento" class="ag-motivo" style="padding: 0 1rem .75rem">
                  Motivo: {{ r.motivo_cancelamento }}
                </div>
              </div>
            </template>
          </div>

          <!-- Barra de lote -->
          <div v-if="selecionadas.length > 0 && isAdmin" class="ag-barra-lote">
            <span class="ag-lote-count">{{ selecionadas.length }} selecionada(s)</span>
            <div class="ag-lote-sep"></div>
            <button @click="cancelarSelecionadas" class="ag-lote-btn">Cancelar</button>
            <button @click="apagarSelecionadas" class="ag-lote-btn ag-lote-del">Apagar</button>
          </div>
        </div>
      </div>

      <!-- RODAPÉ: analytics + admin numa linha -->
      <div class="ag-bottom-grid">
        <div class="ag-bottom-card">
          <p class="ag-label">Mais Agendamentos</p>
          <p class="ag-analytics-nome">{{ topQtdNome }}</p>
          <p class="ag-analytics-val ag-val-azul">{{ topQtdValor }}</p>
        </div>
        <div class="ag-bottom-card">
          <p class="ag-label">Maior Tempo de Uso</p>
          <p class="ag-analytics-nome">{{ topTempoNome }}</p>
          <p class="ag-analytics-val ag-val-azul">{{ topTempoValor }}</p>
        </div>
        <div v-if="isAdmin" class="ag-bottom-card">
          <p class="ag-label">Admin — Limpeza</p>
          <p class="ag-admin-desc">Apaga reuniões com status <strong>Concluída</strong>.</p>
          <button @click="apagarConcluidas" class="ag-btn-admin ag-btn-danger">Apagar Histórico Concluído</button>
        </div>
        <div v-if="isAdmin" class="ag-bottom-card">
          <div class="ag-admin-notion-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text-2)">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z"/>
            </svg>
            <p class="ag-label">Notion</p>
            <span :class="['ag-notion-badge', notionAtivo ? 'ag-notion-on' : 'ag-notion-off']">
              {{ notionAtivo ? '● Ativo' : '● Off' }}
            </span>
          </div>
          <p class="ag-admin-desc">Sincroniza reuniões futuras com o Notion.</p>
          <button @click="sincronizarNotion" :disabled="!notionAtivo || sincronizando" class="ag-btn-admin ag-btn-notion">
            {{ sincronizando ? 'Sincronizando...' : 'Sincronizar Notion' }}
          </button>
        </div>
      </div>

    </div>

    <!-- MODAL -->
    <Teleport to="body">
      <div v-if="modal.show" class="ag-modal-overlay" @click.self="fecharModal">
        <div class="ag-modal-card">
          <div class="ag-modal-top">
            <div :class="['ag-modal-icon', `ag-modal-icon-${modal.tipo}`]">{{ modalIcon }}</div>
            <div class="ag-modal-body">
              <p class="ag-modal-titulo">{{ modal.titulo }}</p>
              <p class="ag-modal-msg">{{ modal.mensagem }}</p>
              <textarea v-if="modal.comMotivo" v-model="modal.motivo" rows="2" maxlength="300"
                placeholder="Motivo (opcional)" class="ag-input ag-textarea ag-modal-motivo"></textarea>
            </div>
            <button @click="fecharModal" class="ag-modal-close">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div v-if="modal.onConfirmar" class="ag-modal-btns">
            <button @click="fecharModal" class="ag-modal-btn-cancel">Não</button>
            <button @click="executarConfirmacao" :class="['ag-modal-btn-ok', `ag-modal-btn-${modal.tipo}`]">{{ modal.btnTexto }}</button>
          </div>
          <div v-if="modal.autoClose" class="ag-modal-progress">
            <div :class="['ag-modal-bar', `ag-bar-${modal.tipo}`]"></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuth } from '../composables/useAuth'

const { user } = useAuth()
const isAdmin = computed(() => user.value?.perfil === 'gestor')

const API = '/bdr/api/v1/agenda'

function authHeaders() {
  const token = localStorage.getItem('bdr_token')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// ── Estado ────────────────────────────────────────────────────
const salas = ref<any[]>([])
const reuniaoOnlineAtiva = ref<any>(null)
const reunioesHoje = ref<number | null>(null)
const pendentes = ref<number | null>(null)
const reservas = ref<any[]>([])
const historico = ref<any[]>([])
const usuarios = ref<any[]>([])
const topQtdNome = ref('—')
const topQtdValor = ref('—')
const topTempoNome = ref('—')
const topTempoValor = ref('—')
const notionAtivo = ref(false)
const abaAtiva = ref<'proximos' | 'historico'>('proximos')
const carregando = ref(false)
const enviando = ref(false)
const sincronizando = ref(false)
const dropdownAberto = ref(false)
const filtrosAbertos = ref(false)
const selecionadas = ref<number[]>([])
const pautasAbertas = ref(new Set<number>())

const hoje = new Date().toISOString().split('T')[0]

const form = ref({
  titulo: '', data: hoje, horaInicio: '', horaFim: '',
  modalidade: 'presencial', sala: 'Sala de Reunião',
  linkReuniao: '', preAta: '', participanteIds: [] as number[],
})

const filtros = ref({ dataInicio: '', dataFim: '', status: '', sala: '' })

const modal = ref<any>({
  show: false, titulo: '', mensagem: '', tipo: 'info',
  autoClose: false, onConfirmar: null, btnTexto: '', btnClass: '',
  comMotivo: false, motivo: '',
})

// ── Computed ──────────────────────────────────────────────────
const todasSalasLivres = computed(() => salas.value.every(s => s.livre))

const bannerTitulo = computed(() => {
  if (todasSalasLivres.value) return 'SALAS LIVRES'
  const qtd = salas.value.filter(s => !s.livre).length
  return qtd === salas.value.length ? 'SALAS OCUPADAS' : `${qtd} SALA${qtd > 1 ? 'S' : ''} OCUPADA${qtd > 1 ? 'S' : ''}`
})

const statusSalasTexto = computed(() => {
  const total = salas.value.length
  if (total === 0) return todasSalasLivres.value ? 'Disponível' : 'Ocupada'
  const livres = salas.value.filter(s => s.livre).length
  return todasSalasLivres.value ? `${livres}/${total} Livres` : `${total - livres}/${total} Ocupada${total - livres > 1 ? 's' : ''}`
})

const reuniaoAtivaTexto = computed(() => {
  const ocupada = salas.value.find(s => !s.livre)
  if (ocupada?.reservaAtiva) return ocupada.reservaAtiva.titulo
  if (reuniaoOnlineAtiva.value) return `🟣 ${reuniaoOnlineAtiva.value.titulo}`
  return 'Nenhuma'
})

const listaExibida = computed(() => {
  if (abaAtiva.value === 'proximos') return reservas.value
  let h = historico.value
  if (filtros.value.dataInicio) h = h.filter(r => r.data >= filtros.value.dataInicio)
  if (filtros.value.dataFim) h = h.filter(r => r.data <= filtros.value.dataFim)
  if (filtros.value.status) h = h.filter(r => r.statusDinamico === filtros.value.status)
  if (filtros.value.sala) {
    if (filtros.value.sala === 'online') h = h.filter(r => r.modalidade === 'online')
    else h = h.filter(r => r.modalidade === 'presencial' && (r.sala || 'Sala de Reunião') === filtros.value.sala)
  }
  return h
})

const temFiltroAtivo = computed(() => Object.values(filtros.value).some(v => v !== ''))

const modalIcon = computed(() => {
  const i: Record<string, string> = { erro: '✕', sucesso: '✓', aviso: '!', info: 'i' }
  return i[modal.value.tipo] || 'i'
})

// ── Helpers ───────────────────────────────────────────────────
function formatarData(iso: string): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function nomeParticipante(id: number): string {
  return usuarios.value.find(u => u.id === id)?.nome || String(id)
}

function removerParticipante(id: number) {
  form.value.participanteIds = form.value.participanteIds.filter(pid => pid !== id)
}

function togglePreAta(id: number) {
  const s = new Set(pautasAbertas.value)
  s.has(id) ? s.delete(id) : s.add(id)
  pautasAbertas.value = s
}

function statusClass(s: string): string {
  const m: Record<string, string> = {
    'Concluída': 'ag-status-concluida',
    'Em andamento': 'ag-status-ativo',
    'Agendada': 'ag-status-agendada',
    'Cancelada': 'ag-status-cancelada',
  }
  return m[s] || 'ag-status-agendada'
}

function statusLabel(s: string): string {
  return s === 'Em andamento' ? '● Ativo' : s
}

function histBadgeClass(s: string): string {
  const m: Record<string, string> = {
    'Concluída': 'ag-badge ag-badge-concluida',
    'Cancelada': 'ag-badge ag-badge-cancelada',
    'Em andamento': 'ag-badge ag-badge-ativo',
    'Agendada': 'ag-badge ag-badge-agendada',
  }
  return m[s] || 'ag-badge ag-badge-concluida'
}

// ── Modal ─────────────────────────────────────────────────────
function mostrarModal(tipo: string, mensagem: string, autoClose = false) {
  const titulos: Record<string, string> = { erro: 'Erro', sucesso: 'Sucesso', aviso: 'Atenção', info: 'Info' }
  modal.value = { show: true, tipo, titulo: titulos[tipo] || 'Info', mensagem, autoClose, onConfirmar: null, btnTexto: '', btnClass: '', comMotivo: false, motivo: '' }
  if (autoClose) setTimeout(fecharModal, 2600)
}

function fecharModal() {
  modal.value.show = false
  modal.value.onConfirmar = null
  modal.value.motivo = ''
}

function executarConfirmacao() {
  const fn = modal.value.onConfirmar
  const motivo = modal.value.motivo
  fecharModal()
  if (fn) fn(motivo)
}

function confirmarAcao(tipo: string, mensagem: string, btnTexto: string, onConfirmar: Function, comMotivo = false) {
  mostrarModal(tipo, mensagem)
  modal.value.onConfirmar = onConfirmar
  modal.value.btnTexto = btnTexto
  modal.value.comMotivo = comMotivo
}

// ── API ───────────────────────────────────────────────────────
async function carregarStatus() {
  try {
    const res = await fetch(`${API}/status`, { headers: authHeaders() })
    if (res.status === 401) return
    const data = await res.json()
    salas.value = data.salas || []
    reuniaoOnlineAtiva.value = data.reuniaoOnlineAtiva || null
    reunioesHoje.value = data.reunioesHoje
    pendentes.value = data.pendentes
  } catch {}
}

async function carregarReservas() {
  carregando.value = true
  try {
    const res = await fetch(`${API}/reservas`, { headers: authHeaders() })
    if (!res.ok) return
    reservas.value = await res.json()
  } catch {} finally { carregando.value = false }
}

async function carregarHistorico() {
  carregando.value = true
  try {
    const res = await fetch(`${API}/historico`, { headers: authHeaders() })
    if (!res.ok) return
    historico.value = await res.json()
  } catch {} finally { carregando.value = false }
}

async function carregarUsuarios() {
  try {
    const res = await fetch(`${API}/usuarios`, { headers: authHeaders() })
    if (!res.ok) return
    usuarios.value = await res.json()
  } catch {}
}

async function carregarAnalytics() {
  try {
    const res = await fetch(`${API}/estatisticas`, { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json()
    const topQtd = data.rankingQuantidade?.[0]
    if (topQtd) { topQtdNome.value = topQtd.nome; topQtdValor.value = `${topQtd.totalReservas} reserva${topQtd.totalReservas !== 1 ? 's' : ''}` }
    const topTempo = data.rankingTempo?.[0]
    if (topTempo) {
      const h = Math.floor(topTempo.totalMinutos / 60), m = topTempo.totalMinutos % 60
      topTempoNome.value = topTempo.nome
      topTempoValor.value = `${h > 0 ? h + 'h ' : ''}${m}min de uso`
    }
  } catch {}
}

async function carregarNotionStatus() {
  if (!isAdmin.value) return
  try {
    const res = await fetch(`${API}/notion/status`, { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json()
    notionAtivo.value = data.configurado
  } catch {}
}

function recarregarTudo() {
  carregarStatus(); carregarAnalytics()
  if (abaAtiva.value === 'proximos') carregarReservas(); else carregarHistorico()
}

// ── Agendar ───────────────────────────────────────────────────
async function agendarReuniao() {
  enviando.value = true
  try {
    const body = {
      titulo: form.value.titulo, data: form.value.data,
      horaInicio: form.value.horaInicio, horaFim: form.value.horaFim,
      modalidade: form.value.modalidade,
      sala: form.value.modalidade === 'presencial' ? form.value.sala : null,
      link_reuniao: form.value.modalidade === 'online' ? form.value.linkReuniao : null,
      pre_ata: form.value.preAta || null, participanteIds: form.value.participanteIds,
    }
    const res = await fetch(`${API}/reservas`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) {
      mostrarModal(data.tipoConflito === 'participante' ? 'aviso' : 'erro', data.mensagem || 'Erro ao criar reserva.')
    } else {
      mostrarModal('sucesso', data.mensagem, true)
      form.value = { titulo: '', data: hoje, horaInicio: '', horaFim: '', modalidade: 'presencial', sala: 'Sala de Reunião', linkReuniao: '', preAta: '', participanteIds: [] }
      dropdownAberto.value = false
      recarregarTudo()
    }
  } catch { mostrarModal('erro', 'Erro ao conectar com o servidor.') }
  finally { enviando.value = false }
}

// ── Cancelar/Excluir ──────────────────────────────────────────
function solicitarCancelamento(id: number, titulo: string) {
  confirmarAcao('aviso', `Cancelar a reunião "${titulo}"?`, 'Sim, cancelar',
    async (motivo: string) => {
      try {
        const res = await fetch(`${API}/reservas/${id}/cancelar`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ motivo }) })
        const data = await res.json()
        if (res.ok) { mostrarModal('sucesso', data.mensagem, true); recarregarTudo() }
        else mostrarModal('erro', data.mensagem || 'Erro.')
      } catch { mostrarModal('erro', 'Erro ao conectar.') }
    }, true)
}

function confirmarExclusao(id: number, titulo: string) {
  confirmarAcao('aviso', `Apagar definitivamente "${titulo}"?`, 'Sim, apagar',
    async () => {
      try {
        const res = await fetch(`${API}/reservas/${id}`, { method: 'DELETE', headers: authHeaders() })
        const data = await res.json()
        if (res.ok) { mostrarModal('sucesso', data.mensagem, true); recarregarTudo() }
        else mostrarModal('erro', data.mensagem || 'Erro.')
      } catch { mostrarModal('erro', 'Erro ao conectar.') }
    })
}

function cancelarSelecionadas() {
  const ids = [...selecionadas.value]
  confirmarAcao('aviso', `Cancelar ${ids.length} reunião(ões)?`, 'Sim, cancelar',
    async (motivo: string) => {
      try {
        const res = await fetch(`${API}/reservas/multiplas/cancelar`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ ids, motivo }) })
        const data = await res.json()
        if (res.ok) { mostrarModal('sucesso', data.mensagem, true); selecionadas.value = []; recarregarTudo() }
        else mostrarModal('erro', data.mensagem || 'Erro.')
      } catch { mostrarModal('erro', 'Erro ao conectar.') }
    }, true)
}

function apagarSelecionadas() {
  const ids = [...selecionadas.value]
  confirmarAcao('aviso', `Apagar ${ids.length} reunião(ões)?`, 'Sim, apagar',
    async () => {
      try {
        const res = await fetch(`${API}/reservas/multiplas`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ ids }) })
        const data = await res.json()
        if (res.ok) { mostrarModal('sucesso', data.mensagem, true); selecionadas.value = []; recarregarTudo() }
        else mostrarModal('erro', data.mensagem || 'Erro.')
      } catch { mostrarModal('erro', 'Erro ao conectar.') }
    })
}

function apagarConcluidas() {
  confirmarAcao('aviso', 'Apagar todas as reuniões com status "Concluída"?', 'Sim, apagar',
    async () => {
      try {
        const res = await fetch(`${API}/historico/concluidas`, { method: 'DELETE', headers: authHeaders() })
        const data = await res.json()
        if (res.ok) { mostrarModal('sucesso', data.mensagem, true); recarregarTudo() }
        else mostrarModal('erro', data.mensagem || 'Erro.')
      } catch { mostrarModal('erro', 'Erro ao conectar.') }
    })
}

async function sincronizarNotion() {
  sincronizando.value = true
  try {
    const res = await fetch(`${API}/notion/sync`, { method: 'POST', headers: authHeaders() })
    const data = await res.json()
    mostrarModal(res.ok ? 'sucesso' : 'erro', data.mensagem, res.ok)
  } catch { mostrarModal('erro', 'Erro ao conectar.') }
  finally { sincronizando.value = false }
}

function trocarAba(aba: 'proximos' | 'historico') {
  abaAtiva.value = aba; selecionadas.value = []
  if (aba === 'proximos') carregarReservas(); else carregarHistorico()
}

function aplicarFiltros() { /* computed já filtra */ }
function limparFiltros() { filtros.value = { dataInicio: '', dataFim: '', status: '', sala: '' } }

// ── SSE ───────────────────────────────────────────────────────
let sse: EventSource | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function iniciarSSE() {
  if (sse) { sse.close(); sse = null }
  sse = new EventSource(`${API}/eventos`)
  sse.addEventListener('atualizacao', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => recarregarTudo(), 300)
  })
  sse.onerror = () => console.warn('SSE agenda: conexão perdida')
}

onMounted(async () => {
  await Promise.all([carregarStatus(), carregarReservas(), carregarUsuarios(), carregarAnalytics(), carregarNotionStatus()])
  iniciarSSE()
  const pollingId = setInterval(() => { carregarStatus(); carregarAnalytics() }, 60_000)
  onUnmounted(() => { clearInterval(pollingId); sse?.close() })
})

watch(dropdownAberto, (open) => {
  if (!open) return
  const handler = (e: MouseEvent) => {
    const el = document.querySelector('.ag-chips-area')
    const dd = document.querySelector('.ag-dropdown')
    if (el && dd && !el.contains(e.target as Node) && !dd.contains(e.target as Node)) {
      dropdownAberto.value = false
      document.removeEventListener('click', handler)
    }
  }
  setTimeout(() => document.addEventListener('click', handler), 0)
})
</script>

<style scoped>
.agenda-view { display:flex; flex-direction:column; min-height:0; font-family:var(--font-body); color:var(--text); }

/* helpers */
.ag-label { font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:var(--text-2); }
.ag-truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-strikethrough { text-decoration:line-through; }
.ag-opacity-60 { opacity:.6; }
.ag-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; display:inline-block; }
.ag-dot-verde { background:#34d399; }
.ag-dot-vermelho { background:#f87171; }

/* banner status */
.ag-banner-status { display:flex; align-items:center; gap:.6rem; padding:.35rem 1rem; font-size:.72rem; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.ag-banner-livre { background:rgba(52,211,153,.06); }
.ag-banner-ocupada { background:rgba(248,113,113,.06); }
.ag-banner-titulo { font-weight:800; font-size:.62rem; letter-spacing:.15em; text-transform:uppercase; }
.ag-banner-livre .ag-banner-titulo { color:#34d399; }
.ag-banner-ocupada .ag-banner-titulo { color:#f87171; }
.ag-chips { display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; }
.ag-chip { display:inline-flex; align-items:center; gap:.25rem; padding:.15rem .5rem; border-radius:20px; font-size:.62rem; font-weight:600; border:1px solid; }
.ag-chip-livre { background:rgba(52,211,153,.08); color:#34d399; border-color:rgba(52,211,153,.2); }
.ag-chip-ocup  { background:rgba(248,113,113,.08); color:#f87171; border-color:rgba(248,113,113,.2); }
.ag-chip-dot { width:4px; height:4px; border-radius:50%; display:inline-block; }
.ag-chip-detalhe { opacity:.55; font-weight:400; }

/* banner online */
.ag-banner-online { display:flex; align-items:center; gap:.6rem; padding:.5rem 1rem; border-bottom:1px solid rgba(139,92,246,.25); background:linear-gradient(135deg,rgba(109,40,217,.12) 0%,rgba(139,92,246,.06) 100%); }
.ag-banner-online-icon { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#7c3aed,#06b6d4); flex-shrink:0; }
.ag-banner-online-info { flex:1; min-width:0; }
.ag-banner-online-label { font-size:.6rem; font-weight:800; letter-spacing:.15em; text-transform:uppercase; color:#a78bfa; }
.ag-banner-online-titulo { font-size:.82rem; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-banner-online-gestor { font-size:.6rem; color:rgba(167,139,250,.7); }
.ag-banner-online-btn { flex-shrink:0; display:flex; align-items:center; gap:.35rem; padding:.35rem .8rem; border-radius:6px; font-size:.72rem; font-weight:700; color:#fff; text-decoration:none; background:linear-gradient(135deg,#7c3aed,#06b6d4); }

/* main */
.ag-main { padding:.75rem 1rem; display:flex; flex-direction:column; gap:.65rem; }

/* KPIs */
.ag-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
@media(max-width:700px){ .ag-kpi-grid{ grid-template-columns:repeat(2,1fr); } }
.ag-kpi-cell { padding:.55rem .85rem; }
.ag-kpi-sep { border-right:1px solid var(--border); }
.ag-kpi-row-label { display:flex; align-items:center; gap:.35rem; margin-bottom:.2rem; }
.ag-kpi-val { font-family:var(--font-mono); font-size:.95rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-val-verde    { color:#34d399; }
.ag-val-vermelho { color:#f87171; }
.ag-val-azul     { color:var(--accent); }
.ag-val-amarelo  { color:#fbbf24; }
.ag-val-text     { color:var(--text); }

/* main grid */
.ag-grid { display:grid; grid-template-columns:280px 1fr; gap:.65rem; align-items:start; }
@media(max-width:900px){ .ag-grid{ grid-template-columns:1fr; } }

/* form */
.ag-form { display:flex; flex-direction:column; gap:.4rem; }
.ag-input { background:var(--surface-2); border:1px solid var(--border-2); color:var(--text); border-radius:var(--radius); padding:.42rem .7rem; font-size:.82rem; font-family:var(--font-body); outline:none; transition:border-color .2s,box-shadow .2s; width:100%; box-sizing:border-box; }
.ag-input:focus { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-dim); }
.ag-input::placeholder { color:var(--text-3); }
.ag-select { appearance:auto; color:var(--text); }
.ag-select option { background:var(--surface-2); }
.ag-input-sm { padding:.3rem .55rem; font-size:.78rem; }
.ag-input-time { padding-left:2.2rem; }
.ag-textarea { resize:none; }
.ag-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:.4rem; }
.ag-time-wrap { position:relative; }
.ag-time-label { position:absolute; left:.55rem; top:50%; transform:translateY(-50%); font-size:.6rem; font-weight:700; color:var(--text-2); pointer-events:none; }
.ag-preata-wrap { position:relative; }
.ag-char-count { position:absolute; bottom:.3rem; right:.45rem; font-family:var(--font-mono); font-size:.6rem; color:var(--text-3); }
.ag-char-red { color:#f87171; font-weight:700; }
.ag-char-yellow { color:#fbbf24; }

/* participantes */
.ag-chips-area { display:flex; flex-wrap:wrap; gap:.3rem; min-height:30px; padding:.35rem .55rem; border-radius:var(--radius); border:1px solid var(--border-2); background:var(--surface-2); cursor:pointer; }
.ag-chips-placeholder { font-size:.78rem; color:var(--text-3); align-self:center; }
.ag-part-chip { display:inline-flex; align-items:center; gap:.2rem; font-size:.68rem; font-weight:600; padding:.12rem .45rem; border-radius:20px; background:rgba(0,240,255,.08); color:var(--accent); border:1px solid rgba(0,240,255,.18); }
.ag-part-chip-del { background:none; border:none; cursor:pointer; color:var(--accent); font-size:.85rem; font-weight:700; padding:0; line-height:1; }
.ag-dropdown { max-height:150px; overflow-y:auto; border:1px solid var(--border-2); border-top:none; border-radius:0 0 var(--radius) var(--radius); background:var(--surface); z-index:20; }
.ag-dropdown-item { display:flex; align-items:center; gap:.5rem; padding:.4rem .7rem; cursor:pointer; font-size:.82rem; color:var(--text); }
.ag-dropdown-item:hover { background:var(--surface-2); }
.ag-checkbox { width:14px; height:14px; cursor:pointer; accent-color:var(--accent); }
.ag-btn-agendar { padding:.5rem 1rem; border-radius:var(--radius); border:none; font-size:.72rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; cursor:pointer; background:linear-gradient(to right,#2563eb,#06b6d4); transition:opacity .2s,transform .15s; }
.ag-btn-agendar:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
.ag-btn-agendar:disabled { opacity:.4; cursor:not-allowed; }

/* painel lista */
.ag-painel { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; display:flex; flex-direction:column; position:relative; }
.ag-tabs { display:flex; border-bottom:1px solid var(--border); }
.ag-tab { flex:1; padding:.45rem; background:none; border:none; border-bottom:2px solid transparent; font-family:var(--font-body); font-size:.68rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--text-2); cursor:pointer; transition:all .2s; }
.ag-tab:hover { background:var(--surface-2); color:var(--text); }
.ag-tab-ativo { color:var(--accent); border-bottom-color:var(--accent); background:rgba(0,240,255,.04); }

/* filtros */
.ag-filtros-bar { display:flex; align-items:center; justify-content:space-between; padding:.3rem .65rem; border-bottom:1px solid var(--border); }
.ag-filtros-toggle { display:flex; align-items:center; gap:.35rem; background:none; border:none; cursor:pointer; font-size:.65rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); padding:.2rem .45rem; border-radius:var(--radius); transition:color .2s,background .2s; }
.ag-filtros-toggle:hover { color:var(--accent); background:var(--accent-dim); }
.ag-filtros-limpar { background:none; border:none; cursor:pointer; font-size:.68rem; font-weight:600; color:var(--accent); }
.ag-filtros-corpo { padding:.6rem; border-bottom:1px solid var(--border); background:var(--surface-2); }
.ag-filtros-grid { display:grid; grid-template-columns:1fr 1fr; gap:.4rem; }

/* lista */
.ag-lista-header { display:grid; grid-template-columns:72px 1fr 75px 75px; gap:.4rem; padding:.3rem .65rem; background:var(--surface-2); border-bottom:1px solid var(--border); font-size:.6rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--text-2); }
.ag-lista-scroll { flex:1; overflow-y:auto; height:290px; }
.ag-lista-vazia { text-align:center; padding:2rem 1rem; color:var(--text-2); font-size:.82rem; }

/* cards */
.ag-card { border-bottom:1px solid var(--border); transition:background .2s; }
.ag-card:hover { background:var(--surface-2); }
.ag-card-cancelada { opacity:.6; }
.ag-card-row { display:flex; align-items:center; gap:.4rem; padding:.4rem .65rem; }
.ag-card-check { flex-shrink:0; width:18px; }
.ag-card-hora { width:68px; flex-shrink:0; }
.ag-card-data { font-size:.62rem; color:var(--text-2); font-family:var(--font-mono); line-height:1; }
.ag-card-time { font-size:.75rem; font-weight:700; color:var(--accent); line-height:1.3; margin-top:.1rem; }
.ag-card-ate { color:var(--text-2); font-weight:400; font-size:.62rem; }
.ag-card-info { flex:1; min-width:0; }
.ag-card-titulo { font-size:.82rem; font-weight:600; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.3; }
.ag-card-gestor { font-size:.62rem; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-card-right { flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end; gap:.1rem; min-width:56px; text-align:right; }
.ag-card-acoes { flex-shrink:0; display:flex; align-items:center; gap:.1rem; margin-left:.2rem; }
.ag-acao-btn { width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:var(--radius); border:none; background:none; color:var(--text-3); cursor:pointer; transition:all .2s; flex-shrink:0; }
.ag-acao-btn:hover { background:var(--surface-3); color:var(--text-2); }
.ag-acao-cancel:hover { color:#fb923c; }
.ag-acao-del:hover { color:var(--error); }
.ag-confirmados { font-size:.62rem; color:#34d399; display:flex; align-items:center; gap:.15rem; flex-shrink:0; }
.ag-link-online { font-size:.65rem; font-weight:700; color:#a78bfa; text-decoration:none; }
.ag-link-online:hover { text-decoration:underline; }

/* status */
.ag-status-concluida  { font-size:.65rem; font-weight:600; color:var(--text-2); }
.ag-status-ativo      { font-size:.65rem; font-weight:700; color:#34d399; animation:ag-pulse 1.5s infinite; }
.ag-status-agendada   { font-size:.65rem; font-weight:600; color:var(--accent); }
.ag-status-cancelada  { font-size:.65rem; font-weight:600; color:#f87171; text-decoration:line-through; }
@keyframes ag-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

/* pré-ata / participantes / motivo */
.ag-preata-box { padding:.3rem .65rem .4rem; }
.ag-preata-text { font-size:.75rem; color:var(--text-2); line-height:1.5; white-space:pre-wrap; background:var(--surface-3); border-left:2px solid var(--accent); border-radius:var(--radius); padding:.4rem .65rem; }
.ag-participantes { display:flex; flex-wrap:wrap; gap:.25rem; padding:0 .65rem .4rem; }
.ag-part-tag { font-size:.62rem; font-weight:600; padding:.12rem .4rem; border-radius:20px; background:rgba(0,240,255,.07); color:var(--accent); border:1px solid rgba(0,240,255,.13); }
.ag-part-recusado { background:rgba(248,113,113,.07); color:#f87171; border-color:rgba(248,113,113,.18); text-decoration:line-through; opacity:.7; }
.ag-motivo { padding:0 .65rem .4rem; font-size:.68rem; color:#f87171; font-style:italic; opacity:.75; }

/* histórico */
.ag-hist-card { border-bottom:1px solid var(--border); transition:background .2s; }
.ag-hist-card:hover { background:var(--surface-2); }
.ag-hist-row { display:flex; align-items:center; gap:.6rem; padding:.4rem .85rem; }
.ag-badge { font-size:.65rem; font-weight:600; padding:.15rem .5rem; border-radius:20px; flex-shrink:0; }
.ag-badge-concluida { background:var(--surface-3); color:var(--text-2); }
.ag-badge-cancelada { background:rgba(248,113,113,.1); color:#f87171; text-decoration:line-through; }
.ag-badge-ativo     { background:rgba(52,211,153,.1); color:#34d399; }
.ag-badge-agendada  { background:rgba(0,240,255,.07); color:var(--accent); }

/* barra de lote */
.ag-barra-lote { position:absolute; bottom:.6rem; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:.6rem; background:var(--surface-3); border:1px solid var(--border-2); padding:.4rem .85rem; border-radius:20px; box-shadow:0 4px 20px rgba(0,0,0,.4); z-index:10; white-space:nowrap; }
.ag-lote-count { font-size:.75rem; font-weight:700; color:var(--text); }
.ag-lote-sep { width:1px; height:12px; background:var(--border-2); }
.ag-lote-btn { background:none; border:none; cursor:pointer; font-size:.75rem; font-weight:700; color:var(--text-2); transition:color .2s; font-family:var(--font-body); }
.ag-lote-btn:hover { color:#fb923c; }
.ag-lote-del:hover { color:var(--error); }

/* rodapé compacto: analytics + admin numa linha de 4 colunas */
.ag-bottom-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:.65rem; }
@media(max-width:1100px){ .ag-bottom-grid{ grid-template-columns:1fr 1fr; } }
@media(max-width:600px){  .ag-bottom-grid{ grid-template-columns:1fr; } }

.ag-bottom-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:.6rem .85rem; display:flex; flex-direction:column; gap:.25rem; }
.ag-analytics-nome { font-family:var(--font-display); font-size:.8rem; font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-analytics-val  { font-size:.72rem; font-family:var(--font-mono); }

.ag-admin-notion-header { display:flex; align-items:center; gap:.35rem; }
.ag-notion-badge { margin-left:auto; font-size:.58rem; font-weight:700; padding:.15rem .45rem; border-radius:20px; }
.ag-notion-on  { background:rgba(52,211,153,.1); color:#34d399; }
.ag-notion-off { background:var(--surface-3); color:var(--text-3); }
.ag-admin-desc { font-size:.72rem; color:var(--text-2); line-height:1.45; flex:1; }
.ag-btn-admin { width:100%; padding:.4rem; border-radius:var(--radius); font-size:.68rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; cursor:pointer; border:1px solid; transition:all .2s; font-family:var(--font-body); background:none; margin-top:auto; }
.ag-btn-danger { color:var(--error); border-color:rgba(255,42,95,.22); }
.ag-btn-danger:hover { background:var(--error-bg); }
.ag-btn-notion { color:#a78bfa; border-color:rgba(167,139,250,.22); }
.ag-btn-notion:hover:not(:disabled) { background:rgba(167,139,250,.07); }
.ag-btn-notion:disabled { opacity:.35; cursor:not-allowed; }

/* modal */
.ag-modal-overlay { position:fixed; inset:0; z-index:500; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.65); backdrop-filter:blur(4px); }
.ag-modal-card { width:100%; max-width:360px; margin:1rem; background:var(--surface); border:1px solid var(--border-2); border-radius:10px; padding:1.1rem; box-shadow:0 20px 60px rgba(0,0,0,.5); }
.ag-modal-top { display:flex; gap:.65rem; align-items:flex-start; }
.ag-modal-icon { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.9rem; font-weight:700; flex-shrink:0; }
.ag-modal-icon-erro    { background:rgba(255,42,95,.15); color:var(--error); }
.ag-modal-icon-sucesso { background:rgba(52,211,153,.15); color:#34d399; }
.ag-modal-icon-aviso   { background:rgba(251,191,36,.15); color:#fbbf24; }
.ag-modal-icon-info    { background:rgba(0,240,255,.1); color:var(--accent); }
.ag-modal-body { flex:1; min-width:0; }
.ag-modal-titulo { font-weight:700; font-size:.88rem; color:var(--text); margin-bottom:.25rem; }
.ag-modal-msg { font-size:.8rem; color:var(--text-2); line-height:1.5; }
.ag-modal-motivo { margin-top:.65rem; }
.ag-modal-close { background:none; border:none; cursor:pointer; color:var(--text-2); padding:2px; border-radius:var(--radius); transition:color .2s; flex-shrink:0; }
.ag-modal-close:hover { color:var(--text); }
.ag-modal-btns { display:flex; gap:.4rem; justify-content:flex-end; margin-top:.85rem; }
.ag-modal-btn-cancel { padding:.4rem .9rem; border-radius:var(--radius); border:1px solid var(--border-2); background:var(--surface-2); color:var(--text-2); cursor:pointer; font-size:.78rem; font-weight:600; font-family:var(--font-body); transition:all .2s; }
.ag-modal-btn-cancel:hover { color:var(--text); }
.ag-modal-btn-ok { padding:.4rem .9rem; border-radius:var(--radius); border:none; color:#fff; cursor:pointer; font-size:.78rem; font-weight:700; font-family:var(--font-body); transition:opacity .2s; }
.ag-modal-btn-ok:hover { opacity:.85; }
.ag-modal-btn-aviso  { background:#f59e0b; }
.ag-modal-btn-erro   { background:var(--error); }
.ag-modal-btn-sucesso{ background:#059669; }
.ag-modal-btn-info   { background:var(--accent); color:#000; }
.ag-modal-progress { margin-top:.85rem; height:2px; background:var(--surface-3); border-radius:2px; overflow:hidden; }
.ag-modal-bar { height:100%; border-radius:2px; animation:ag-shrink 2.5s linear forwards; }
.ag-bar-sucesso{ background:#34d399; }
.ag-bar-erro   { background:var(--error); }
.ag-bar-aviso  { background:#fbbf24; }
.ag-bar-info   { background:var(--accent); }
@keyframes ag-shrink { from{width:100%} to{width:0%} }
</style>
