import axios from 'axios';
import https from 'https';
import logger from './logger';

// ============================================================
// Sessão autenticada do IXC (login de usuário, não o token de API).
// Necessária só para rotas da aplicação administrativa que exigem
// sessão de navegador (ex: visualização de anexos/fotos de O.S.),
// que o token do webservice não alcança.
// ============================================================

const IXC_HOST = process.env.IXC_HOST!;
const IXC_ADMIN_LOGIN = process.env.IXC_ADMIN_LOGIN;
const IXC_ADMIN_SENHA = process.env.IXC_ADMIN_SENHA;

const agent = new https.Agent({ rejectUnauthorized: false });

let sessionCookie: string | null = null;
let sessionObtidaEm = 0;
let loginEmAndamento: Promise<string> | null = null;
const SESSION_TTL_MS = 20 * 60 * 1000; // 20min — margem de segurança sobre o timeout real do IXC

/// Acumula cookies de várias respostas num único jar (nome -> valor), mesclando
/// em vez de substituir — o login em duas etapas do IXC só reenvia os cookies
/// que mudaram a cada etapa, não o conjunto completo.
function mesclarCookies(jar: Map<string, string>, setCookie: string[] | undefined): void {
  for (const c of setCookie ?? []) {
    const [par] = c.split(';');
    const idx = par.indexOf('=');
    if (idx === -1) continue;
    jar.set(par.slice(0, idx).trim(), par.slice(idx + 1).trim());
  }
}

function serializarCookies(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function autenticar(): Promise<string> {
  if (!IXC_ADMIN_LOGIN || !IXC_ADMIN_SENHA) {
    throw new Error('IXC_ADMIN_LOGIN / IXC_ADMIN_SENHA não configurados — necessários para visualizar anexos de O.S.');
  }

  const jar = new Map<string, string>();

  // Etapa 1: envia o e-mail, recebe cookie de sessão inicial
  const formEmail = new FormData();
  formEmail.append('email', IXC_ADMIN_LOGIN);
  const res1 = await axios.post(`${IXC_HOST}/api-module/auth/login`, formEmail, {
    httpsAgent: agent,
    validateStatus: () => true,
  });
  mesclarCookies(jar, res1.headers['set-cookie']);
  if (res1.status !== 200 || !jar.size) {
    throw new Error(`IXC: falha na etapa 1 do login (HTTP ${res1.status})`);
  }

  // Etapa 2: envia a senha, usando os cookies acumulados até aqui.
  // O IXC permite só uma sessão ativa por vez: se uma sessão anterior (nossa
  // ou de outra chamada) ainda não expirou, ele responde HTTP 200 com
  // status "0" e a mensagem abaixo — a própria API orienta tentar de novo.
  const formSenha = new FormData();
  formSenha.append('password', IXC_ADMIN_SENHA);
  let ultimoErro = '';
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res2 = await axios.post(`${IXC_HOST}/api-module/auth/login`, formSenha, {
      httpsAgent: agent,
      headers: { Cookie: serializarCookies(jar) },
      validateStatus: () => true,
    });
    if (res2.status !== 200) {
      throw new Error(`IXC: falha na etapa 2 do login (HTTP ${res2.status})`);
    }
    if (res2.data?.status !== '0') {
      mesclarCookies(jar, res2.headers['set-cookie']);
      return serializarCookies(jar);
    }
    ultimoErro = res2.data?.messages?.[0]?.body || 'sessão ativa';
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`IXC: login recusado após 3 tentativas (${ultimoErro})`);
}

/// Garante uma única tentativa de login por vez — chamadas concorrentes
/// (ex: busca paralela de várias fotos) compartilham a mesma promise em vez
/// de disparar logins simultâneos, o que gerava sessões parciais/inconsistentes.
export async function getSessaoIxc(forcarNova = false): Promise<string> {
  const expirada = Date.now() - sessionObtidaEm > SESSION_TTL_MS;
  if (sessionCookie && !expirada && !forcarNova) {
    return sessionCookie;
  }
  if (!loginEmAndamento) {
    loginEmAndamento = autenticar()
      .then((cookie) => {
        sessionCookie = cookie;
        sessionObtidaEm = Date.now();
        logger.info('[IXC] Sessão de admin renovada (busca de anexos)');
        return cookie;
      })
      .finally(() => { loginEmAndamento = null; });
  }
  return loginEmAndamento;
}

export interface ArquivoBinario {
  buffer: Buffer;
  contentType: string;
}

/// Busca o conteúdo binário de um anexo de O.S. (foto/imagem) via a rota
/// autenticada por sessão do IXC (rel_30001.php). Se a sessão tiver expirado,
/// renova uma vez e tenta de novo.
export async function buscarArquivoBinario(idArquivo: number): Promise<ArquivoBinario | null> {
  const tentar = async (cookie: string) => axios.get(
    `${IXC_HOST}/aplicativo/su_oss_chamado/rel_30001.php`,
    {
      params: { id: idArquivo },
      httpsAgent: agent,
      headers: { Cookie: cookie },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    },
  );

  let cookie = await getSessaoIxc();
  let res = await tentar(cookie);
  let contentType = String(res.headers['content-type'] || '');

  if (!contentType.startsWith('image/')) {
    cookie = await getSessaoIxc(true);
    res = await tentar(cookie);
    contentType = String(res.headers['content-type'] || '');
  }

  if (!contentType.startsWith('image/')) {
    logger.warn('[IXC] Não foi possível obter o anexo como imagem', { idArquivo, contentType });
    return null;
  }

  return { buffer: Buffer.from(res.data), contentType };
}
