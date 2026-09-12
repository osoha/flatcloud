import { currentUser } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";
import { createGoogleDriveStorage, SandboxGoogleDriveFileStorage } from "@/lib/storage/sandbox-google-drive";
import { prepareSandboxDriveFolders } from "@/lib/storage/sandbox-drive-setup";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const storage = createGoogleDriveStorage();
    if (!(storage instanceof SandboxGoogleDriveFileStorage)) throw new Error("Sandboxové úložiště není nastaveno.");
    const result = await prepareSandboxDriveFolders(storage, process.env.GOOGLE_DRIVE_SANDBOX_ROOT_FOLDER_ID!);
    return goWithMessage(request, "/nastaveni/system", "ok", `Sandboxové vazby ověřeny (${result.audit.propertyFolders} složek, ${result.audit.assets} souborů). Nastavení pro Render: ${Object.entries(result.folders).map(([key, value]) => `${key}=${value}`).join("; ")}`);
  } catch (error) {
    console.warn("Sandbox Drive preparation failed.", { errorClass: error instanceof Error ? error.name : "UnknownError" });
    return goWithMessage(request, "/nastaveni/system", "error", "Příprava sandboxu se nezdařila: ověřte OAuth, kořenovou složku a existující vazby souborů. Nic mimo sandbox nepřesouvejte.");
  }
}
