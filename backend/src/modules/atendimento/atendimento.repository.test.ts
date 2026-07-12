import { describe, it, expect } from 'vitest';
import { calcularTemposRespostaHumana } from './atendimento.repository';

const HUMANO = [{ inicio: new Date('2026-07-11T10:00:00Z').getTime(), fim: new Date('2026-07-11T11:00:00Z').getTime() }];

function msg(hhmmss: string, ehCliente: boolean, ehSaida: boolean) {
  return { data: new Date(`2026-07-11T${hhmmss}Z`), ehCliente, ehSaida };
}

describe('calcularTemposRespostaHumana', () => {
  it('mede o intervalo entre mensagem do cliente e a resposta humana seguinte', () => {
    const mensagens = [
      msg('10:00:00', true, false),  // cliente
      msg('10:00:30', false, true),  // humano responde 30s depois
    ];
    const amostras = calcularTemposRespostaHumana(mensagens, HUMANO);
    expect(amostras).toEqual([30000]);
  });

  it('NUNCA conta resposta da URA/IZA (fora do segmento humano) — o relógio continua até um humano responder', () => {
    const mensagens = [
      msg('10:00:00', true, false),   // cliente
      msg('09:59:05', false, true),   // "resposta" da URA/IZA, ANTES do segmento humano começar (bot)
      msg('10:02:00', false, true),   // agora sim, dentro do segmento humano
    ];
    const amostras = calcularTemposRespostaHumana(mensagens, HUMANO);
    // Tem que medir do cliente (10:00:00) até a resposta HUMANA (10:02:00) = 120s,
    // ignorando a resposta do bot em 09:59:05 inteiramente.
    expect(amostras).toEqual([120000]);
  });

  it('mensagem que o atendente manda por conta própria (sem pergunta do cliente antes) não conta', () => {
    const mensagens = [
      msg('10:05:00', false, true), // humano manda mensagem proativa, sem cliente ter escrito nada
    ];
    const amostras = calcularTemposRespostaHumana(mensagens, HUMANO);
    expect(amostras).toEqual([]);
  });

  it('cada troca cliente->humano vira uma amostra própria dentro da mesma conversa', () => {
    const mensagens = [
      msg('10:00:00', true, false),
      msg('10:00:10', false, true),  // 10s
      msg('10:05:00', true, false),
      msg('10:05:40', false, true),  // 40s
    ];
    const amostras = calcularTemposRespostaHumana(mensagens, HUMANO);
    expect(amostras).toEqual([10000, 40000]);
  });

  it('sem segmento humano nenhum, nunca gera amostra (atendimento nunca teve humano)', () => {
    const mensagens = [
      msg('10:00:00', true, false),
      msg('10:00:05', false, true),
    ];
    const amostras = calcularTemposRespostaHumana(mensagens, []);
    expect(amostras).toEqual([]);
  });
});
