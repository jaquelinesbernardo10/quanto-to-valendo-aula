// /api/connections — CRUD de conexões Baileys + conectar/desconectar.
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { assincrono } from './util.js';

export function rotasConexoes({ repo, connectionManager }) {
  const r = Router();

  const comStatus = (c) => ({ ...c, ...connectionManager.obterStatus(c.id), ...repo.metricasConexao(c.id) });

  r.get('/', (_req, res) => {
    res.json(repo.listarConexoes().map(comStatus));
  });

  r.post('/', (req, res) => {
    const nome = String(req.body?.nome ?? '').trim();
    if (!nome) return res.status(400).json({ erro: 'Informe o nome da conexão.' });
    res.status(201).json(comStatus(repo.criarConexao(uuid(), nome)));
  });

  r.delete('/:id', assincrono(async (req, res) => {
    if (!repo.obterConexao(req.params.id)) return res.status(404).json({ erro: 'Conexão não encontrada.' });
    await connectionManager.remover(req.params.id);
    res.status(204).end();
  }));

  r.post('/:id/connect', assincrono(async (req, res) => {
    if (!repo.obterConexao(req.params.id)) return res.status(404).json({ erro: 'Conexão não encontrada.' });
    await connectionManager.conectar(req.params.id);
    res.json(comStatus(repo.obterConexao(req.params.id)));
  }));

  r.post('/:id/disconnect', assincrono(async (req, res) => {
    if (!repo.obterConexao(req.params.id)) return res.status(404).json({ erro: 'Conexão não encontrada.' });
    await connectionManager.desconectar(req.params.id);
    res.json(comStatus(repo.obterConexao(req.params.id)));
  }));

  return r;
}
