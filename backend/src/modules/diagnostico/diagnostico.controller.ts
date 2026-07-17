import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../auth/auth.service';
import prisma from '../../config/prisma';
import { gerarDiagnosticoIndividual, gerarRespostaGestaoIndividual, intervaloMesAtual, criarJanelaAtual } from './diagnostico.service';
import {
  buscarClientePorNome,
  buscarRankingVendedores,
  buscarEvolucaoVendas,
  buscarStatusPops,
} from './diagnostico.repository';
import { buscarPioresClientesHoje } from '../otdr/otdr.service';
import { getResumoAuditoriaRetencao, getRetencao } from '../retencao/retencao.service';
import { obterMetricasIxc } from '../../config/ixcSession';
import { obterMetricasAgregadasGemini } from './diagnostico.ia';
import { FONTES_GESTAO } from './diagnostico.gestao-fontes';
import { gerarPdfFonte, gerarExcelFonte } from './diagnostico.relatorios';

type AuthRequest = Request & { user: AuthPayload };

export async function buscarCliente(req: Request, res: Response, next: NextFunction) {
  try {
    const { termo } = req.query as { termo: string };
    const candidatos = await buscarClientePorNome(termo);
    res.json(candidatos);
  } catch (err) { next(err); }
}

export async function criarConsulta(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, nome } = (req as AuthRequest).user;
    const { id_cliente, pergunta, historico } = req.body as {
      id_cliente: number;
      pergunta?: string;
      historico?: { pergunta: string; resposta: string }[];
    };

    const resultado = await gerarDiagnosticoIndividual(
      id_cliente,
      { ixcUserId: id, ixcUsername: nome },
      pergunta,
      historico,
    );

    res.json(resultado);
  } catch (err) { next(err); }
}

export async function listarHistoricoConsultas(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_cliente } = req.params;
    const consultas = await prisma.diagnosticoConsulta.findMany({
      where: { tipo_alvo: 'CLIENTE', id_alvo: id_cliente },
      orderBy: { criado_em: 'desc' },
      take: 50,
      select: {
        id: true, pergunta: true, resposta: true,
        ixc_username: true, criado_em: true,
      },
    });
    res.json(consultas);
  } catch (err) { next(err); }
}

export async function criarConsultaGestao(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, nome } = (req as AuthRequest).user;
    const { pergunta, historico } = req.body as {
      pergunta: string;
      historico?: { pergunta: string; resposta: string }[];
    };

    const resultado = await gerarRespostaGestaoIndividual(
      pergunta,
      { ixcUserId: id, ixcUsername: nome },
      historico,
    );

    res.json(resultado);
  } catch (err) { next(err); }
}

const NOMES_FORMATO: Record<string, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

/// Gera o arquivo pedido pelo CAIO no chat (ver EXPORTAR: em
/// diagnostico.service.ts::gerarRespostaGestaoIndividual) — recalcula o dado
/// na hora do download (não fica nada em cache/disco), então "chave" e
/// "formato" já vêm validados contra FONTES_GESTAO desde o momento em que a
/// resposta do chat foi montada; aqui só confere de novo por segurança
/// (a URL podia ser adulterada manualmente).
export async function exportarRelatorioGestao(req: Request, res: Response, next: NextFunction) {
  try {
    const { chave, formato } = req.query as { chave?: string; formato?: string };
    const fonte = FONTES_GESTAO.find((f) => f.chave === chave);
    if (!fonte) { res.status(400).json({ message: 'Fonte de relatório desconhecida.' }); return; }
    if (formato !== 'pdf' && formato !== 'xlsx') { res.status(400).json({ message: 'Formato deve ser pdf ou xlsx.' }); return; }
    if (formato === 'xlsx' && !fonte.paraExcel) { res.status(400).json({ message: 'Essa fonte não está disponível em Excel.' }); return; }

    const dados = await fonte.buscar(criarJanelaAtual());
    const buffer = formato === 'pdf' ? await gerarPdfFonte(fonte, dados) : await gerarExcelFonte(fonte, dados);
    if (!buffer) { res.status(400).json({ message: 'Não foi possível gerar o arquivo para essa fonte.' }); return; }

    const nomeArquivo = `${chave}-${new Date().toISOString().slice(0, 10)}.${formato}`;
    res.setHeader('Content-Type', NOMES_FORMATO[formato]);
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (err) { next(err); }
}

export async function registrarFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { feedback, comentario } = req.body as { feedback: 'POSITIVO' | 'NEGATIVO'; comentario?: string };
    await prisma.diagnosticoConsulta.update({
      where: { id },
      data: { feedback, feedback_comentario: comentario ?? null, feedback_em: new Date() },
    });
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Consulta não encontrada.' });
      return;
    }
    next(err);
  }
}

