import fs from 'fs';
import path from 'path';

/// Valores de comissão em reais são específicos de cada instalação, vêm de
/// config/comissoes.json (não commitado, ver .example.json pro formato).
/// Mesmo padrão de setores-atendimento.json e retencao-diagnosticos.json.

export interface FaixaComissaoRetencao {
  minimo:     number;
  valorReais: number;
  label:      string;
  cor:        string;
}

interface ConfigComissoesArquivo {
  retencaoFaixas: FaixaComissaoRetencao[];
  bdr: {
    refidelizacao: number;
    downgrade:     number;
  };
}

const CAMINHO_CONFIG = path.join(__dirname, '../../config/comissoes.json');

function carregarConfigComissoes(): ConfigComissoesArquivo {
  if (!fs.existsSync(CAMINHO_CONFIG)) {
    throw new Error(
      `Arquivo de configuração não encontrado: ${CAMINHO_CONFIG}. Copie ` +
      `backend/config/comissoes.example.json para backend/config/comissoes.json ` +
      `e preencha com os valores reais de comissão desta instalação.`
    );
  }
  return JSON.parse(fs.readFileSync(CAMINHO_CONFIG, 'utf8'));
}

const config = carregarConfigComissoes();

/// Ordenada da maior 'minimo' pra menor — quem usa deve percorrer nessa
/// ordem e parar na primeira faixa atingida.
export const FAIXAS_COMISSAO_RETENCAO: FaixaComissaoRetencao[] =
  [...config.retencaoFaixas].sort((a, b) => b.minimo - a.minimo);

export const COMISSAO_BDR_REFIDELIZACAO = config.bdr.refidelizacao;
export const COMISSAO_BDR_DOWNGRADE     = config.bdr.downgrade;
