import { ref, computed } from 'vue';
import axios from 'axios';

interface AuthUser {
  id: string;
  nome: string;
  email: string;
  id_grupo: number;
  perfil: 'consultor' | 'gestor' | 'cs' | 'estoque' | 'campo' | 'agente';
  /// true quando o usuário logado é um agente ativo do roster de QA — habilita
  /// "Minhas Avaliações" independente do perfil (ver auth.service.ts).
  souAgenteQa: boolean;
}

const TOKEN_KEY = 'bdr_token';

const user = ref<AuthUser | null>(null);

function parseJwt(token: string): AuthUser | null {
  try {
    const payload = token.split('.')[1];
    const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}

function init() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) user.value = parseJwt(token);
}

init();

const HUB_ADMIN_IDS = ['349', '167'];

export function useAuth() {
  const isAuthenticated = computed(() => !!user.value);
  const isGestor        = computed(() => user.value?.perfil === 'gestor');
  const isCS            = computed(() => user.value?.perfil === 'cs');
  const isEstoque       = computed(() => user.value?.perfil === 'estoque');
  const isCampo         = computed(() => user.value?.perfil === 'campo');
  const isAgente        = computed(() => user.value?.perfil === 'agente');
  const souAgenteQa     = computed(() => !!user.value?.souAgenteQa);
  const isHubAdmin      = computed(() => !!user.value && HUB_ADMIN_IDS.includes(String(user.value.id)));

  async function login(email: string, password: string) {
    const { data } = await axios.post('/bdr/api/v1/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    user.value = parseJwt(data.token);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    user.value = null;
  }

  return { user, isAuthenticated, isGestor, isCS, isEstoque, isCampo, isAgente, souAgenteQa, isHubAdmin, login, logout };
}
