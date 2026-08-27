import net from "node:net";
import tls from "node:tls";

export type RawImapMessage = { uid: number; source: Buffer };

export type ImapOptions = { host: string; port: number; secure: boolean; user: string; pass: string; mailbox: string };

function quoted(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function decodeCharset(bytes: Buffer, charset?: string | null) {
  const requested = (charset || "").trim().replace(/["']/g, "").toLowerCase();
  const candidates = requested ? [requested, "utf-8", "windows-1250", "iso-8859-2"] : ["utf-8", "windows-1250", "iso-8859-2"];
  for (const candidate of candidates) {
    try {
      return new TextDecoder(candidate, { fatal: candidate === "utf-8" }).decode(bytes);
    } catch { /* try next */ }
  }
  return bytes.toString("latin1");
}

function decodeQuotedPrintableBytes(input: string) {
  const value = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "=" && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(value.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset: string, enc: string, payload: string) => {
    try {
      const buf = enc.toLowerCase() === "b"
        ? Buffer.from(payload, "base64")
        : decodeQuotedPrintableBytes(payload.replace(/_/g, " "));
      return decodeCharset(buf, charset);
    } catch { return payload; }
  });
}

function parseHeaders(raw: string) {
  const headerText = raw.split(/\r?\n\r?\n/, 1)[0] || "";
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    headers.set(line.slice(0, idx).trim().toLowerCase(), decodeMimeWords(line.slice(idx + 1).trim()));
  }
  return headers;
}

function bodyAfterHeaders(raw: string) {
  const match = raw.match(/\r?\n\r?\n/);
  return match ? raw.slice((match.index || 0) + match[0].length) : "";
}

function charsetFromContentType(contentType?: string | null) {
  return contentType?.match(/charset=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
}

function decodePart(body: string, encoding?: string, charset?: string | null) {
  const enc = (encoding || "").toLowerCase();
  try {
    const bytes = enc.includes("base64")
      ? Buffer.from(body.replace(/\s/g, ""), "base64")
      : enc.includes("quoted-printable")
        ? decodeQuotedPrintableBytes(body)
        : Buffer.from(body, "latin1");
    return decodeCharset(bytes, charset);
  } catch { /* best effort */ }
  return body;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?(?:p|div|tr|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function multipartText(raw: string, boundary: string) {
  const marker = `--${boundary}`;
  const parts = raw.split(marker).slice(1);
  const texts: string[] = [];
  for (const part of parts) {
    if (part.startsWith("--")) break;
    const headers = parseHeaders(part);
    const contentType = headers.get("content-type") || "text/plain";
    if (/multipart\//i.test(contentType)) {
      const nestedBoundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
      if (nestedBoundary) texts.push(multipartText(bodyAfterHeaders(part), nestedBoundary));
      continue;
    }
    if (!/^text\/(plain|html)/i.test(contentType)) continue;
    const decoded = decodePart(bodyAfterHeaders(part), headers.get("content-transfer-encoding"), charsetFromContentType(contentType));
    texts.push(/^text\/html/i.test(contentType) ? stripHtml(decoded) : decoded);
  }
  return texts.join("\n");
}

export function parseRawEmail(source: Buffer) {
  // latin1 keeps a 1:1 mapping to the RFC822 bytes; MIME charset/transfer decoding happens per part below.
  const raw = source.toString("latin1");
  const headers = parseHeaders(raw);
  const contentType = headers.get("content-type") || "text/plain";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
  const body = bodyAfterHeaders(raw);
  let text: string;
  if (boundary) text = multipartText(body, boundary);
  else {
    const decoded = decodePart(body, headers.get("content-transfer-encoding"), charsetFromContentType(contentType));
    text = /^text\/html/i.test(contentType) ? stripHtml(decoded) : decoded;
  }
  const sender = headers.get("from");
  const dateRaw = headers.get("date");
  const parsedDate = dateRaw ? new Date(dateRaw) : undefined;
  return {
    messageId: headers.get("message-id")?.replace(/^<|>$/g, ""),
    subject: headers.get("subject"),
    from: sender,
    returnPath: headers.get("return-path"),
    authenticationResults: headers.get("authentication-results"),
    date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined,
    text: text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

function createImapSession(options: ImapOptions) {
  const socket = options.secure
    ? tls.connect({ host: options.host, port: options.port, servername: options.host, rejectUnauthorized: true })
    : net.connect({ host: options.host, port: options.port });
  socket.setTimeout(15_000);
  let buffer = Buffer.alloc(0);
  const waiters: Array<() => void> = [];
  let socketError: Error | null = null;
  let socketClosed = false;
  const wakeAll = () => { for (const wake of waiters.splice(0)) wake(); };
  socket.on("data", (chunk: Buffer) => { buffer = Buffer.concat([buffer, chunk]); wakeAll(); });
  socket.on("error", (error) => { socketError = error; wakeAll(); });
  socket.on("end", () => { socketClosed = true; wakeAll(); });
  socket.on("close", () => { socketClosed = true; wakeAll(); });
  socket.on("timeout", () => socket.destroy(new Error("IMAP timeout po 15 sekundách bez odpovědi.")));

  const waitData = () => new Promise<void>((resolve) => waiters.push(resolve));
  async function waitForLine(predicate: (line: string) => boolean) {
    while (true) {
      if (socketError) throw socketError;
      const idx = buffer.indexOf("\r\n");
      if (idx >= 0) {
        const line = buffer.subarray(0, idx).toString("utf8");
        buffer = buffer.subarray(idx + 2);
        if (predicate(line)) return line;
        continue;
      }
      if (socketClosed) throw new Error("IMAP server ukončil spojení dříve, než dokončil odpověď.");
      await waitData();
    }
  }
  async function command(tag: string, body: string) {
    if (socketClosed || socket.destroyed) throw new Error("IMAP spojení už není aktivní.");
    socket.write(`${tag} ${body}\r\n`);
    let collected = Buffer.alloc(0);
    const taggedLine = new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n`, "i");
    while (true) {
      if (socketError) throw socketError;
      if (buffer.length) {
        collected = Buffer.concat([collected, buffer]);
        buffer = Buffer.alloc(0);
        const latin = collected.toString("latin1");
        const match = taggedLine.exec(latin);
        if (match && match.index !== undefined) {
          const prefixLength = match[0].startsWith("\r\n") ? 2 : 0;
          const taggedStart = match.index + prefixLength;
          const end = match.index + match[0].length;
          const output = collected.subarray(0, end);
          buffer = collected.subarray(end);
          const status = latin.slice(taggedStart, end).match(new RegExp(`^${tag} (OK|NO|BAD)`, "i"))?.[1]?.toUpperCase();
          if (status !== "OK") throw new Error(`IMAP příkaz selhal: ${output.toString("utf8").slice(-500)}`);
          return output;
        }
      }
      if (socketClosed) throw new Error("IMAP server ukončil spojení dříve, než dokončil příkaz.");
      await waitData();
    }
  }
  async function loginAndSelect() {
    await waitForLine((line) => /^\* OK/i.test(line));
    await command("A001", `LOGIN ${quoted(options.user)} ${quoted(options.pass)}`);
    const capability = await command("A002", "CAPABILITY");
    const select = await command("A003", `SELECT ${quoted(options.mailbox || "INBOX")}`);
    const uidValidity = select.toString("latin1").match(/\* OK \[UIDVALIDITY\s+(\d+)\]/i)?.[1] || null;
    return { uidValidity, supportsUidExpunge: /UIDPLUS/i.test(capability.toString("latin1")) };
  }
  function close() {
    if (!socket.destroyed) socket.destroy();
  }
  return { command, loginAndSelect, close };
}

export async function testImapConnection(options: ImapOptions): Promise<{ ok: true; mailbox: string }> {
  const session = createImapSession(options);
  try {
    await session.loginAndSelect();
    return { ok: true, mailbox: options.mailbox || "INBOX" };
  } finally {
    session.close();
  }
}

export async function fetchImapMessages(options: ImapOptions, afterUid: number): Promise<{ messages: RawImapMessage[]; maxUid: number; uidValidity: string | null }> {
  const session = createImapSession(options);
  try {
    const selected = await session.loginAndSelect();
    const search = await session.command("A003", `UID SEARCH UID ${Math.max(1, afterUid + 1)}:*`);
    const searchText = search.toString("latin1");
    const ids: number[] = [...new Set<number>((searchText.match(/^\* SEARCH\s*(.*)$/mi)?.[1] || "").trim().split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > afterUid))].sort((a, b) => a - b);
    const messages: RawImapMessage[] = [];
    let seq = 4;
    let maxUid = afterUid;
    for (const uid of ids.slice(0, 200)) {
      const tag = `A${String(seq++).padStart(3, "0")}`;
      const response = await session.command(tag, `UID FETCH ${uid} (UID BODY.PEEK[])`);
      const latin = response.toString("latin1");
      const literal = latin.match(/\{(\d+)\}\r\n/);
      if (!literal || literal.index === undefined) continue;
      const start = literal.index + literal[0].length;
      const length = Number(literal[1]);
      const source = response.subarray(start, start + length);
      if (source.length !== length) throw new Error(`IMAP FETCH UID ${uid}: neúplný obsah zprávy.`);
      messages.push({ uid, source });
      maxUid = Math.max(maxUid, uid);
    }
    return { messages, maxUid, uidValidity: selected.uidValidity };
  } finally {
    session.close();
  }
}

export async function deleteImapMessages(options: ImapOptions, uidValidity: string, uids: number[]) {
  if (!uids.length) return 0;
  const session = createImapSession(options);
  try {
    const selected = await session.loginAndSelect();
    if (!selected.uidValidity || selected.uidValidity !== uidValidity) throw new Error("UIDVALIDITY schránky se změnila; mazání bylo bezpečně přeskočeno.");
    if (!selected.supportsUidExpunge) throw new Error("IMAP server nepodporuje bezpečný selektivní UID EXPUNGE; retence byla přeskočena.");
    const uidSet = [...new Set(uids)].filter((uid) => Number.isInteger(uid) && uid > 0).join(",");
    if (!uidSet) return 0;
    await session.command("A004", `UID STORE ${uidSet} +FLAGS.SILENT (\\Deleted)`);
    await session.command("A005", `UID EXPUNGE ${uidSet}`);
    return uids.length;
  } finally {
    session.close();
  }
}
