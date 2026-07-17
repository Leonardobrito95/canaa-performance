import { ObjectId } from 'mongodb';
import { getOpaSuiteDb } from '../../config/opasuiteMongo';
import logger from '../../config/logger';

/// Utilitário genérico "protocolo OPA -> conversa real" sobre o Mongo do
/// OpaSuite (PABX/omnichannel). Usado por qualquer módulo que precise
/// verificar o que realmente aconteceu numa interação, em vez de confiar
/// cegamente numa nota escrita livremente por quem atendeu (o operador não
/// edita a conversa do OpaSuite depois — é a evidência mais confiável).

export interface MensagemOpaSuite {
  data:  Date | null;
  texto: string;
  /// Quem mandou a mensagem — sinal pedido pela gestão (2026-07-16): sem
  /// isso, a transcrição crua não deixa óbvio quem é cliente/colaborador/
  /// IZA numa conversa longa com transferência de setor. Ver
  /// classificarMensagem() abaixo pro critério exato.
  remetente: 'cliente' | 'humano' | 'iza';
  /// Nome do colaborador humano que respondeu (resolvido via usuarios do
  /// OpaSuite) — só preenchido quando remetente === 'humano'; ausente pra
  /// cliente/IZA (não tem "autor" com nome de verdade nesses casos).
  autor?: string;
}

export interface ConversaOpaSuite {
  protocolo: string;
  mensagens: MensagemOpaSuite[];
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

/// Mesmo critério já validado em atendimento.repository.ts
/// (calcularTemposRespostaHumana) pra distinguir quem mandou cada mensagem
/// de saída, duplicado aqui (não importado de lá) porque atendimento.repository.ts
/// já importa DESTE arquivo (buscarMensagensAtendimento) — importar de volta
/// criaria dependência circular entre os dois módulos.
function segmentosHumanos(doc: any): { inicio: number; fim: number }[] {
  return (doc.atendentes ?? [])
    .filter((a: any) => a.atendimentoHumano === true && a.inicio && a.fim)
    .map((a: any) => ({ inicio: new Date(a.inicio).getTime(), fim: new Date(a.fim).getTime() }));
}

export async function buscarConversaPorProtocolo(protocolo: string): Promise<ConversaOpaSuite | null> {
  try {
    const db = await getOpaSuiteDb();
    const atendimento = await db.collection('atendimentos').findOne({ protocolo });
    if (!atendimento) return null;

    const segmentos = segmentosHumanos(atendimento);
    const msgsBrutas = await db.collection('atendimentos_mensagens')
      .find({ id_rota: atendimento._id })
      .sort({ data: 1 })
      .toArray();

    // Mesma regra de atendimento.repository.ts: cliente = tem id_user e não
    // tem id_atend; saída (id_atend + mensagem em string, exclui raciocínio
    // interno da IZA que guarda objeto) é humana se o horário cai dentro de
    // um segmento com atendimentoHumano=true, senão é IZA/URA.
    const idsAtend = [...new Set(
      msgsBrutas.filter((m) => m.id_atend).map((m) => String(m.id_atend)),
    )];
    const usuarios = idsAtend.length
      ? await db.collection('usuarios').find(
          { _id: { $in: idsAtend.map((id) => new ObjectId(id)) } },
          { projection: { nome: 1 } },
        ).toArray()
      : [];
    const nomePorId = new Map(usuarios.map((u) => [u._id.toString(), u.nome as string]));

    const mensagens: MensagemOpaSuite[] = msgsBrutas
      .map((m) => {
        const texto = typeof m.mensagem === 'string' ? m.mensagem : '';
        const data = m.data ? new Date(m.data) : null;
        const ehCliente = Boolean(m.id_user) && !m.id_atend;
        const ehSaida = Boolean(m.id_atend) && typeof m.mensagem === 'string';

        let remetente: MensagemOpaSuite['remetente'] = 'iza';
        let autor: string | undefined;
        if (ehCliente) {
          remetente = 'cliente';
        } else if (ehSaida && data) {
          const nomeAtend = nomePorId.get(String(m.id_atend));
          // Confirmado ao vivo (2026-07-16): a IZA tem uma conta de usuário
          // de verdade no OpaSuite (nome "Iza"), então id_atend sozinho não
          // basta — uma mensagem dela caía classificada como "humano (Iza)"
          // sempre que o horário batia com o segmento de um atendente humano
          // ativo (ex: logo após transferência de setor). Nome da conta
          // resolvido bate primeiro, timing de segmento é só o desempate
          // pros demais id_atend que não são a própria IZA.
          if (nomeAtend && /^iza$/i.test(nomeAtend.trim())) {
            remetente = 'iza';
          } else {
            const t = data.getTime();
            const ehHumano = segmentos.some((s) => t >= s.inicio && t <= s.fim);
            remetente = ehHumano ? 'humano' : 'iza';
            if (ehHumano) autor = nomeAtend;
          }
        }

        return { data, texto, remetente, autor };
      })
      .filter((m) => m.texto && m.texto.trim() && !/^gravacao_de_voz/i.test(m.texto.trim()));

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
