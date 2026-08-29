import { DocumentCategory, DocumentPhotoStage } from "@prisma/client";
import { validateFile } from "./file-validation";

export const MAX_DOCUMENT_FILES = 10;
export type PreparedDocumentFile = { bytes: Uint8Array; mimeType: string; originalName: string };

export async function prepareDocumentFiles(form: FormData): Promise<PreparedDocumentFile[]> {
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  const fallback = form.get("file");
  if (!files.length && fallback instanceof File && fallback.size > 0) files.push(fallback);
  if (!files.length) throw new Error("Vyberte alespoň jeden soubor.");
  if (files.length > MAX_DOCUMENT_FILES) throw new Error("Najednou lze nahrát nejvýše 10 souborů.");
  const prepared = await Promise.all(files.map(async (file) => ({ bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || "application/octet-stream", originalName: file.name })));
  // Validate the complete batch before storage or database writes begin.
  for (const file of prepared) validateFile(file);
  return prepared;
}

export function documentCategory(value: FormDataEntryValue | null, file: PreparedDocumentFile, fallback: DocumentCategory = DocumentCategory.OTHER) {
  if (value && typeof value === "string" && Object.values(DocumentCategory).includes(value as DocumentCategory)) return value as DocumentCategory;
  return file.mimeType.startsWith("image/") ? DocumentCategory.PHOTO : fallback;
}
export function documentPhotoStage(value: FormDataEntryValue | null, fallback?: DocumentPhotoStage) {
  return value && typeof value === "string" && Object.values(DocumentPhotoStage).includes(value as DocumentPhotoStage) ? value as DocumentPhotoStage : fallback;
}
