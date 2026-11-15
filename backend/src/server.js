// Entrada do backend: Express + Socket.IO, auth por X-Admin-Token, boot (migrations + religar conexões).
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Server as SocketServer } from 'socket.io';
import pino from 'pino';

import { abrirBanco } from './db/database.js';
import { criarRepositorio } from './db/repositorio.js';
import { analisarCurriculo } from './core/agente.js';
import { extrairTexto } from './core/extracao.js';
import { renderizar } from './renderers/whatsappRenderer.js';
import { criarMessageHandler } from './managers/messageHandler.js';
import { criarConnectionManager, baixarMidia } from './managers/connectionManager.js';
import { rotasConexoes } from './routes/connections.js';
import { rotasConversas } from './routes/conversations.js';
import { rotasConfiguracoes } from './routes/settings.js';

export function criarLogger() {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    // Invariante 8: a chave nunca vai para log.
    redact: {
      paths: ['*.apiKey', '*.ANTHROPIC_API_KEY', 'headers["x-api-key"]', 'headers["x-admin-token"]'],
      censor: '[oculto]',
    },
  });
}

export function tokenValido(recebido, esperado) {
  if (typeof recebido !== 'string' || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Monta app HTTP + Socket.IO sem iniciar o listen (testável).
 * O connectionManager pode ser injetado; por padrão usa o Baileys real.
 */
export function criarServidor({ repo, adminToken, logger, criarConnectionManagerFn = criarConnectionManager }) {
  const app = express();
  const http = createServer(app);
  const io = new SocketServer(http, { cors: { origin: '*' } });
  const emitir = (evento, payload) => io.emit(evento, payload);

  const tratarMensagem = criarMessageHandler({
    repo,
    emitir,
    analisar: analisarCurriculo,
    renderizar,
    extrair: extrairTexto,
    baixarMidia,
    logger,
  });
  const connectionManager = criarConnectionManagerFn({
    repo,
    emitir,
    aoReceberMensagem: tratarMensagem,
    logger,
  });

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', (req, res, next) => {
    if (tokenValido(req.get('X-Admin-Token'), adminToken)) return next();
    res.status(401).json({ erro: 'Token de administrador inválido.' });
  });
  app.get('/api/status', (_req, res) => res.json({ conexoes_ativas: connectionManager.contarAtivas() }));
  app.use('/api/connections', rotasConexoes({ repo, connectionManager }));
  app.use('/api/conversations', rotasConversas({ repo, emitir }));
  app.use('/api/settings', rotasConfiguracoes({ repo }));

  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    logger.error({ err, rota: req.originalUrl }, 'erro na rota');
    if (res.headersSent) return;
    res.status(err.status || 500).json({ erro: err.expose ? err.message : 'Erro interno.' });
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers['x-admin-token'];
    if (tokenValido(token, adminToken)) return next();
    next(new Error('nao_autorizado'));
  });

  return { app, http, io, connectionManager };
}

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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  iniciar();
}
