import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { taskAccessWhere } from "@/lib/access";
import { createFileStorage } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const attachment = await prisma.taskAttachment.findFirst({ where: { id, task: taskAccessWhere(user) }, include: { fileAsset: true } });
  if (!attachment) return new Response("Not found", { status: 404 });
  const variant = new URL(request.url).searchParams.get("variant") || "original";
  if (!["original", "preview", "thumbnail"].includes(variant)) return new Response("Bad request", { status: 400 });
  const key = variant === "thumbnail" ? attachment.fileAsset.thumbnailStorageKey : variant === "preview" ? attachment.fileAsset.previewStorageKey : attachment.fileAsset.storageKey;
  if (!key) return new Response("Not found", { status: 404 });
  const bytes = await createFileStorage().getObject(key);
  const inline = variant !== "original";
  return new Response(bytes, { headers: { "Cache-Control": "private, no-store", "Content-Type": inline ? "image/webp" : attachment.fileAsset.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.fileAsset.originalName)}` } });
}
