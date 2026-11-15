// /api/settings — override do system prompt, modelo e toggle global do agente.
import { Router } from 'express';
import { PROMPT_PADRAO } from '../core/prompts.js';
import { MODELO_PADRAO } from '../core/agente.js';

export const MODELOS_VALIDOS = Object.freeze([
  'claude-haiku-4-5',
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
]);

export function rotasConfiguracoes({ repo }) {
  const r = Router();

  const resposta = () => {
    const c = repo.obterConfiguracoes();
    return {
      ...c,
      modelo: c.modelo || process.env.MODELO_AGENTE || MODELO_PADRAO,
      prompt_padrao: PROMPT_PADRAO,
      modelos_disponiveis: MODELOS_VALIDOS,
    };
  };

  r.get('/', (_req, res) => {
    res.json(resposta());
  });

  r.put('/', (req, res) => {
    const { system_prompt_override, modelo, agente_ativo_global } = req.body ?? {};
    if (system_prompt_override !== undefined && typeof system_prompt_override !== 'string') {
      return res.status(400).json({ erro: 'system_prompt_override deve ser texto.' });
    }
    if (modelo !== undefined && !MODELOS_VALIDOS.includes(modelo)) {
      return res.status(400).json({ erro: `Modelo inválido. Use um de: ${MODELOS_VALIDOS.join(', ')}.` });
    }
    if (agente_ativo_global !== undefined && typeof agente_ativo_global !== 'boolean') {
      return res.status(400).json({ erro: 'agente_ativo_global deve ser booleano.' });
    }
    if (system_prompt_override !== undefined) {
      // Override igual ao padrão (ou vazio) = sem override.
      const texto = system_prompt_override.trim();
      repo.salvarConfig('system_prompt_override', texto === PROMPT_PADRAO.trim() ? '' : texto);
    }
    if (modelo !== undefined) repo.salvarConfig('modelo', modelo);
    if (agente_ativo_global !== undefined) repo.salvarConfig('agente_ativo_global', agente_ativo_global ? '1' : '0');
    res.json(resposta());
  });

  return r;
}
