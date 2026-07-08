import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// O OTDR (dashboard de monitoramento de rede) fica atrás do proxy Nginx em
// /otdr/, mas não tem sessão própria de navegador — quando o usuário clica
// no ícone do menu, geramos um token assinado de curta duração (60s) que o
// Flask do OTDR valida (mesma chave secreta, HMAC) e troca por uma sessão
// própria dele. Ver /home/canaa/OTDR/dashboard/app.py (_validar_sso).
const OTDR_PUBLIC_URL = process.env.OTDR_PUBLIC_URL ?? 'https://exemplo.com.br/otdr/';

// Quem pode acessar o OTDR: gestores e Supervisão Campo (grupo IXC 138).
// Isso é checado aqui, no backend, porque o botão escondido no menu (v-if)
// é só uma conveniência de UI — sem essa checagem, qualquer usuário
// autenticado poderia chamar essa rota direto e conseguir o link de acesso.
const PERFIS_PERMITIDOS = ['gestor', 'campo'];

export function gerarLinkOtdr(req: Request, res: Response) {
  const secret = process.env.OTDR_SSO_SECRET;
  if (!secret) {
    res.status(500).json({ message: 'OTDR_SSO_SECRET não configurado no servidor.' });
    return;
  }

  if (!PERFIS_PERMITIDOS.includes(req.user!.perfil)) {
    res.status(403).json({ message: 'Seu perfil não tem acesso ao OTDR.' });
    return;
  }

  const payload = {
    sub:    req.user!.id,
    nome:   req.user!.nome,
    perfil: req.user!.perfil,
  };
  const token = jwt.sign(payload, secret, { expiresIn: '60s' });

  const base = OTDR_PUBLIC_URL.endsWith('/') ? OTDR_PUBLIC_URL : `${OTDR_PUBLIC_URL}/`;
  res.json({ url: `${base}painel?sso=${token}` });
}
