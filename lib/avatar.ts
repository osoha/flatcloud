import sharp from "sharp";

const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_SIZE = 320;

export type AvatarUpdate = {
  avatarData: Uint8Array<ArrayBuffer>;
  avatarMimeType: "image/webp";
};

function validateSignature(bytes: Uint8Array, mimeType: string) {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return mimeType === "image/png" ? isPng : mimeType === "image/jpeg" ? isJpeg : isWebp;
}

export async function normalizeAvatarBytes(input: Uint8Array) {
  return sharp(input, { failOn: "error", limitInputPixels: 25_000_000 })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, {
      fit: "cover",
      position: sharp.strategy.attention,
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 90, smartSubsample: true, effort: 4 })
    .toBuffer();
}

export async function processAvatarUpload(upload: FormDataEntryValue | null): Promise<AvatarUpdate | null> {
  if (!(upload instanceof File) || upload.size === 0) return null;
  if (!ALLOWED_AVATAR_TYPES.has(upload.type)) throw new Error("Avatar musí být ve formátu PNG, JPG nebo WebP.");
  if (upload.size > MAX_AVATAR_BYTES) throw new Error("Avatar může mít maximálně 2 MB.");

  const bytes = new Uint8Array(await upload.arrayBuffer());
  if (!validateSignature(bytes, upload.type)) throw new Error("Obsah souboru neodpovídá zvolenému formátu obrázku.");

  try {
    const normalized = await normalizeAvatarBytes(bytes);
    const avatarData = new Uint8Array(new ArrayBuffer(normalized.byteLength));
    avatarData.set(normalized);
    return { avatarData, avatarMimeType: "image/webp" };
  } catch {
    throw new Error("Obrázek se nepodařilo zpracovat. Nahrajte prosím jinou fotografii.");
  }
}
