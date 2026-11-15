// Smoke da análise real: chama a API Anthropic com um CV fictício e imprime as 5 mensagens.
// Uso: npm run exemplo   (precisa de ANTHROPIC_API_KEY em backend/.env — gasta API)
import 'dotenv/config';
import { analisarCurriculo } from '../src/core/agente.js';
import { renderizar } from '../src/renderers/whatsappRenderer.js';

const CV = `Juliana Costa — Engenheira de Dados
São Paulo, SP

Experiência
- Engenheira de Dados, Fintech XYZ (2021–atual): pipelines em Airflow e dbt sobre BigQuery
  processando 2 TB/dia; migrei o legado on-premise para a nuvem reduzindo 40% do custo;
  responsável pelo modelo de dados de crédito usado por 3 squads.
- Analista de Dados, Varejo ABC (2019–2021): SQL, Python e Power BI; automatizei relatórios
  semanais de vendas e criei o primeiro data mart da área comercial.

Formação
- Bacharelado em Ciência da Computação — UFSCar (2018)

Habilidades: Python, SQL, Spark, Airflow, dbt, BigQuery, Terraform, Git.`;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Defina ANTHROPIC_API_KEY em backend/.env para rodar o exemplo.');
  process.exit(1);
}

const inicio = Date.now();
try {
  const analise = await analisarCurriculo(CV);
  renderizar(analise).forEach((msg, i) => {
    console.log(`\n──────── mensagem ${i + 1}/5 ────────\n${msg}`);
  });
  console.log(`\n✔ análise concluída em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
} catch (erro) {
  console.error('✖ falha na análise:', erro.message);
  process.exit(1);
}
