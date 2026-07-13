import { Request, Response } from 'express';
import { listarAlertasHub, resolverAlertaHub } from './alertasHub.service';

export async function resumo(req: Request, res: Response) {
  try {
    const itens = await listarAlertasHub();
    const contagem = {
      critico: itens.filter(i => i.severidade === 'CRITICO').length,
      aviso: itens.filter(i => i.severidade === 'AVISO').length,
      porOrigem: {
        atendimento: itens.filter(i => i.origem === 'atendimento').length,
        vistoria: itens.filter(i => i.origem === 'vistoria').length
      }
    };
    res.json({ itens, contagem });
  } catch (error) {
    console.error('Erro ao listar Alertas Hub:', error);
    res.status(500).json({ error: 'Erro ao listar alertas' });
  }
}

export async function resolver(req: Request, res: Response) {
  try {
    const { origem, id } = req.params;
    if (origem !== 'atendimento' && origem !== 'vistoria') {
      return res.status(400).json({ error: 'Origem inválida' });
    }
    const resolvido = await resolverAlertaHub(origem, id);
    res.json(resolvido);
  } catch (error) {
    console.error('Erro ao resolver Alerta Hub:', error);
    res.status(500).json({ error: 'Erro ao resolver alerta' });
  }
}
