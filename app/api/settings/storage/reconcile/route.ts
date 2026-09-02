import { currentUser } from "@/lib/auth";
import { createFileStorage, GoogleDriveFileStorage } from "@/lib/storage";
import { validateCanonicalDriveFolders } from "@/lib/storage/locations";
import { reconcileAllPropertyDriveStructures } from "@/lib/storage/property-drive-reconciliation";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const storage = createFileStorage();
    if (!(storage instanceof GoogleDriveFileStorage)) throw new Error("Google Drive není nastaven jako aktivní úložiště.");
    await validateCanonicalDriveFolders(storage);
    const result = await reconcileAllPropertyDriveStructures({ storage, actorUserId: user.id });
    return goWithMessage(request, "/nastaveni", "ok", `Google Drive: nemovitosti ${result.properties}; přejmenováno ${result.renamed}; přesunuto ${result.moved}; složek vytvořeno ${result.foldersCreated}; dokumentů přesunuto ${result.documentsMoved}; bez změny ${result.unchanged}; varování ${result.warnings}; chyby ${result.errors}.`);
  } catch (error) {
    console.warn("Google Drive structure reconciliation failed.", { provider: "gdrive", operation: "reconcile_structure", errorClass: error instanceof Error ? error.name : "UnknownError" });
    return goWithMessage(request, "/nastaveni", "error", "Strukturu Google Drive se nepodařilo synchronizovat; existující odkazy a soubory zůstaly zachované.");
  }
}
