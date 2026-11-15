// Cliente HTTP do painel. O token vive só em memória e vai em todo request (X-Admin-Token).
import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001' });

let tokenAtual = null;
export function definirToken(token) {
  tokenAtual = token;
}

api.interceptors.request.use((config) => {
  if (tokenAtual) config.headers['X-Admin-Token'] = tokenAtual;
  return config;
});

/** Mensagem de erro amigável a partir de um erro do axios. */
export function mensagemErro(erro) {
  return erro?.response?.data?.erro || erro?.message || 'Erro inesperado.';
}
