import { describe, it, expect } from 'vitest';
import {
  consultarFaixaSalarial,
  proximoNivel,
  executarTool,
  CARGO_GERAL,
} from '../src/core/tools.js';
import { FaixaSalarial } from '../src/core/schema.js';
import { PerfilSemMatchError } from '../src/core/erros.js';

describe('consultarFaixaSalarial', () => {
  it('match exato devolve a linha do dataset com match_exato=true', () => {
    const f = consultarFaixaSalarial('Cientista de Dados', 'senior');
    expect(f).toMatchObject({ cargo: 'Cientista de Dados', senioridade: 'senior', mediana: 14919, match_exato: true });
    expect(FaixaSalarial.safeParse(f).success).toBe(true);
  });

  it('ignora acentos e caixa na senioridade', () => {
    expect(consultarFaixaSalarial('Analista de Dados', 'Júnior').mediana).toBe(3516);
  });

  it('staff sempre cai em Geral (todas as funções)', () => {
    const f = consultarFaixaSalarial('Engenheiro de Dados', 'staff');
    expect(f.cargo).toBe(CARGO_GERAL);
    expect(f.mediana).toBe(17805);
    expect(f.match_exato).toBe(false);
    expect(consultarFaixaSalarial(CARGO_GERAL, 'staff').match_exato).toBe(true);
  });

  it('sem match exato devolve o recorte mais próximo com match_exato=false', () => {
    const f = consultarFaixaSalarial('Machine Learning Engineer', 'pleno');
    expect(f.cargo).toBe('Cientista de Dados');
    expect(f.match_exato).toBe(false);
    const bi = consultarFaixaSalarial('Analista de BI', 'senior');
    expect(bi).toMatchObject({ cargo: 'Analista de Dados', match_exato: false });
  });

  it('senioridade desconhecida lança PerfilSemMatchError', () => {
    expect(() => consultarFaixaSalarial('Analista de Dados', 'diretor')).toThrow(PerfilSemMatchError);
  });
});

describe('proximoNivel', () => {
  it('segue junior → pleno → senior → staff → null', () => {
    expect(proximoNivel('junior')).toBe('pleno');
    expect(proximoNivel('pleno')).toBe('senior');
    expect(proximoNivel('senior')).toBe('staff');
    expect(proximoNivel('staff')).toBeNull();
  });
});

describe('executarTool', () => {
  it('devolve erro em vez de lançar exceção', () => {
    expect(executarTool('outra_tool', {}).erro).toBe(true);
    expect(executarTool('consultar_faixa_salarial', { cargo: 'x', senioridade: 'y' }).erro).toBe(true);
  });
});
