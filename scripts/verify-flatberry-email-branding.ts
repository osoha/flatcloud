import assert from "node:assert/strict";
import { prepareFlatBerryMail, renderFlatBerryEmail } from "../lib/email";
import { renderWelcomeLetter } from "../lib/distribution/welcome-letters";

const qr = { filename: "qr-platba.gif", content: Buffer.from("qr"), cid: "qr@flatberry", contentType: "image/gif" };
async function verify() {
  const payment = await prepareFlatBerryMail({ to: "tenant@example.test", subject: "Platební údaje", text: "8 900 Kč", html: '<p>Částka: 8 900 Kč</p><img src="cid:qr@flatberry">', attachments: [qr] });
  assert.match(payment.html, /data-flatberry-email="1"/);
  assert.match(payment.html, /alt="FlatBerry"/);
  assert.match(payment.html, /src="cid:flatberry-brand-logo@flatberry"/);
  assert.match(payment.html, /Částka: 8 900 Kč/);
  assert.match(payment.html, /src="cid:qr@flatberry"/);
  assert.deepEqual(payment.attachments?.map(item => item.cid), ["qr@flatberry", "flatberry-brand-logo@flatberry"]);
  assert.equal(payment.attachments?.[1].contentType, "image/png");
  assert.ok((payment.attachments?.[1].content.length || 0) > 1000);

  const letter = renderWelcomeLetter({ subject: "Vítejte", introduction: "Vážení vlastníci", handoverText: "", leaseText: "", insuranceText: "", managementText: "", platformText: "FlatBerry", taxText: "", associationText: "", closingText: "S pozdravem", contactText: "Flat Cloud a.s." });
  assert.match(letter.html, /src="\/flatberry-logo.png"/); // Browser preview uses the local image.
  const sentLetter = await prepareFlatBerryMail({ to: "owner@example.test", subject: "Vítejte", ...letter });
  assert.equal(sentLetter.html.match(/data-flatberry-email="1"/g)?.length, 1);
  assert.match(sentLetter.html, /cid:flatberry-brand-logo@flatberry/);
  assert.doesNotMatch(sentLetter.html, /src="\/flatberry-logo.png"/);

  const root = renderFlatBerryEmail("<p>Zpráva</p>");
  assert.match(root, /Zpráva byla vytvořena v aplikaci FlatBerry/);
  console.log("FlatBerry mail branding, inline logo and QR attachment verified.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
