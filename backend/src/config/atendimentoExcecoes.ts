import fs from 'fs';
import path from 'path';

/// Nomes de conta do roster de Atendimento/QA que não representam 1 pessoa
/// real (agregados, contas de treino) são específicos de cada instalação,
/// vêm de config/atendimento-excecoes.json (não commitado, ver
/// .example.json pro formato). Mesmo padrão de setores-atendimento.json.

interface ConfigExcecoesArquivo {
  agentesExcluidosRanking: string[];
  palavrasContaTeste:      string[];
}

const CAMINHO_CONFIG = path.join(__dirname, '../../config/atendimento-excecoes.json');

function carregarConfigExcecoes(): ConfigExcecoesArquivo {
  if (!fs.existsSync(CAMINHO_CONFIG)) {
    throw new Error(
      `Arquivo de configuração não encontrado: ${CAMINHO_CONFIG}. Copie ` +
      `backend/config/atendimento-excecoes.example.json para ` +
      `backend/config/atendimento-excecoes.json e preencha com os nomes ` +
      `de conta excepcionais desta instalação.`
    );
  }
  return JSON.parse(fs.readFileSync(CAMINHO_CONFIG, 'utf8'));
}

const config = carregarConfigExcecoes();

export const AGENTES_QA_EXCLUIDOS_RANKING: string[] = config.agentesExcluidosRanking;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/// Casa em qualquer parte do nome (não só no início), sem diferenciar
/// maiúsculas/minúsculas — mesmo comportamento do regex fixo que isso
/// substitui.
export const NOME_CONTA_TESTE_REGEX = new RegExp(
  config.palavrasContaTeste.map(escapeRegex).join('|'),
  'i',
);
