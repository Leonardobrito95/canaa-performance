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

        <!-- Navegação central: cada grupo é um dropdown, alinhado à mesma taxonomia de
             setores do Hub (hub.sectors) — config única em useNavMenu.ts, consumida aqui
             e na drawer mobile via v-for (elimina a duplicação que existia antes). -->
        <nav class="header-nav" ref="headerNavRef">
          <template v-for="(group, idx) in visibleGroups" :key="group.key">
            <div v-if="idx > 0" class="nav-divider"></div>
            <div :class="['nav-group', { open: openNavGroup === group.key }]">
              <button type="button" :class="['nav-group-trigger', { active: grupoAtivo === group.key }]" @click="toggleNavGroup(group.key)">
                <i v-if="group.icon" :class="`fa-solid ${group.icon}`" :style="group.color ? `color:${group.color}` : ''"></i>
                <span class="nav-group-label">{{ group.label }}</span>
                <svg class="nav-caret" width="9" height="6" viewBox="0 0 9 6" fill="none"><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div v-if="openNavGroup === group.key" class="nav-dropdown" @click="openNavGroup = null">
                <button
                  v-for="item in group.items.filter((i) => i.visible)"
                  :key="item.label"
                  :class="['nav-drop-item', { active: isItemActive(item, tab) }]"
                  :disabled="item.disabled"
                  @click="activateNavItem(item)"
                >
                  <!-- eslint-disable-next-line vue/no-v-html -- SVG 100% estático do próprio código-fonte, nunca vem de API/usuário -->
                  <span v-if="item.icon" v-html="item.icon"></span>
                  <span v-else-if="item.iconText" class="nav-icon-text">{{ item.iconText }}</span>
                  <span>{{ item.dynamicLabel ? item.dynamicLabel() : item.label }}</span>
                </button>
              </div>
            </div>
          </template>

          <!-- Divisor -->
          <div class="nav-divider"></div>

          <!-- C.A.I.O. (Canaã Artificial Intelligence Operator) — módulo próprio do agente de IA,
               não é dropdown de setor, fica fora do loop de grupos -->
          <button type="button" :class="['nav-standalone-btn', { active: tab === 'diagnostico' }]" @click="tab = 'diagnostico'" title="Canaã Artificial Intelligence Operator">
            <svg width="20" height="20" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="1.1" r="0.75" fill="currentColor"/>
              <path d="M7.5 1.85v1.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              <rect x="2.5" y="3.15" width="10" height="7.3" rx="2.6" stroke="currentColor" stroke-width="1.3"/>
              <path d="M2.5 5.8h-1.2M13.5 5.8h1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              <path d="M4.9 6.3c.5-.75 1.2-.75 1.7 0" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8.4 6.3c.5-.75 1.2-.75 1.7 0" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5.6 8.6h3.8" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>
              <path d="M4.2 10.45v1.15M10.8 10.45v1.15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span class="nav-group-label">C.A.I.O.</span>
          </button>
        </nav>

        <!-- Direita: relógio + usuário + logout -->
        <div class="header-right">
          <div class="header-clock">
            <span class="clock-date">{{ currentDate }}</span>
            <span class="clock-time">{{ currentTime }}</span>
          </div>
          <div class="user-info">
            <span class="user-name">{{ user?.nome.split(' ')[0] }}</span>
            <span class="user-role">{{ user?.perfil === 'cs' ? 'CS' : user?.perfil === 'campo' ? 'Campo' : user?.perfil === 'agente' ? 'Agente' : user?.perfil }}</span>
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

    <!-- Backdrop sutil atrás do dropdown de navegação aberto -->
    <div v-if="openNavGroup" class="nav-backdrop" @click="openNavGroup = null"></div>

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

            <div v-for="group in visibleGroups" :key="group.key" class="drawer-group">
              <span class="drawer-group-label">
                <i v-if="group.icon" :class="`fa-solid ${group.icon}`" :style="group.color ? `color:${group.color};margin-right:.4rem` : 'margin-right:.4rem'"></i>
                {{ group.label }}
              </span>
              <button
                v-for="item in group.items.filter((i) => i.visible)"
                :key="item.label"
                :class="['drawer-btn', { active: isItemActive(item, tab) }]"
                :disabled="item.disabled"
                @click="activateNavItem(item)"
              >
                <!-- eslint-disable-next-line vue/no-v-html -- SVG 100% estático do próprio código-fonte, nunca vem de API/usuário -->
                <span v-if="item.icon" v-html="item.icon"></span>
                <span v-else-if="item.iconText" class="drawer-icon-text">{{ item.iconText }}</span>
                {{ item.dynamicLabel ? item.dynamicLabel() : item.label }}
              </button>
            </div>

            <div class="drawer-group">
              <span class="drawer-group-label">C.A.I.O.</span>
              <button :class="['drawer-btn', { active: tab === 'diagnostico' }]" @click="tab = 'diagnostico'; menuOpen = false">
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M1 8h2.3l1.4-3.6 2.3 7.2 1.4-4.5 1 .9H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Canaã Artificial Intelligence Operator
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

          <section v-else-if="tab === 'atendimento-comercial'" key="atendimento-comercial">
            <ComercialAtendimentoView />
          </section>

          <section v-else-if="tab === 'retencao'" key="retencao">
            <RetencaoView :refresh="refreshTick" />
          </section>

          <section v-else-if="tab === 'atendimento'" key="atendimento">
            <AtendimentoView />
          </section>

          <section v-else-if="tab === 'monitoria-qa'" key="monitoria-qa">
            <MonitoriaQaView />
          </section>

          <section v-else-if="tab === 'minhas-avaliacoes'" key="minhas-avaliacoes">
            <MinhasAvaliacoesView />
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import BdrForm              from './components/BdrForm.vue';
import LoginView             from './views/LoginView.vue';
import VendasView            from './views/VendasView.vue';
import ComissaoView          from './views/ComissaoView.vue';
import ComissaoCampoView     from './views/ComissaoCampoView.vue';
import BdrDashboardView      from './views/BdrDashboardView.vue';
import RetencaoView          from './views/RetencaoView.vue';
import AtendimentoView       from './views/AtendimentoView.vue';
import ComercialAtendimentoView from './views/ComercialAtendimentoView.vue';
import MonitoriaQaView       from './views/MonitoriaQaView.vue';
import MinhasAvaliacoesView  from './views/MinhasAvaliacoesView.vue';
import DiagnosticoView       from './views/DiagnosticoView.vue';
import HubView               from './views/hub/HubView.vue';
import HubViewerView         from './views/hub/HubViewerView.vue';
import HubAdminView          from './views/hub/HubAdminView.vue';
import AgendaView            from './views/AgendaView.vue';
import { useAuth } from './composables/useAuth';
import { useNavMenu, type Tab, type NavItem, type NavGroupKey } from './composables/useNavMenu';
import type { HubDashboard } from './services/hubApi';
import { logModuleView } from './services/hubApi';
import { getOtdrLink } from './services/otdrApi';

