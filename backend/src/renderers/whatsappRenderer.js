// AnaliseCompleta → 5 mensagens WhatsApp, nesta ordem:
// 1) Veredito  2) Delta  3) Caminho/lacunas  4) Plano de 90 dias  5) Resumo LinkedIn.
// Formatação nativa do WhatsApp apenas (*negrito*, _itálico_, > citação, •).
// Importa SÓ core/schema.js (regra de dependência).

import { FONTE } from '../core/schema.js';

const NOMES_SENIORIDADE = { junior: 'Júnior', pleno: 'Pleno', senior: 'Sênior', staff: 'Staff' };

const formatadorNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** 12500 → "R$ 12.500" */
export function formatarReais(valor) {
  return `R$ ${formatadorNumero.format(Math.round(Number(valor) || 0))}`;
}

function nomeSenioridade(s) {
  return NOMES_SENIORIDADE[s] ?? s;
}

function linhasFaixa(faixa) {
  return [
    `A maioria dos profissionais como você ganha entre *${formatarReais(faixa.p25)}* e *${formatarReais(faixa.p75)}* por mês.`,
    `O valor típico: *${formatarReais(faixa.mediana)}*.`,
  ];
}

function avisoRecorte(faixa) {
  return faixa.match_exato
    ? null
    : `_Não há recorte exato para o seu perfil na pesquisa; usei o mais próximo: ${faixa.cargo} · ${nomeSenioridade(faixa.senioridade)}._`;
}

function mensagemVeredito({ veredito }, fonte) {
  const { faixa_atual: faixa } = veredito;
  return [
    '*1/5 · O Veredito*',
    '',
    `Pelo seu currículo, você é *${veredito.cargo} ${nomeSenioridade(veredito.senioridade)}*.`,
    '',
    ...linhasFaixa(faixa),
    '',
    `> ${veredito.justificativa}`,
    avisoRecorte(faixa),
    '',
    `_${veredito.aviso_estimativa}_`,
    `_Fonte: ${fonte} · ${faixa.n_respondentes} respondentes neste recorte._`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

function mensagemDelta({ veredito, delta }) {
  const proxima = delta.faixa_proximo_nivel;
  if (!proxima || delta.delta_mensal === null) {
    // Staff: o Ato 2 vira reconhecimento — nunca some (invariante 4).
    return [
      '*2/5 · O Delta*',
      '',
      '*Você está no topo da tabela.* 🏆',
      `Não existe um nível acima de ${nomeSenioridade(veredito.senioridade)} na pesquisa.`,
      '',
      delta.mensagem,
    ].join('\n');
  }
  return [
    '*2/5 · O Delta*',
    '',
    `No nível *${nomeSenioridade(proxima.senioridade)}*, o valor típico é *${formatarReais(proxima.mediana)}* por mês.`,
    '',
    `Você está deixando *${formatarReais(delta.delta_mensal)} por mês* na mesa.`,
    '',
    delta.mensagem,
  ].join('\n');
}

function mensagemLacunas({ veredito, delta, caminho }) {
  const proxima = delta.faixa_proximo_nivel;
  const titulo = proxima
    ? `O que separa você do nível *${nomeSenioridade(proxima.senioridade)}*:`
    : 'O que mantém você no topo:';
  const itens = caminho.gap_para_proximo_nivel.map(
    (g) => `• *${g.lacuna}*\n  _${g.porque_importa}_`,
  );
  return [
    '*3/5 · O Caminho*',
    '',
    titulo,
    '',
    ...(itens.length ? itens : [`• Seu perfil já cobre o que se espera de ${nomeSenioridade(veredito.senioridade)}.`]),
  ].join('\n');
}

function mensagemRoadmap({ caminho }) {
  const fases = caminho.roadmap_90_dias.map((fase) =>
    [`*${fase.periodo}* — ${fase.foco}`, ...fase.acoes.map((a) => `• ${a}`)].join('\n'),
  );
  return ['*4/5 · Seu plano de 90 dias*', '', fases.join('\n\n')].join('\n');
}

function mensagemLinkedin({ resumo_linkedin }) {
  return [
    '*5/5 · Mais uma coisa…*',
    '',
    'Seu resumo profissional reescrito, pronto para colar no LinkedIn:',
    '',
    resumo_linkedin,
  ].join('\n');
}

/** @returns {string[]} exatamente 5 mensagens, na ordem dos atos */
export function renderizar(analise) {
  const fonte = analise.fonte || FONTE;
  return [
    mensagemVeredito(analise, fonte),
    mensagemDelta(analise),
    mensagemLacunas(analise),
    mensagemRoadmap(analise),
    mensagemLinkedin(analise),
  ];
}
