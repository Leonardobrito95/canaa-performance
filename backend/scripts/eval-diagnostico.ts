/**
 * Avaliação manual do Diagnóstico IA contra casos REAIS (banco + Gemini de verdade).
 * Isso NÃO é um teste unitário (não roda no `npm test`, custa chamada real de API,
 * depende de serviços externos no ar) — é uma rede de segurança para rodar à mão
 * depois de qualquer mudança de prompt, antes de considerar a mudança pronta.
 *
 * Os casos usam fatos HISTÓRICOS JÁ FECHADOS (O.S./atendimento/snapshot antigos,
 * que não mudam) como âncora, para não quebrar sozinho com o passar do tempo.
 * Se um caso falhar, revise manualmente: pode ser uma regressão real, ou o
 * modelo respondeu de um jeito válido mas com palavras diferentes do esperado —
 * as asserções são propositalmente frouxas (contains, não igualdade exata).
 *
 * Uso: npx ts-node -r dotenv/config scripts/eval-diagnostico.ts
 */

import { gerarDiagnosticoIndividual, gerarRespostaGestaoIndividual } from '../src/modules/diagnostico/diagnostico.service';
import prisma from '../src/config/prisma';

const SOLICITANTE = { ixcUserId: 'eval-script', ixcUsername: 'eval-script' };

interface Caso {
  nome: string;
  rodar: () => Promise<string>;
  verificar: (resposta: string) => string[]; // lista de falhas; vazio = passou
}

const CLIENTE_42929 = 42929;

