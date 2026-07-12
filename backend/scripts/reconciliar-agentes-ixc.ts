/**
 * Reconcilia AtendimentoAgenteQa.ixc_user_id — link real com o usuário do
 * IXC, necessário pro fluxo de "ciência" (agente logar e ver a própria
 * nota). Bater só por nome já se mostrou frágil (colação de acento do MySQL
 * do IXC deu resultado inconsistente em duas consultas iguais, confirmado
 * 2026-07-12) — por isso 7 casos têm o ID do IXC explícito, passado
 * diretamente pelo usuário, em vez de tentar casar nome de novo.
 *
 * Idempotente: pode rodar de novo, só atualiza quem ainda não tem
 * ixc_user_id ou cujo valor mudou.
 *
 * Uso: npx ts-node -r dotenv/config scripts/reconciliar-agentes-ixc.ts
 */
import prisma from '../src/config/prisma';
import pool from '../src/config/mysql';

// Nome exato como está no roster (AtendimentoAgenteQa.nome) -> id do usuário
// no IXC, confirmado diretamente pelo usuário em 2026-07-12 (nomes reais no
// IXC têm grafia/acento diferente do roster, por isso não dá pra bater só
// por string).
const MAPEAMENTO_MANUAL: Record<string, number> = {
  'Jonatha Fernandes':            409, // IXC: "Jonatha Luiz Fernandes"
  'Juliane Miranda de Araújo':     380, // IXC: "Juliane Miranda de Araujo" (sem acento)
  'Karen Monteiro':                408, // IXC: "Karen Victória Monteiro Camargo"
  'Milena Figueiredo de Almeida':  410, // IXC: "Milena Figueredo de Almeida" (grafia diferente)
  'Sarah Couto':                   209, // IXC: "SARAH COUTO"
  'Taina Nunes Ribeiro':           381, // IXC: "Tainá Nunes Ribeiro" (com acento)
  'Walison Rodrigues':             206, // IXC: "WALISON RODRIGUES"
};

async function main() {
  const agentes = await prisma.atendimentoAgenteQa.findMany({
    where: { status: 'Ativo', nome: { notIn: ['APRIMORAR', 'TESTE'] } },
  });

  let atualizados = 0;
  const semMatch: string[] = [];

  for (const agente of agentes) {
    let ixcUserId: string | null = null;

    if (MAPEAMENTO_MANUAL[agente.nome]) {
      ixcUserId = String(MAPEAMENTO_MANUAL[agente.nome]);
    } else {
      const [rows]: any = await pool.execute('SELECT id FROM usuarios WHERE nome = ? AND status = "A" LIMIT 1', [agente.nome]);
      if (rows.length) ixcUserId = String(rows[0].id);
    }

    if (!ixcUserId) {
      semMatch.push(agente.nome);
      continue;
    }

    if (agente.ixc_user_id !== ixcUserId) {
      await prisma.atendimentoAgenteQa.update({ where: { id: agente.id }, data: { ixc_user_id: ixcUserId } });
      console.log(`▶ ${agente.nome} -> ixc_user_id ${ixcUserId}`);
      atualizados++;
    }
  }

  console.log(`\nAtualizados: ${atualizados} | Sem match: ${semMatch.length}`);
  if (semMatch.length) console.log('Sem match:', semMatch.join(', '));

  const total = await prisma.atendimentoAgenteQa.count({ where: { status: 'Ativo', ixc_user_id: { not: null } } });
  console.log(`Total de agentes ativos com ixc_user_id preenchido: ${total}/${agentes.length}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
