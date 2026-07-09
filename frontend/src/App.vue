<template>
  <LoginView v-if="!isAuthenticated" @login-success="() => {}" />

  <div v-else class="app">
    <!-- ── Header com navbar integrada ── -->
    <header class="app-header">
      <div class="header-inner">

        <!-- Logo -->
        <div class="logo">
          <div class="logo-mark">
            <svg width="28" height="30" viewBox="0 -4 32 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pg_bars" x1="0" y1="30" x2="16" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stop-color="#0080b8"/>
                  <stop offset="100%" stop-color="#00f0ff"/>
                </linearGradient>
                <linearGradient id="pg_coin" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
                  <stop offset="0%"   stop-color="#d4ff40"/>
                  <stop offset="100%" stop-color="#c7ff00"/>
                </linearGradient>
                <filter id="pg_glow">
                  <feGaussianBlur stdDeviation="1.5" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <rect x="0"  y="20" width="8"  height="10" rx="2" fill="url(#pg_bars)" opacity="0.55"/>
              <rect x="10" y="13" width="8"  height="17" rx="2" fill="url(#pg_bars)" opacity="0.78"/>
              <rect x="20" y="4"  width="8"  height="26" rx="2" fill="url(#pg_bars)"/>
              <path d="M4 19.5 L14 12.5 L24 3.5" stroke="white" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="1.5 2" opacity="0.45"/>
              <circle cx="24" cy="1.8" r="3.5" fill="url(#pg_coin)" filter="url(#pg_glow)"/>
              <path d="M22.5 1.8 L23.7 3 L25.7 0.6" stroke="#4a6500" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="logo-text-wrap">
            <span class="logo-title">CANAÃ</span>
            <span class="logo-sub">PERFORMANCE</span>
          </div>
        </div>

        <!-- Navegação central -->
        <nav class="header-nav">
          <!-- Grupo Performance (oculto para estoque) -->
          <div v-if="!isEstoque" class="nav-group">
            <span class="nav-group-label">Performance</span>
            <div class="nav-items">
              <button v-if="!isCS && !isCampo" :class="['nav-btn', { active: tab === 'vendas' }]" @click="tab = 'vendas'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M3 10L6 7L9 11L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Vendas</span>
              </button>
              <button v-if="!isCampo" :class="['nav-btn', { active: tab === 'comissao' }]" @click="tab = 'comissao'">
                <span class="nav-icon-text">$</span>
                <span>Comissões</span>
              </button>
              <button v-if="isCampo || isGestor" :class="['nav-btn', { active: tab === 'comissao-campo' }]" @click="tab = 'comissao-campo'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 11V5l5-3 5 3v6M5 15v-4h5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Campo</span>
              </button>
              <button v-if="!isCS && !isCampo" :class="['nav-btn', { active: tab === 'form' }]" @click="tab = 'form'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 3h11M2 7h11M2 11h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <span>Registro BDR</span>
              </button>
              <button v-if="!isCS && !isCampo" :class="['nav-btn', { active: tab === 'bdr-dash' }]" @click="tab = 'bdr-dash'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 11l3-4 3 2 3-5 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="1" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>Dashboard BDR</span>
              </button>
              <button v-if="!isCampo" :class="['nav-btn', { active: tab === 'retencao' }]" @click="tab = 'retencao'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" stroke="currentColor" stroke-width="1.5"/><path d="M5 7.5l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Retenção</span>
              </button>
              <button :class="['nav-btn', { active: tab === 'diagnostico' }]" @click="tab = 'diagnostico'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M1 8h2.3l1.4-3.6 2.3 7.2 1.4-4.5 1 .9H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Diagnóstico IA</span>
              </button>
            </div>
          </div>

          <!-- Divisor (oculto para estoque) -->
          <div v-if="!isEstoque" class="nav-divider"></div>

          <!-- Grupo Hub (dashboards e administração dele) -->
          <div class="nav-group">
            <span class="nav-group-label">Hub</span>
            <div class="nav-items">
              <button :class="['nav-btn', { active: tab === 'hub' || tab === 'hub-viewer' }]" @click="tab = 'hub'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>Dashboards</span>
              </button>
              <button v-if="isHubAdmin" :class="['nav-btn', { active: tab === 'hub-admin' }]" @click="tab = 'hub-admin'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1z" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 4v3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <span>Administração</span>
              </button>
            </div>
          </div>

          <!-- Divisor -->
          <div class="nav-divider"></div>

          <!-- Grupo Ferramentas (sistemas externos, não são dashboards do Hub) -->
          <div v-if="isGestor || isCampo" class="nav-group">
            <span class="nav-group-label">Ferramentas</span>
            <div class="nav-items">
              <button class="nav-btn" :disabled="abrindoOtdr" @click="abrirOtdr">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M1 5.5a9 9 0 0 1 13 0M3.5 8a5.5 5.5 0 0 1 8 0M6 10.5a2 2 0 0 1 3 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="13" r="1" fill="currentColor"/></svg>
                <span>{{ abrindoOtdr ? 'Abrindo...' : 'OTDR (Rede)' }}</span>
              </button>
              <button v-if="isGestor" :class="['nav-btn', { active: tab === 'sala-reuniao' }]" @click="tab = 'sala-reuniao'">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 12v1.5M10 12v1.5M3.5 13.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 6.5h7M4 8.5h4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></svg>
                <span>Sala de Reunião</span>
              </button>
            </div>
          </div>
        </nav>

        <!-- Direita: relógio + usuário + logout -->
        <div class="header-right">
          <div class="header-clock">
            <span class="clock-date">{{ currentDate }}</span>
            <span class="clock-time">{{ currentTime }}</span>
          </div>
          <div class="user-info">
            <span class="user-name">{{ user?.nome.split(' ')[0] }}</span>
            <span class="user-role">{{ user?.perfil === 'cs' ? 'CS' : user?.perfil === 'campo' ? 'Campo' : user?.perfil }}</span>
          </div>
          <button class="btn-logout" @click="logout" title="Sair">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 10l3-3-3-3M13 7H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <!-- Hamburger (mobile only) -->
          <button class="btn-hamburger" @click="menuOpen = !menuOpen" aria-label="Menu">
            <span :class="['hb-bar', { open: menuOpen }]"></span>
            <span :class="['hb-bar', { open: menuOpen }]"></span>
            <span :class="['hb-bar', { open: menuOpen }]"></span>
          </button>
        </div>
      </div>
    </header>

    <!-- ── Mobile nav drawer ── -->
    <Transition name="backdrop">
      <div v-if="menuOpen" class="mobile-backdrop" @click="menuOpen = false">
        <Transition name="drawer">
          <nav class="mobile-drawer" @click.stop>
            <div class="drawer-header">
              <span class="drawer-title">Menu</span>
              <button class="drawer-close" @click="menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
            </div>

            <div v-if="!isEstoque" class="drawer-group">
              <span class="drawer-group-label">Performance</span>
              <button v-if="!isCS && !isCampo" :class="['drawer-btn', { active: tab === 'vendas' }]" @click="navTo('vendas')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M3 10L6 7L9 11L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Vendas
              </button>
              <button v-if="!isCampo" :class="['drawer-btn', { active: tab === 'comissao' }]" @click="navTo('comissao')">
                <span class="drawer-icon-text">$</span>
                Comissões
              </button>
              <button v-if="isCampo || isGestor" :class="['drawer-btn', { active: tab === 'comissao-campo' }]" @click="navTo('comissao-campo')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 11V5l5-3 5 3v6M5 15v-4h5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Campo
              </button>
              <button v-if="!isCS && !isCampo" :class="['drawer-btn', { active: tab === 'form' }]" @click="navTo('form')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 3h11M2 7h11M2 11h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                Registro BDR
              </button>
              <button v-if="!isCS && !isCampo" :class="['drawer-btn', { active: tab === 'bdr-dash' }]" @click="navTo('bdr-dash')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 11l3-4 3 2 3-5 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="1" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>
                Dashboard BDR
              </button>
              <button v-if="!isCampo" :class="['drawer-btn', { active: tab === 'retencao' }]" @click="navTo('retencao')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" stroke="currentColor" stroke-width="1.5"/><path d="M5 7.5l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Retenção
              </button>
            </div>

            <div class="drawer-group">
              <span class="drawer-group-label">Hub</span>
              <button :class="['drawer-btn', { active: tab === 'hub' || tab === 'hub-viewer' }]" @click="navTo('hub')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
                Dashboards
              </button>
              <button v-if="isHubAdmin" :class="['drawer-btn', { active: tab === 'hub-admin' }]" @click="navTo('hub-admin')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1z" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 4v3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                Administração
              </button>
            </div>

            <div v-if="isGestor || isCampo" class="drawer-group">
              <span class="drawer-group-label">Ferramentas</span>
              <button class="drawer-btn" :disabled="abrindoOtdr" @click="abrirOtdr">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M1 5.5a9 9 0 0 1 13 0M3.5 8a5.5 5.5 0 0 1 8 0M6 10.5a2 2 0 0 1 3 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="13" r="1" fill="currentColor"/></svg>
                {{ abrindoOtdr ? 'Abrindo...' : 'OTDR (Rede)' }}
              </button>
              <button v-if="isGestor" :class="['drawer-btn', { active: tab === 'sala-reuniao' }]" @click="navTo('sala-reuniao')">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 12v1.5M10 12v1.5M3.5 13.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 6.5h7M4 8.5h4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></svg>
                Sala de Reunião
              </button>
            </div>

            <div class="drawer-footer">
              <span class="drawer-user">{{ user?.nome.split(' ')[0] }}</span>
              <span class="drawer-role">{{ user?.perfil }}</span>
            </div>
          </nav>
        </Transition>
      </div>
    </Transition>

    <!-- ── Conteúdo ── -->
    <div class="app-body">
      <main :class="['app-main', { 'app-main--fullscreen': tab === 'hub-viewer' || tab === 'sala-reuniao' }]">
        <Transition name="fade" mode="out-in">
          <section v-if="tab === 'vendas'" key="vendas">
            <VendasView :refresh="refreshTick" />
          </section>

          <section v-else-if="tab === 'comissao'" key="comissao">
            <ComissaoView :refresh="refreshTick" />
          </section>

          <section v-else-if="tab === 'comissao-campo'" key="comissao-campo">
            <ComissaoCampoView />
          </section>

          <section v-else-if="tab === 'form'" key="form" class="view-form">
            <div class="view-header">
              <div>
                <h1 class="view-title">Registro BDR</h1>
                <p class="view-sub">Preencha os dados de alteração contratual no BDR.</p>
              </div>
            </div>
            <BdrForm @registered="onRegistered" />
          </section>

          <section v-else-if="tab === 'bdr-dash'" key="bdr-dash">
            <BdrDashboardView :refresh="refreshTick" />
          </section>

          <section v-else-if="tab === 'retencao'" key="retencao">
            <RetencaoView :refresh="refreshTick" />
          </section>

          <section v-else-if="tab === 'diagnostico'" key="diagnostico">
            <DiagnosticoView />
          </section>

          <section v-else-if="tab === 'hub'" key="hub" class="hub-section">
            <HubView :refresh="refreshTick" @open-viewer="openViewer" />
          </section>

          <section v-else-if="tab === 'hub-viewer'" key="hub-viewer" class="hub-section">
            <HubViewerView :dashboard="selectedDashboard!" @back="tab = 'hub'" />
          </section>

          <section v-else-if="tab === 'hub-admin'" key="hub-admin" class="hub-section">
            <HubAdminView />
          </section>

          <section v-else-if="tab === 'sala-reuniao'" key="sala-reuniao" class="hub-section agenda-section">
            <AgendaView />
          </section>
        </Transition>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import BdrForm              from './components/BdrForm.vue';
