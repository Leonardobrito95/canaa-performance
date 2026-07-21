import axios from 'axios';
import logger from './logger';

/// Mesmas variáveis de ambiente do sistema OTDR (otdr_alertas.py), que já usa
/// esse token/template em produção, reaproveitado aqui de propósito, não é
/// coincidência de nome. Template pré-aprovado no Meta Business Manager
/// ("otdr_alerta"), 3 parâmetros de texto livre no corpo ({{1}}, {{2}},
/// {{3}}), a mesma forma usada pelos alertas de queda/normalização do OTDR.
const TOKEN     = process.env.WHATSAPP_TOKEN ?? '';
const PHONE_ID  = process.env.WHATSAPP_PHONE_ID ?? '';
const TEMPLATE  = process.env.WHATSAPP_TEMPLATE ?? 'otdr_alerta';
const LANG      = process.env.WHATSAPP_LANG ?? 'pt_BR';

/// Envia WhatsApp via Meta Cloud API (Graph API oficial), chamado direto
/// deste backend. Sempre via template (mensagem de texto livre iniciada pela
/// empresa só entrega dentro da janela de 24h de conversa com o cliente, não
/// dá pra confiar nisso pra alerta que dispara sem aviso). `parametros` vira
/// {{1}}, {{2}}, {{3}}... na ordem, preenchendo o corpo do template
/// aprovado. Sem WHATSAPP_TOKEN/WHATSAPP_PHONE_ID configurado, não faz nada
/// (silencioso).
export async function enviarWhatsappMeta(numeroDestino: string, parametros: string[]): Promise<boolean> {
  if (!TOKEN || !PHONE_ID) {
    logger.warn('[Meta WhatsApp] WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID não configurado, envio ignorado.');
    return false;
  }
  if (!numeroDestino) {
    logger.warn('[Meta WhatsApp] Número de destino vazio, envio ignorado.');
    return false;
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: numeroDestino,
    type: 'template',
    template: {
      name: TEMPLATE,
      language: { code: LANG },
      components: [{
        type: 'body',
        parameters: parametros.map((p) => ({ type: 'text', text: p })),
      }],
    },
  };

  try {
    await axios.post(url, body, { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15_000 });
    return true;
  } catch (err: any) {
    const detalhe = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.warn(`[Meta WhatsApp] Falha ao enviar: ${detalhe}`);
    return false;
  }
}