export async function statusIxc(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(obterMetricasIxc());
  } catch (err) { next(err); }
}

export async function statusGemini(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(obterMetricasAgregadasGemini());
  } catch (err) { next(err); }
}

/// Resumo direto do Painel de Gestão (ranking + evolução + POPs), sem passar
/// pelo Gemini — dado bruto, rápido e sem custo de API, pra alimentar os
/// cards visuais do painel. O chat de gestão continua existindo à parte,
/// pra perguntas que exigem síntese/interpretação.
export async function resumoGestao(req: Request, res: Response, next: NextFunction) {
  try {
    const [ranking, evolucao, statusRede, piores, auditoriaRetencao, retencaoMes] = await Promise.all([
      buscarRankingVendedores(),
      buscarEvolucaoVendas(),
      buscarStatusPops().catch(() => ({ pops: [], piorGeral: null })),
      buscarPioresClientesHoje(5).catch(() => []),
      getResumoAuditoriaRetencao().catch(() => null),
      getRetencao('gestor', '', intervaloMesAtual()).then((r) => r.kpis).catch(() => null),
    ]);
    res.json({ ranking, evolucao, pops: statusRede.pops, piorGeral: statusRede.piorGeral, piores, auditoriaRetencao, retencaoMes });
  } catch (err) { next(err); }
}

export async function listarAgregados(req: Request, res: Response, next: NextFunction) {
  try {
    const { dimensao } = req.query as { dimensao?: string };
    const agregados = await prisma.diagnosticoAgregado.findMany({
      where: dimensao ? { dimensao } : undefined,
      orderBy: { atualizado_em: 'desc' },
    });
    res.json(agregados);
  } catch (err) { next(err); }
}

export async function listarRegras(req: Request, res: Response, next: NextFunction) {
  try {
    const regras = await prisma.diagnosticoRegraNegocio.findMany({ orderBy: { chave: 'asc' } });
    res.json(regras);
  } catch (err) { next(err); }
}

export async function criarRegra(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome } = (req as AuthRequest).user;
    const { chave, valor, descricao, categoria } = req.body;
    const regra = await prisma.diagnosticoRegraNegocio.create({
      data: { chave, valor, descricao, categoria, atualizado_por: nome },
    });
    res.status(201).json(regra);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Já existe uma regra com essa chave.' });
      return;
    }
    next(err);
  }
}

export async function editarRegra(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome } = (req as AuthRequest).user;
    const { chave } = req.params;
    const { valor, descricao, categoria } = req.body;
    const regra = await prisma.diagnosticoRegraNegocio.update({
      where: { chave },
      data: { valor, descricao, categoria, atualizado_por: nome },
    });
    res.json(regra);
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Regra não encontrada.' });
      return;
    }
    next(err);
  }
}

export async function excluirRegra(req: Request, res: Response, next: NextFunction) {
  try {
    const { chave } = req.params;
    await prisma.diagnosticoRegraNegocio.delete({ where: { chave } });
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Regra não encontrada.' });
      return;
    }
    next(err);
  }
}