const { user, isAuthenticated, isGestor, isCS, isEstoque, isCampo, isAgente, souAgenteQa, isHubAdmin, logout } = useAuth();
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

const { visibleGroups, tabParaGrupo, isItemActive } = useNavMenu({
  isGestor, isCS, isEstoque, isCampo, isAgente, souAgenteQa, isHubAdmin, abrindoOtdr, abrirOtdr,
});

const tab = ref<Tab>(
  isAgente.value  ? 'minhas-avaliacoes' :
  isEstoque.value ? 'hub' :
  isCampo.value   ? 'comissao-campo' :
  isCS.value      ? 'retencao' :
  'vendas',
);
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
  'atendimento-comercial': 'VIEW_ATENDIMENTO_COMERCIAL',
  retencao: 'VIEW_RETENCAO',
  atendimento: 'VIEW_ATENDIMENTO',
  'monitoria-qa': 'VIEW_MONITORIA_QA',
  'minhas-avaliacoes': 'VIEW_MINHAS_AVALIACOES',
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

function activateNavItem(item: NavItem) {
  if (item.action) item.action();
  else if (item.tab) tab.value = item.tab;
  openNavGroup.value = null;
  menuOpen.value = false;
}

// ── Dropdowns do header (grupos de setor + Hub/Ferramentas) ──────────────
const openNavGroup = ref<NavGroupKey | null>(null);
const headerNavRef = ref<HTMLElement | null>(null);

function toggleNavGroup(grupo: NavGroupKey) {
  openNavGroup.value = openNavGroup.value === grupo ? null : grupo;
}

function handleOutsideNavClick(e: MouseEvent) {
  if (headerNavRef.value && !headerNavRef.value.contains(e.target as Node)) {
    openNavGroup.value = null;
  }
}

