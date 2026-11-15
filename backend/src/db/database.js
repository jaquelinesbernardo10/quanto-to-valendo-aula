// SQLite (better-sqlite3). Migrations idempotentes rodam ao abrir o banco.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAMINHO_PADRAO = fileURLToPath(new URL('../../data/app.db', import.meta.url));

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS conexoes (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL,
  remote_jid    TEXT NOT NULL,
  nome_contato  TEXT,
  agente_ativo  INTEGER NOT NULL DEFAULT 1,
  criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (connection_id, remote_jid)
);

CREATE TABLE IF NOT EXISTS mensagens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  papel       TEXT NOT NULL CHECK (papel IN ('usuario', 'agente', 'sistema')),
  tipo        TEXT NOT NULL DEFAULT 'texto',
  conteudo    TEXT,
  timestamp   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens (conversa_id, id);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`;

/** Abre (ou cria) o banco e aplica as migrations. Aceita ':memory:' nos testes. */
export function abrirBanco(caminho = CAMINHO_PADRAO) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(MIGRATIONS);
  return db;
}
