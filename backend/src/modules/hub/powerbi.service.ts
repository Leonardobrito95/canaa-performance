import axios from 'axios';

const TENANT_ID     = process.env.POWERBI_TENANT_ID!;
const CLIENT_ID     = process.env.POWERBI_CLIENT_ID!;
const CLIENT_SECRET = process.env.POWERBI_CLIENT_SECRET!;
const PBI_USERNAME  = process.env.POWERBI_USERNAME!;
const PBI_PASSWORD  = process.env.POWERBI_PASSWORD!;
const WORKSPACE_ID  = process.env.POWERBI_WORKSPACE_ID!;

const PBI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Obtém access token via ROPC (Resource Owner Password Credentials).
 * Token fica em cache até 1 minuto antes de expirar.
 */
async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  // Client Credentials flow — não requer usuário/senha, funciona com Service Principal
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         PBI_SCOPE,
  });

  const res = await axios.post(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, expires_in } = res.data;
  tokenCache = {
    token:     access_token,
    expiresAt: Date.now() + (Number(expires_in) - 60) * 1000,
  };
  return access_token;
}

/**
 * Extrai o Report ID de uma URL do Power BI.
 * Suporta:
 *   - https://app.powerbi.com/groups/{groupId}/reports/{reportId}/...
 *   - https://app.powerbi.com/reportEmbed?reportId={reportId}&...
 */
const UUID_RE = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

function extractReportId(url: string): string | null {
  const m1 = url.match(new RegExp(`/reports/(${UUID_RE})`, 'i'));
  if (m1) return m1[1];

  const m2 = url.match(new RegExp(`[?&]reportId=(${UUID_RE})`, 'i'));
  if (m2) return m2[1];

  return null;
}

export interface EmbedTokenResult {
  embedUrl:   string;
  embedToken: string;
  reportId:   string;
  expiry:     string;
}

export interface ExportResult {
  buffer:   Buffer;
  filename: string;
}

/**
 * Gera token de embed para um relatório Power BI.
 * Usa o Workspace ID configurado no .env.
 */
export async function getEmbedToken(dashboardUrl: string): Promise<EmbedTokenResult> {
  const reportId = extractReportId(dashboardUrl);
  if (!reportId) {
    throw Object.assign(
      new Error('Não foi possível extrair o Report ID da URL configurada no dashboard.'),
      { status: 400 }
    );
  }

  const accessToken = await getAccessToken();

  // Busca detalhes do relatório (embedUrl + datasetId)
  const reportRes = await axios.get(
    `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/reports/${reportId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const embedUrl  = reportRes.data.embedUrl  as string;
  const datasetId = reportRes.data.datasetId as string;

  // Token multi-recurso: inclui o dataset para habilitar "Exportar dados" nas visuais.
  // Endpoint raiz /GenerateToken aceita arrays reports + datasets com groupId explícito.
  const tokenRes = await axios.post(
    `https://api.powerbi.com/v1.0/myorg/GenerateToken`,
    {
      reports:  [{ id: reportId,  groupId: WORKSPACE_ID, allowEdit: false }],
      datasets: [{ id: datasetId, groupId: WORKSPACE_ID }],
    },
    {
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    embedUrl,
    embedToken: tokenRes.data.token      as string,
    reportId,
    expiry:     tokenRes.data.expiration as string,
  };
}

/**
 * Exporta um relatório Power BI como PDF via Export To File API.
 * Fluxo assíncrono: POST para iniciar → polling de status → GET do arquivo.
 * Máximo de 90 segundos de espera (30 tentativas × 3s).
 */
export async function exportReportToPdf(dashboardUrl: string): Promise<ExportResult> {
  const reportId = extractReportId(dashboardUrl);
  if (!reportId) {
    throw Object.assign(
      new Error('Não foi possível extrair o Report ID da URL configurada no dashboard.'),
      { status: 400 }
    );
  }

  const accessToken = await getAccessToken();

  const exportRes = await axios.post(
    `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/reports/${reportId}/ExportTo`,
    { format: 'PDF' },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  const exportId: string = exportRes.data.id;

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise<void>((r) => setTimeout(r, 3000));

    const statusRes = await axios.get(
      `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/reports/${reportId}/exports/${exportId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const { status, resourceFileExtension } = statusRes.data as { status: string; resourceFileExtension?: string };

    if (status === 'Succeeded') {
      const fileRes = await axios.get(
        `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/reports/${reportId}/exports/${exportId}/file`,
        { headers: { Authorization: `Bearer ${accessToken}` }, responseType: 'arraybuffer' }
      );
      return {
        buffer:   Buffer.from(fileRes.data as ArrayBuffer),
        filename: `relatorio${resourceFileExtension ?? '.pdf'}`,
      };
    }

    if (status === 'Failed') {
      throw new Error('O Power BI falhou ao exportar o relatório. Verifique se o Service Principal tem permissão de exportação no workspace.');
    }
  }

  throw Object.assign(
    new Error('Timeout: o relatório demorou mais de 90 segundos para exportar. Tente novamente.'),
    { status: 504 }
  );
}
