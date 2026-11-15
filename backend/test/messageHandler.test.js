import { describe, it, expect, beforeEach } from 'vitest';
import {
  deveIgnorarMensagem,
  classificarConteudo,
  sortearAtraso,
  criarMessageHandler,
  TEXTOS,
} from '../src/managers/messageHandler.js';
import { abrirBanco } from '../src/db/database.js';
import { criarRepositorio } from '../src/db/repositorio.js';
import { renderizar } from '../src/renderers/whatsappRenderer.js';
import { PDFSemTextoError } from '../src/core/erros.js';
import { analisePleno, CV_EXEMPLO } from './fixtures.js';

const JID = '5511999990000@s.whatsapp.net';
const msgTexto = (text, extra = {}) => ({
  key: { remoteJid: JID, fromMe: false, id: 'x', ...extra.key },
  pushName: 'Ana',
  message: { conversation: text },
});
const msgDoc = (mimetype, fileName) => ({
  key: { remoteJid: JID, fromMe: false, id: 'd' },
  message: { documentMessage: { mimetype, fileName } },
});

describe('deveIgnorarMensagem', () => {
  it('ignora fromMe, grupos, broadcast, status e mensagens vazias', () => {
    expect(deveIgnorarMensagem(msgTexto('oi', { key: { fromMe: true } }))).toBe(true);
    expect(deveIgnorarMensagem(msgTexto('oi', { key: { remoteJid: '123@g.us' } }))).toBe(true);
    expect(deveIgnorarMensagem(msgTexto('oi', { key: { remoteJid: 'status@broadcast' } }))).toBe(true);
    expect(deveIgnorarMensagem(msgTexto('oi', { key: { remoteJid: '1@broadcast' } }))).toBe(true);
    expect(deveIgnorarMensagem({ key: { remoteJid: JID }, message: { imageMessage: {} } })).toBe(true);
    expect(deveIgnorarMensagem({ key: { remoteJid: JID } })).toBe(true);
  });

  it('aceita texto e documento de contato individual', () => {
    expect(deveIgnorarMensagem(msgTexto('oi'))).toBe(false);
    expect(deveIgnorarMensagem(msgDoc('application/pdf', 'cv.pdf'))).toBe(false);
    expect(
      deveIgnorarMensagem({ key: { remoteJid: JID }, message: { extendedTextMessage: { text: 'oi' } } }),
    ).toBe(false);
  });
});

describe('classificarConteudo', () => {
  it('roteia PDF, documento não-PDF, texto curto e currículo', () => {
    expect(classificarConteudo(msgDoc('application/pdf', 'cv.pdf'))).toBe('pdf');
    expect(classificarConteudo(msgDoc('application/octet-stream', 'CV.PDF'))).toBe('pdf');
    expect(classificarConteudo(msgDoc('application/msword', 'cv.doc'))).toBe('documento_nao_pdf');
    expect(classificarConteudo(msgTexto('oi, quanto eu valho?'))).toBe('texto_curto');
    expect(classificarConteudo(msgTexto('a'.repeat(199)))).toBe('texto_curto');
    expect(classificarConteudo(msgTexto('a'.repeat(200)))).toBe('curriculo');
  });

  it('desembrulha documento com legenda', () => {
    const msg = {
      key: { remoteJid: JID },
      message: {
        documentWithCaptionMessage: {
          message: { documentMessage: { mimetype: 'application/pdf', fileName: 'cv.pdf' } },
        },
      },
    };
    expect(classificarConteudo(msg)).toBe('pdf');
  });
});

describe('sortearAtraso', () => {
  it('fica entre 1,5 e 2,5s', () => {
    expect(sortearAtraso(() => 0)).toBe(1500);
    expect(sortearAtraso(() => 0.9999)).toBeLessThanOrEqual(2500);
  });
});

