export const MF_SOURCE_PAGE =
  "https://mf.gov.cz/cs/rozpoctova-politika/podpora-projektoveho-rizeni/cenova-mapa/cenova-mapa-infografika";
export const MF_HTML_MAX_BYTES = 2 * 1024 * 1024;
export const MF_XLSX_MAX_BYTES = 10 * 1024 * 1024;
export const MF_REQUEST_TIMEOUT_MS = 15_000;

export type MfSourceRelease = {
  url: string;
  fileName: string;
  publishedOn: Date;
  marketYear: number;
  marketQuarter: number;
  current: boolean;
};
export type MfFetch = typeof fetch;

export function assertOfficialMfUrl(input: string, base = MF_SOURCE_PAGE) {
  const url = new URL(input, base);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "mf.gov.cz" ||
    !url.pathname.toLowerCase().endsWith(".xlsx")
  )
    throw new Error("Nepovolený zdroj dat MF.");
  return url;
}
export function marketPeriodBeforePublication(date: Date) {
  let year = date.getUTCFullYear(),
    quarter = Math.floor(date.getUTCMonth() / 3);
  if (quarter === 0) {
    year--;
    quarter = 4;
  }
  if (quarter < 1 || quarter > 4) throw new Error("Neplatné období MF.");
  return { marketYear: year, marketQuarter: quarter };
}
function publicationFrom(
  name: string,
  label: string,
  current: boolean,
  pageUpdated?: Date,
) {
  const iso = name.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const months: Record<string, number> = {
    leden: 0,
    únor: 1,
    brezen: 2,
    březen: 2,
    duben: 3,
    květen: 4,
    cerven: 5,
    červen: 5,
    cervenec: 6,
    červenec: 6,
    srpen: 7,
    září: 8,
    rijen: 9,
    říjen: 9,
    listopad: 10,
    prosinec: 11,
  };
  const match = label.toLowerCase().match(/([a-zá-ž]+)\s+(20\d{2})/u);
  if (match && months[match[1]] !== undefined)
    return new Date(Date.UTC(+match[2], months[match[1]], 15));
  if (current && pageUpdated) return pageUpdated;
  throw new Error("U přílohy MF chybí datum publikace.");
}
export function discoverMfReleases(html: string, pageUrl = MF_SOURCE_PAGE) {
  const updated = html.match(
    /(?:aktualizován|updated)[^0-9]*(\d{1,2})\.(\d{1,2})\.(20\d{2})/i,
  );
  const pageUpdated = updated
    ? new Date(Date.UTC(+updated[3], +updated[2] - 1, +updated[1]))
    : undefined;
  const releases: MfSourceRelease[] = [];
  const links =
    /<a\b[^>]*href=["']([^"']+\.xlsx(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = links.exec(html))) {
    const url = assertOfficialMfUrl(match[1], pageUrl);
    const label = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const current = /tabulkov[eé]\s+v[yý]stupy/i.test(label);
    const historical = /historick[aá]\s+data/i.test(label);
    if (!current && !historical) continue;
    const fileName = decodeURIComponent(url.pathname.split("/").pop()!);
    const publishedOn = publicationFrom(fileName, label, current, pageUpdated);
    releases.push({
      url: url.href,
      fileName,
      publishedOn,
      ...marketPeriodBeforePublication(publishedOn),
      current,
    });
  }
  if (!releases.some((r) => r.current) || !releases.some((r) => !r.current))
    throw new Error(
      "Oficiální stránka MF neobsahuje očekávané aktuální a historické XLSX přílohy.",
    );
  return releases.sort(
    (a, b) => b.publishedOn.getTime() - a.publishedOn.getTime(),
  );
}
async function limited(response: Response, max: number) {
  const final = new URL(response.url);
  if (
    final.protocol !== "https:" ||
    final.hostname.toLowerCase() !== "mf.gov.cz"
  )
    throw new Error("Přesměrování mimo mf.gov.cz bylo odmítnuto.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > max)
    throw new Error("Odpověď MF překročila povolenou velikost.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > max)
    throw new Error("Odpověď MF překročila povolenou velikost.");
  return bytes;
}
export async function fetchOfficialBytes(
  url: string,
  max: number,
  fetcher: MfFetch = fetch,
) {
  const official =
    url === MF_SOURCE_PAGE ? new URL(url) : assertOfficialMfUrl(url);
  const response = await fetcher(official, {
    redirect: "follow",
    signal: AbortSignal.timeout(MF_REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "FlatCloud MF CMNB synchronizer/1" },
  });
  if (!response.ok)
    throw new Error(`Zdroj MF není dostupný (${response.status}).`);
  return limited(response, max);
}
export async function discoverOfficialMfReleases(fetcher: MfFetch = fetch) {
  const bytes = await fetchOfficialBytes(
    MF_SOURCE_PAGE,
    MF_HTML_MAX_BYTES,
    fetcher,
  );
  return discoverMfReleases(new TextDecoder().decode(bytes));
}
export async function downloadOfficialXlsx(
  url: string,
  fetcher: MfFetch = fetch,
) {
  const bytes = await fetchOfficialBytes(url, MF_XLSX_MAX_BYTES, fetcher);
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    throw new Error("Příloha MF není platný XLSX/ZIP soubor.");
  return bytes;
}
