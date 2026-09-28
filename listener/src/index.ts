import makeWASocket, {
  Browsers,
  DisconnectReason,
  getContentType,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

const apiBase = required("PWB_API_BASE_URL").replace(/\/$/, "");
const sharedSecret = required("LISTENER_SHARED_SECRET");
const authDir = process.env.WA_AUTH_DIR || "./auth";
const groupPrefix = (process.env.PWB_GROUP_NAME_PREFIX || "").trim();
const includeDms = process.env.PWB_INCLUDE_DMS === "true";
const allowedGroupJids = new Set(
  (process.env.PWB_GROUP_JIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const groupCache = new Map<string, { name: string; expiresAt: number }>();
const seenGroups = new Set<string>();

let socket: ReturnType<typeof makeWASocket> | null = null;
let connected = false;
let reconnectTimer: NodeJS.Timeout | null = null;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function api(path: string, init?: RequestInit) {
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-pwb-listener-secret": sharedSecret,
      ...(init?.headers || {}),
    },
  });
}

function messageText(message: any) {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    null
  );
}

function normalizeMessageType(message: any) {
  const type = getContentType(message) || "unknown";
  if (type === "conversation" || type === "extendedTextMessage") return "text";
  if (type === "imageMessage") return "image";
  if (type === "videoMessage") return "video";
  if (type === "audioMessage") return "audio";
  if (type === "documentMessage") return "document";
  if (type === "stickerMessage") return "sticker";
  if (type === "reactionMessage") return "reaction";
  return type;
}

function mediaMetadata(message: any) {
  const image = message?.imageMessage;
  const video = message?.videoMessage;
  const audio = message?.audioMessage;
  const document = message?.documentMessage;

  if (image) {
    return {
      mimetype: image.mimetype || null,
      width: image.width || null,
      height: image.height || null,
    };
  }

  if (video) {
    return {
      mimetype: video.mimetype || null,
      seconds: video.seconds || null,
      width: video.width || null,
      height: video.height || null,
    };
  }

  if (audio) {
    return {
      mimetype: audio.mimetype || null,
      seconds: audio.seconds || null,
      ptt: audio.ptt || false,
    };
  }

  if (document) {
    return {
      mimetype: document.mimetype || null,
      fileName: document.fileName || null,
      fileLength: document.fileLength?.toString?.() || null,
    };
  }

  return {};
}

function toIsoTimestamp(timestamp: any) {
  const seconds =
    typeof timestamp === "number"
      ? timestamp
      : Number(timestamp?.toString?.() || Math.floor(Date.now() / 1000));

  return new Date(seconds * 1000).toISOString();
}

async function getGroupName(jid: string) {
  const cached = groupCache.get(jid);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  if (!socket) return jid;

  try {
    const metadata = await socket.groupMetadata(jid);
    const name = metadata.subject || jid;
    groupCache.set(jid, { name, expiresAt: Date.now() + 5 * 60 * 1000 });
    return name;
  } catch (error) {
    logger.warn({ err: error, jid }, "Could not read group metadata");
    return jid;
  }
}

function groupAllowed(jid: string, name: string) {
  if (allowedGroupJids.has(jid)) return true;
  if (groupPrefix && name.toLocaleLowerCase("tr-TR").startsWith(groupPrefix.toLocaleLowerCase("tr-TR"))) {
    return true;
  }
  return false;
}

async function ingestMessage(item: any) {
  if (!item?.message || !item?.key?.remoteJid || item.key.fromMe) return;

  const chatJid = item.key.remoteJid as string;
  const isGroup = chatJid.endsWith("@g.us");

  if (!isGroup && !includeDms) return;

  let chatName: string | null = null;

  if (isGroup) {
    chatName = await getGroupName(chatJid);

    if (!seenGroups.has(chatJid)) {
      seenGroups.add(chatJid);
      logger.info({ group: chatName, jid: chatJid }, "WhatsApp group discovered");
    }

    if (!groupAllowed(chatJid, chatName)) return;
  }

  const senderJid =
    (item.key as any).participantAlt ||
    item.key.participant ||
    item.key.remoteJid;

  const payload = {
    message_id: item.key.id || `${chatJid}:${Date.now()}`,
    chat_jid: chatJid,
    chat_name: chatName,
    group_jid: isGroup ? chatJid : null,
    sender_wa_id: senderJid,
    sender_name: item.pushName || null,
    timestamp: toIsoTimestamp(item.messageTimestamp),
    message_type: normalizeMessageType(item.message),
    text: messageText(item.message),
    media_metadata: mediaMetadata(item.message),
    raw_metadata: {
      from_me: Boolean(item.key.fromMe),
      participant: item.key.participant || null,
      participant_alt: (item.key as any).participantAlt || null,
    },
  };

  const response = await api("/api/events/whatsapp", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.error(
      { status: response.status, body: await response.text(), messageId: payload.message_id },
      "PWB API rejected WhatsApp event",
    );
  }
}

async function pollOutbox() {
  if (!socket || !connected) return;

  try {
    const response = await api("/api/outbox/next");

    if (response.status === 204) return;
    if (!response.ok) {
      logger.warn({ status: response.status, body: await response.text() }, "Outbox poll failed");
      return;
    }

    const { item } = (await response.json()) as {
      item: {
        id: string;
        to_jid: string;
        body: string;
        claim_token: string;
      };
    };

    try {
      const sent = await socket.sendMessage(item.to_jid, { text: item.body });
      await api(`/api/outbox/${item.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          claim_token: item.claim_token,
          ok: true,
          wa_message_id: sent?.key?.id || null,
        }),
      });
      logger.info({ outboxId: item.id, to: item.to_jid }, "Approved WhatsApp message sent");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await api(`/api/outbox/${item.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          claim_token: item.claim_token,
          ok: false,
          error: errorMessage,
        }),
      });
      logger.error({ err: error, outboxId: item.id }, "WhatsApp send failed");
    }
  } catch (error) {
    logger.warn({ err: error }, "Outbox worker error");
  }
}

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const nextSocket = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu("PWB Bot"),
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
  });

  socket = nextSocket;

  nextSocket.ev.on("creds.update", saveCreds);

  nextSocket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Scan the QR below from the dedicated PWB Bot WhatsApp account.");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      connected = true;
      logger.info("PWB WhatsApp Listener connected");
    }

    if (connection === "close") {
      connected = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn({ statusCode, loggedOut }, "WhatsApp connection closed");

      if (!loggedOut && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void startSocket();
        }, 3000);
      }

      if (loggedOut) {
        logger.error("WhatsApp session logged out. Remove auth data and pair the PWB Bot number again.");
      }
    }
  });

  nextSocket.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const item of messages) {
      void ingestMessage(item).catch((error) => {
        logger.error({ err: error, messageId: item.key.id }, "Failed to ingest WhatsApp message");
      });
    }
  });
}

setInterval(() => {
  void pollOutbox();
}, 3000);

void startSocket().catch((error) => {
  logger.fatal({ err: error }, "Listener failed to start");
  process.exitCode = 1;
});
