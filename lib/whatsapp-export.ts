import crypto from "node:crypto";

export type ParsedWhatsAppMessage = {
  sender: string;
  senderNormalized: string;
  sentAt: string;
  text: string;
  messageType: "text" | "image" | "video" | "audio" | "document" | "system";
  topics: string[];
  isSubstantive: boolean;
};

export type ParsedWhatsAppEvent = {
  sentAt: string;
  eventType: "joined" | "added" | "left" | "removed" | "system";
  subjectAlias?: string;
  actorAlias?: string;
  rawText: string;
};

const messagePattern =
  /^\[(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s+([^:]+):\s?(.*)$/;

const eventPattern =
  /^\[(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s+(.*)$/;

function cleanInvisible(value: string) {
  return value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\u202f/g, " ")
    .trim();
}

export function normalizeAlias(value: string) {
  return cleanInvisible(value)
    .replace(/^~\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(
  day: string,
  month: string,
  year: string,
  hour: string,
  minute: string,
  second?: string,
) {
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 3,
      Number(minute),
      Number(second || "0"),
    ),
  ).toISOString();
}

function classifyMessage(text: string): ParsedWhatsAppMessage["messageType"] {
  const lower = cleanInvisible(text).toLocaleLowerCase("tr-TR");
  if (lower.includes("görüntü dahil edilmedi")) return "image";
  if (lower.includes("video dahil edilmedi")) return "video";
  if (lower.includes("ses dahil edilmedi")) return "audio";
  if (lower.includes("belge dahil edilmedi")) return "document";
  return "text";
}

export function classifyTopics(text: string) {
  const lower = cleanInvisible(text).toLocaleLowerCase("tr-TR");
  const topics: string[] = [];

  const tests: Array<[string, RegExp]> = [
    ["Antrenman", /(antrenman|training|drill|kondisyon|gym|salon|ring içi|sparring)/i],
    ["Karakter/Gimmick", /(gimmick|karakter|persona|heel|face|entrance|giriş müziği|theme)/i],
    ["Hikâye/Promo", /(promo|feud|story|hikaye|hikâye|segment|booking|maç plan|match)/i],
    ["Ring/Ekipman", /((^|[^a-z0-9çğıöşü])ring($|[^a-z0-9çğıöşü])|canvas|turnbuckle|ring ip|ekipman)/i],
    ["Mekân/Lojistik", /(mekan|mekân|depo|salon|stüdyo|studio|ulaşım|lojistik)/i],
    ["Creative/Medya", /(video|çekim|kurgu|edit|grafik|logo|poster|kamera|foto)/i],
    ["Sosyal Medya", /(instagram|tiktok|youtube|sosyal medya|reels|post paylaş)/i],
    ["Sponsor/Finans", /(sponsor|bütçe|butce|(^|[^a-z0-9çğıöşü])para($|[^a-z0-9çğıöşü])|(^|[^a-z0-9çğıöşü])tl($|[^a-z0-9çğıöşü])|euro|ödeme|maliyet|finans)/i],
    ["Yönetim/Operasyon", /(toplantı|görev|yonetim|yönetim|planlama|organizasyon|takvim|deadline)/i],
    ["Katılım/Uygunluk", /(geleceğim|gelicem|katılacağım|uygunum|müsait|musait|gelemem|katılım)/i],
  ];

  for (const [topic, pattern] of tests) {
    if (pattern.test(lower)) topics.push(topic);
  }

  return topics;
}

function isSubstantiveMessage(text: string) {
  const lower = cleanInvisible(text).toLocaleLowerCase("tr-TR");
  return !(
    lower.length < 3 ||
    ["ok", "tm", "tamam", "evet", "hayır", "yok", "aynen", "lol", "ahah", "hahaha"].includes(lower)
  );
}

function parseEventText(text: string): Omit<ParsedWhatsAppEvent, "sentAt"> {
  const cleaned = cleanInvisible(text);

  let match = cleaned.match(/^(.+?)\s+gruptan ayrıldı\.?$/i);
  if (match) {
    return { eventType: "left", subjectAlias: normalizeAlias(match[1]), rawText: cleaned };
  }

  match = cleaned.match(/^(.+?)\s+gruba katıldı\.?$/i);
  if (match) {
    return { eventType: "joined", subjectAlias: normalizeAlias(match[1]), rawText: cleaned };
  }

  match = cleaned.match(/^(.+?)\s+çıkarıldı\.?$/i);
  if (match) {
    return { eventType: "removed", subjectAlias: normalizeAlias(match[1]), rawText: cleaned };
  }

  match = cleaned.match(/^(.+?),\s*(.+?)\s+(?:adlı kişiyi|kişisini) ekledi\.?$/i);
  if (match) {
    return {
      eventType: "added",
      actorAlias: normalizeAlias(match[1]),
      subjectAlias: normalizeAlias(match[2]),
      rawText: cleaned,
    };
  }

  match = cleaned.match(/^(.+?)\s+sizi ekledi\.?$/i);
  if (match) {
    return { eventType: "added", actorAlias: normalizeAlias(match[1]), rawText: cleaned };
  }

  return { eventType: "system", rawText: cleaned };
}

export function parseWhatsAppExport(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const messages: ParsedWhatsAppMessage[] = [];
  const events: ParsedWhatsAppEvent[] = [];

  let current: ParsedWhatsAppMessage | null = null;

  const flush = () => {
    if (!current) return;
    current.messageType = classifyMessage(current.text);
    current.topics = classifyTopics(current.text);
    current.isSubstantive = isSubstantiveMessage(current.text);
    messages.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = cleanInvisible(rawLine);
    if (!line) continue;

    const messageMatch = line.match(messagePattern);
    if (messageMatch) {
      flush();
      const [, day, month, year, hour, minute, second, rawSender, firstLine] = messageMatch;
      const sender = normalizeAlias(rawSender);
      current = {
        sender,
        senderNormalized: sender.toLocaleLowerCase("tr-TR"),
        sentAt: toIso(day, month, year, hour, minute, second),
        text: cleanInvisible(firstLine),
        messageType: classifyMessage(firstLine),
        topics: classifyTopics(firstLine),
        isSubstantive: isSubstantiveMessage(firstLine),
      };
      continue;
    }

    const eventMatch = line.match(eventPattern);
    if (eventMatch) {
      flush();
      const [, day, month, year, hour, minute, second, eventText] = eventMatch;
      events.push({
        sentAt: toIso(day, month, year, hour, minute, second),
        ...parseEventText(eventText),
      });
      continue;
    }

    if (current) {
      current.text += `\n${line}`;
    }
  }

  flush();
  return { messages, events };
}

export function inferGroupName(fileName: string) {
  return fileName
    .replace(/\.zip$/i, "")
    .replace(/^WhatsApp Chat - /i, "")
    .replace(/\(\d+\)$/i, "")
    .trim();
}

export function messageFingerprint(input: {
  groupName: string;
  senderNormalized: string;
  sentAt: string;
  text: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      [input.groupName, input.senderNormalized, input.sentAt, input.text].join("\n"),
      "utf8",
    )
    .digest("hex");
}
