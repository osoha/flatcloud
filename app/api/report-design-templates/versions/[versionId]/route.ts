import { ReportDesignPageRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { activateReportDesignTemplateVersion, applyCurrentFlatCloudPreset, applyTemplateBackgroundToContentPages, cloneReportDesignTemplateVersion, setGeneratedTemplateBackground } from "@/lib/reporting/design-template-service";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const [{ versionId }, actor] = await Promise.all([params, requireUser()]);
  try {
    const form = await request.formData(), action = text(form, "action", true), roleValue = text(form, "role");
    const role = roleValue && Object.values(ReportDesignPageRole).includes(roleValue as ReportDesignPageRole) ? roleValue as ReportDesignPageRole : null;
    let targetVersionId = versionId;
    if (action === "clone") targetVersionId = (await cloneReportDesignTemplateVersion(versionId, actor)).id;
    else if (action === "activate") await activateReportDesignTemplateVersion(versionId, actor);
    else if (action === "apply-current-preset") await applyCurrentFlatCloudPreset(versionId, actor);
    else if (action === "generated" && role) await setGeneratedTemplateBackground(versionId, role, actor);
    else if (action === "apply-content" && role) await applyTemplateBackgroundToContentPages(versionId, role, actor);
    else throw new Error("Unknown template action.");
    return goWithMessage(request, `/reporty/sablony/${targetVersionId}`, "ok", "Změna šablony byla uložena.");
  } catch (error) { return goWithMessage(request, `/reporty/sablony/${versionId}`, "error", error instanceof Error ? error.message : "Operaci se nepodařilo provést."); }
}
