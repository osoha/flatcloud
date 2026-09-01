import type { DocumentCategory } from "@prisma/client";
import { prisma } from "../db";
import type { FileStorage } from "./types";
import { GoogleDriveFileStorage } from "./google-drive";

export const PROPERTY_FOLDER_TREE = {
  documents: "01_Dokumenty", contracts: "01_Smlouvy", protocols: "02_Protokoly", technical: "03_Technická dokumentace",
  invoices: "04_Faktury a nabídky", energy: "05_Energie a pojištění", legal: "06_Právní", other: "99_Ostatní",
  photos: "02_Fotografie", reports: "03_Reporty", archive: "99_Archiv",
} as const;

export const DOCUMENT_CATEGORY_FOLDER:Record<DocumentCategory,keyof typeof PROPERTY_FOLDER_TREE>={
  CONTRACT:"contracts",CONTRACT_ADDENDUM:"contracts",HANDOVER_PROTOCOL:"protocols",INSPECTION_PROTOCOL:"protocols",
  TECHNICAL_DOCUMENT:"technical",INVOICE:"invoices",OFFER:"invoices",ENERGY_CERTIFICATE:"energy",INSURANCE:"energy",
  LEGAL:"legal",PHOTO:"photos",OTHER:"other",
};

export type StoragePlacement={folderId?:string;displayName:string;variantFolderId?:string};
function envFolder(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is required for Google Drive storage.`);return value}
function cleanName(name:string){return name.replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().slice(0,180)||"Nemovitost"}

export async function validateCanonicalDriveFolders(storage:GoogleDriveFileStorage){
  const configured=["GOOGLE_DRIVE_ROOT_FOLDER_ID","GOOGLE_DRIVE_PROPERTIES_FOLDER_ID","GOOGLE_DRIVE_REPORTS_FOLDER_ID","GOOGLE_DRIVE_TEMPLATES_FOLDER_ID","GOOGLE_DRIVE_ARCHIVE_FOLDER_ID"];
  const results=await Promise.all(configured.map(async(name)=>({name,valid:await storage.validateFolder(envFolder(name))})));
  const invalid=results.find(result=>!result.valid);if(invalid)throw new Error(`${invalid.name} is not an accessible Google Drive folder.`);return true;
}

async function standardPropertyFolders(storage:GoogleDriveFileStorage,propertyFolderId:string){
  const documents=await storage.ensureFolder(PROPERTY_FOLDER_TREE.documents,propertyFolderId);
  const [contracts,protocols,technical,invoices,energy,legal,other,photos,reports,archive]=await Promise.all([
    storage.ensureFolder(PROPERTY_FOLDER_TREE.contracts,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.protocols,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.technical,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.invoices,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.energy,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.legal,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.other,documents),storage.ensureFolder(PROPERTY_FOLDER_TREE.photos,propertyFolderId),storage.ensureFolder(PROPERTY_FOLDER_TREE.reports,propertyFolderId),storage.ensureFolder(PROPERTY_FOLDER_TREE.archive,propertyFolderId),
  ]);return {documents,contracts,protocols,technical,invoices,energy,legal,other,photos,reports,archive};
}

export async function provisionPropertyDriveFolder(propertyId:string,storage:GoogleDriveFileStorage){
  const property=await prisma.property.findUnique({where:{id:propertyId},select:{name:true,googleDriveFolderId:true}});if(!property)throw new Error("Property was not found.");
  if(property.googleDriveFolderId){const folders=await standardPropertyFolders(storage,property.googleDriveFolderId);return {propertyFolderId:property.googleDriveFolderId,folders}}
  const created=await storage.ensureFolder(cleanName(property.name),envFolder("GOOGLE_DRIVE_PROPERTIES_FOLDER_ID"));
  const claimed=await prisma.property.updateMany({where:{id:propertyId,googleDriveFolderId:null},data:{googleDriveFolderId:created}});
  if(claimed.count===0){const winner=await prisma.property.findUnique({where:{id:propertyId},select:{googleDriveFolderId:true}});if(!winner?.googleDriveFolderId)throw new Error("Property Drive folder provisioning failed.");if(winner.googleDriveFolderId!==created)await storage.deleteObject(created).catch(()=>{});const folders=await standardPropertyFolders(storage,winner.googleDriveFolderId);return {propertyFolderId:winner.googleDriveFolderId,folders}}
  try {const folders=await standardPropertyFolders(storage,created);return {propertyFolderId:created,folders}} catch(error){await prisma.property.updateMany({where:{id:propertyId,googleDriveFolderId:created},data:{googleDriveFolderId:null}});await storage.deleteObject(created).catch(()=>{});throw error}
}

async function variantsFolder(storage:GoogleDriveFileStorage){const internal=await storage.ensureFolder("99_Interní",envFolder("GOOGLE_DRIVE_ROOT_FOLDER_ID"));return storage.ensureFolder("Náhledy",internal)}
export async function documentStoragePlacement(storage:FileStorage,propertyId:string,category:DocumentCategory,originalName:string):Promise<StoragePlacement>{if(!(storage instanceof GoogleDriveFileStorage))return {displayName:originalName};await validateCanonicalDriveFolders(storage);const provisioned=await provisionPropertyDriveFolder(propertyId,storage);return {folderId:provisioned.folders[DOCUMENT_CATEGORY_FOLDER[category]],displayName:originalName,variantFolderId:await variantsFolder(storage)}}
export async function templateStoragePlacement(storage:FileStorage,version:number,role:string,originalName:string):Promise<StoragePlacement>{if(!(storage instanceof GoogleDriveFileStorage))return {displayName:originalName};await validateCanonicalDriveFolders(storage);const quarterly=await storage.ensureFolder("Kvartální reporty",envFolder("GOOGLE_DRIVE_TEMPLATES_FOLDER_ID"));const template=await storage.ensureFolder("FLATCLOUD_QUARTERLY_2026",quarterly);return {folderId:await storage.ensureFolder(`v${version}`,template),displayName:role.toLowerCase()+(/png$/i.test(originalName)?".png":".jpg"),variantFolderId:await variantsFolder(storage)}}
export async function reportStoragePlacement(storage:FileStorage,year:number,quarter:number,displayName:string):Promise<StoragePlacement>{if(!(storage instanceof GoogleDriveFileStorage))return {displayName};await validateCanonicalDriveFolders(storage);const legacy=await storage.ensureFolder("Legacy",envFolder("GOOGLE_DRIVE_REPORTS_FOLDER_ID"));const yearFolder=await storage.ensureFolder(String(year),legacy);return {folderId:await storage.ensureFolder(`Q${quarter}`,yearFolder),displayName}}
