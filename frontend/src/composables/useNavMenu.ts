import { computed, type ComputedRef, type Ref } from 'vue';
import { PERFIS_MODULO, temAcesso } from '../config/acesso';

export type Tab =
  | 'form' | 'vendas' | 'comissao' | 'comissao-campo' | 'bdr-dash' | 'atendimento-comercial'
  | 'retencao' | 'atendimento' | 'monitoria-qa' | 'minhas-avaliacoes'
  | 'pos-ativacao' | 'vistoria-pop'
  | 'diagnostico' | 'hub' | 'hub-viewer' | 'hub-admin' | 'sala-reuniao'
  | 'alertas-hub' | 'rh';

export type NavGroupKey = 'alertas' | 'comercial' | 'centro-solucao' | 'campo' | 'redes' | 'infraestrutura' | 'rh' | 'ferramentas';

export interface NavItem {
  tab?: Tab;
  /// P/ itens cujo estado "ativo" cobre mais de um tab (ex: Dashboards cobre 'hub' e 'hub-viewer').
  activeTabs?: Tab[];
  label: string;
  /// Só o OTDR usa (label muda pra "Abrindo..." durante o carregamento).
  dynamicLabel?: () => string;
  icon?: string;      // markup SVG inline
  iconText?: string;   // só Comissões usa ("$")
  visible: boolean;    // cópia EXATA da condição v-if do item original
  disabled?: boolean;  // só OTDR usa
  action?: () => void; // só OTDR usa — se presente, clique chama isso em vez de trocar de tab
}

export interface NavGroupConfig {
  key: NavGroupKey;
  label: string;
  /// Cor/ícone vêm de hub.sectors (só os 4 grupos de setor têm) — Hub e
  /// Ferramentas não são setores de negócio, ficam sem cor/ícone de grupo.
  color?: string;
  icon?: string; // classe FontAwesome, ex: 'fa-handshake'
  visible: boolean; // cópia EXATA da condição v-if do wrapper de grupo original
  items: NavItem[];
}

export interface UseNavMenuDeps {
  isGestor:     ComputedRef<boolean>;
  isCS:         ComputedRef<boolean>;
  isEstoque:    ComputedRef<boolean>;
  isCampo:      ComputedRef<boolean>;
  isAgente:     ComputedRef<boolean>;
  souAgenteQa:  ComputedRef<boolean>;
  isHubAdmin:   ComputedRef<boolean>;
  abrindoOtdr:  Ref<boolean>;
  perfilAtual:  Ref<string>;
  abrirOtdr:    () => void;
}