const grupoAtivo = computed(() => tabParaGrupo.value.get(tab.value) ?? null);

const currentDate = ref('');
const currentTime = ref('');
const selectedDashboard = ref<HubDashboard | null>(null);
let timer: ReturnType<typeof setInterval>;

function updateClock() {
  const now = new Date();
  currentDate.value = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  currentTime.value = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

onMounted(() => {
  updateClock();
  timer = setInterval(updateClock, 1000);
  document.addEventListener('mousedown', handleOutsideNavClick);
});
onUnmounted(() => {
  clearInterval(timer);
  document.removeEventListener('mousedown', handleOutsideNavClick);
});

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
  --text-3:       #707c98;
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

/* ── Scrollbars finas e escuras, em qualquer área com overflow no app inteiro
   (Firefox via scrollbar-color/-width herdado do :root, Chrome/Edge/Safari via
   ::-webkit-scrollbar sem seletor composto = aplica a todo elemento rolável) ── */
:root { scrollbar-color: var(--surface-3) transparent; scrollbar-width: thin; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--surface-3); border: 1px solid var(--border-2); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-2); }

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
  position: relative;
  display: flex;
  align-items: stretch;
  height: 100%;
}

/* Botão-gatilho do dropdown de cada grupo */
.nav-group-trigger {
  display: flex;
  align-items: center;
  gap: .4rem;
  height: 100%;
  padding: 0 1rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: all var(--transition);
}
.nav-group-trigger:hover { color: var(--text); background: var(--surface-2); }
.nav-group-trigger.active { color: var(--accent); border-bottom-color: var(--accent); background: var(--accent-dim); }
.nav-group.open .nav-group-trigger { color: var(--text); background: var(--surface-2); }

/* C.A.I.O. — botão standalone (não é dropdown, só um destino); ícone em cima, nome embaixo, tudo centralizado */
.nav-standalone-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .18rem;
  height: 100%;
  padding: 0 1rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: all var(--transition);
}
.nav-standalone-btn svg { opacity: .65; transition: opacity var(--transition); flex-shrink: 0; }
.nav-standalone-btn:hover { color: var(--text); background: var(--surface-2); }
.nav-standalone-btn:hover svg { opacity: .95; }
.nav-standalone-btn.active { color: var(--accent); border-bottom-color: var(--accent); background: var(--accent-dim); }
.nav-standalone-btn.active svg { opacity: 1; filter: drop-shadow(0 0 4px var(--accent)); }
.nav-standalone-btn .nav-group-label { line-height: 1; }

.nav-group-label {
  font-family: var(--font-mono);
  font-size: .62rem;
  font-weight: 600;
  letter-spacing: .14em;
  text-transform: uppercase;
  white-space: nowrap;
}
.nav-caret { opacity: .6; transition: transform var(--transition); flex-shrink: 0; }
.nav-group.open .nav-caret { transform: rotate(180deg); }

/* Backdrop sutil atrás do dropdown aberto — ajuda o foco sem escurecer demais */
.nav-backdrop {
  position: fixed;
  top: var(--header-h, 62px);
  left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, .35);
  z-index: 30;
}

/* Painel do dropdown */
.nav-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 215px;
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  padding: .35rem;
  display: flex;
  flex-direction: column;
  gap: .1rem;
  z-index: 40;
}

/* Item dentro do dropdown */
.nav-drop-item {
  display: flex;
  align-items: center;
  gap: .65rem;
  width: 100%;
  padding: .6rem .75rem .6rem calc(.75rem + 2px);
  background: none;
  border: none;
  border-left: 2px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: .8rem;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  transition: all var(--transition);
}
.nav-drop-item svg { opacity: .6; transition: opacity var(--transition); flex-shrink: 0; }
.nav-icon-text { font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; line-height: 1; opacity: .6; transition: opacity var(--transition); width: 18px; text-align: center; flex-shrink: 0; }
.nav-drop-item:hover .nav-icon-text, .nav-drop-item.active .nav-icon-text { opacity: 1; }
.nav-drop-item:hover { color: var(--text); background: var(--surface-3); }
.nav-drop-item:hover svg { opacity: .9; }
.nav-drop-item.active { color: var(--accent); background: var(--accent-dim); border-left-color: var(--accent); }
.nav-drop-item.active svg { opacity: 1; filter: drop-shadow(0 0 4px var(--accent)); }
.nav-drop-item:disabled { opacity: .5; cursor: not-allowed; }

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
