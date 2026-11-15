// Contrato de saída do agente — cópia exata do PRD, Apêndice B.
import { z } from 'zod';

export const FONTE = 'State of Data Brazil 2025-2026 (Data Hackers / Bain & Company)';
export const SENIORIDADES = ['junior', 'pleno', 'senior', 'staff'];
export const Senioridade = z.enum(['junior', 'pleno', 'senior', 'staff']);
export const Cargo = z.enum([
  'Analista de Dados', 'Cientista de Dados', 'Engenheiro de Dados', 'Geral (todas as funções)',
]);

export const FaixaSalarial = z.object({
  cargo: z.string(),
  senioridade: Senioridade,
  p25: z.number(),
  mediana: z.number(),
  p75: z.number(),
  n_respondentes: z.number(),
  fonte: z.string(),
  match_exato: z.boolean(),
});

const GapItem = z.object({ lacuna: z.string().min(1), porque_importa: z.string().min(1) });
const RoadmapFase = z.object({
  periodo: z.string().min(1),           // ex.: "Dias 1–30"
  foco: z.string().min(1),
  acoes: z.array(z.string().min(1)).min(1),
});

const Veredito = z.object({
  cargo: z.string().min(1),
  senioridade: Senioridade,
  faixa_atual: FaixaSalarial,
  justificativa: z.string().min(1),     // cita evidências do CV
  aviso_estimativa: z.string().min(1),  // valores são estimativas autodeclaradas
});
const Delta = z.object({
  faixa_proximo_nivel: FaixaSalarial.nullable(),  // staff => null
  delta_mensal: z.number().nullable(),            // staff => null
  mensagem: z.string().min(1),
});
const Caminho = z.object({
  gap_para_proximo_nivel: z.array(GapItem).max(3),  // invariante #5
  roadmap_90_dias: z.array(RoadmapFase).min(1),
});

export const AnaliseCompleta = z.object({
  veredito: Veredito,
  delta: Delta,
  caminho: Caminho,
  resumo_linkedin: z.string().min(1),   // o "one more thing"
  fonte: z.string().default(FONTE),
});
