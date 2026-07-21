import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma';
import { findUserByCredentials } from './auth.repository';
import { Perfil, perfilPorGrupoIxc } from '../../config/acesso';

export interface AuthPayload {
  id: string;
  nome: string;
  email: string;
  id_grupo: number;
  perfil: Perfil;
  /// true quando o ixc_user_id logado bate com um agente ATIVO do roster de
  /// QA (AtendimentoAgenteQa) — decidido 1x no login, não a cada request.
  /// Habilita a nav "Minhas Avaliações" independente do perfil (109/138 já
  /// logam como cs/campo mas também podem ser agentes avaliados — grupo
  /// IXC não é sinal confiável de papel, confirmado 2026-07-12).
  souAgenteQa: boolean;
}

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

  const perfil: AuthPayload['perfil'] = perfilPorGrupoIxc(user.id_grupo);

  const agenteQa = await prisma.atendimentoAgenteQa.findFirst({
    where: { ixc_user_id: user.id, status: 'Ativo' },
    select: { id: true },
  });

  const payload: AuthPayload = {
    id:       user.id,
    nome:     user.nome,
    email:    user.email,
    id_grupo: user.id_grupo,
    perfil,
    souAgenteQa: Boolean(agenteQa),
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });

  return {
    token,
    ixc_user_id: user.id,
    user: { nome: user.nome, email: user.email, id_grupo: user.id_grupo, perfil, souAgenteQa: payload.souAgenteQa },
  };
}
