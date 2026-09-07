import sharp from "sharp";
export { czechMapPoint } from "./annual-map-projection";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function processAnnualMapPhoto(upload: FormDataEntryValue | null) {
  if (!(upload instanceof File) || upload.size === 0) return null;
  if (!ALLOWED_IMAGE_TYPES.has(upload.type)) throw new Error("Fotografie musí být ve formátu PNG, JPG nebo WebP.");
  if (upload.size > MAX_IMAGE_BYTES) throw new Error("Fotografie může mít maximálně 8 MB.");
  try {
    const buffer = await sharp(new Uint8Array(await upload.arrayBuffer()), { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(720, 480, { fit: "cover", position: sharp.strategy.attention }).webp({ quality: 88, effort: 4 }).toBuffer();
    return { data: new Uint8Array(buffer), mimeType: "image/webp" };
  } catch { throw new Error("Fotografii se nepodařilo zpracovat."); }
}

export type GeocodedAddress = { latitude: number; longitude: number; displayName: string };

export async function geocodeCzechAddress(address: string, fetcher: typeof fetch = fetch): Promise<GeocodedAddress | null> {
  const baseUrl = process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org";
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", `${address}, Česko`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "cz");
  const response = await fetcher(url, { headers: { "user-agent": "FlatCloud-Rent/1.22 annual-report-map (info@flatcloud.cz)", accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("Mapová služba je dočasně nedostupná.");
  const rows = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const latitude = Number(rows[0]?.lat); const longitude = Number(rows[0]?.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude, displayName: rows[0]?.display_name || address } : null;
}
