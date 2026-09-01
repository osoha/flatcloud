import { ReportDesignPageRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prepareDocumentFiles } from "@/lib/documents/upload";
import { uploadTemplateBackground } from "@/lib/reporting/design-template-service";
import { goWithMessage } from "@/lib/route-response";
import { fileStorageCapabilities } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string; role: string }> }) {
  const [{ versionId, role: rawRole }, actor] = await Promise.all([params, requireUser()]);
  try {
    if (!Object.values(ReportDesignPageRole).includes(rawRole as ReportDesignPageRole)) throw new Error("Unknown page role.");
    if (!fileStorageCapabilities().upload) throw new Error("Úložiště souborů není nakonfigurováno.");
    const files = await prepareDocumentFiles(await request.formData());
    if (files.length !== 1) throw new Error("Nahrajte právě jeden obrázek.");
    await uploadTemplateBackground(versionId, rawRole as ReportDesignPageRole, files[0], actor);
    return goWithMessage(request, `/reporty/sablony/${versionId}`, "ok", "Pozadí stránky bylo uloženo.");
  } catch (error) { return goWithMessage(request, `/reporty/sablony/${versionId}`, "error", error instanceof Error ? error.message : "Pozadí se nepodařilo uložit."); }
}
