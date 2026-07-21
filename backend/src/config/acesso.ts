import fs from 'fs';
import path from 'path';

/// Papéis fixos que o produto suporta (o "menu" de RBAC, definido em código,
/// todo módulo verifica contra esses nomes). O que É específico de cada
/// instalação (quais grupos do IXC caem em cada papel, e quais papéis
/// acessam cada módulo do Hub) vem de config/rbac.json (não commitado, ver
/// .example.json pro formato). Mesmo padrão de setores-atendimento.json.
export type Perfil = 'consultor' | 'gestor' | 'cs' | 'estoque' | 'campo' | 'agente';

const PAPEIS_COM_GRUPO_IXC = ['gestor', 'cs', 'estoque', 'campo', 'agente'] as const;
type PapelComGrupoIxc = (typeof PAPEIS_COM_GRUPO_IXC)[number];

interface PerfisModuloConfig {
  atendimentoGestaoQa:  Perfil[];
  atendimentoAuditoria: Perfil[];
  vistoriaPop:          Perfil[];
  posAtivacao:          Perfil[];
  retencaoAuditoria:    Perfil[];
  diagnosticoGestao:    Perfil[];
  bdrGeral:             Perfil[];
  otdrLink:             Perfil[];
  alertasHub:           Perfil[];
  rh:                   Perfil[];
}

interface ConfigRbacArquivo {
  gruposIxc:    Record<PapelComGrupoIxc, number[]>;
  perfisModulo: PerfisModuloConfig;
}

const CAMINHO_CONFIG = path.join(__dirname, '../../config/rbac.json');

function carregarConfigRbac(): ConfigRbacArquivo {
  if (!fs.existsSync(CAMINHO_CONFIG)) {
    throw new Error(
      `Arquivo de configuração não encontrado: ${CAMINHO_CONFIG}. Copie ` +
      `backend/config/rbac.example.json para backend/config/rbac.json e ` +
      `preencha com os grupos do IXC e o RBAC de módulos desta instalação.`
    );
  }
  return JSON.parse(fs.readFileSync(CAMINHO_CONFIG, 'utf8'));
}

const config = carregarConfigRbac();

export const PERFIS_MODULO: PerfisModuloConfig = config.perfisModulo;

/// Deriva o papel do usuário a partir do id_grupo do IXC. Um grupo que não
/// aparece em nenhuma lista de config/rbac.json cai no papel padrão
/// 'consultor' (mesmo comportamento do if/else que isso substitui).
export function perfilPorGrupoIxc(idGrupo: number): Perfil {
  for (const papel of PAPEIS_COM_GRUPO_IXC) {
    if (config.gruposIxc[papel]?.includes(idGrupo)) return papel;
  }
  return 'consultor';
}