const casos: Caso[] = [
  {
    nome: 'Cliente 42929 — técnico da O.S. #558426 (histórico fechado)',
    rodar: async () => {
      const r = await gerarDiagnosticoIndividual(CLIENTE_42929, SOLICITANTE, 'quem foi o tecnico da O.S. 558426?');
      return r.textoCompleto;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/MARCOS VINICIUS/i.test(resp)) falhas.push('Não citou o técnico real (MARCOS VINICIUS) da O.S. #558426.');
      return falhas;
    },
  },
  {
    nome: 'Cliente 42929 — atendimento #602545 não deve ser confundido com O.S.',
    rodar: async () => {
      const r = await gerarDiagnosticoIndividual(CLIENTE_42929, SOLICITANTE, 'quem foi o responsavel pelo atendimento numero 602545?');
      return r.textoCompleto;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/WALISON/i.test(resp)) falhas.push('Não citou o responsável real (WALISON) do atendimento #602545 — regressão da confusão atendimento/O.S. já vista em produção.');
      if (/não (está|esta) (presente|nos dados)/i.test(resp) && !/WALISON/i.test(resp)) {
        falhas.push('Negou ter o dado do atendimento quando ele existe no contexto.');
      }
      return falhas;
    },
  },
  {
    nome: 'Cliente 42929 — pergunta de acompanhamento elíptica usa histórico da conversa',
    rodar: async () => {
      const r1 = await gerarDiagnosticoIndividual(CLIENTE_42929, SOLICITANTE, 'quais foram os tecnicos responsaveis pelas o.s?');
      const r2 = await gerarDiagnosticoIndividual(
        CLIENTE_42929, SOLICITANTE, 'e os atendimentos?',
        [{ pergunta: 'quais foram os tecnicos responsaveis pelas o.s?', resposta: r1.textoCompleto }],
      );
      return r2.textoCompleto;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      if (resp.length < 20) falhas.push('Resposta vazia ou curta demais para uma pergunta de acompanhamento.');
      if (/^DIAGNOSTICO:/i.test(resp.trim())) falhas.push('Forçou o formato de 3 seções para uma pergunta factual simples.');
      return falhas;
    },
  },
  {
    nome: 'Cliente 42929 — status de comissão expõe mês de referência (snapshot imutável)',
    rodar: async () => {
      const r = await gerarDiagnosticoIndividual(CLIENTE_42929, SOLICITANTE, 'qual o status da comissao desse contrato?');
      return r.textoCompleto;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/2026-0?4|abril/i.test(resp)) falhas.push('Não mencionou o mês de referência (abril/2026) do snapshot.');
      return falhas;
    },
  },
  {
    nome: 'Cliente 42929 — pergunta genuinamente fora de escopo é recusada',
    rodar: async () => {
      const r = await gerarDiagnosticoIndividual(CLIENTE_42929, SOLICITANTE, 'qual a previsao do tempo pra amanha?');
      return JSON.stringify({ texto: r.textoCompleto, estruturado: r.estruturado });
    },
    verificar: (respRaw) => {
      const { texto, estruturado } = JSON.parse(respRaw);
      const falhas: string[] = [];
      if (estruturado) falhas.push('Forçou o formato de diagnóstico para uma pergunta sem relação com o cliente.');
      // Frouxo de propósito: o modelo parafraseia a recusa de formas diferentes
      // ("focado no diagnóstico", "focado na análise técnica"...) — checar a
      // ausência de conteúdo real de previsão do tempo é mais robusto que
      // exigir uma frase exata.
      const pareceRecusa = /foco|focad[oa]|escopo|não (tenho|possuo|tem)|não é (poss[ií]vel|do meu)/i.test(texto);
      const respondeuTempoDeVerdade = /\d+\s*°|graus|chuva|\bsol\b|nublado|previs[aã]o.{0,20}(ser[aá]|indica|aponta)/i.test(texto);
      if (!pareceRecusa || respondeuTempoDeVerdade) {
        falhas.push('Não deixou claro que a pergunta está fora do escopo do assistente (ou pode ter respondido de verdade sobre o tempo).');
      }
      return falhas;
    },
  },
  {
    nome: 'Cliente 4915 — sem nenhuma O.S./sinal/comodato, não deve inventar problema',
    rodar: async () => {
      const r = await gerarDiagnosticoIndividual(4915, SOLICITANTE);
      return r.textoCompleto;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/n[ãa]o h[áa]|sem registro|insuficiente|n[ãa]o (existem|possui|apresenta)/i.test(resp)) {
        falhas.push('Não reconheceu explicitamente a ausência de dados — risco de estar alucinando um problema.');
      }
      return falhas;
    },
  },
  {
    nome: 'Cliente 12762 — equipamento ZTE não deve puxar o padrão de problema do TP-Link',
    rodar: async () => {
      const r = await gerarDiagnosticoIndividual(12762, SOLICITANTE);
      return r.textoCompleto;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      if (/tp-?link/i.test(resp)) falhas.push('Mencionou TP-Link para um cliente cujo equipamento atual é ZTE — regra de padrão de equipamento sendo aplicada fora de contexto.');
      return falhas;
    },
  },
  {
    nome: 'Gestão — ranking de vendedores de abril/2026 (mês fechado, não muda)',
    rodar: () => gerarRespostaGestaoIndividual('quem foram os melhores vendedores em abril de 2026?', SOLICITANTE).then((r) => r.resposta),
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/sebasti[aã]o/i.test(resp)) falhas.push('Não citou o vendedor real (Sebastião) líder em valor de ativos em abril/2026.');
      return falhas;
    },
  },
  {
    nome: 'Gestão — pergunta sobre mês sem snapshot explica a defasagem',
    rodar: () => gerarRespostaGestaoIndividual('como esta a evolucao de vendas de junho de 2026?', SOLICITANTE).then((r) => r.resposta),
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/19|n[aã]o (est[aá]|h[aá])|dispon[ií]vel/i.test(resp)) {
        falhas.push('Não explicou por que não há dados de junho/2026 (defasagem do snapshot, gerado dia 19).');
      }
      return falhas;
    },
  },
  {
    nome: 'Gestão — status de POP real responde com dados ao vivo',
    rodar: () => gerarRespostaGestaoIndividual('como esta o pop aguas claras hoje?', SOLICITANTE).then((r) => r.resposta),
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/\d/.test(resp)) falhas.push('Não trouxe nenhum número (ONUs/status) para um POP que existe na lista.');
      return falhas;
    },
  },
  {
    nome: 'Gestão — POP inexistente não inventa dado',
    rodar: () => gerarRespostaGestaoIndividual('como esta o pop centro hoje?', SOLICITANTE).then((r) => r.resposta),
    verificar: (resp) => {
      const falhas: string[] = [];
      if (!/n[ãa]o (h[áa]|encontrei|possui|tem|existe)|n[ãa]o est[áa]/i.test(resp)) {
        falhas.push('Não deixou claro que o POP "Centro" não existe na lista, em vez de inventar dado.');
      }
      return falhas;
    },
  },
  {
    nome: 'Gestão — não compara líder de um mês com número de outro mês como "superou" (bug real, achado via feedback do usuário)',
    rodar: async () => {
      const historico: { pergunta: string; resposta: string }[] = [];
      const r1 = await gerarRespostaGestaoIndividual('Como está o setor de vendas? o que tem chamado mais atenção?', SOLICITANTE);
      historico.push({ pergunta: 'Como está o setor de vendas? o que tem chamado mais atenção?', resposta: r1.resposta });
      const r2 = await gerarRespostaGestaoIndividual('faça um resumo', SOLICITANTE, historico);
      return r2.resposta;
    },
    verificar: (resp) => {
      const falhas: string[] = [];
      // Nathalia (maio, R$9152.80) NÃO supera o número de abril de Sebastião (R$10473.20) —
      // se a resposta citar os dois números junto com linguagem de "superar", é o bug de volta.
      const misturouMeses = /supera|ultrapass/i.test(resp) && /9152/.test(resp) && /10473/.test(resp);
      if (misturouMeses) {
        falhas.push('Comparou o líder de maio (Nathalia) com o número de abril de outro vendedor (Sebastião) como se fosse "superar" — números de meses diferentes não são comparáveis assim.');
      }
      return falhas;
    },
  },
];

async function run() {
  let passou = 0;
  let falhou = 0;

  for (const caso of casos) {
    process.stdout.write(`\n▶ ${caso.nome}\n`);
    try {
      const resposta = await caso.rodar();
      const falhas = caso.verificar(resposta);
      if (falhas.length === 0) {
        console.log('  ✓ PASSOU');
        passou++;
      } else {
        console.log('  ✗ FALHOU');
        falhas.forEach((f) => console.log(`    - ${f}`));
        console.log(`  Resposta obtida: ${resposta.slice(0, 300)}`);
        falhou++;
      }
    } catch (err: any) {
      console.log('  ✗ ERRO ao rodar o caso');
      console.log(`    ${err.message}`);
      falhou++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Resultado: ${passou} passou, ${falhou} falhou (de ${casos.length})`);
  await prisma.$disconnect();
  process.exit(falhou > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
