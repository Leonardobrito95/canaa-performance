/**
 * Envia um e-mail de TESTE do resumo diário do OTDR (com causa via Diagnóstico
 * IA) só para um destinatário específico — NÃO usa a lista de produção
 * (OTDR_ALERT_EMAIL). Usa os dados reais mais recentes disponíveis (hoje, ou
 * o dia mais recente com registro, se hoje ainda não tiver nada).
 *
 * Uso: npx ts-node -r dotenv/config scripts/test-email-resumo-diario.ts <email>
 */

import axios from 'axios';
import mysqlPool from '../src/config/mysql';
import transporter from '../src/config/mailer';
import prisma from '../src/config/prisma';
import { htmlResumoDiario, CausaCliente } from '../src/modules/otdr/otdr.alerts';
import { ResumoOlt } from '../src/modules/otdr/otdr.service';
import { gerarDiagnosticoIndividual } from '../src/modules/diagnostico/diagnostico.service';

const OTDR_BASE = process.env.OTDR_API_URL ?? 'http://127.0.0.1:5008';
const FROM = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';
const SOLICITANTE = { ixcUserId: 'teste-email', ixcUsername: 'teste-email' };

async function run() {
  const destinatario = process.argv[2];
  if (!destinatario) throw new Error('Uso: ts-node scripts/test-email-resumo-diario.ts <email>');

  const { data } = await axios.get(`${OTDR_BASE}/api/historico/piora`, { timeout: 15_000 });
  const todos: any[] = data.dados ?? [];
  const dataMaisRecente = [...new Set(todos.map((p) => p.data_queda).filter(Boolean))].sort(
    (a, b) => a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join('')),
  ).pop();
  console.log(`Usando dados de: ${dataMaisRecente} (dia mais recente com registro)`);

  const pioras = todos.filter((p) => p.data_queda === dataMaisRecente);

  const byOlt = new Map<string, any[]>();
  for (const p of pioras) {
    if (!byOlt.has(p.olt_name)) byOlt.set(p.olt_name, []);
    byOlt.get(p.olt_name)!.push(p);
  }
  const resumos: ResumoOlt[] = [...byOlt.entries()].map(([olt, items]) => {
    const pior = items.sort((a, b) => a.rx_hoje - b.rx_hoje)[0];
    return { olt, qtdPioraram: items.length, piorRx: pior.rx_hoje, piorSn: pior.sn, deltaDdBm: pior.rx_hoje - pior.rx_anterior };
  }).sort((a, b) => a.piorRx - b.piorRx);

  const ordenadas = [...pioras].sort((a, b) => a.rx_hoje - b.rx_hoje);
  const causas: CausaCliente[] = [];
  for (const p of ordenadas) {
    if (causas.length >= 3) break;
    const [rows] = await mysqlPool.query<any[]>(
      `SELECT mc.id_cliente, c.razao FROM movimento_produtos mp
       JOIN movimento_comodatos mc ON mc.id_movimento_produtos = mp.id
       JOIN cliente c ON c.id = mc.id_cliente
       WHERE mp.numero_serie = ? AND mp.status_comodato = 'E' LIMIT 1`,
      [p.sn],
    );
    if (!rows.length) continue;
    console.log(`Gerando diagnóstico para ${rows[0].razao} (cliente ${rows[0].id_cliente})...`);
    const resultado = await gerarDiagnosticoIndividual(rows[0].id_cliente, SOLICITANTE);
    causas.push({ nome: rows[0].razao, causa: resultado.erro || resultado.textoCompleto });
  }

  const dataFmt = new Date().toLocaleDateString('pt-BR');
  const totalOnus = resumos.reduce((s, r) => s + r.qtdPioraram, 0);
  const html = htmlResumoDiario(resumos, `${dataFmt} (TESTE — dados de ${dataMaisRecente})`, causas);

  await transporter.sendMail({
    from: FROM,
    to: destinatario,
    subject: `[TESTE] 📡 OTDR — ${totalOnus} ONUs degradadas (dados de ${dataMaisRecente}) | com causa via Diagnóstico IA`,
    html,
  });

  console.log(`E-mail de teste enviado para ${destinatario}.`);
  await prisma.$disconnect();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
