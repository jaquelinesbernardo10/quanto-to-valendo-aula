// Agente de análise: loop MANUAL de tool calling + validação Zod com retries.
// Todo estado de uma análise vive dentro da chamada (invariante 6): em module
// scope só o client Anthropic (imutável, criado sob demanda).

import Anthropic from '@anthropic-ai/sdk';
import { AnaliseCompleta } from './schema.js';
import { TOOL_CONSULTAR_FAIXA, executarTool, consultarFaixaSalarial, proximoNivel } from './tools.js';
import { getSystemPrompt } from './prompts.js';
import { AnaliseInvalidaError } from './erros.js';

export const MODELO_PADRAO = 'claude-haiku-4-5';
const MAX_RETRIES_VALIDACAO = 2;
const MAX_ITERACOES_TOOL = 8;
const MAX_TOKENS = 4096;

let clientPadrao = null;
function obterClientPadrao() {
  if (!clientPadrao) clientPadrao = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  return clientPadrao;
}

/** Remove ```json ... ``` (ou ``` ... ```) ao redor do JSON, se houver. */
export function removerCodeFence(texto) {
  const t = String(texto ?? '').trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) return m[1].trim();
  // Fallback: recorta do primeiro "{" ao último "}".
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  return ini !== -1 && fim > ini ? t.slice(ini, fim + 1) : t;
}

function textoDaResposta(resposta) {
  return (resposta.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** Valida o texto final; devolve { ok, analise } ou { ok: false, erro }. */
export function validarResposta(texto) {
  let json;
  try {
    json = JSON.parse(removerCodeFence(texto));
  } catch (e) {
    return { ok: false, erro: `A resposta não é JSON válido: ${e.message}` };
  }
  const r = AnaliseCompleta.safeParse(json);
  if (!r.success) {
    const detalhes = r.error.issues
      .map((i) => `- ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    return { ok: false, erro: `O JSON não segue o schema AnaliseCompleta:\n${detalhes}` };
  }
  return { ok: true, analise: r.data };
}

/**
 * Garante a invariante 1 de forma determinística: as faixas e o delta finais vêm
 * da tool, não do texto do modelo. delta_mensal = diferença das medianas; staff → null.
 */
export function reconciliarComTool(analise) {
  const { cargo, senioridade } = analise.veredito;
  const faixaAtual = consultarFaixaSalarial(cargo, senioridade);
  const nivelSeguinte = proximoNivel(senioridade);
  const faixaProxima = nivelSeguinte ? consultarFaixaSalarial(cargo, nivelSeguinte) : null;
  return {
    ...analise,
    veredito: { ...analise.veredito, faixa_atual: faixaAtual },
    delta: {
      ...analise.delta,
      faixa_proximo_nivel: faixaProxima,
      delta_mensal: faixaProxima ? faixaProxima.mediana - faixaAtual.mediana : null,
    },
  };
}

/**
 * Analisa um currículo e devolve um AnaliseCompleta validado.
 * @param {string} texto - texto do currículo
 * @param {{ client?: object, modelo?: string, systemPromptOverride?: string, logger?: object }} [opcoes]
 */
export async function analisarCurriculo(texto, opcoes = {}) {
  const client = opcoes.client ?? obterClientPadrao();
  const modelo = opcoes.modelo || process.env.MODELO_AGENTE || MODELO_PADRAO;
  const system = getSystemPrompt(opcoes.systemPromptOverride);
  const logger = opcoes.logger;

  const mensagens = [
    { role: 'user', content: `Analise este currículo:\n\n<curriculo>\n${texto}\n</curriculo>` },
  ];
  let retriesRestantes = MAX_RETRIES_VALIDACAO;
  let iteracoes = 0;
  let ultimoErro = 'sem resposta';

  while (true) {
    iteracoes += 1;
    if (iteracoes > MAX_ITERACOES_TOOL + MAX_RETRIES_VALIDACAO + 1) {
      throw new AnaliseInvalidaError(`Limite de iterações atingido (${ultimoErro}).`);
    }

    const resposta = await client.messages.create({
      model: modelo,
      max_tokens: MAX_TOKENS,
      system,
      tools: [TOOL_CONSULTAR_FAIXA],
      messages: mensagens,
    });
    mensagens.push({ role: 'assistant', content: resposta.content });

    const chamadas = (resposta.content ?? []).filter((b) => b.type === 'tool_use');
    if (resposta.stop_reason === 'tool_use' && chamadas.length > 0) {
      const resultados = chamadas.map((chamada) => {
        const { erro, conteudo } = executarTool(chamada.name, chamada.input);
        logger?.debug?.({ tool: chamada.name, entrada: chamada.input, erro }, 'tool executada');
        return {
          type: 'tool_result',
          tool_use_id: chamada.id,
          content: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo),
          ...(erro ? { is_error: true } : {}),
        };
      });
      mensagens.push({ role: 'user', content: resultados });
      continue;
    }

    const validacao = validarResposta(textoDaResposta(resposta));
    if (validacao.ok) return AnaliseCompleta.parse(reconciliarComTool(validacao.analise));

    ultimoErro = validacao.erro;
    if (retriesRestantes === 0) {
      throw new AnaliseInvalidaError(`Análise inválida após ${MAX_RETRIES_VALIDACAO} retries: ${ultimoErro}`);
    }
    retriesRestantes -= 1;
    logger?.warn?.({ erro: ultimoErro, retriesRestantes }, 'resposta inválida, reenviando erro ao modelo');
    mensagens.push({
      role: 'user',
      content: `${ultimoErro}\n\nCorrija e responda novamente APENAS com o JSON válido.`,
    });
  }
}
