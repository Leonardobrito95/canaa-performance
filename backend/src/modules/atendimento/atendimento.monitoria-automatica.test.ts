import { describe, it, expect } from 'vitest';
import { deveEscalarAposAvaliacao } from './atendimento.monitoria-automatica';

describe('deveEscalarAposAvaliacao', () => {
  it('escala quando há erro crítico, mesmo com pontuação zerada explícita', () => {
    expect(deveEscalarAposAvaliacao({ pontuacao: 0, erroCritico: true })).toBe(true);
  });

  it('escala quando a pontuação cai abaixo do corte de "Bom" (7.0)', () => {
    expect(deveEscalarAposAvaliacao({ pontuacao: 6.99, erroCritico: false })).toBe(true);
    expect(deveEscalarAposAvaliacao({ pontuacao: 0, erroCritico: false })).toBe(true);
  });

  it('NÃO escala quando a pontuação bate exatamente o corte de "Bom" (7.0) ou acima', () => {
    expect(deveEscalarAposAvaliacao({ pontuacao: 7.0, erroCritico: false })).toBe(false);
    expect(deveEscalarAposAvaliacao({ pontuacao: 9.0, erroCritico: false })).toBe(false);
    expect(deveEscalarAposAvaliacao({ pontuacao: 10, erroCritico: false })).toBe(false);
  });
});