import LoginView             from './views/LoginView.vue';
import VendasView            from './views/VendasView.vue';
import ComissaoView          from './views/ComissaoView.vue';
import ComissaoCampoView     from './views/ComissaoCampoView.vue';
import BdrDashboardView      from './views/BdrDashboardView.vue';
import RetencaoView          from './views/RetencaoView.vue';
import DiagnosticoView       from './views/DiagnosticoView.vue';
import HubView               from './views/hub/HubView.vue';
import HubViewerView         from './views/hub/HubViewerView.vue';
import HubAdminView          from './views/hub/HubAdminView.vue';
import AgendaView            from './views/AgendaView.vue';
import { useAuth } from './composables/useAuth';
import type { HubDashboard } from './services/hubApi';
import { logModuleView } from './services/hubApi';
import { getOtdrLink } from './services/otdrApi';

const { user, isAuthenticated, isGestor, isCS, isEstoque, isCampo, isHubAdmin, logout } = useAuth();
const abrindoOtdr = ref(false);

async function abrirOtdr() {
  if (abrindoOtdr.value) return;
  abrindoOtdr.value = true;
  try {
    const { url } = await getOtdrLink();
    logModuleView('VIEW_OTDR');
    window.open(url, '_blank');
  } catch {
    alert('Não foi possível abrir o OTDR. Tente novamente.');
  } finally {
    abrindoOtdr.value = false;
  }
}

