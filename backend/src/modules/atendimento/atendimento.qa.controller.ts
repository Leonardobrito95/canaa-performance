import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../auth/auth.service';
import {
  criarMonitoriaQa, atualizarMonitoriaQa, buscarMonitoriaQaPorId, listarMonitoriasQa,
  getResumoNaoConformesPorCriterio, getDistribuicaoPorMotivo, getRankingAgentesPorQualidade,
  listarAgentesAtivos, listarEquipesQa, protocoloJaMonitorado,
  buscarAgenteQaPorIxcUserId, listarMinhasAvaliacoes, darCienciaMonitoria,
} from './atendimento.qa.service';
import { sugerirPreenchimentoQa } from './atendimento.qa.ia';
import { buscarAtendimentoPorProtocolo } from './atendimento.repository';
import { MonitoriaQaInput, FiltrosMonitoriaQa } from './atendimento.qa.types';

type AuthRequest = Request & { user: AuthPayload };

function parseData(valor: unknown, fallback: Date): Date {
  if (typeof valor !== 'string' || !valor) return fallback;
  const d = new Date(`${valor}T00:00:00`);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function listarMonitoriaQa(req: Request, res: Response, next: NextFunction) {
  try {
    const { agente, equipe, dateFrom, dateTo, origem } = req.query as Record<string, string>;
    const monitorias = await listarMonitoriasQa({
      agente, equipe,
      origem: origem as FiltrosMonitoriaQa['origem'],
      dateFrom: dateFrom ? parseData(dateFrom, new Date(0)) : undefined,
      dateTo:   dateTo ? parseData(dateTo, new Date()) : undefined,
    });
    res.json({ monitorias });
  } catch (err) { next(err); }
}

export async function dashboardQa(req: Request, res: Response, next: NextFunction) {
  try {
    const { agente, equipe, dateFrom, dateTo } = req.query as Record<string, string>;
    const filtros = {
      agente, equipe,
      dateFrom: dateFrom ? parseData(dateFrom, new Date(0)) : undefined,
      dateTo:   dateTo ? parseData(dateTo, new Date()) : undefined,
    };
    const [criterios, motivos, ranking, agentesAtivos, equipes] = await Promise.all([
      getResumoNaoConformesPorCriterio(filtros),
      getDistribuicaoPorMotivo(filtros),
      getRankingAgentesPorQualidade(filtros),
      listarAgentesAtivos(),
      listarEquipesQa(),
    ]);
    res.json({ criterios, motivos, ranking, agentesAtivos, equipes });
  } catch (err) { next(err); }
}

function montarInput(body: any): MonitoriaQaInput {
  return {
    protocolo:          body.protocolo,
    dataAtendimento:    parseData(body.dataAtendimento, new Date()),
    dataMonitoria:       parseData(body.dataMonitoria, new Date()),
    nomeAgente:          body.nomeAgente,
    equipe:              body.equipe,
    motivoAtendimento:   body.motivoAtendimento,
    monitoriaZero:       body.monitoriaZero,
    avaliacaoAtd:        body.avaliacaoAtd !== undefined && body.avaliacaoAtd !== '' ? Number(body.avaliacaoAtd) : undefined,
    observacoes:         body.observacoes,
    criterios:           body.criterios ?? {},
  };
}

export async function criarMonitoria(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = (req as AuthRequest).user;
    const input = montarInput(req.body);

    if (!input.protocolo) {
      res.status(400).json({ message: 'Protocolo é obrigatório.' });
      return;
    }
    if (await protocoloJaMonitorado(input.protocolo)) {
      res.status(409).json({ message: 'Este protocolo já tem uma monitoria registrada no Canaã Performance.' });
      return;
    }

    const monitoria = await criarMonitoriaQa(input, { ixcUserId: id });
    res.status(201).json(monitoria);
  } catch (err) { next(err); }
}

export async function atualizarMonitoria(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: monitoriaId } = req.params;
    const input = montarInput(req.body);

    if (await protocoloJaMonitorado(input.protocolo, monitoriaId)) {
      res.status(409).json({ message: 'Este protocolo já tem outra monitoria registrada no Canaã Performance.' });
      return;
    }

    const monitoria = await atualizarMonitoriaQa(monitoriaId, input);
    res.json(monitoria);
  } catch (err) { next(err); }
}

export async function buscarMonitoria(req: Request, res: Response, next: NextFunction) {
  try {
    const monitoria = await buscarMonitoriaQaPorId(req.params.id);
    if (!monitoria) {
      res.status(404).json({ message: 'Monitoria não encontrada.' });
      return;
    }
    res.json(monitoria);
  } catch (err) { next(err); }
}

/// Autoatendimento do agente — lista só as próprias avaliações, resolvidas
/// pelo `ixc_user_id` do usuário logado (nunca por nome vindo de query/body).
export async function minhasAvaliacoes(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = (req as AuthRequest).user;
    const agente = await buscarAgenteQaPorIxcUserId(id);
    if (!agente) {
      res.status(403).json({ message: 'Usuário não corresponde a um agente de QA ativo.' });
      return;
    }
    const monitorias = await listarMinhasAvaliacoes(agente.nome);
    res.json({ agente: { nome: agente.nome, equipe: agente.equipe }, monitorias });
  } catch (err) { next(err); }
}

/// Dá ciência numa avaliação própria — a identidade do agente é resolvida
/// server-side a partir do `ixc_user_id` autenticado, o service bloqueia
/// (403) se a avaliação pertencer a outra pessoa.
export async function comunicarCiencia(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: ixcUserId } = (req as AuthRequest).user;
    const agente = await buscarAgenteQaPorIxcUserId(ixcUserId);
    if (!agente) {
      res.status(403).json({ message: 'Usuário não corresponde a um agente de QA ativo.' });
      return;
    }
    const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim() || undefined : undefined;
    const monitoria = await darCienciaMonitoria(req.params.id, agente.nome, comentario);
    res.json(monitoria);
  } catch (err) { next(err); }
}

/// Copiloto do CAIO — sugere preenchimento, não grava nada. O QA confirma
/// via POST /atendimento/qa normalmente, como se tivesse preenchido à mão.
export async function sugestaoQa(req: Request, res: Response, next: NextFunction) {
  try {
    const { protocolo } = req.params;
    const atendimento = await buscarAtendimentoPorProtocolo(protocolo);
    if (!atendimento) {
      res.status(404).json({ message: 'Atendimento não encontrado (protocolo não localizado ou não é de um setor coberto).' });
      return;
    }
    const resultado = await sugerirPreenchimentoQa(atendimento);
    res.json(resultado);
  } catch (err) { next(err); }
}
