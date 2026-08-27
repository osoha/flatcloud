import { createHash } from "node:crypto";
import type { ImapOptions } from "./imap";

export function mailboxIdentity(options: Pick<ImapOptions, "host" | "port" | "secure" | "user" | "mailbox">) {
  return createHash("sha256")
    .update(JSON.stringify({ host: options.host, port: options.port, secure: options.secure, user: options.user, mailbox: options.mailbox || "INBOX" }))
    .digest("hex");
}