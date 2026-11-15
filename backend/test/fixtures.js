// Fixtures compartilhadas pelos testes.
import { consultarFaixaSalarial } from '../src/core/tools.js';
import { FONTE } from '../src/core/schema.js';

export function analisePleno() {
  const atual = consultarFaixaSalarial('Analista de Dados', 'pleno');
  const proxima = consultarFaixaSalarial('Analista de Dados', 'senior');
  return {
    veredito: {
      cargo: 'Analista de Dados',
      senioridade: 'pleno',
      faixa_atual: atual,
      justificativa: '4 anos com SQL e Power BI, dashboards de ponta a ponta para o time comercial.',
      aviso_estimativa: 'Valores são estimativas autodeclaradas da pesquisa.',
    },
    delta: {
      faixa_proximo_nivel: proxima,
      delta_mensal: proxima.mediana - atual.mediana,
      mensagem: 'Você está deixando dinheiro na mesa todo mês.',
    },
    caminho: {
      gap_para_proximo_nivel: [
        { lacuna: 'Modelagem dimensional', porque_importa: 'Seniores desenham a camada analítica.' },
        { lacuna: 'Mentoria', porque_importa: 'Senioridade é multiplicar o time.' },
      ],
      roadmap_90_dias: [
        { periodo: 'Dias 1–30', foco: 'Fundamentos', acoes: ['Estudar Kimball'] },
        { periodo: 'Dias 31–60', foco: 'Prática', acoes: ['Remodelar um mart'] },
        { periodo: 'Dias 61–90', foco: 'Visibilidade', acoes: ['Apresentar o resultado'] },
      ],
    },
    resumo_linkedin: 'Analista de Dados com 4 anos transformando dados comerciais em decisões.',
    fonte: FONTE,
  };
}

export function analiseStaff() {
  const base = analisePleno();
  return {
    ...base,
    veredito: {
      ...base.veredito,
      cargo: 'Engenheiro de Dados',
      senioridade: 'staff',
      faixa_atual: consultarFaixaSalarial('Engenheiro de Dados', 'staff'),
    },
    delta: { faixa_proximo_nivel: null, delta_mensal: null, mensagem: 'Você está no topo da tabela.' },
  };
}

// Client Anthropic falso: devolve as respostas da fila, em ordem, e grava as chamadas.
export function clientFalso(respostas) {
  const chamadas = [];
  return {
    chamadas,
    messages: {
      async create(params) {
        chamadas.push(structuredClone(params));
        const r = respostas.shift();
        if (!r) throw new Error('clientFalso sem respostas');
        return r;
      },
    },
  };
}

export const respostaTool = (id, cargo, senioridade) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name: 'consultar_faixa_salarial', input: { cargo, senioridade } }],
});

export const respostaTexto = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

export const CV_EXEMPLO =
  'Maria Silva — Analista de Dados. 4 anos de experiência com SQL, Python e Power BI. ' +
  'Construí dashboards de vendas de ponta a ponta, automatizei relatórios semanais e apoiei ' +
  'o time comercial com análises de churn. Formação em Estatística pela USP.';
