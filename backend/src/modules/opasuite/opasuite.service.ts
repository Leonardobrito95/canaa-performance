import { ObjectId } from 'mongodb';
import { getOpaSuiteDb } from '../../config/opasuiteMongo';
import logger from '../../config/logger';

/// Utilitário genérico "protocolo OPA -> conversa real" sobre o Mongo do
/// OpaSuite (PABX/omnichannel). Usado por qualquer módulo que precise
/// verificar o que realmente aconteceu numa interação, em vez de confiar
/// cegamente numa nota escrita livremente por quem atendeu (o operador não
/// edita a conversa do OpaSuite depois — é a evidência mais confiável).

export interface ConversaOpaSuite {
  protocolo: string;
  mensagens: { data: Date | null; texto: string }[];
  /// Canal do atendimento (whatsapp, pabx, instagram, uzera...). Importante
  /// porque ligações (canal 'pabx') NUNCA têm a conversa real em texto aqui —
  /// só o roteiro automático da URA até a transferência pro atendente humano
  /// ("Sua ligação será transferida", "Ligação encaminhada"...). O áudio da
  /// ligação existe (fica salvo como .mp3 em `arquivos`), mas não há
  /// transcrição automática — então "mensagens" de uma ligação não é
  /// evidência da conversa real, é só o log de roteamento.
  canal: string | null;
}

const REGEX_PROTOCOLO = /OPA\d+/gi;

export function extrairProtocolos(textos: string[]): string[] {
  const set = new Set<string>();
  for (const t of textos) {
    const matches = t.match(REGEX_PROTOCOLO) ?? [];
    for (const m of matches) set.add(m.toUpperCase());
  }
  return [...set];
}

/// Mensagens de texto legíveis de um atendimento (exclui gravações de voz do
/// WhatsApp, que ficam registradas como um nome de arquivo, não texto real).
/// Compartilhado entre a busca por protocolo abaixo e qualquer módulo que já
/// tenha o _id do atendimento (ex: atendimento.repository.ts, que resolve por
/// setor/data em vez de por protocolo).
export async function buscarMensagensAtendimento(atendimentoId: ObjectId): Promise<{ data: Date | null; texto: string }[]> {
  const db = await getOpaSuiteDb();
  const msgs = await db.collection('atendimentos_mensagens')
    .find({ id_rota: atendimentoId })
    .sort({ data: 1 })
    .toArray();

  return msgs
    .map((m) => ({
      data:  m.data ? new Date(m.data) : null,
      texto: typeof m.mensagem === 'string' ? m.mensagem : '',
    }))
    .filter((m) => m.texto && m.texto.trim() && !/^gravacao_de_voz/i.test(m.texto.trim()));
}

export async function buscarConversaPorProtocolo(protocolo: string): Promise<ConversaOpaSuite | null> {
  try {
    const db = await getOpaSuiteDb();
    const atendimento = await db.collection('atendimentos').findOne({ protocolo });
    if (!atendimento) return null;

    const mensagens = await buscarMensagensAtendimento(atendimento._id);

    return { protocolo, mensagens, canal: typeof atendimento.canal === 'string' ? atendimento.canal : null };
  } catch (err: any) {
    logger.warn('[OPASUITE] Falha ao buscar conversa por protocolo', { protocolo, error: err.message });
    return null;
  }
}

export async function buscarConversasPorProtocolos(protocolos: string[]): Promise<ConversaOpaSuite[]> {
  const resultados = await Promise.all(protocolos.map((p) => buscarConversaPorProtocolo(p)));
  return resultados.filter((r): r is ConversaOpaSuite => r !== null);
}
