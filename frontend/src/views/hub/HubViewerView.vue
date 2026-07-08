<template>
  <div class="viewer-wrap">
    <!-- Title bar -->
    <div class="viewer-bar">
      <button class="btn-back" @click="emit('back')">
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M8.5 3L4 7.5l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Voltar
      </button>
      <div class="viewer-info">
        <h2 class="viewer-title">{{ dashboard.title }}</h2>
        <div class="viewer-meta">
          <span v-if="dashboard.sector" class="viewer-sector" :style="`color: ${dashboard.sector.color}`">
            {{ dashboard.sector.name }}
          </span>
          <span class="viewer-type-tag" :class="dashboard.type">
            {{ dashboard.type === 'powerbi' ? 'Power BI' : dashboard.type === 'internal' ? 'Interno' : 'Link' }}
          </span>
          <span :class="['viewer-status', dashboard.status]">{{ statusLabel(dashboard.status) }}</span>
        </div>
      </div>
      <!-- Exportar PDF (somente Power BI em iframe) -->
      <div v-if="dashboard.type === 'powerbi' && dashboard.embed_mode !== 'newtab'" class="export-area">
        <span v-if="exportMsg" class="export-msg">{{ exportMsg }}</span>
        <button class="btn-export" :disabled="exporting || iframeLoading" @click="handleExport" title="Exportar relatório como PDF">
          <svg v-if="!exporting" width="14" height="14" viewBox="0 0 15 15" fill="none">
            <path d="M7.5 1v9M4 7l3.5 3.5L11 7M2 13h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span v-if="exporting" class="export-spinner"></span>
          {{ exporting ? 'Exportando...' : 'Exportar PDF' }}
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="viewer-content">
      <!-- Redirect page for newtab -->
      <div v-if="dashboard.embed_mode === 'newtab' || dashboard.type === 'link'" class="redirect-page">
        <div class="redirect-inner">
          <svg width="40" height="40" viewBox="0 0 15 15" fill="none" class="redirect-icon"><path d="M3 7.5H12M9 4.5L12 7.5L9 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <p>Abrindo em nova aba...</p>
          <span>Se nada acontecer, <button class="link-btn" @click="openManually">clique aqui</button></span>
        </div>
      </div>

      <!-- Power BI SDK embed -->
      <template v-else-if="dashboard.type === 'powerbi'">
        <div v-if="iframeLoading" class="iframe-loader">
          <div class="loader-dots"><span></span><span></span><span></span></div>
          <p>Carregando painel Power BI...</p>
        </div>
        <div v-if="embedError" class="embed-error">
          <svg width="32" height="32" viewBox="0 0 15 15" fill="none"><path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1zm0 4v3m0 2.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <p>{{ embedError }}</p>
        </div>
        <div ref="pbiContainer" class="viewer-iframe" :class="{ hidden: iframeLoading || !!embedError }" />
      </template>

      <!-- Iframe embed (internal / outros) -->
      <template v-else>
        <div v-if="iframeLoading" class="iframe-loader">
          <div class="loader-dots">
            <span></span><span></span><span></span>
          </div>
          <p>Carregando painel...</p>
        </div>
        <iframe
          :src="iframeSrc"
          class="viewer-iframe"
          :class="{ hidden: iframeLoading }"
          frameborder="0"
          allowfullscreen
          @load="iframeLoading = false"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import * as pbi from 'powerbi-client';
import type { HubDashboard } from '../../services/hubApi';
import { getEmbedToken } from '../../services/hubApi';

const props = defineProps<{ dashboard: HubDashboard }>();
const emit  = defineEmits<{ (e: 'back'): void }>();

const iframeLoading = ref(true);
const embedError    = ref('');
const pbiContainer  = ref<HTMLDivElement | null>(null);
const exporting     = ref(false);
const exportMsg     = ref('');

let pbiReport: pbi.Report | null = null;
const powerbi = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory,
);

const INTERNAL_RE = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1)/;

