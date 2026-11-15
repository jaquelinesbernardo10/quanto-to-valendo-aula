// Regra de dependência entre camadas (PRD §4.1).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function importsDe(pasta) {
  return readdirSync(join(SRC, pasta))
    .filter((f) => f.endsWith('.js'))
    .flatMap((arquivo) => {
      const codigo = readFileSync(join(SRC, pasta, arquivo), 'utf8');
      const alvos = [...codigo.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)];
      return alvos.map((m) => ({ arquivo, alvo: m[1] ?? m[2] }));
    });
}

describe('regra de dependência', () => {
  it('core/ não importa managers/, routes/, renderers/ nem db/', () => {
    const proibidos = importsDe('core').filter(({ alvo }) =>
      /(^|\/)(managers|routes|renderers|db)(\/|$)/.test(alvo),
    );
    expect(proibidos).toEqual([]);
  });

  it('core/ só importa caminhos relativos dentro do próprio core/', () => {
    const relativosParaFora = importsDe('core').filter(({ alvo }) => alvo.startsWith('..'));
    expect(relativosParaFora).toEqual([]);
  });

  it('renderers/ importam só core/schema.js', () => {
    const imports = importsDe('renderers');
    expect(imports.length).toBeGreaterThan(0);
    for (const { alvo } of imports) expect(alvo).toBe('../core/schema.js');
  });
});
