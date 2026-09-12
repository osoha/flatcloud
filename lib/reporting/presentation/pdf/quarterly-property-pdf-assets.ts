import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { createFileStorage } from "@/lib/storage";
import type { FileStorage } from "@/lib/storage/types";

export type QuarterlyPropertyPdfAssets = {
  logo: string;
  contentLogo?: string;
  primary: string | null;
  supportive: string | null;
  backgrounds: Partial<Record<"COVER" | "OVERVIEW" | "TECHNICAL" | "VALUATION" | "TRENDS", string>>;
};

export class QuarterlyPropertyPdfAssetUnavailable extends Error {
  constructor() { super("A required report asset is temporarily unavailable."); this.name = "QuarterlyPropertyPdfAssetUnavailable"; }
}

const logoPath = path.join(process.cwd(), "public", "flatcloud-logo-white.png");
const contentLogoPath = path.join(process.cwd(), "public", "flatcloud-logo-report.png");

async function pdfSafeImage(storage: FileStorage, storageKey: string) {
  try {
    const source = await storage.getObject(storageKey);
    const bytes = await sharp(source).rotate().resize({ width: 1800, height: 1400, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 8 }).toBuffer();
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.error("Quarterly property PDF asset hydration failed.", error instanceof Error ? error.name : "Unknown error");
    throw new QuarterlyPropertyPdfAssetUnavailable();
  }
}

export async function resolveQuarterlyPropertyPdfAssets(input: { groupId: string; reportId: string; propertyId: string }): Promise<QuarterlyPropertyPdfAssets> {
  const row = await prisma.quarterlyPropertyReport.findFirst({
    where: { quarterlyReportId: input.reportId, propertyId: input.propertyId, quarterlyReport: { reportingGroupId: input.groupId } },
    select: {
      media: { where: { OR: [{ role: "PRIMARY", sortOrder: 0 }, { role: "SECONDARY", sortOrder: 0 }] }, select: { role: true, sortOrder: true, fileAsset: { select: { storageKey: true, deletedAt: true } } } },
      quarterlyReport: { select: { designTemplateVersion: { select: { pages: { where: { backgroundMode: "ASSET" }, select: { role: true, backgroundAsset: { select: { storageKey: true, deletedAt: true } } } } } } } },
    },
  });
  if (!row) return { logo: logoPath, contentLogo: contentLogoPath, primary: null, supportive: null, backgrounds: {} };
  const storage = createFileStorage();
  const primary = row.media.find((item) => item.role === "PRIMARY" && item.sortOrder === 0);
  const supportive = row.media.find((item) => item.role === "SECONDARY" && item.sortOrder === 0);
  const mediaSource = async (item: typeof primary) => item?.fileAsset && !item.fileAsset.deletedAt ? pdfSafeImage(storage, item.fileAsset.storageKey) : null;
  const backgroundPages = row.quarterlyReport.designTemplateVersion?.pages || [];
  for (const page of backgroundPages) {
    if (!page.backgroundAsset || page.backgroundAsset.deletedAt) throw new QuarterlyPropertyPdfAssetUnavailable();
  }
  const [primarySource, supportiveSource, backgroundSources] = await Promise.all([
    mediaSource(primary),
    mediaSource(supportive),
    Promise.all(backgroundPages.map(async (page) => [page.role, await pdfSafeImage(storage, page.backgroundAsset!.storageKey)] as const)),
  ]);
  return { logo: logoPath, contentLogo: contentLogoPath, primary: primarySource, supportive: supportiveSource, backgrounds: Object.fromEntries(backgroundSources) };
}
