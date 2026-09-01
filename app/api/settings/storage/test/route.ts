import { currentUser } from "@/lib/auth";
import { createFileStorage, GoogleDriveFileStorage } from "@/lib/storage";
import { validateCanonicalDriveFolders } from "@/lib/storage/locations";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request:Request){const user=await currentUser();if(!user||user.role!=="SUPER_ADMIN")return go(request,"/login");try{const storage=createFileStorage();if(!(storage instanceof GoogleDriveFileStorage))throw new Error("Google Drive není nastaven jako aktivní úložiště.");await validateCanonicalDriveFolders(storage);return goWithMessage(request,"/nastaveni","ok","Google Drive je připojen a všechny kanonické složky jsou dostupné.")}catch(error){console.warn("Google Drive diagnostics failed.",{provider:"gdrive",operation:"validate_folders",errorClass:error instanceof Error?error.name:"UnknownError"});return goWithMessage(request,"/nastaveni","error","Google Drive není dostupný nebo jeho konfigurace není úplná.")}}
