/**
 * Script pontual — envia cópia do relatório de comissão direto para o gestor.
 * Não altera o log de envios (comissao_envio_log).
 * Uso: npx ts-node scripts/reenviar-copia.ts 2026-05
 */

import transporter from '../src/config/mailer';
import { gerarRelatorioComissao } from '../src/modules/vendas/comissao-relatorio.service';

const mes_referencia = process.argv[2];
if (!mes_referencia) {
  console.error('Informe o mês: npx ts-node scripts/reenviar-copia.ts 2026-05');
  process.exit(1);
}

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

function labelMes(ref: string) {
  const [year, month] = ref.split('-').map(Number);
  return `${MESES[month - 1]}/${year}`;
}

async function main() {
  const from = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';
  const to   = process.env.REENVIO_COPIA_EMAIL_TO;
  if (!to) {
    console.error('Defina REENVIO_COPIA_EMAIL_TO no .env com o destinatário da cópia.');
    process.exit(1);
  }

  console.log(`Gerando relatório ${mes_referencia}...`);
  const buffer   = await gerarRelatorioComissao(mes_referencia);
  const label    = labelMes(mes_referencia);
  const filename = `Comissao_Vendas_${mes_referencia}.xlsx`;

  await transporter.sendMail({
    from,
    to,
    subject: `[CÓPIA] Comissão Aprovada — ${label}`,
    html: `<p>Cópia do relatório de comissão de <strong>${label}</strong> enviado ao financeiro.</p>
           <p style="color:#6b7280;font-size:12px">Este é um envio avulso — não altera o histórico do sistema.</p>`,
    attachments: [{ filename, content: buffer as Buffer }],
  });

  console.log(`Cópia enviada para ${to}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