type Tab = 'form' | 'vendas' | 'comissao' | 'comissao-campo' | 'bdr-dash' | 'retencao' | 'diagnostico' | 'hub' | 'hub-viewer' | 'hub-admin' | 'sala-reuniao';
const tab = ref<Tab>(isEstoque.value ? 'hub' : isCampo.value ? 'comissao-campo' : isCS.value ? 'retencao' : 'vendas');
const refreshTick = ref(0);
const menuOpen = ref(false);

// Log de navegação por módulo — uma vez por troca de aba, não a cada chamada
// de API interna do módulo (evita poluir o log com refresh/filtro).
const TAB_LOG_ACTION: Partial<Record<Tab, string>> = {
  vendas: 'VIEW_VENDAS',
  comissao: 'VIEW_COMISSAO',
  'comissao-campo': 'VIEW_CAMPO',
  form: 'VIEW_REGISTRO_BDR',
  'bdr-dash': 'VIEW_BDR_DASHBOARD',
  retencao: 'VIEW_RETENCAO',
  diagnostico: 'VIEW_DIAGNOSTICO',
  hub: 'VIEW_HUB',
  'hub-admin': 'VIEW_HUB_ADMIN',
  'sala-reuniao': 'VIEW_SALA_REUNIAO',
};
watch([tab, isAuthenticated], ([novaTab, autenticado]) => {
  if (!autenticado) return;
  const action = TAB_LOG_ACTION[novaTab];
  if (action) logModuleView(action);
}, { immediate: true });

