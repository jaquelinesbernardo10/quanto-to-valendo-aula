import { describe, it, expect } from 'vitest';
import { AnaliseCompleta, FONTE } from '../src/core/schema.js';
import { analisePleno, analiseStaff } from './fixtures.js';

describe('schema AnaliseCompleta', () => {
  it('aceita uma análise válida', () => {
    expect(AnaliseCompleta.safeParse(analisePleno()).success).toBe(true);
  });

  it('aceita staff com faixa_proximo_nivel e delta_mensal nulos', () => {
    expect(AnaliseCompleta.safeParse(analiseStaff()).success).toBe(true);
  });

  it('rejeita mais de 3 lacunas', () => {
    const a = analisePleno();
    a.caminho.gap_para_proximo_nivel = Array.from({ length: 4 }, (_, i) => ({
      lacuna: `l${i}`,
      porque_importa: 'x',
    }));
    expect(AnaliseCompleta.safeParse(a).success).toBe(false);
  });

  it('rejeita senioridade fora do enum', () => {
    const a = analisePleno();
    a.veredito.senioridade = 'diretor';
    expect(AnaliseCompleta.safeParse(a).success).toBe(false);
  });

  it('preenche fonte com o default', () => {
    const { fonte, ...semFonte } = analisePleno();
    expect(AnaliseCompleta.parse(semFonte).fonte).toBe(FONTE);
  });
});
