// Orquestra cada mensagem recebida: filtros → persistência → agente ativo? →
// roteamento → análise → envio dos 5 atos (PRD §4.3).
// Dependências são injetadas para testar sem rede. Os filtros são funções puras.

import { PDFSemTextoError } from '../core/erros.js';

export const MIN_CARACTERES_CURRICULO = 200;

export const TEXTOS = Object.freeze({
  analisando: '🔍 Analisando seu currículo...',
  jaAnalisando: '⏳ Já estou analisando seu currículo, um instante — já te respondo.',
  textoCurto:
    'Para eu calcular quanto você está valendo, cola aqui o seu currículo completo ou me manda o PDF. 📄',
  documentoNaoPdf: 'Não consigo ler esse formato. Me manda o currículo em *PDF* ou cola o texto aqui. 📄',
  pdfSemTexto:
    'Não consegui ler o texto desse PDF (parece ser uma imagem escaneada). Pode me mandar um PDF com texto selecionável ou colar o currículo aqui?',
  erroGenerico: 'Tive um problema para concluir sua análise agora. Pode tentar de novo em alguns minutos?',
});

// ── funções puras ────────────────────────────────────────────────────────────

/** Desembrulha mensagens efêmeras / view once / documento com legenda. */
function conteudoReal(message) {
  let m = message;
  for (let i = 0; i < 4 && m; i++) {
    const interno =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.documentWithCaptionMessage?.message;
    if (!interno) break;
    m = interno;
  }
  return m ?? null;
}

/** Texto digitado na mensagem (sem documento), ou ''. */
export function textoDaMensagem(msg) {
  const m = conteudoReal(msg?.message);
  return (m?.conversation ?? m?.extendedTextMessage?.text ?? '').trim();
}

/** documentMessage da mensagem, ou null. */
export function documentoDaMensagem(msg) {
  return conteudoReal(msg?.message)?.documentMessage ?? null;
}

/** true se a mensagem deve ser ignorada sem nem ser persistida. */
export function deveIgnorarMensagem(msg) {
  if (!msg?.key || !msg.message) return true;
  if (msg.key.fromMe) return true;
  const jid = msg.key.remoteJid ?? '';
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) {
    return true;
  }
  return !textoDaMensagem(msg) && !documentoDaMensagem(msg);
}

/** @returns {'pdf' | 'documento_nao_pdf' | 'texto_curto' | 'curriculo'} */
export function classificarConteudo(msg) {
  const doc = documentoDaMensagem(msg);
  if (doc) {
    const mime = (doc.mimetype ?? '').toLowerCase();
    const nome = (doc.fileName ?? '').toLowerCase();
    return mime === 'application/pdf' || nome.endsWith('.pdf') ? 'pdf' : 'documento_nao_pdf';
  }
  return textoDaMensagem(msg).length >= MIN_CARACTERES_CURRICULO ? 'curriculo' : 'texto_curto';
}

/** Intervalo humano entre mensagens: 1,5–2,5s. */
export function sortearAtraso(aleatorio = Math.random) {
  return 1500 + Math.floor(aleatorio() * 1000);
}

// ── orquestração ─────────────────────────────────────────────────────────────

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/repositorio.js').criarRepositorio>} deps.repo
 * @param {(evento: string, payload: object) => void} deps.emitir - emite via Socket.IO
 * @param {(texto: string, opcoes: object) => Promise<object>} deps.analisar - analisarCurriculo
 * @param {(analise: object) => string[]} deps.renderizar
 * @param {(buffer: Buffer) => Promise<string>} deps.extrair - extrairTexto
 * @param {(msg: object, sock: object) => Promise<Buffer>} deps.baixarMidia
 * @param {(ms: number) => Promise<void>} [deps.atraso]
 * @param {() => number} [deps.sortear]
 * @param {object} [deps.logger]
 */
