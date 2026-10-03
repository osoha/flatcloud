// Operates on decoded plain text, before any excerpt is truncated or persisted.
// Keep account identity, dates and the change amount: they can identify the payment.
const balanceLabel = /(?<!\p{L})(?:z[ůu]stat(?:ek|ku|ky|ků)|zostat(?:ok|ku|ky)|saldo|balance(?:s)?)(?!\p{L})/giu;
const paymentField = /(?:částka|castka|připsaná částka|pripsana castka|\bamount\b|variabiln[ií] symbol|specifick[yý] symbol|konstantn[ií] symbol|\bVS\b|\bSS\b|\bKS\b|účet protistrany|ucet protistrany|název protistrany|nazev protistrany|datum účtování|datum uctovani|zpráva pro příjemce|zprava pro prijemce)/iu;
const numberPattern = "[+\\-−]?(?:\\d{1,3}(?:[ \\t\\u00a0\\u202f.,]\\d{3})+|\\d+)(?:[.,]\\d{1,2})?";
const number = new RegExp(`(?<![\\p{L}\\d])${numberPattern}(?![\\p{L}\\d])`, "gu");

function maskBalanceValue(value: string) {
  const protectedRanges: Array<[number, number]> = [];
  const protect = (pattern: RegExp) => {
    for (const match of value.matchAll(pattern)) protectedRanges.push([match.index!, match.index! + match[0].length]);
  };
  protect(/(?:\d{1,6}-)?\d{1,10}\s*\/\s*\d{4}|CZ\d{2}(?:\s*\d){20}/giu);
  protect(/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\b/gu);
  protect(/(?:účtu|uctu|účte|ucte|account)\s+(?:č[.\s]*|number\s+)?(?:\d{1,6}-)?\d{1,10}(?!\d)/giu);
  const change = value.match(new RegExp(`(?:zv[yý]š(?:il|en)|sn[ií]ž(?:il|en)|increased|decreased)[^\\n;]*?\\b(?:o|by)\\s+(${numberPattern})`, "iu"));
  if (change) {
    const start = change.index! + change[0].lastIndexOf(change[1]);
    protectedRanges.push([start, start + change[1].length]);
  }
  return value.replace(number, (amount: string, offset: number) =>
    protectedRanges.some(([start, end]) => offset < end && offset + amount.length > start) ? amount : "xxxx");
}

export function redactBankBalances(text: string): string {
  const lines = text.split("\n");
  let awaitingValue = false;
  return lines.map(line => {
    const labels = [...line.matchAll(balanceLabel)];
    if (!labels.length) {
      if (!awaitingValue || !line.trim()) return line;
      // A label/value layout may put the balance on the next non-empty line.
      // Stop at the next payment field, so its amount/VS never becomes a balance.
      if (paymentField.test(line)) { awaitingValue = false; return line; }
      const masked = maskBalanceValue(line);
      if (masked !== line || /xxxx/i.test(line)) awaitingValue = false;
      return masked;
    }
    awaitingValue = false;
    let result = line;
    for (let i = labels.length - 1; i >= 0; i -= 1) {
      const start = labels[i].index! + labels[i][0].length;
      const end = labels[i + 1]?.index ?? line.length;
      const span = line.slice(start, end);
      const field = span.match(paymentField);
      const stop = field?.index ?? span.length;
      const value = span.slice(0, stop);
      const masked = maskBalanceValue(value);
      result = result.slice(0, start) + masked + span.slice(stop) + result.slice(end);
      if (i === labels.length - 1 && !field && masked === value && !/xxxx/i.test(value)) awaitingValue = true;
    }
    return result;
  }).join("\n");
}
