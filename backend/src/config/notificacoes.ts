/// Sistema em desenvolvimento — a versão em produção (modelo antigo) já
/// envia alertas por e-mail/WhatsApp pro mesmo público, então esta versão
/// nova fica calada (não envia nada) até ser promovida a produção, pra não
/// duplicar notificação pro mesmo destinatário (confirmado pelo usuário
/// 2026-07-14). Continua rodando tudo por dentro (detecção, cron, feed
/// interno) — só a saída externa (email/WhatsApp) é suprimida.
///
/// Flip pra 'true' no .env quando este sistema assumir o envio de verdade.
export const ENVIO_ALERTAS_ATIVO = process.env.ENVIO_ALERTAS_ATIVO === 'true';

/// Kill-switch da monitoria automática do CAIO (atendimento.monitoria-automatica.ts) —
/// esse job escreve registros OFICIAIS de avaliação de desempenho de funcionários reais,
/// automaticamente, sem revisão humana. Mesmo cuidado do ENVIO_ALERTAS_ATIVO acima: o job
/// roda igual (cron ativo, resolve identidade, chama a IA), mas com a flag off ele só loga
/// o que TERIA acontecido (auto-salvo/escalado) sem gravar nada em AtendimentoMonitoriaQa —
/// dá pra observar o comportamento real por alguns dias antes de confiar de verdade.
/// Flip pra 'true' no .env quando o usuário validar a qualidade das notas automáticas.
export const MONITORIA_AUTOMATICA_ATIVA = process.env.MONITORIA_AUTOMATICA_ATIVA === 'true';

/// Kill-switch do escalonamento por WhatsApp dos alertas operacionais de Atendimento
/// (atendimento.alertas-escalonamento.ts) — canal NOVO, não é o mesmo público do
/// ENVIO_ALERTAS_ATIVO acima (aquele é sobre não duplicar o que o modelo antigo já manda
/// pra Comercial/Retenção; este aqui é sobre um público que HOJE não recebe nada — gestora
/// do Atendimento e diretoria). Fica off até o usuário confirmar webhook + números reais no
/// n8n e validar o texto das mensagens.
export const ESCALONAMENTO_WHATSAPP_ATIVO = process.env.ESCALONAMENTO_WHATSAPP_ATIVO === 'true';
