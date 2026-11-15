// Acesso a dados: conexões, conversas, mensagens e configurações.

export const CHAVES_CONFIG = ['system_prompt_override', 'modelo', 'agente_ativo_global'];

const agora = () => new Date().toISOString();

export function criarRepositorio(db) {
  const q = {
    criarConexao: db.prepare('INSERT INTO conexoes (id, nome, criada_em) VALUES (?, ?, ?)'),
    listarConexoes: db.prepare('SELECT * FROM conexoes ORDER BY criada_em'),
    obterConexao: db.prepare('SELECT * FROM conexoes WHERE id = ?'),
    removerConexao: db.prepare('DELETE FROM conexoes WHERE id = ?'),
    removerConversasDaConexao: db.prepare('DELETE FROM conversas WHERE connection_id = ?'),

    obterConversaPorChave: db.prepare(
      'SELECT * FROM conversas WHERE connection_id = ? AND remote_jid = ?',
    ),
    obterConversa: db.prepare('SELECT * FROM conversas WHERE id = ?'),
    inserirConversa: db.prepare(
      `INSERT INTO conversas (connection_id, remote_jid, nome_contato, criada_em, atualizada_em)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (connection_id, remote_jid) DO NOTHING`,
    ),
    atualizarNomeContato: db.prepare(
      'UPDATE conversas SET nome_contato = ? WHERE id = ? AND (nome_contato IS NULL OR nome_contato != ?)',
    ),
    tocarConversa: db.prepare('UPDATE conversas SET atualizada_em = ? WHERE id = ?'),
    definirAgenteAtivo: db.prepare('UPDATE conversas SET agente_ativo = ? WHERE id = ?'),
    listarConversas: db.prepare(
      `SELECT c.*,
              (SELECT conteudo  FROM mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_mensagem,
              (SELECT papel     FROM mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_papel,
              (SELECT timestamp FROM mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_em,
              (SELECT COUNT(*)  FROM mensagens m WHERE m.conversa_id = c.id) AS total_mensagens
         FROM conversas c
        ORDER BY c.atualizada_em DESC`,
    ),

    inserirMensagem: db.prepare(
      'INSERT INTO mensagens (conversa_id, papel, tipo, conteudo, timestamp) VALUES (?, ?, ?, ?, ?)',
    ),
    obterMensagem: db.prepare('SELECT * FROM mensagens WHERE id = ?'),
    listarMensagens: db.prepare(
      `SELECT * FROM (
         SELECT * FROM mensagens WHERE conversa_id = ? AND id < ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`,
    ),

    metricasConexao: db.prepare(
      `SELECT COUNT(DISTINCT c.id) AS contatos, COUNT(m.id) AS mensagens
         FROM conversas c LEFT JOIN mensagens m ON m.conversa_id = c.id
        WHERE c.connection_id = ?`,
    ),

    obterConfig: db.prepare('SELECT valor FROM configuracoes WHERE chave = ?'),
    salvarConfig: db.prepare(
      `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
    ),
  };

  const comPreview = (c) => ({ ...c, agente_ativo: Boolean(c.agente_ativo) });

  return {
    // ── conexões ──
    criarConexao(id, nome) {
      q.criarConexao.run(id, nome, agora());
      return q.obterConexao.get(id);
    },
    listarConexoes: () => q.listarConexoes.all(),
    obterConexao: (id) => q.obterConexao.get(id) ?? null,
    removerConexao: db.transaction((id) => {
      q.removerConversasDaConexao.run(id);
      return q.removerConexao.run(id).changes > 0;
    }),
    metricasConexao: (id) => q.metricasConexao.get(id),

    // ── conversas ──
    obterOuCriarConversa(connectionId, remoteJid, nomeContato = null) {
      q.inserirConversa.run(connectionId, remoteJid, nomeContato, agora(), agora());
      const conversa = q.obterConversaPorChave.get(connectionId, remoteJid);
      if (nomeContato) q.atualizarNomeContato.run(nomeContato, conversa.id, nomeContato);
      return comPreview(q.obterConversaPorChave.get(connectionId, remoteJid));
    },
    obterConversa(id) {
      const c = q.obterConversa.get(id);
      return c ? comPreview(c) : null;
    },
    listarConversas: () => q.listarConversas.all().map(comPreview),
    definirAgenteAtivo(id, ativo) {
      q.definirAgenteAtivo.run(ativo ? 1 : 0, id);
      return this.obterConversa(id);
    },

    // ── mensagens ──
    inserirMensagem(conversaId, papel, conteudo, tipo = 'texto') {
      const ts = agora();
      const { lastInsertRowid } = q.inserirMensagem.run(conversaId, papel, tipo, conteudo, ts);
      q.tocarConversa.run(ts, conversaId);
      return q.obterMensagem.get(lastInsertRowid);
    },
    /** Histórico paginado: as `limite` mensagens anteriores a `antesDe` (ordem cronológica). */
    listarMensagens(conversaId, { limite = 50, antesDe = Number.MAX_SAFE_INTEGER } = {}) {
      return q.listarMensagens.all(conversaId, antesDe, limite);
    },

    // ── configurações ──
    obterConfig(chave) {
      return q.obterConfig.get(chave)?.valor ?? null;
    },
    salvarConfig(chave, valor) {
      q.salvarConfig.run(chave, valor === null || valor === undefined ? null : String(valor));
    },
    /** Configurações já tipadas, com defaults. */
    obterConfiguracoes() {
      const ativo = this.obterConfig('agente_ativo_global');
      return {
        system_prompt_override: this.obterConfig('system_prompt_override') ?? '',
        modelo: this.obterConfig('modelo') ?? null,
        agente_ativo_global: ativo === null ? true : ativo === '1' || ativo === 'true',
      };
    },
  };
}
