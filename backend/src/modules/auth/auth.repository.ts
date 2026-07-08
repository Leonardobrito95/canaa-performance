import pool from '../../config/mysql';
import { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

export interface IXCUser {
  id: string;
  nome: string;
  email: string;
  id_grupo: number;
}

// 110 = consultor BDR, 134/101/147/140/123 = gestor, 109 = CS, 142/128/143 = estoque/compras, 138 = campo
const ALLOWED_GROUPS = [110, 134, 101, 147, 140, 123, 109, 142, 128, 143, 138];

export async function findUserByCredentials(
  email: string,
  password: string
): Promise<IXCUser | null> {
  const senhaHash = crypto.createHash('sha256').update(password).digest('hex');

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, nome, email, id_grupo
     FROM usuarios
     WHERE email = ?
       AND senha = ?
       AND status = 'A'
       AND id_grupo IN (110, 134, 101, 147, 140, 123, 109, 142, 128, 143, 138)
     LIMIT 1`,
    [email, senhaHash]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id:       String(row.id),
    nome:     String(row.nome),
    email:    String(row.email),
    id_grupo: Number(row.id_grupo),
  };
}
