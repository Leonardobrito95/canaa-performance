import { Pool } from 'pg';
import logger from '../../config/logger';

const agendaPool = new Pool({
  host: process.env.AGENDA_DB_HOST || 'localhost',
  port: 5432,
  user: process.env.AGENDA_DB_USER || 'postgres',
  password: process.env.AGENDA_DB_PASS,
  database: process.env.AGENDA_DB_NAME || 'sistema_db',
  ssl: false,
  connectionTimeoutMillis: 5000,
  // search_path como parâmetro nativo da conexão: o Postgres garante que já está
  // em vigor antes da primeira query, sem a corrida do evento 'connect'.
  options: '-c search_path=central_agendamento,public',
});

agendaPool.connect()
  .then(c => { logger.info('[AGENDA] DB conectado'); c.release(); })
  .catch(err => logger.error('[AGENDA] DB falha na conexão', { error: err.message }));

export default agendaPool;
