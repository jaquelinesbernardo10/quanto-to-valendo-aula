// Tool de consulta salarial. É a ÚNICA fonte de números salariais (invariante 1).
// O dataset é um asset estático e imutável, carregado uma vez (invariante 2).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Cargo, SENIORIDADES } from './schema.js';
import { PerfilSemMatchError } from './erros.js';

// Resolvido a partir deste arquivo, não do cwd (o pm2 roda com cwd ./backend).
const CAMINHO_DATASET = fileURLToPath(new URL('../../../dados/salarios.json', import.meta.url));

const DATASET = Object.freeze(
  JSON.parse(readFileSync(CAMINHO_DATASET, 'utf8')).map((linha) => Object.freeze(linha)),
);

export const CARGO_GERAL = 'Geral (todas as funções)';

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarSenioridade(senioridade) {
  const s = normalizar(senioridade);
  if (SENIORIDADES.includes(s)) return s;
  if (['jr', 'junior i', 'trainee', 'estagiario'].includes(s)) return 'junior';
  if (['pl', 'mid', 'pleno i', 'pleno ii'].includes(s)) return 'pleno';
  if (['sr', 'senior i', 'senior ii'].includes(s)) return 'senior';
  if (['principal', 'especialista', 'lead', 'tech lead', 'lider'].includes(s)) return 'staff';
  return null;
}

// Mapeia um cargo livre para o cargo do dataset mais próximo.
function cargoMaisProximo(cargo) {
  const c = normalizar(cargo);
  const exato = Cargo.options.find((opcao) => normalizar(opcao) === c);
  if (exato) return { cargo: exato, exato: true };
  if (/cientista|scientist|machine learning|\bml\b|\bia\b/.test(c)) {
    return { cargo: 'Cientista de Dados', exato: false };
  }
  if (/engenheir|engineer|analytics engineer|dataops|pipeline/.test(c)) {
    return { cargo: 'Engenheiro de Dados', exato: false };
  }
  if (/analista|analyst|\bbi\b|business intelligence/.test(c)) {
    return { cargo: 'Analista de Dados', exato: false };
  }
  return { cargo: 'Analista de Dados', exato: false };
}

/**
 * Consulta a faixa salarial de um (cargo, senioridade).
 * - staff sempre cai na linha "Geral (todas as funções)";
 * - sem match exato → recorte mais próximo com match_exato=false.
 * @returns {import('zod').infer<typeof import('./schema.js').FaixaSalarial>}
 */
export function consultarFaixaSalarial(cargo, senioridade) {
  const nivel = normalizarSenioridade(senioridade);
  if (!nivel) {
    throw new PerfilSemMatchError(`Senioridade desconhecida: "${senioridade}".`);
  }

  let cargoAlvo;
  let matchExato;
  if (nivel === 'staff') {
    cargoAlvo = CARGO_GERAL;
    matchExato = normalizar(cargo) === normalizar(CARGO_GERAL);
  } else {
    const proximo = cargoMaisProximo(cargo);
    cargoAlvo = proximo.cargo === CARGO_GERAL ? 'Analista de Dados' : proximo.cargo;
    matchExato = proximo.exato && proximo.cargo !== CARGO_GERAL;
  }

  const linha =
    DATASET.find((l) => l.cargo === cargoAlvo && l.senioridade === nivel) ??
    DATASET.find((l) => l.senioridade === nivel);
  if (!linha) {
    throw new PerfilSemMatchError(`Sem recorte para ${cargo} / ${senioridade}.`);
  }

  return {
    cargo: linha.cargo,
    senioridade: linha.senioridade,
    p25: linha.p25,
    mediana: linha.mediana,
    p75: linha.p75,
    n_respondentes: linha.n_respondentes,
    fonte: linha.fonte,
    match_exato: matchExato && linha.cargo === cargoAlvo,
  };
}

/** junior → pleno → senior → staff → null */
export function proximoNivel(senioridade) {
  const nivel = normalizarSenioridade(senioridade);
  const i = SENIORIDADES.indexOf(nivel);
  if (i === -1 || i === SENIORIDADES.length - 1) return null;
  return SENIORIDADES[i + 1];
}

// Definição da tool no formato da API Anthropic.
export const TOOL_CONSULTAR_FAIXA = Object.freeze({
  name: 'consultar_faixa_salarial',
  description:
    'Consulta a faixa salarial mensal (R$) da pesquisa State of Data Brazil 2025-2026 para um ' +
    'cargo e uma senioridade. É a ÚNICA fonte permitida de números salariais. Chame para o nível ' +
    'atual estimado e para o próximo nível. Senioridade "staff" usa sempre o recorte geral.',
  input_schema: {
    type: 'object',
    properties: {
      cargo: { type: 'string', enum: [...Cargo.options] },
      senioridade: { type: 'string', enum: [...SENIORIDADES] },
    },
    required: ['cargo', 'senioridade'],
  },
});

/** Executa uma chamada de tool vinda do modelo; erros viram resultado de erro, não exceção. */
export function executarTool(nome, entrada) {
  if (nome !== TOOL_CONSULTAR_FAIXA.name) {
    return { erro: true, conteudo: `Tool desconhecida: ${nome}` };
  }
  try {
    return { erro: false, conteudo: consultarFaixaSalarial(entrada?.cargo, entrada?.senioridade) };
  } catch (e) {
    return { erro: true, conteudo: e.message };
  }
}