function navTo(t: Tab) { tab.value = t; menuOpen.value = false; }
const currentDate = ref('');
const currentTime = ref('');
const selectedDashboard = ref<HubDashboard | null>(null);
let timer: ReturnType<typeof setInterval>;

function updateClock() {
  const now = new Date();
  currentDate.value = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  currentTime.value = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

onMounted(() => { updateClock(); timer = setInterval(updateClock, 1000); });
onUnmounted(() => clearInterval(timer));

function onRegistered() { refreshTick.value++; }

function openViewer(dashboard: HubDashboard) {
  selectedDashboard.value = dashboard;
  tab.value = 'hub-viewer';
}
</script>

<style>
/* ── Variables ── */
:root {
  --bg:           #040507;
  --surface:      #0b0d12;
  --surface-2:    #12151d;
  --surface-3:    #1c202b;
  --border:       #1e2330;
  --border-2:     #2b3245;
  --accent:       #00f0ff;
  --accent-2:     #c7ff00;
  --accent-dim:   rgba(0, 240, 255, 0.1);
  --accent-glow:  rgba(0, 240, 255, 0.25);
  --text:         #f0f3ff;
  --text-2:       #8a99b8;
  --text-3:       #4c5870;
  --success:      #c7ff00;
  --success-bg:   rgba(199, 255, 0, 0.1);
  --error:        #ff2a5f;
  --error-bg:     rgba(255, 42, 95, 0.1);
  --upgrade:      #00f0ff;
  --downgrade:    #ff2a5f;
  --refid:        #a855f7;
  --radius:       2px;
  --radius-sm:    2px;
  --font-display: 'Unbounded', sans-serif;
  --font-body:    'Albert Sans', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
  --shadow:       0 8px 32px rgba(0, 240, 255, 0.1);
  --transition:   .2s cubic-bezier(.2,1,.2,1);
  --header-h:     62px;
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  background-image:
    radial-gradient(ellipse 60% 50% at 50% -10%, rgba(0, 240, 255, 0.05), transparent),
    radial-gradient(circle at 100% 50%, rgba(199, 255, 0, 0.03), transparent 40%);
}

/* ── App shell ── */
.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Header ── */
.app-header {
  background: rgba(11, 13, 18, 0.95);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  flex-shrink: 0;
  height: var(--header-h);
}

.header-inner {
  height: 100%;
  padding: 0 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

/* Logo */
.logo { display: flex; align-items: center; gap: .75rem; text-decoration: none; flex-shrink: 0; }
.logo-mark { display: flex; align-items: center; filter: drop-shadow(0 0 8px rgba(0,200,255,.3)) drop-shadow(0 0 4px rgba(199,255,0,.2)); }
.logo-text-wrap { display: flex; flex-direction: column; line-height: 1; }
.logo-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.logo-sub {
  font-family: var(--font-mono);
  font-size: .55rem;
  color: var(--accent);
  letter-spacing: .25em;
  text-transform: uppercase;
  margin-top: 2px;
}

/* ── Navbar central ── */
.header-nav {
  display: flex;
  align-items: stretch;
  gap: .25rem;
  height: 100%;
  flex: 1;
  justify-content: center;
}

.nav-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}
.nav-group-label {
  font-family: var(--font-mono);
  font-size: .52rem;
  font-weight: 600;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--text-3);
  padding-bottom: .3rem;
}
.nav-items {
  display: flex;
  align-items: stretch;
  height: 100%;
}

