// /api/conversations — lista, histórico paginado e toggle do agente por conversa.
import { Router } from 'express';

export function rotasConversas({ repo, emitir }) {
  const r = Router();

  const obterOu404 = (req, res) => {
    const conversa = repo.obterConversa(Number(req.params.id));
    if (!conversa) res.status(404).json({ erro: 'Conversa não encontrada.' });
    return conversa;
  };

  r.get('/', (_req, res) => {
    res.json(repo.listarConversas());
  });

  r.get('/:id/messages', (req, res) => {
    const conversa = obterOu404(req, res);
    if (!conversa) return;
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);
    const antesDe = Number(req.query.antesDe) || undefined;
    res.json({ conversa, mensagens: repo.listarMensagens(conversa.id, { limite, antesDe }) });
  });

  r.patch('/:id', (req, res) => {
    const conversa = obterOu404(req, res);
    if (!conversa) return;
    if (typeof req.body?.agente_ativo !== 'boolean') {
      return res.status(400).json({ erro: 'agente_ativo deve ser booleano.' });
    }
    const atualizada = repo.definirAgenteAtivo(conversa.id, req.body.agente_ativo);
    emitir('conversation_update', {
      conversaId: atualizada.id,
      connectionId: atualizada.connection_id,
      remoteJid: atualizada.remote_jid,
      conversa: atualizada,
    });
    res.json(atualizada);
  });

  return r;
}
