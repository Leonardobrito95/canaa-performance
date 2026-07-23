import prisma from '../../config/prisma';
import transporter from '../../config/mailer';
import logger from '../../config/logger';
import { emailTemplate } from '../../utils/emailTemplate';
import { enviarWhatsappMeta } from '../../config/metaWhatsapp';

/// Alertas sobre a SAÚDE OPERACIONAL do próprio CAIO (custo se aproximando/
/// estourando o teto diário, falha técnica esgotando todas as tentativas de
/// chamada ao Gemini) — só pro super admin do hub (Leonardo/Gustavo), não é
/// um alerta de negócio pra gestores. Reaproveita DiagnosticoAlerta (schema
/// diagnostico.alertas), que existia no schema mas nunca tinha sido usado,
/// como registro de dedup (1 linha por tipo+período já cobre o caso).
const FROM            = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';
const EMAIL_ADMIN     = process.env.ALERT_EMAIL_CAIO_ADMIN ?? '';
const WHATSAPP_ADMIN  = process.env.CAIO_ADMIN_WHATSAPP ?? '';
const DASHBOARD       = `${process.env.BASE_URL ?? 'https://exemplo.com.br'}/bdr/`;

/// A partir de quantos % do teto diário já dispara o aviso de "se aproximando"
/// (antes de bloquear de vez).
const PCT_ALERTA_APROXIMANDO = 0.8;

async function jaAlertou(tipo: string, periodo: string): Promise<boolean> {
  const registro = await prisma.diagnosticoAlerta.findUnique({
    where: { tipo_referencia_periodo: { tipo, referencia: 'CAIO', periodo } },
  });
  return !!registro;
}

async function registrarAlerta(tipo: string, periodo: string, narrativa: string): Promise<void> {
  await prisma.diagnosticoAlerta.create({ data: { tipo, referencia: 'CAIO', periodo, narrativa } });
}

/// E-mail e WhatsApp são melhor esforço: uma falha de envio nunca deve
/// impedir o registro do alerta nem propagar pro chamador (quem dispara isso
/// está no meio de uma requisição de verdade do CAIO).
async function notificar(titulo: string, cor: string, descricaoHtml: string, whatsappParams: string[]): Promise<void> {
  if (EMAIL_ADMIN) {
    try {
      await transporter.sendMail({
        from: FROM,
        to: EMAIL_ADMIN,
        subject: `⚠️ ${titulo}`,
        html: emailTemplate(titulo, cor, descricaoHtml),
      });
    } catch (err: any) {
      logger.warn(`[Alerta CAIO Admin] Falha ao enviar e-mail: ${err.message}`);
    }
  }
  if (WHATSAPP_ADMIN) {
    try {
      await enviarWhatsappMeta(WHATSAPP_ADMIN, whatsappParams);
    } catch (err: any) {
      logger.warn(`[Alerta CAIO Admin] Falha ao enviar WhatsApp: ${err.message}`);
    }
  }
}

/// Chamado a cada consulta do CAIO, depois de calcular o gasto do dia.
/// Dedup diário: no máximo 1 alerta de cada tipo (aproximando/estourado) por
/// dia, mesmo com muitas consultas acontecendo.
export async function alertarCustoCaioSeNecessario(gastoHojeUsd: number, limiteUsd: number): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);

  if (gastoHojeUsd >= limiteUsd) {
    const tipo = 'CAIO_CUSTO_ESTOURADO';
    if (await jaAlertou(tipo, hoje)) return;
    const titulo = 'CAIO atingiu o teto de custo diário';
    const descricao = `Uso de hoje: US$ ${gastoHojeUsd.toFixed(2)} de US$ ${limiteUsd.toFixed(2)}. O CAIO está bloqueado para todo mundo até meia-noite.`;
    await notificar(titulo, '#ff2a5f', `<p>${descricao}</p>`, [titulo, descricao, `Painel: ${DASHBOARD}`]);
    await registrarAlerta(tipo, hoje, descricao);
    return;
  }

  if (gastoHojeUsd >= limiteUsd * PCT_ALERTA_APROXIMANDO) {
    const tipo = 'CAIO_CUSTO_APROXIMANDO';
    if (await jaAlertou(tipo, hoje)) return;
    const pct = Math.round((gastoHojeUsd / limiteUsd) * 100);
    const titulo = 'CAIO se aproximando do teto de custo diário';
    const descricao = `Uso de hoje: US$ ${gastoHojeUsd.toFixed(2)} de US$ ${limiteUsd.toFixed(2)} (${pct}%).`;
    await notificar(titulo, '#d97706', `<p>${descricao}</p>`, [titulo, descricao, `Painel: ${DASHBOARD}`]);
    await registrarAlerta(tipo, hoje, descricao);
  }
}

/// Chamado quando o CAIO esgota todas as tentativas (modelo principal 2x +
/// fallback) sem conseguir uma resposta válida do Gemini (ver chamarGemini em
/// diagnostico.ia.ts) — sinal de quebra técnica real (ex: parâmetro rejeitado
/// pela API, outage), não uma falha pontual isolada. Dedup por hora: no
/// máximo 1 alerta por hora enquanto a falha persistir (evita 1 e-mail por
/// requisição durante uma indisponibilidade prolongada, mas ainda assim
/// lembra de hora em hora que continua quebrado).
export async function alertarFalhaTecnicaCaio(erro: unknown): Promise<void> {
  const periodo = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const tipo = 'CAIO_FALHA_TECNICA';
  if (await jaAlertou(tipo, periodo)) return;

  const mensagemErro = erro instanceof Error ? erro.message : String(erro);
  const titulo = 'CAIO parou de responder';
  const descricao = `Todas as tentativas (modelo principal + fallback) falharam. Erro: ${mensagemErro}`;
  await notificar(titulo, '#ff2a5f', `<p>${descricao}</p>`, [titulo, descricao.slice(0, 300), `Painel: ${DASHBOARD}`]);
  await registrarAlerta(tipo, periodo, descricao);
}
