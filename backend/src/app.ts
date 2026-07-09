import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes     from './modules/auth/auth.routes';
import bdrRoutes      from './modules/bdr/bdr.routes';
import vendasRoutes   from './modules/vendas/vendas.routes';
import retencaoRoutes from './modules/retencao/retencao.routes';
import hubRoutes      from './modules/hub/hub.routes';
import comissaoRoutes from './modules/comissao/comissao.routes';
import agendaRoutes   from './modules/agenda/agenda.routes';
import otdrRoutes     from './modules/otdr/otdr.routes';
import diagnosticoRoutes from './modules/diagnostico/diagnostico.routes';
import { errorHandler } from './middlewares/errorHandler';
import logger from './config/logger';

const app = express();

// Hosts permitidos (compara por hostname, ignorando http/https e porta):
// cobre acesso por http:// e https:// ao mesmo domínio sem reabrir para terceiros.
const allowedHosts = new Set(
  [process.env.BASE_URL, 'http://localhost:5173']
    .filter((u): u is string => !!u)
    .map((u) => { try { return new URL(u).hostname; } catch { return u; } })
    .concat(['localhost', '127.0.0.1'])
    // Acesso por IP da própria VM em ambiente de desenvolvimento (teste manual
    // de tela via navegador em outra máquina da rede) — nunca em produção.
    .concat(process.env.NODE_ENV !== 'production' ? ['172.31.29.10'] : []),
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; } // apps nativos / same-origin sem header
    let hostname: string;
    try { hostname = new URL(origin).hostname; } catch { hostname = ''; }
    if (allowedHosts.has(hostname)) {
      callback(null, true);
    } else {
      logger.warn('[CORS] Origem bloqueada', { origin });
      callback(new Error('Origem não permitida pelo CORS.'));
    }
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve thumbnails do Hub enviados pelo admin
app.use('/hub/uploads/thumbnails', express.static(path.join(process.cwd(), 'uploads', 'hub', 'thumbnails')));

app.use('/api/v1/auth',     authRoutes);
app.use('/api/v1/bdr',      bdrRoutes);
app.use('/api/v1/vendas',   vendasRoutes);
app.use('/api/v1/retencao', retencaoRoutes);
app.use('/api/v1/hub',      hubRoutes);
app.use('/api/v1/comissao', comissaoRoutes);
app.use('/api/v1/agenda',  agendaRoutes);
app.use('/api/v1/otdr',    otdrRoutes);
app.use('/api/v1/diagnostico', diagnosticoRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

export default app;