/* Botão de navegação — estilo navbar */
.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .25rem;
  padding: 0 .9rem;
  height: 100%;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-2);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: .7rem;
  font-weight: 500;
  white-space: nowrap;
  transition: all var(--transition);
  min-width: 64px;
}
.nav-btn svg { opacity: .55; transition: opacity var(--transition); flex-shrink: 0; }
.nav-icon-text { font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; line-height: 1; opacity: .55; transition: opacity var(--transition); }
.nav-btn:hover .nav-icon-text, .nav-btn.active .nav-icon-text { opacity: 1; }
.nav-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}
.nav-btn:hover svg { opacity: .9; }
.nav-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  background: var(--accent-dim);
}
.nav-btn.active svg { opacity: 1; filter: drop-shadow(0 0 4px var(--accent)); }

/* Divisor entre grupos */
.nav-divider {
  width: 1px;
  background: var(--border);
  margin: .75rem .5rem;
  flex-shrink: 0;
}

/* Clock + User */
.header-right { display: flex; align-items: center; gap: .75rem; flex-shrink: 0; }
.header-clock { display: flex; flex-direction: column; align-items: flex-end; }
.clock-date { font-size: .65rem; color: var(--text-2); text-transform: capitalize; letter-spacing: .04em; }
.clock-time { font-family: var(--font-mono); font-size: .82rem; color: var(--accent); letter-spacing: .05em; }

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-left: .75rem;
  border-left: 1px solid var(--border);
}
.user-name { font-size: .82rem; font-weight: 600; color: var(--text); }
.user-role { font-size: .62rem; color: var(--accent); text-transform: capitalize; letter-spacing: .06em; }