// ── fluxo com dependências falsas ──
function sockFalso() {
  const enviadas = [];
  return {
    enviadas,
    async sendPresenceUpdate() {},
    async sendMessage(jid, { text }) {
      enviadas.push({ jid, text });
    },
  };
}

function montar({ analisar, extrair } = {}) {
  const repo = criarRepositorio(abrirBanco(':memory:'));
  const eventos = [];
  const chamadasAnalise = [];
  const tratar = criarMessageHandler({
    repo,
    emitir: (evento, payload) => eventos.push({ evento, payload }),
    analisar:
      analisar ??
      (async (texto, opcoes) => {
        chamadasAnalise.push({ texto, opcoes });
        return analisePleno();
      }),
    renderizar,
    extrair: extrair ?? (async () => CV_EXEMPLO),
    baixarMidia: async () => Buffer.from('pdf'),
    atraso: async () => {},
    logger: { error() {}, warn() {}, debug() {} },
  });
  return { repo, eventos, tratar, chamadasAnalise };
}

describe('criarMessageHandler', () => {
  let ctx;
  beforeEach(() => {
    ctx = montar();
  });

  it('currículo em texto → "Analisando" + 5 atos, tudo persistido', async () => {
    const sock = sockFalso();
    const r = await ctx.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) });
    expect(r.acao).toBe('analisada');
    expect(sock.enviadas.map((m) => m.text)[0]).toBe(TEXTOS.analisando);
    expect(sock.enviadas).toHaveLength(6);
    expect(sock.enviadas[1].text).toContain('O Veredito');

    const [conversa] = ctx.repo.listarConversas();
    expect(conversa.nome_contato).toBe('Ana');
    expect(conversa.total_mensagens).toBe(7); // 1 recebida + 6 enviadas
    expect(ctx.eventos.filter((e) => e.evento === 'conversation_update')).toHaveLength(7);
  });

  it('PDF passa pela extração', async () => {
    const sock = sockFalso();
    await ctx.tratar({ connectionId: 'c1', sock, msg: msgDoc('application/pdf', 'cv.pdf') });
    expect(ctx.chamadasAnalise[0].texto).toBe(CV_EXEMPLO);
    expect(sock.enviadas).toHaveLength(6);
  });

  it('PDF sem texto → orientação amigável', async () => {
    const c = montar({
      extrair: async () => {
        throw new PDFSemTextoError();
      },
    });
    const sock = sockFalso();
    await c.tratar({ connectionId: 'c1', sock, msg: msgDoc('application/pdf', 'scan.pdf') });
    expect(sock.enviadas.at(-1).text).toBe(TEXTOS.pdfSemTexto);
  });

  it('erro na análise nunca chega cru ao usuário', async () => {
    const c = montar({
      analisar: async () => {
        throw new Error('stack trace interno');
      },
    });
    const sock = sockFalso();
    await c.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) });
    expect(sock.enviadas.at(-1).text).toBe(TEXTOS.erroGenerico);
    expect(sock.enviadas.some((m) => m.text.includes('stack'))).toBe(false);
  });

  it('texto curto e documento não-PDF recebem orientação sem chamar a API', async () => {
    const sock = sockFalso();
    await ctx.tratar({ connectionId: 'c1', sock, msg: msgTexto('oi') });
    await ctx.tratar({ connectionId: 'c1', sock, msg: msgDoc('application/msword', 'cv.doc') });
    expect(sock.enviadas.map((m) => m.text)).toEqual([TEXTOS.textoCurto, TEXTOS.documentoNaoPdf]);
    expect(ctx.chamadasAnalise).toHaveLength(0);
  });

  it('agente desligado globalmente ou na conversa → só persiste', async () => {
    const sock = sockFalso();
    ctx.repo.salvarConfig('agente_ativo_global', '0');
    expect((await ctx.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) })).acao).toBe(
      'agente_desligado',
    );
    ctx.repo.salvarConfig('agente_ativo_global', '1');
    const [conversa] = ctx.repo.listarConversas();
    ctx.repo.definirAgenteAtivo(conversa.id, false);
    expect((await ctx.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) })).acao).toBe(
      'agente_desligado',
    );
    expect(sock.enviadas).toHaveLength(0);
    expect(ctx.repo.listarConversas()[0].total_mensagens).toBe(2);
  });

  it('usa modelo e override do painel lidos a cada análise', async () => {
    ctx.repo.salvarConfig('modelo', 'claude-sonnet-5-5');
    ctx.repo.salvarConfig('system_prompt_override', 'prompt novo');
    await ctx.tratar({ connectionId: 'c1', sock: sockFalso(), msg: msgTexto(CV_EXEMPLO) });
    expect(ctx.chamadasAnalise[0].opcoes).toMatchObject({
      modelo: 'claude-sonnet-5-5',
      systemPromptOverride: 'prompt novo',
    });
  });

  it('trava: segunda mensagem da mesma conversa durante a análise recebe "já estou analisando"', async () => {
    let liberar;
    const c = montar({
      analisar: () => new Promise((r) => (liberar = () => r(analisePleno()))),
    });
    const sock = sockFalso();
    const primeira = c.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) });
    await new Promise((r) => setTimeout(r, 0));
    const segunda = await c.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) });
    expect(segunda.acao).toBe('ja_analisando');
    liberar();
    expect((await primeira).acao).toBe('analisada');
    // depois de terminar, a trava foi liberada
    const terceira = c.tratar({ connectionId: 'c1', sock, msg: msgTexto('oi') });
    expect((await terceira).acao).toBe('texto_curto');
  });

  it('texto curto durante a análise não libera a trava de outra mensagem', async () => {
    let liberar;
    const c = montar({ analisar: () => new Promise((r) => (liberar = () => r(analisePleno()))) });
    const sock = sockFalso();
    const analise = c.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) });
    await new Promise((r) => setTimeout(r, 0));
    expect((await c.tratar({ connectionId: 'c1', sock, msg: msgTexto('oi') })).acao).toBe('ja_analisando');
    expect((await c.tratar({ connectionId: 'c1', sock, msg: msgTexto(CV_EXEMPLO) })).acao).toBe(
      'ja_analisando',
    );
    liberar();
    await analise;
  });

  it('conversas diferentes analisam em paralelo sem se bloquear nem vazar contexto', async () => {
    const pendentes = [];
    const c = montar({
      analisar: (texto) =>
        new Promise((r) =>
          pendentes.push(() => {
            const a = analisePleno();
            a.resumo_linkedin = `resumo de: ${texto.slice(0, 10)}`;
            r(a);
          }),
        ),
    });
    const sockA = sockFalso();
    const sockB = sockFalso();
    const cvA = 'A'.repeat(250);
    const cvB = 'B'.repeat(250);
    const pa = c.tratar({ connectionId: 'c1', sock: sockA, msg: msgTexto(cvA) });
    const pb = c.tratar({
      connectionId: 'c1',
      sock: sockB,
      msg: msgTexto(cvB, { key: { remoteJid: '5521888880000@s.whatsapp.net' } }),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(pendentes).toHaveLength(2);
    pendentes.reverse().forEach((f) => f());
    expect((await pa).acao).toBe('analisada');
    expect((await pb).acao).toBe('analisada');
    expect(sockA.enviadas.at(-1).text).toContain('resumo de: AAAAAAAAAA');
    expect(sockB.enviadas.at(-1).text).toContain('resumo de: BBBBBBBBBB');
    expect(sockA.enviadas.every((m) => m.jid === JID)).toBe(true);
  });

  it('mensagens ignoradas não são persistidas', async () => {
    await ctx.tratar({ connectionId: 'c1', sock: sockFalso(), msg: msgTexto('oi', { key: { fromMe: true } }) });
    expect(ctx.repo.listarConversas()).toHaveLength(0);
  });
});
