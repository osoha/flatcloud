import { redactedBankEmailExcerpt } from "./bank-email";
import { parseRawEmail } from "./imap";

export function failedBankEmailExcerpt(source: Buffer): string {
  try {
    // Never persist RFC822 bytes: a base64/quoted-printable part can hide a balance.
    return redactedBankEmailExcerpt(parseRawEmail(source));
  } catch {
    return "Původní obsah nebyl uložen: e-mail se nepodařilo bezpečně dekódovat.";
  }
}