.btn-logout {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: var(--radius-sm);
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-logout:hover { color: var(--error); border-color: rgba(255,42,95,.3); background: var(--error-bg); }

/* ── Body + Main ── */
.app-body { flex: 1; overflow: hidden; }

/* ── Main content ── */
.app-main {
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem 2rem;
}
.app-main--fullscreen {
  padding: 0;
  overflow: hidden;
}

.hub-section { height: 100%; }
.sala-iframe { width: 100%; height: 100%; border: none; display: block; }
.agenda-section { overflow-y: auto; }

/* ── View Headers ── */
.view-header {
  margin-bottom: 1.75rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.view-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -.01em;
}
.view-sub { font-size: .875rem; color: var(--text-2); margin-top: .3rem; }

/* ── Form view layout ── */
.view-form { max-width: 740px; margin: 0 auto; }
.view-history { width: 100%; }

/* ── Shared inputs ── */
input, select {
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: .6rem .85rem;
  font-size: .9rem;
  font-family: var(--font-body);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
  width: 100%;
}
input:focus, select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
input::placeholder { color: var(--text-3); }
select option { background: var(--surface-2); }

/* ── Form ── */
.bdr-form { display: flex; flex-direction: column; gap: 1.1rem; }
.form-group { display: flex; flex-direction: column; gap: .4rem; }
.form-label {
  font-size: .78rem;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: .06em;
  text-transform: uppercase;
}

/* Contract search */
.input-row { display: flex; align-items: center; gap: .6rem; }
.input-row input { flex: 1; font-family: var(--font-mono); letter-spacing: .04em; }

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: .3rem;
  font-size: .72rem;
  font-weight: 600;
  padding: .25rem .65rem;
  border-radius: 20px;
  white-space: nowrap;
  letter-spacing: .04em;
}
.status-pill.loading { background: var(--surface-3); color: var(--text-2); }
.status-pill.ok      { background: var(--success-bg); color: var(--success); border: 1px solid rgba(16,185,129,.2); }
.status-pill.error   { background: var(--error-bg);   color: var(--error);   border: 1px solid rgba(248,113,113,.2); }
.status-pill::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.loading::before { animation: pulse 1.2s infinite; }
@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

/* Contract info card */
.contract-card {
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: .85rem 1rem;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: .75rem;
  animation: slideDown .15s ease;
}
@keyframes slideDown { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
.ccard-label { font-size: .7rem; color: var(--text-2); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; margin-bottom: .2rem; }
.ccard-value { font-size: .95rem; font-weight: 600; color: var(--text); }
.ccard-amount { font-family: var(--font-mono); font-size: 1.05rem; font-weight: 600; color: var(--accent); }
.label-hint { font-size: .72rem; color: var(--text-2); font-weight: 400; text-transform: none; letter-spacing: 0; }

/* Negotiation type pills */
.type-pills { display: flex; gap: .5rem; flex-wrap: wrap; }
.type-pill {
  display: flex; align-items: center; gap: .4rem;
  cursor: pointer; font-size: .875rem; font-weight: 500;
  padding: .5rem 1rem;
  border: 1px solid var(--border-2); border-radius: 20px;
  transition: all var(--transition);
  color: var(--text-2); background: none; user-select: none;
}
.type-pill input { display: none; }
.type-pill:hover { color: var(--text); background: var(--surface-3); }
.type-pill.selected-upgrade    { border-color: var(--upgrade);   color: var(--upgrade);   background: rgba(16,185,129,.1); }
.type-pill.selected-downgrade  { border-color: var(--downgrade); color: var(--downgrade); background: rgba(248,113,113,.1); }
.type-pill.selected-refidelizacao { border-color: var(--refid); color: var(--refid);    background: rgba(96,165,250,.1); }

/* Commission preview */
.commission-box {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--accent-dim);
  border: 1px solid rgba(245,158,11,.25);
  border-radius: var(--radius-sm);
  padding: .85rem 1.1rem;
  animation: slideDown .15s ease;
}
.commission-label { font-size: .8rem; color: var(--text-2); font-weight: 500; }
.commission-amount { font-family: var(--font-mono); font-size: 1.25rem; font-weight: 600; color: var(--accent); }

/* Warning — estilos base; detalhes no BdrForm.vue scoped */
.warn-banner { margin-bottom: .25rem; }

