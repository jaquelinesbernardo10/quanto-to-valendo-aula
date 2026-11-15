// Entrada do backend (pm2 / npm run dev): carrega o .env, roda migrations, sobe o HTTP e religa conexões.
// Não depende de process.argv — sob o pm2 o argv[1] é o contêiner do pm2, não este arquivo.
import 'dotenv/config';
import { abrirBanco } from './db/database.js';
import { criarRepositorio } from './db/repositorio.js';
import { criarServidor, criarLogger } from './app.js';

async function iniciar() {
  const logger = criarLogger();
  const faltando = ['ANTHROPIC_API_KEY', 'ADMIN_TOKEN'].filter((v) => !process.env[v]);
  if (faltando.length) {
    logger.fatal(`Variáveis obrigatórias ausentes em backend/.env: ${faltando.join(', ')}`);
    process.exit(1);
  }

  const repo = criarRepositorio(abrirBanco()); // migrations rodam aqui
  const { http, connectionManager } = criarServidor({ repo, adminToken: process.env.ADMIN_TOKEN, logger });
  const porta = Number(process.env.PORT) || 3001;

  http.on('error', (err) => {
    logger.fatal({ err }, err.code === 'EADDRINUSE' ? `porta ${porta} já está em uso` : 'falha no servidor HTTP');
    process.exit(1);
  });
  http.listen(porta, () => logger.info(`backend ouvindo na porta ${porta}`));
  await connectionManager.religarSalvas();

  const encerrar = async () => {
    await connectionManager.encerrarTodas();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

iniciar();