const iframeSrc = computed(() => {
  const url = props.dashboard.url;
  if (INTERNAL_RE.test(url)) {
    return `/bdr/api/v1/hub/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
});

function statusLabel(s: string) {
  return s === 'active' ? 'Ativo' : s === 'maintenance' ? 'Manutenção' : 'Erro';
}

function openManually() {
  window.open(props.dashboard.url, '_blank');
}

async function embedPowerBI() {
  if (!pbiContainer.value) return;
  try {
    const { embedUrl, embedToken, reportId } = await getEmbedToken(props.dashboard.id);

    const config: pbi.IReportEmbedConfiguration = {
      type:        'report',
      id:          reportId,
      embedUrl,
      accessToken: embedToken,
      tokenType:   pbi.models.TokenType.Embed,
      settings: {
        navContentPaneEnabled: true,
        filterPaneEnabled:     false,
        background:            pbi.models.BackgroundType.Default,
        layoutType:            pbi.models.LayoutType.Custom,
        customLayout: {
          displayOption: pbi.models.DisplayOption.FitToPage,
        },
        commands: [
          {
            exportData: { displayOption: pbi.models.CommandDisplayOption.Enabled },
          },
        ],
      },
    };

    pbiReport = powerbi.embed(pbiContainer.value, config) as pbi.Report;
    pbiReport.on('loaded', () => { iframeLoading.value = false; });
    pbiReport.on('error',  (e) => {
      iframeLoading.value = false;
      embedError.value = 'Erro ao carregar o relatório Power BI.';
      console.error('[PowerBI]', e.detail);
    });
  } catch (err: any) {
    iframeLoading.value = false;
    embedError.value = err?.response?.data?.message ?? 'Não foi possível obter o token de embed.';
  }
}

async function handleExport() {
  exporting.value = true;
  exportMsg.value = '';
  try {
    // Abre a URL da API diretamente — o browser faz o download pelo Content-Disposition
    // sem criar blob URLs (evita aviso de conteúdo misto em conexões HTTP)
    const token = localStorage.getItem('bdr_token') ?? '';
    const res = await fetch(`/bdr/api/v1/hub/dashboards/${props.dashboard.id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as any).message ?? `Erro ${res.status}`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${props.dashboard.title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (err: any) {
    exportMsg.value = err?.message ?? 'Erro ao exportar. Tente novamente.';
    setTimeout(() => { exportMsg.value = ''; }, 6000);
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  if (props.dashboard.embed_mode === 'newtab' || props.dashboard.type === 'link') {
    window.open(props.dashboard.url, '_blank');
    return;
  }
  if (props.dashboard.type === 'powerbi') {
    embedPowerBI();
  }
});

onUnmounted(() => {
  if (pbiContainer.value) powerbi.reset(pbiContainer.value);
});
</script>

<style scoped>
.viewer-wrap {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-h));
  gap: 0;
}

.viewer-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: .5rem 1rem;
  flex-shrink: 0;
}

.btn-back {
  display: flex; align-items: center; gap: .4rem;
  background: var(--surface-2); border: 1px solid var(--border-2);
  color: var(--text-2); border-radius: var(--radius-sm);
  padding: .4rem .8rem; font-size: .8rem; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition); flex-shrink: 0;
}
.btn-back:hover { color: var(--text); border-color: var(--border-2); }

.viewer-info { display: flex; flex-direction: column; gap: .25rem; flex: 1; min-width: 0; }
.viewer-title { font-size: .95rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.viewer-meta { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.viewer-sector { font-size: .72rem; font-weight: 600; }
.viewer-type-tag {
  font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  padding: .15rem .45rem; border-radius: 3px;
}
.viewer-type-tag.powerbi { background: rgba(243,186,47,.12); color: #f3ba2f; border: 1px solid rgba(243,186,47,.25); }
.viewer-type-tag.internal { background: var(--accent-dim); color: var(--accent); border: 1px solid rgba(0,240,255,.2); }
.viewer-type-tag.link { background: rgba(168,85,247,.12); color: #a855f7; border: 1px solid rgba(168,85,247,.25); }
.viewer-status {
  font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  padding: .15rem .45rem; border-radius: 10px;
}
.viewer-status.active { background: var(--success-bg); color: var(--success); }
.viewer-status.maintenance { background: rgba(234,179,8,.1); color: #eab308; }
.viewer-status.error { background: var(--error-bg); color: var(--error); }

.viewer-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--surface);
  min-height: 0;
}

.viewer-iframe {
  width: 100%; height: 100%;
  border: none; display: block;
}
.viewer-iframe.hidden { opacity: 0; pointer-events: none; }

.embed-error {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .75rem; color: var(--error); font-size: .9rem; text-align: center;
  background: var(--surface); z-index: 3; padding: 2rem;
}

.iframe-loader {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .75rem; color: var(--text-2); font-size: .875rem;
  background: var(--surface);
  z-index: 2;
}
.loader-dots { display: flex; gap: .4rem; }
.loader-dots span {
  width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
  animation: bounce 1.2s infinite;
}
.loader-dots span:nth-child(2) { animation-delay: .15s; }
.loader-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-6px);opacity:1} }

.redirect-page {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.redirect-inner {
  display: flex; flex-direction: column; align-items: center; gap: .75rem;
  color: var(--text-2); text-align: center;
}
.redirect-icon { color: var(--accent); animation: pulse-icon 1.5s infinite; }
@keyframes pulse-icon { 0%,100%{opacity:.6;transform:translateX(0)} 50%{opacity:1;transform:translateX(4px)} }
.redirect-inner p { font-size: 1rem; font-weight: 500; color: var(--text); }
.redirect-inner span { font-size: .82rem; }
.link-btn {
  background: none; border: none; color: var(--accent); cursor: pointer;
  font-size: .82rem; font-family: var(--font-body); text-decoration: underline;
  text-underline-offset: 2px; padding: 0;
}

.export-area { display: flex; align-items: center; gap: .6rem; flex-shrink: 0; margin-left: auto; }

.btn-export {
  display: flex; align-items: center; gap: .4rem;
  background: var(--surface-2); border: 1px solid var(--border-2);
  color: var(--text-2); border-radius: var(--radius-sm);
  padding: .4rem .9rem; font-size: .8rem; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition); white-space: nowrap;
}
.btn-export:hover:not(:disabled) { color: var(--accent); border-color: rgba(0,240,255,.35); }
.btn-export:disabled { opacity: .45; cursor: not-allowed; }

.export-msg {
  font-size: .75rem; color: var(--error);
  background: var(--error-bg); border: 1px solid rgba(255,42,95,.2);
  border-radius: var(--radius-sm); padding: .3rem .7rem;
}

.export-spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--border-2); border-top-color: var(--accent);
  animation: spin .7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