/* Alerts */
.alert-msg {
  padding: .75rem 1rem; border-radius: var(--radius-sm);
  font-size: .875rem; font-weight: 500;
  display: flex; align-items: center; gap: .5rem;
}
.alert-msg.success { background: var(--success-bg); color: var(--success); border: 1px solid rgba(16,185,129,.2); }
.alert-msg.error   { background: var(--error-bg);   color: var(--error);   border: 1px solid rgba(248,113,113,.2); }

/* Submit button */
.btn-primary {
  background: var(--accent); color: #000; border: none;
  border-radius: var(--radius-sm); padding: .75rem 1.5rem;
  font-size: .9rem; font-weight: 700; font-family: var(--font-body);
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition), transform var(--transition);
  letter-spacing: .02em;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-2); transform: translateY(-1px); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }
.btn-primary:disabled { opacity: .35; cursor: not-allowed; }

/* ── History ── */
.history-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem; }
.history-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.history-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; }

/* Summary cards */
.summary-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-bottom: 1.25rem; }
.summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .85rem 1.1rem; display: flex; flex-direction: column; gap: .2rem; }
.sc-label { font-size: .72rem; color: var(--text-2); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.sc-value { font-family: var(--font-mono); font-size: 1.25rem; font-weight: 600; color: var(--text); }
.sc-value.amber { color: var(--accent); }

/* Filters */
.filter-bar { display: flex; gap: .6rem; flex-wrap: wrap; align-items: flex-end; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .9rem 1.1rem; margin-bottom: 1rem; }
.filter-group { display: flex; flex-direction: column; gap: .3rem; flex: 1 1 140px; min-width: 120px; max-width: 220px; }
.filter-label { font-size: .7rem; font-weight: 600; color: var(--text-2); letter-spacing: .06em; text-transform: uppercase; }
.filter-group input, .filter-group select { font-size: .825rem; padding: .45rem .75rem; }
.btn-filter-clear { background: var(--surface-3); border: 1px solid var(--border-2); color: var(--text-2); border-radius: var(--radius-sm); padding: .45rem .9rem; font-size: .82rem; font-family: var(--font-body); cursor: pointer; transition: all var(--transition); align-self: flex-end; white-space: nowrap; }
.btn-filter-clear:hover { color: var(--text); }

/* Refresh button */
.btn-refresh { display: flex; align-items: center; gap: .4rem; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); padding: .45rem .9rem; font-size: .82rem; font-family: var(--font-body); cursor: pointer; transition: all var(--transition); }
.btn-refresh:hover { color: var(--text); border-color: var(--border-2); }

/* Table */
.table-wrapper { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
table { width: 100%; min-width: 1000px; border-collapse: collapse; font-size: .8rem; }
thead { background: var(--surface); }
thead th { color: var(--text-2); text-align: left; padding: .45rem .75rem; font-weight: 600; font-size: .68rem; letter-spacing: .07em; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody tr { border-bottom: 1px solid var(--border); transition: background var(--transition); }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: var(--surface-2); }
tbody td { padding: .38rem .75rem; color: var(--text); vertical-align: middle; }
.td-mono { font-family: var(--font-mono); font-size: .82rem; color: var(--text-2); }
.td-amount { font-family: var(--font-mono); font-weight: 600; }
.td-commission { font-family: var(--font-mono); font-weight: 700; color: var(--accent); }
.td-date { font-size: .8rem; color: var(--text-2); }

.type-tag { display: inline-block; padding: .2rem .65rem; border-radius: 20px; font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.type-tag.upgrade       { background: rgba(16,185,129,.12); color: var(--upgrade); border: 1px solid rgba(16,185,129,.2); }
.type-tag.downgrade     { background: rgba(248,113,113,.12); color: var(--downgrade); border: 1px solid rgba(248,113,113,.2); }
.type-tag.refidelizacao { background: rgba(96,165,250,.12); color: var(--refid); border: 1px solid rgba(96,165,250,.2); }

.state-msg { text-align: center; padding: 3rem 1rem; color: var(--text-2); font-size: .9rem; }

/* ── Transition ── */
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease, transform .15s ease; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }
.fade-leave-to   { opacity: 0; transform: translateY(-4px); }

/* ── Hamburger button (oculto no desktop) ── */
.btn-hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 34px; height: 34px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  cursor: pointer;
}
.hb-bar {
  display: block;
  width: 100%; height: 1.5px;
  background: var(--text-2);
  border-radius: 2px;
  transition: all .2s ease;
  transform-origin: center;
}
.hb-bar.open:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
.hb-bar.open:nth-child(2) { opacity: 0; transform: scaleX(0); }
.hb-bar.open:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

