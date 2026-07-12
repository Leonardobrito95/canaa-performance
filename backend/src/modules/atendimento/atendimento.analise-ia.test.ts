import { describe, it, expect } from 'vitest';
import { calcularSentimentoCategoria, analisarAtendimento } from './atendimento.analise-ia';

describe('calcularSentimentoCategoria', () => {
  it('classifica os extremos e o meio da escala corretamente', () => {
    expect(calcularSentimentoCategoria(1)).toBe('muito_positivo');
    expect(calcularSentimentoCategoria(0.6)).toBe('muito_positivo');
    expect(calcularSentimentoCategoria(0.3)).toBe('positivo');
    expect(calcularSentimentoCategoria(0)).toBe('neutro');
    expect(calcularSentimentoCategoria(-0.3)).toBe('negativo');
    expect(calcularSentimentoCategoria(-0.6)).toBe('negativo'); // limiar é inclusivo, mesmo padrão dos outros limiares
    expect(calcularSentimentoCategoria(-0.61)).toBe('muito_negativo');
    expect(calcularSentimentoCategoria(-1)).toBe('muito_negativo');
  });
});

describe('analisarAtendimento — guarda de confiança insuficiente', () => {
  it('não chama IA e devolve confiancaInsuficiente=true pra ligação (pabx)', async () => {
    const { resultado, metricas } = await analisarAtendimento({
      protocolo: 'OPA1', setor: 'SAC', canal: 'pabx', dataAtendimento: new Date(),
      mensagens: [{ data: new Date(), texto: 'oi' }, { data: new Date(), texto: 'tudo bem' }],
    });
    expect(resultado.confiancaInsuficiente).toBe(true);
    expect(resultado.adesaoScript).toBeNull();
    expect(resultado.indiceSentimento).toBeNull();
    expect(metricas).toBeNull();
  });

  it('não chama IA e devolve confiancaInsuficiente=true pra conversa com menos de 2 mensagens', async () => {
    const { resultado, metricas } = await analisarAtendimento({
      protocolo: 'OPA2', setor: 'SAC', canal: 'whatsapp', dataAtendimento: new Date(),
      mensagens: [{ data: new Date(), texto: 'obrigado' }],
    });
    expect(resultado.confiancaInsuficiente).toBe(true);
    expect(metricas).toBeNull();
  });
});
