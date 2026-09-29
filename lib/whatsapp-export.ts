import crypto from "node:crypto";

export type ParsedWhatsAppMessage = {
  sender: string;
  senderNormalized: string;
  sentAt: string;
  text: string;
  messageType: "text" | "image" | "video" | "audio" | "document" | "system";
};

const linePattern =
  /^\[(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2}):(\d{2})\] ([^:]+): ?(.*)$/;

function cleanInvisible(value: string) {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
}

export function normalizeAlias(value: string) {
  return cleanInvisible(value)
    .replace(/^~\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyMessage(text: string): ParsedWhatsAppMessage["messageType"] {
  const lower = cleanInvisible(text).toLocaleLowerCase("tr-TR");
  if (lower.includes("görüntü dahil edilmedi")) return "image";
  if (lower.includes("video dahil edilmedi")) return "video";
  if (lower.includes("ses dahil edilmedi")) return "audio";
  if (lower.includes("belge dahil edilmedi")) return "document";
  return "text";
}

export function looksLikeSystemMessage(sender: string, text: string, groupName?: string) {
  const normalized = cleanInvisible(text).toLocaleLowerCase("tr-TR");
  const senderClean = normalizeAlias(sender);

  if (groupName && senderClean === normalizeAlias(groupName)) return true;

  return [
    "mesajlar ve aramalar uçtan uca şifrelidir",
    "grubunu oluşturdunuz",
    "grubunu oluşturdu",
    "sizi ekledi",
    "kişisini ekledi",
    "topluluğuna dahil olan bir gruba ekledi",
    "gruptan ayrıldı",
    "çıkarıldı",
    "grup açıklamasını değiştirdi",
    "grup simgesini değiştirdi",
  ].some((needle) => normalized.includes(needle));
}

export function parseWhatsAppExport(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const parsed: ParsedWhatsAppMessage[] = [];

  let current: ParsedWhatsAppMessage | null = null;

  for (const rawLine of lines) {
    const match = rawLine.match(linePattern);

    if (match) {
      if (current) parsed.push(current);

      const [, day, month, year, hour, minute, second, rawSender, firstLine] = match;
      const sender = normalizeAlias(rawSender);
      const sentAt = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour) - 3,
          Number(minute),
          Number(second),
        ),
      ).toISOString();

      current = {
        sender,
        senderNormalized: sender.toLocaleLowerCase("tr-TR"),
        sentAt,
        text: cleanInvisible(firstLine),
        messageType: classifyMessage(firstLine),
      };
      continue;
    }

    if (current) {
      current.text += `\n${cleanInvisible(rawLine)}`;
      current.messageType = classifyMessage(current.text);
    }
  }

  if (current) parsed.push(current);
  return parsed;
}

export function inferGroupName(fileName: string, messages: ParsedWhatsAppMessage[]) {
  const fromSystem = messages.find((message) =>
    /mesajlar ve aramalar uçtan uca şifrelidir/i.test(message.text),
  )?.sender;

  if (fromSystem) return normalizeAlias(fromSystem);

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
