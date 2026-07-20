import { Request, Response, NextFunction } from 'express';
import {
  getKpis, getMotivos, getDistribuicao, getTendencia, getChurn, getTecnicos,
  getClientes, getClientesExport, getContatosCliente,
  getBairros, getCanais, getResolucaoSla,
} from './posativacao.service';

function parseJanela(valor: unknown): 30 | 60 | 90 | undefined {
  const n = Number(valor);
  return n === 30 || n === 60 || n === 90 ? n : undefined;
}

export async function kpis(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getKpis({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function motivos(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getMotivos({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function distribuicao(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getDistribuicao({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function tendencia(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getTendencia({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function churn(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getChurn();
    res.json(r);
  } catch (err) { next(err); }
}

export async function tecnicos(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getTecnicos({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function bairros(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getBairros({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function canais(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getCanais({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

export async function resolucaoSla(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getResolucaoSla({ janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

function parseFiltrosClientes(req: Request) {
  const q = req.query as Record<string, string>;
  return {
    janela:     parseJanela(q.janela),
    page:       q.page ? Number(q.page) : undefined,
    soContato:  q.so_contato === '1',
    busca:      q.busca,
    assunto:    q.assunto,
    minTickets: q.min_tickets ? Number(q.min_tickets) : undefined,
    dataAtivacaoInicio: q.data_ativacao_inicio || undefined,
    dataAtivacaoFim:    q.data_ativacao_fim || undefined,
  };
}

export async function clientes(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await getClientes(parseFiltrosClientes(req));
    res.json(r);
  } catch (err) { next(err); }
}

export async function contatosCliente(req: Request, res: Response, next: NextFunction) {
  try {
    const idCliente = Number(req.params.idCliente);
    const r = await getContatosCliente(idCliente, { janela: parseJanela(req.query.janela) });
    res.json(r);
  } catch (err) { next(err); }
}

const MOTIVO_LABEL: Record<string, string> = { I: 'Instalação', M: 'Mud. Endereço' };

function csvEscape(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

/// Mesmo formato do export original (CSV com ';', BOM UTF-8 pro Excel abrir
/// certo, mesmas 9 colunas).
export async function clientesExport(req: Request, res: Response, next: NextFunction) {
  try {
    const linhas = await getClientesExport(parseFiltrosClientes(req));
    const cabecalho = ['ID Contrato', 'ID Cliente', 'Cliente', 'Telefone', 'Ativação',
      'Tipo', 'Total Tickets', '1º Contato', 'Dias até 1º Contato'];

    const corpo = linhas.map((l) => [
      String(l.contratoId), String(l.idCliente), l.nome, l.telefone ?? '',
      l.dataAtivacao ?? '', MOTIVO_LABEL[l.motivoInclusao] ?? l.motivoInclusao,
      String(l.totalContatos), l.primeiroContato ?? '',
      l.diasPrimeiro !== null ? String(l.diasPrimeiro) : '',
    ].map(csvEscape).join(';'));

    const csv = '﻿' + [cabecalho.map(csvEscape).join(';'), ...corpo].join('\n');
    const filename = `pos_ativacao_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) { next(err); }
}
