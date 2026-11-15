import { describe, it, expect } from 'vitest';
import { analisarCurriculo, removerCodeFence } from '../src/core/agente.js';
import { AnaliseInvalidaError } from '../src/core/erros.js';
import { PROMPT_PADRAO } from '../src/core/prompts.js';
import {
  analisePleno,
  analiseStaff,
  clientFalso,
  respostaTool,
  respostaTexto,
  CV_EXEMPLO,
} from './fixtures.js';

describe('analisarCurriculo (client mockado)', () => {
  it('executa o loop de tool calling e devolve a análise validada', async () => {
    const client = clientFalso([
      respostaTool('t1', 'Analista de Dados', 'pleno'),
      respostaTool('t2', 'Analista de Dados', 'senior'),
      respostaTexto(JSON.stringify(analisePleno())),
    ]);
    const analise = await analisarCurriculo(CV_EXEMPLO, { client, modelo: 'modelo-teste' });

    expect(analise.veredito.senioridade).toBe('pleno');
    expect(analise.delta.delta_mensal).toBe(10131 - 6560);
    expect(client.chamadas).toHaveLength(3);
    expect(client.chamadas[0].model).toBe('modelo-teste');
    expect(client.chamadas[0].system).toBe(PROMPT_PADRAO);
    expect(client.chamadas[0].tools[0].name).toBe('consultar_faixa_salarial');

    // O tool_result enviado de volta contém os números do dataset.
    const resultado = client.chamadas[1].messages.at(-1).content[0];
    expect(resultado).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(JSON.parse(resultado.content).mediana).toBe(6560);
  });

  it('faz strip de code fence na resposta final', async () => {
    const client = clientFalso([respostaTexto('```json\n' + JSON.stringify(analisePleno()) + '\n```')]);
    await expect(analisarCurriculo(CV_EXEMPLO, { client })).resolves.toMatchObject({
      veredito: { cargo: 'Analista de Dados' },
    });
  });

  it('reenvia o erro de validação e aceita a resposta corrigida', async () => {
    const invalida = analisePleno();
    invalida.caminho.gap_para_proximo_nivel.push(
      { lacuna: 'a', porque_importa: 'b' },
      { lacuna: 'c', porque_importa: 'd' },
    );
    const client = clientFalso([
      respostaTexto('isto não é json'),
      respostaTexto(JSON.stringify(invalida)),
      respostaTexto(JSON.stringify(analisePleno())),
    ]);
    const analise = await analisarCurriculo(CV_EXEMPLO, { client });
    expect(analise.caminho.gap_para_proximo_nivel).toHaveLength(2);
    expect(client.chamadas).toHaveLength(3);
    expect(client.chamadas[2].messages.at(-1).content).toContain('gap_para_proximo_nivel');
  });

  it('desiste após 2 retries', async () => {
    const client = clientFalso([respostaTexto('x'), respostaTexto('y'), respostaTexto('z')]);
    await expect(analisarCurriculo(CV_EXEMPLO, { client })).rejects.toBeInstanceOf(AnaliseInvalidaError);
    expect(client.chamadas).toHaveLength(3);
  });

  it('usa o override do system prompt quando informado', async () => {
    const client = clientFalso([respostaTexto(JSON.stringify(analisePleno()))]);
    await analisarCurriculo(CV_EXEMPLO, { client, systemPromptOverride: 'prompt do painel' });
    expect(client.chamadas[0].system).toBe('prompt do painel');
  });

  it('corrige números inventados pelo modelo com os valores da tool', async () => {
    const inventada = analisePleno();
    inventada.veredito.faixa_atual.mediana = 99999;
    inventada.delta.delta_mensal = 1;
    const client = clientFalso([respostaTexto(JSON.stringify(inventada))]);
    const analise = await analisarCurriculo(CV_EXEMPLO, { client });
    expect(analise.veredito.faixa_atual.mediana).toBe(6560);
    expect(analise.delta.delta_mensal).toBe(10131 - 6560);
  });

  it('staff fica com próximo nível e delta nulos', async () => {
    const comDelta = analiseStaff();
    comDelta.delta.delta_mensal = 5000;
    const client = clientFalso([respostaTexto(JSON.stringify(comDelta))]);
    const analise = await analisarCurriculo(CV_EXEMPLO, { client });
    expect(analise.delta.faixa_proximo_nivel).toBeNull();
    expect(analise.delta.delta_mensal).toBeNull();
    expect(analise.veredito.faixa_atual.cargo).toBe('Geral (todas as funções)');
  });
});

describe('removerCodeFence', () => {
  it('remove ```json e ``` e recorta texto ao redor do objeto', () => {
    expect(removerCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(removerCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(removerCodeFence('Aqui está: {"a":1} pronto')).toBe('{"a":1}');
  });
});
