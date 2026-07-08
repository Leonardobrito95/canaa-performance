import jwt from 'jsonwebtoken';
import { findUserByCredentials } from './auth.repository';

export interface AuthPayload {
  id: string;
  nome: string;
  email: string;
  id_grupo: number;
  perfil: 'consultor' | 'gestor' | 'cs' | 'estoque' | 'campo';
}

// Grupos de gestor: BDR gestor + administradores IXC + admin Centro de Solução (140)
const GESTOR_GROUPS  = [134, 101, 147, 140, 123];
// Grupos de Centro de Solução
const CS_GROUPS      = [109];
// Grupos de Estoque (acesso restrito ao Hub)
const ESTOQUE_GROUPS = [142, 128, 143];
// Grupos de Campo (acesso restrito ao módulo de comissão de campo e hub)
const CAMPO_GROUPS   = [138];

const httpError = (msg: string, status: number) =>
  Object.assign(new Error(msg), { status });

export async function login(email: string, password: string): Promise<{ token: string; ixc_user_id: string; user: Omit<AuthPayload, 'id'> }> {
  if (!email || !password) {
    throw httpError('E-mail e senha são obrigatórios.', 400);
  }

  const user = await findUserByCredentials(email.toLowerCase().trim(), password);
  if (!user) {
    throw httpError('Credenciais inválidas.', 401);
  }

  const perfil: AuthPayload['perfil'] =
    GESTOR_GROUPS.includes(user.id_grupo)  ? 'gestor'   :
    CS_GROUPS.includes(user.id_grupo)      ? 'cs'        :
    ESTOQUE_GROUPS.includes(user.id_grupo) ? 'estoque'   :
    CAMPO_GROUPS.includes(user.id_grupo)   ? 'campo'     :
    'consultor';

  const payload: AuthPayload = {
    id:       user.id,
    nome:     user.nome,
    email:    user.email,
    id_grupo: user.id_grupo,
    perfil,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });

  return {
    token,
    ixc_user_id: user.id,
    user: { nome: user.nome, email: user.email, id_grupo: user.id_grupo, perfil },
  };
}