export function criarMessageHandler({
  repo,
  emitir,
  analisar,
  renderizar,
  extrair,
  baixarMidia,
  atraso = esperar,
  sortear = sortearAtraso,
  logger,
}) {
  // Só chaves de controle "(connectionId:remoteJid)" — nenhum dado de CV.
  const emAnalise = new Set();

  function registrar(conversa, papel, conteudo, tipo = 'texto') {
    const mensagem = repo.inserirMensagem(conversa.id, papel, conteudo, tipo);
    emitir('conversation_update', {
      conversaId: conversa.id,
      connectionId: conversa.connection_id,
      remoteJid: conversa.remote_jid,
      mensagem,
    });
    return mensagem;
  }

  async function responder(sock, conversa, texto, papel = 'agente') {
    const jid = conversa.remote_jid;
    try {
      await sock.sendPresenceUpdate('composing', jid);
    } catch {
      /* presença é cosmética */
    }
    await atraso(sortear());
    await sock.sendMessage(jid, { text: texto });
    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      /* idem */
    }
    registrar(conversa, papel, texto);
  }

  async function obterTextoCurriculo(tipo, msg, sock) {
    if (tipo === 'pdf') return extrair(await baixarMidia(msg, sock));
    return textoDaMensagem(msg);
  }

  async function analisarEEnviar({ sock, conversa, msg, tipo }) {
    await responder(sock, conversa, TEXTOS.analisando, 'sistema');
    let mensagens;
    try {
      const texto = await obterTextoCurriculo(tipo, msg, sock);
      const config = repo.obterConfiguracoes(); // lido a cada análise: vale sem restart
      const analise = await analisar(texto, {
        modelo: config.modelo || undefined,
        systemPromptOverride: config.system_prompt_override || undefined,
        logger,
      });
      mensagens = renderizar(analise);
    } catch (erro) {
      if (erro instanceof PDFSemTextoError) {
        await responder(sock, conversa, TEXTOS.pdfSemTexto, 'sistema');
        return;
      }
      logger?.error?.({ err: erro, conversaId: conversa.id }, 'falha na análise');
      await responder(sock, conversa, TEXTOS.erroGenerico, 'sistema');
      return;
    }
    for (const texto of mensagens) await responder(sock, conversa, texto);
  }

  /** Trata uma mensagem do evento messages.upsert. */
  return async function tratarMensagem({ connectionId, sock, msg }) {
    if (deveIgnorarMensagem(msg)) return { acao: 'ignorada' };

    const remoteJid = msg.key.remoteJid;
    const conversa = repo.obterOuCriarConversa(connectionId, remoteJid, msg.pushName || null);
    const doc = documentoDaMensagem(msg);
    registrar(
      conversa,
      'usuario',
      doc ? `[documento] ${doc.fileName ?? 'sem nome'}` : textoDaMensagem(msg),
      doc ? 'documento' : 'texto',
    );

    const { agente_ativo_global: ativoGlobal } = repo.obterConfiguracoes();
    if (!ativoGlobal || !conversa.agente_ativo) return { acao: 'agente_desligado' };

    // Trava anti-concorrência: checagem e reserva são síncronas (antes de qualquer await).
    const chave = `${connectionId}:${remoteJid}`;
    if (emAnalise.has(chave)) {
      await responder(sock, conversa, TEXTOS.jaAnalisando, 'sistema');
      return { acao: 'ja_analisando' };
    }

    const tipo = classificarConteudo(msg);
    const vaiAnalisar = tipo === 'pdf' || tipo === 'curriculo';
    if (vaiAnalisar) emAnalise.add(chave);
    try {
      if (tipo === 'documento_nao_pdf') {
        await responder(sock, conversa, TEXTOS.documentoNaoPdf, 'sistema');
        return { acao: tipo };
      }
      if (tipo === 'texto_curto') {
        await responder(sock, conversa, TEXTOS.textoCurto, 'sistema');
        return { acao: tipo };
      }
      await analisarEEnviar({ sock, conversa, msg, tipo });
      return { acao: 'analisada', tipo };
    } catch (erro) {
      logger?.error?.({ err: erro, conversaId: conversa.id }, 'falha ao responder');
      return { acao: 'erro' };
    } finally {
      // Só libera a trava que esta mensagem reservou.
      if (vaiAnalisar) emAnalise.delete(chave);
    }
  };
}
