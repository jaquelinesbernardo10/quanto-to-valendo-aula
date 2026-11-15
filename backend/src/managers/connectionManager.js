// Conexões Baileys: QR, status em tempo real, reconexão e sessão persistida por conexão.
// Baileys é CJS: makeWASocket é o import DEFAULT; o resto é nomeado.
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PASTA_SESSOES_PADRAO = fileURLToPath(new URL('../../sessions', import.meta.url));
const ATRASO_RECONEXAO_MS = 3000;

/** Baixa o buffer de um documento recebido. */
export function baixarMidia(msg, sock) {
  return downloadMediaMessage(
    msg,
    'buffer',
    {},
    { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage },
  );
}

/**
 * @param {object} deps
 * @param {object} deps.repo
 * @param {(evento: string, payload: object) => void} deps.emitir
 * @param {(args: { connectionId: string, sock: object, msg: object }) => Promise<unknown>} deps.aoReceberMensagem
 * @param {object} deps.logger - pino
 * @param {string} [deps.pastaSessoes]
 */
export function criarConnectionManager({
  repo,
  emitir,
  aoReceberMensagem,
  logger,
  pastaSessoes = PASTA_SESSOES_PADRAO,
}) {
  /** @type {Map<string, { sock: any, status: string, conectadoEm: number|null, numero: string|null, paradaManual: boolean, timerReconexao: any }>} */
  const instancias = new Map();
  const loggerBaileys = logger.child({ modulo: 'baileys' }, { level: 'warn' });

  const pastaDe = (id) => join(pastaSessoes, id);
  const temSessaoSalva = (id) => existsSync(join(pastaDe(id), 'creds.json'));

  function definirStatus(id, status) {
    const inst = instancias.get(id);
    if (inst) inst.status = status;
    emitir('connection_status', { connectionId: id, status });
  }

  async function conectar(id) {
    if (!repo.obterConexao(id)) throw new Error('Conexão não encontrada.');
    const existente = instancias.get(id);
    if (existente?.sock && ['open', 'connecting', 'qr'].includes(existente.status)) return;
    clearTimeout(existente?.timerReconexao);

    const inst = existente ?? {
      sock: null,
      status: 'connecting',
      conectadoEm: null,
      numero: null,
      paradaManual: false,
      timerReconexao: null,
    };
    inst.paradaManual = false;
    instancias.set(id, inst);
    definirStatus(id, 'connecting');

    const { state, saveCreds } = await useMultiFileAuthState(pastaDe(id));
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      /* sem rede para o lookup: usa a versão embutida */
    }

    const sock = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      browser: Browsers.ubuntu('Quanto Tô Valendo'),
      logger: loggerBaileys,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    inst.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (instancias.get(id)?.sock !== sock) return; // socket antigo
      if (qr) {
        try {
          emitir('qr_update', { connectionId: id, qr: await QRCode.toDataURL(qr) });
          definirStatus(id, 'qr');
        } catch (err) {
          logger.error({ err, connectionId: id }, 'falha ao gerar QR');
        }
      }
      if (connection === 'open') {
        inst.conectadoEm = Date.now();
        inst.numero = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null;
        definirStatus(id, 'open');
        logger.info({ connectionId: id }, 'conexão aberta');
      }
      if (connection === 'close') {
        inst.conectadoEm = null;
        inst.sock = null;
        const codigo = lastDisconnect?.error?.output?.statusCode;
        definirStatus(id, 'close');
        if (inst.paradaManual) return; // desconexão manual não religa
        if (codigo === DisconnectReason.loggedOut) {
          logger.warn({ connectionId: id }, 'sessão deslogada no celular; limpando sessão');
          await rm(pastaDe(id), { recursive: true, force: true });
          inst.numero = null;
          return;
        }
        logger.info({ connectionId: id, codigo }, 'conexão caiu; religando');
        inst.timerReconexao = setTimeout(() => {
          conectar(id).catch((err) => logger.error({ err, connectionId: id }, 'falha ao religar'));
        }, ATRASO_RECONEXAO_MS);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        aoReceberMensagem({ connectionId: id, sock, msg }).catch((err) =>
          logger.error({ err, connectionId: id }, 'falha ao tratar mensagem'),
        );
      }
    });
  }

  /** Parada manual: mantém a sessão (religa sem QR depois) e não reconecta sozinha. */
  async function desconectar(id) {
    const inst = instancias.get(id);
    if (!inst) return;
    inst.paradaManual = true;
    clearTimeout(inst.timerReconexao);
    const sock = inst.sock;
    inst.sock = null;
    inst.conectadoEm = null;
    try {
      sock?.end(undefined);
    } catch {
      /* já fechado */
    }
    definirStatus(id, 'close');
  }

  /** Remove a conexão: desloga do WhatsApp, apaga a sessão e o registro. */
  async function remover(id) {
    const inst = instancias.get(id);
    if (inst) {
      inst.paradaManual = true;
      clearTimeout(inst.timerReconexao);
      try {
        await inst.sock?.logout();
      } catch {
        try {
          inst.sock?.end(undefined);
        } catch {
          /* ignore */
        }
      }
      instancias.delete(id);
    }
    await rm(pastaDe(id), { recursive: true, force: true });
    return repo.removerConexao(id);
  }

  /** No boot: religa as conexões que têm sessão salva (sem novo QR). */
  async function religarSalvas() {
    for (const { id } of repo.listarConexoes()) {
      if (!temSessaoSalva(id)) continue;
      conectar(id).catch((err) => logger.error({ err, connectionId: id }, 'falha ao religar no boot'));
    }
  }

  function obterStatus(id) {
    const inst = instancias.get(id);
    return {
      status: inst?.status ?? 'close',
      numero: inst?.numero ?? null,
      uptime_segundos: inst?.conectadoEm ? Math.floor((Date.now() - inst.conectadoEm) / 1000) : 0,
      sessao_salva: temSessaoSalva(id),
    };
  }

  function contarAtivas() {
    return [...instancias.values()].filter((i) => i.status === 'open').length;
  }

  async function encerrarTodas() {
    for (const inst of instancias.values()) {
      inst.paradaManual = true;
      clearTimeout(inst.timerReconexao);
      try {
        inst.sock?.end(undefined);
      } catch {
        /* ignore */
      }
    }
  }

  return { conectar, desconectar, remover, religarSalvas, obterStatus, contarAtivas, encerrarTodas };
}