// SVGs extraídos verbatim do template original de App.vue — fonte única,
// consumida tanto pelo dropdown desktop quanto pela drawer mobile.
const ICON_VENDAS = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M3 10L6 7L9 11L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CAMPO = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 11V5l5-3 5 3v6M5 15v-4h5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_REGISTRO_BDR = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 3h11M2 7h11M2 11h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_DASHBOARD_BDR = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 11l3-4 3 2 3-5 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="1" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_RETENCAO = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" stroke="currentColor" stroke-width="1.5"/><path d="M5 7.5l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_ATENDIMENTO = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M2 6.5a5.5 5.5 0 0 1 11 0v3.5a1.5 1.5 0 0 1-1.5 1.5H10M2 6.5v3a1.5 1.5 0 0 0 1.5 1.5h.5v-4h-2zM13 6.5v3a1.5 1.5 0 0 1-1.5 1.5H11v-4h2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_MONITORIA_QA = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M4 2h5l3 3v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 7.5l1.5 1.5L10 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_OTDR = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M1 5.5a9 9 0 0 1 13 0M3.5 8a5.5 5.5 0 0 1 8 0M6 10.5a2 2 0 0 1 3 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="13" r="1" fill="currentColor"/></svg>`;
const ICON_POS_ATIVACAO = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M1 8h2.5l1.3-3.5L7.5 12l1.7-7L10.5 8H14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_VISTORIA = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5v4.5M5 3l2.5-2 2.5 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 13.5h10M4.5 13.5V7.5M10.5 13.5V7.5M7.5 13.5V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const ICON_HUB = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_ADMIN = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1z" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 4v3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_SALA_REUNIAO = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 12v1.5M10 12v1.5M3.5 13.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 6.5h7M4 8.5h4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></svg>`;
const ICON_ALERTA = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5l6.5 11.5H1L7.5 1.5zM7.5 7v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7.5" cy="12.5" r=".7" fill="currentColor"/></svg>`;
const ICON_RH = `<svg width="18" height="18" viewBox="0 0 15 15" fill="none"><circle cx="5.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 13v-1a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="11" cy="5" r="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M13.5 13v-.8a3 3 0 0 0-2.3-2.9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

/// Config de navegação centralizada — antes duplicada literalmente 2x em
/// App.vue (dropdown desktop + drawer mobile), agora 1 fonte só, consumida
/// via v-for nos dois templates. Grupos alinhados com a taxonomia real de
/// setores do Hub (hub.sectors: nome/cor/ícone), não mais uma lista solta
/// "Performance" sem estrutura.
export function useNavMenu(deps: UseNavMenuDeps) {
  const { isGestor, isCS, isEstoque, isCampo, isAgente, souAgenteQa, isHubAdmin, abrindoOtdr, perfilAtual, abrirOtdr } = deps;

  const navGroups = computed<NavGroupConfig[]>(() => [
    {
      key: 'alertas', label: 'Central de Alertas', icon: 'fa-bell',
      visible: temAcesso(perfilAtual.value, PERFIS_MODULO.alertasHub),
      items: [
        { tab: 'alertas-hub', label: 'Alertas', icon: ICON_ALERTA, visible: true }
      ],
    },
    {
      key: 'comercial', label: 'Comercial', color: '#1565C0', icon: 'fa-handshake',
      visible: !isEstoque.value,
      items: [
        { tab: 'vendas', label: 'Vendas', icon: ICON_VENDAS, visible: !isCS.value && !isCampo.value && !isAgente.value },
        { tab: 'comissao', label: 'Comissões', iconText: '$', visible: !isCampo.value && !isAgente.value },
        { tab: 'form', label: 'Registro BDR', icon: ICON_REGISTRO_BDR, visible: !isCS.value && !isCampo.value && !isAgente.value },
        { tab: 'bdr-dash', label: 'Dashboard BDR', icon: ICON_DASHBOARD_BDR, visible: !isCS.value && !isCampo.value && !isAgente.value },
        { tab: 'atendimento-comercial', label: 'Atendimento', icon: ICON_ATENDIMENTO, visible: !isCS.value && !isCampo.value && !isAgente.value },
      ],
    },
    {
      key: 'centro-solucao', label: 'Centro de Solução', color: '#00838F', icon: 'fa-headset',
      visible: !isEstoque.value,
      items: [
        { tab: 'retencao', label: 'Retenção', icon: ICON_RETENCAO, visible: !isCampo.value && !isAgente.value },
        { tab: 'atendimento', label: 'Atendimento', icon: ICON_ATENDIMENTO, visible: temAcesso(perfilAtual.value, PERFIS_MODULO.atendimentoGestaoQa) },
        { tab: 'monitoria-qa', label: 'Monitoria de Qualidade', icon: ICON_MONITORIA_QA, visible: temAcesso(perfilAtual.value, PERFIS_MODULO.atendimentoGestaoQa) },
        // Autoatendimento do agente (ciência na própria nota) — visibilidade
        // por souAgenteQa, não por perfil (109/138 já logam como cs/campo e
        // também podem ser agente avaliado, ver auth.service.ts).
        { tab: 'minhas-avaliacoes', label: 'Minhas Avaliações', icon: ICON_MONITORIA_QA, visible: souAgenteQa.value },
      ],
    },
    {
      key: 'campo', label: 'Campo', color: '#2E7D32', icon: 'fa-hard-hat',
      visible: !isEstoque.value,
      items: [
        { tab: 'comissao-campo', label: 'Campo', icon: ICON_CAMPO, visible: isCampo.value || isGestor.value },
        // Dono é Campo (quem instala), mas Centro de Solução também consulta
        // — é quem trata o ticket que o cliente abre depois (confirmado pelo
        // usuário 2026-07-13).
        { tab: 'pos-ativacao', label: 'Pós-Ativação', icon: ICON_POS_ATIVACAO, visible: temAcesso(perfilAtual.value, PERFIS_MODULO.posAtivacao) },
      ],
    },
    {
      // "Redes" (NOC/monitoramento de rede) é setor DIFERENTE de "Infraestrutura"
      // (vistoria de POP, incorporada 2026-07-13 — ver grupo abaixo) — os dois
      // precisam se comunicar no fluxo de trabalho, mas não são o mesmo grupo.
      // OTDR é rede, não infraestrutura genérica.
      key: 'redes', label: 'Redes', color: '#1976D2', icon: 'fa-network-wired',
      visible: !isEstoque.value,
      items: [
        {
          label: 'OTDR (Rede)', icon: ICON_OTDR, visible: temAcesso(perfilAtual.value, PERFIS_MODULO.otdrLink),
          disabled: abrindoOtdr.value, action: abrirOtdr,
          dynamicLabel: () => (abrindoOtdr.value ? 'Abrindo...' : 'OTDR (Rede)'),
        },
      ],
    },
    {
      // Vistoria de POP (checklist de inspeção técnica, porta 5002) — sistema
      // externo incorporado só por leitura de dado (mesmo padrão do OTDR),
      // sem perfil novo. Pós-Ativação NÃO fica aqui — é do setor Campo (ver
      // grupo 'campo' acima), mesmo sendo outro sistema externo incorporado
      // do mesmo jeito — o critério de agrupamento é o dono do dado, não a
      // origem técnica (confirmado pelo usuário 2026-07-13).
      key: 'infraestrutura', label: 'Infraestrutura', color: '#6D4C41', icon: 'fa-tower-broadcast',
      visible: !isEstoque.value,
      items: [
        { tab: 'vistoria-pop', label: 'Vistoria de POP', icon: ICON_VISTORIA, visible: temAcesso(perfilAtual.value, PERFIS_MODULO.vistoriaPop) },
      ],
    },
    {
      // RH: módulo próprio de indicadores de pessoas (jornada, desempenho),
      // separado dos setores operacionais (Comercial/Centro de Solução/Campo)
      // porque cruza equipes de vários setores ao mesmo tempo, não é dono de
      // 1 setor só. Não substitui o acesso que Comercial/Centro de Solução já
      // têm aos mesmos indicadores dentro da própria tela de Atendimento
      // (aba "Jornada e Produtividade"); aqui é a visão ampliada, com filtro
      // de setor livre, pra RH olhar a empresa inteira de uma vez.
      key: 'rh', label: 'RH', color: '#8E24AA', icon: 'fa-users', visible: temAcesso(perfilAtual.value, PERFIS_MODULO.rh),
      items: [
        { tab: 'rh', label: 'Indicadores de Atendimento', icon: ICON_RH, visible: true },
      ],
    },
    {
      // Grupo Hub foi dissolvido (2026-07-19) — Dashboards/Administração vieram
      // pra cá. Visibilidade do GRUPO fica sempre true (Dashboards é visível
      // pra qualquer perfil, sem gate) — o antigo gate isGestor.value do grupo
      // desceu pro item Sala de Reunião, que é o único que realmente precisa
      // dele, pra não tirar acesso de ninguém que já via Dashboards.
      key: 'ferramentas', label: 'Ferramentas', icon: 'fa-screwdriver-wrench', visible: true,
      items: [
        { tab: 'hub', activeTabs: ['hub', 'hub-viewer'], label: 'Dashboards', icon: ICON_HUB, visible: true },
        { tab: 'hub-admin', label: 'Administração', icon: ICON_ADMIN, visible: isHubAdmin.value },
        { tab: 'sala-reuniao', label: 'Sala de Reunião', icon: ICON_SALA_REUNIAO, visible: isGestor.value },
      ],
    },
  ]);

  /// Um grupo só aparece se tiver o guard próprio E pelo menos 1 item visível
  /// pro usuário atual — as duas condições, não uma (ver diagnostico do plano:
  /// sem o guard, Estoque veria itens que hoje só ficam escondidos pelo
  /// wrapper; sem o .some(), um grupo pode abrir vazio pra algumas personas).
  const visibleGroups = computed<NavGroupConfig[]>(() =>
    navGroups.value.filter((g) => g.visible && g.items.some((i) => i.visible)),
  );

  /// Deriva tab -> grupo automaticamente de navGroups (primeiro grupo do
  /// array que contém aquele tab vence) — não escrito à mão, pra nunca ficar
  /// dessincronizado se um item mudar de grupo no futuro.
  const tabParaGrupo = computed<Map<Tab, NavGroupKey>>(() => {
    const mapa = new Map<Tab, NavGroupKey>();
    for (const grupo of navGroups.value) {
      for (const item of grupo.items) {
        const tabs = item.activeTabs ?? (item.tab ? [item.tab] : []);
        for (const t of tabs) if (!mapa.has(t)) mapa.set(t, grupo.key);
      }
    }
    return mapa;
  });

  function isItemActive(item: NavItem, tabAtual: Tab): boolean {
    if (item.activeTabs) return item.activeTabs.includes(tabAtual);
    return item.tab === tabAtual;
  }

  return { navGroups, visibleGroups, tabParaGrupo, isItemActive };
}
