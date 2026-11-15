// Auth e rotas HTTP/Socket.IO com connectionManager falso (sem Baileys nem rede externa).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as clienteSocket } from 'socket.io-client';
import pino from 'pino';
import { criarServidor } from '../src/app.js';
import { abrirBanco } from '../src/db/database.js';
import { criarRepositorio } from '../src/db/repositorio.js';

const TOKEN = 'token-de-teste';
let servidor;
let base;

beforeAll(async () => {
  const repo = criarRepositorio(abrirBanco(':memory:'));
  servidor = criarServidor({
    repo,
    adminToken: TOKEN,
    logger: pino({ level: 'silent' }),
    criarConnectionManagerFn: () => ({
      conectar: async () => {},
      desconectar: async () => {},
      remover: async (id) => repo.removerConexao(id),
      religarSalvas: async () => {},
      obterStatus: () => ({ status: 'close', numero: null, uptime_segundos: 0, sessao_salva: false }),
      contarAtivas: () => 0,
      encerrarTodas: async () => {},
    }),
  });
  await new Promise((r) => servidor.http.listen(0, r));
  base = `http://127.0.0.1:${servidor.http.address().port}`;
});

afterAll(async () => {
  servidor.io.close();
  await new Promise((r) => servidor.http.close(r));
});

const api = (caminho, opcoes = {}) =>
  fetch(base + caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) },
  });
const comToken = { 'X-Admin-Token': TOKEN };

describe('servidor HTTP', () => {
  it('/health é aberto', async () => {
    expect((await api('/health')).status).toBe(200);
  });

  it('/api/* recusa sem token ou com token errado', async () => {
    expect((await api('/api/settings')).status).toBe(401);
    expect((await api('/api/connections', { headers: { 'X-Admin-Token': 'errado' } })).status).toBe(401);
  });

  it('CRUD de conexões com token', async () => {
    const criada = await (
      await api('/api/connections', { method: 'POST', headers: comToken, body: JSON.stringify({ nome: 'Principal' }) })
    ).json();
    expect(criada).toMatchObject({ nome: 'Principal', status: 'close', contatos: 0 });
    const lista = await (await api('/api/connections', { headers: comToken })).json();
    expect(lista).toHaveLength(1);
    expect((await api(`/api/connections/${criada.id}`, { method: 'DELETE', headers: comToken })).status).toBe(204);
    expect((await api(`/api/connections/${criada.id}/connect`, { method: 'POST', headers: comToken })).status).toBe(404);
  });

  it('settings valida modelo e persiste', async () => {
    const invalido = await api('/api/settings', {
      method: 'PUT',
      headers: comToken,
      body: JSON.stringify({ modelo: 'gpt-4' }),
    });
    expect(invalido.status).toBe(400);
    const ok = await (
      await api('/api/settings', {
        method: 'PUT',
        headers: comToken,
        body: JSON.stringify({ modelo: 'claude-sonnet-5-5', agente_ativo_global: false }),
      })
    ).json();
    expect(ok).toMatchObject({ modelo: 'claude-sonnet-5-5', agente_ativo_global: false });
    expect(ok.prompt_padrao.length).toBeGreaterThan(100);
  });
});

describe('Socket.IO', () => {
  const conectar = (auth) =>
    new Promise((resolve) => {
      const s = clienteSocket(base, { auth, transports: ['websocket'], reconnection: false });
      s.on('connect', () => {
        s.close();
        resolve('conectado');
      });
      s.on('connect_error', (e) => {
        s.close();
        resolve(e.message);
      });
    });

  it('recusa handshake sem token válido e aceita com token', async () => {
    expect(await conectar({})).toBe('nao_autorizado');
    expect(await conectar({ token: 'errado' })).toBe('nao_autorizado');
    expect(await conectar({ token: TOKEN })).toBe('conectado');
  });
});
