import { describe, it, expect } from 'vitest';
import { renderizar, formatarReais } from '../src/renderers/whatsappRenderer.js';
import { consultarFaixaSalarial } from '../src/core/tools.js';
import { analisePleno, analiseStaff } from './fixtures.js';

// Intl pode usar espaço não separável; normaliza para comparar.
const norm = (s) => s.replace(/ | /g, ' ');

describe('formatarReais', () => {
  it('formata em R$ com separador de milhar e sem centavos', () => {
    expect(norm(formatarReais(12500))).toBe('R$ 12.500');
    expect(norm(formatarReais(3571.6))).toBe('R$ 3.572');
    expect(norm(formatarReais(900))).toBe('R$ 900');
  });
});

describe('renderizar', () => {
  it('devolve 5 mensagens na ordem dos atos', () => {
    const msgs = renderizar(analisePleno()).map(norm);
    expect(msgs).toHaveLength(5);
    expect(msgs[0]).toContain('O Veredito');
    expect(msgs[1]).toContain('O Delta');
    expect(msgs[2]).toContain('O Caminho');
    expect(msgs[3]).toContain('90 dias');
    expect(msgs[4]).toContain('LinkedIn');
  });

  it('usa os números da faixa em linguagem humana', () => {
    const [veredito, delta] = renderizar(analisePleno()).map(norm);
    expect(veredito).toContain('entre *R$ 4.848* e *R$ 8.772*');
    expect(veredito).toContain('valor típico: *R$ 6.560*');
    expect(delta).toContain('*R$ 3.571 por mês* na mesa');
  });

  it('usa só formatação nativa do WhatsApp (sem #, HTML ou "percentil")', () => {
    for (const msg of [...renderizar(analisePleno()), ...renderizar(analiseStaff())]) {
      expect(msg).not.toMatch(/^#/m);
      expect(msg).not.toMatch(/<[a-z/][^>]*>/i);
      expect(msg.toLowerCase()).not.toContain('percentil');
    }
  });

  it('caso staff: o Ato 2 vira reconhecimento e não some', () => {
    const msgs = renderizar(analiseStaff());
    expect(msgs).toHaveLength(5);
    expect(msgs[1]).toContain('O Delta');
    expect(msgs[1]).toContain('topo da tabela');
    expect(msgs[1]).not.toContain('na mesa');
  });

  it('sinaliza quando o recorte não é exato', () => {
    const a = analisePleno();
    a.veredito.faixa_atual = consultarFaixaSalarial('Analista de BI', 'pleno');
    expect(renderizar(a)[0]).toContain('mais próximo');
    expect(renderizar(analisePleno())[0]).not.toContain('mais próximo');
  });

  it('lista as lacunas com •', () => {
    expect(renderizar(analisePleno())[2]).toContain('• *Modelagem dimensional*');
  });
});