/* ── Mobile backdrop ── */
.mobile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  z-index: 200;
  backdrop-filter: blur(2px);
}

/* ── Mobile drawer ── */
.mobile-drawer {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: min(300px, 85vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 201;
  overflow-y: auto;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.drawer-title {
  font-family: var(--font-display);
  font-size: .9rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text);
}
.drawer-close {
  background: none; border: none;
  color: var(--text-2); cursor: pointer;
  padding: 4px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: color var(--transition);
}
.drawer-close:hover { color: var(--text); }

.drawer-group {
  padding: 1rem 1rem .5rem;
  border-bottom: 1px solid var(--border);
}
.drawer-group-label {
  font-family: var(--font-mono);
  font-size: .6rem;
  font-weight: 600;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--text-3);
  display: block;
  margin-bottom: .5rem;
  padding-left: .5rem;
}

.drawer-btn {
  display: flex;
  align-items: center;
  gap: .75rem;
  width: 100%;
  padding: .7rem .75rem;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: var(--font-body);
  font-size: .9rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition);
  margin-bottom: .15rem;
}
.drawer-btn svg { opacity: .55; flex-shrink: 0; transition: opacity var(--transition); }
.drawer-btn:hover { background: var(--surface-2); color: var(--text); }
.drawer-btn:hover svg { opacity: .9; }
.drawer-btn.active {
  background: var(--accent-dim);
  color: var(--accent);
  border-left: 3px solid var(--accent);
  padding-left: calc(.75rem - 3px);
}
.drawer-btn.active svg { opacity: 1; }

.drawer-icon-text {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 700;
  opacity: .55;
  width: 18px;
  text-align: center;
  transition: opacity var(--transition);
}
.drawer-btn.active .drawer-icon-text { opacity: 1; }

.drawer-footer {
  margin-top: auto;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: .15rem;
}
.drawer-user { font-size: .88rem; font-weight: 600; color: var(--text); }
.drawer-role { font-size: .68rem; color: var(--accent); text-transform: capitalize; letter-spacing: .06em; }

/* ── Drawer transition ── */
.backdrop-enter-active, .backdrop-leave-active { transition: opacity .22s ease; }
.backdrop-enter-from, .backdrop-leave-to { opacity: 0; }
.drawer-enter-active, .drawer-leave-active { transition: transform .22s cubic-bezier(.2,1,.2,1); }
.drawer-enter-from, .drawer-leave-to { transform: translateX(100%); }

/* ── Mobile breakpoints ── */
@media (max-width: 768px) {
  :root { --header-h: 56px; }

  .header-inner { padding: 0 1rem; gap: 1rem; }

  /* Oculta nav desktop, mostra hamburger */
  .header-nav { display: none; }
  .btn-hamburger { display: flex; }

  /* Oculta relógio e dados do usuário */
  .header-clock { display: none; }
  .user-info { display: none; }

  /* Padding do conteúdo */
  .app-main { padding: 1rem; }
}

@media (max-width: 480px) {
  .header-inner { padding: 0 .75rem; }
  .logo-sub { display: none; }
  .app-main { padding: .75rem; }
}

/* ── Print ── */
@media print {
  .app-header, .sidebar, .filter-bar, .kpi-row, .charts-row,
  .pagination, .btn-refresh, .header-actions, .state-msg { display: none !important; }
  .app-main { padding: 0 !important; }
  .table-wrapper { overflow: visible; box-shadow: none; border: none; }
  body { background: #fff; color: #000; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; }
  th { background: #f0f0f0; font-weight: bold; }
}
</style>
