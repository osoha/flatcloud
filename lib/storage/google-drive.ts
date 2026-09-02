import { OAuth2Client } from "google-auth-library";
import type { FileStorage, PutObjectInput, SignedDownloadOptions } from "./types";
import { StorageTimeoutError, StorageUnavailableError } from "./types";

type Environment = Record<string, string | undefined>;
type Fetch = typeof fetch;
export type DriveFile = { id?: string; name?: string; mimeType?: string; trashed?: boolean; parents?: string[] };
export const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DEFAULT_GOOGLE_DRIVE_REQUEST_TIMEOUT_MS = 30_000;

export class GoogleDriveAuthenticationError extends StorageUnavailableError { constructor(){super();this.name="GoogleDriveAuthenticationError"} }
export class GoogleDrivePermissionError extends StorageUnavailableError { constructor(){super();this.name="GoogleDrivePermissionError"} }
export class GoogleDriveStorageUnavailableError extends StorageUnavailableError { constructor(){super();this.name="GoogleDriveStorageUnavailableError"} }

function required(environment: Environment, name: string) { const value=environment[name]; if(!value) throw new GoogleDriveAuthenticationError(); return value; }
export function googleDriveRequestTimeout(environment: Environment=process.env) { const value=environment.GOOGLE_DRIVE_REQUEST_TIMEOUT_MS; if(!value)return DEFAULT_GOOGLE_DRIVE_REQUEST_TIMEOUT_MS; const parsed=Number(value); if(!Number.isInteger(parsed)||parsed<5_000||parsed>300_000)throw new Error("GOOGLE_DRIVE_REQUEST_TIMEOUT_MS must be an integer between 5000 and 300000."); return parsed; }
function safeName(value:string){return value.replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().slice(0,240)||"soubor"}

export class GoogleDriveFileStorage implements FileStorage {
  private auth: OAuth2Client; private timeoutMs:number; private fetcher:Fetch;
  constructor(private environment:Environment=process.env, fetcher:Fetch=fetch){
    this.auth=new OAuth2Client(required(environment,"GOOGLE_DRIVE_CLIENT_ID"),required(environment,"GOOGLE_DRIVE_CLIENT_SECRET"));
    this.auth.setCredentials({refresh_token:required(environment,"GOOGLE_DRIVE_REFRESH_TOKEN")}); this.timeoutMs=googleDriveRequestTimeout(environment); this.fetcher=fetcher;
  }
  private async request(url:string, init:RequestInit={}):Promise<Response>{
    let token:string; try { const result=await this.auth.getAccessToken(); token=typeof result==="string"?result:result?.token||""; if(!token)throw new Error(); } catch { throw new GoogleDriveAuthenticationError(); }
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),this.timeoutMs), started=Date.now();
    try { const response=await this.fetcher(url,{...init,signal:controller.signal,headers:{Authorization:`Bearer ${token}`,...init.headers}}); if(response.ok)return response; if(response.status===401)throw new GoogleDriveAuthenticationError(); if(response.status===403)throw new GoogleDrivePermissionError(); if(response.status===404)return response; console.warn("Google Drive operation failed.",{provider:"gdrive",operation:init.method||"GET",elapsedMs:Date.now()-started,httpStatus:response.status}); throw new GoogleDriveStorageUnavailableError(); }
    catch(error){if(error instanceof StorageUnavailableError)throw error;if((error as {name?:string})?.name==="AbortError")throw new StorageTimeoutError();throw new GoogleDriveStorageUnavailableError()} finally {clearTimeout(timer)}
  }
  async putObject(input:PutObjectInput){
    const metadata={name:safeName(input.displayName||input.key.split("/").pop()||"soubor"),...(input.folderId?{parents:[input.folderId]}:{})};
    const boundary=`flatcloud-${crypto.randomUUID()}`, head=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`, tail=`\r\n--${boundary}--`;
    const body=new Blob([head,input.body,tail]); const response=await this.request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body}); const file=await response.json() as DriveFile; if(!file.id)throw new GoogleDriveStorageUnavailableError(); return {key:file.id};
  }
  async getObject(key:string){const metadata=await this.getFile(key);if(!metadata||metadata.trashed)throw new GoogleDriveStorageUnavailableError();const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?alt=media`);if(response.status===404)throw new GoogleDriveStorageUnavailableError();return new Uint8Array(await response.arrayBuffer())}
  async deleteObject(key:string){const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}`,{method:"DELETE"});if(response.status===404)return}
  async exists(key:string){const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?fields=id,trashed`);if(response.status===404)return false;const file=await response.json() as DriveFile;return Boolean(file.id&&!file.trashed)}
  async getSignedDownloadUrl(_key:string,_expiresSeconds?:number,_options?:SignedDownloadOptions):Promise<string>{throw new Error("Google Drive assets must be streamed through an authorized application route.")}
  async getFile(key:string){const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?fields=id,name,mimeType,parents,trashed`);if(response.status===404)return null;return response.json() as Promise<DriveFile>}
  async listFoldersByName(name:string,parentId:string){const normalized=safeName(name),escaped=normalized.replace(/\\/g,"\\\\").replace(/'/g,"\\'");const q=encodeURIComponent(`'${parentId}' in parents and name = '${escaped}' and mimeType = '${GOOGLE_DRIVE_FOLDER_MIME}' and trashed = false`);const found=await this.request(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,trashed)&pageSize=10`);return (await found.json() as {files?:DriveFile[]}).files||[]}
  async listFoldersByPrefix(prefix:string,parentId:string){const normalized=safeName(prefix),escaped=normalized.replace(/\\/g,"\\\\").replace(/'/g,"\\'");const q=encodeURIComponent(`'${parentId}' in parents and name contains '${escaped}' and mimeType = '${GOOGLE_DRIVE_FOLDER_MIME}' and trashed = false`);const found=await this.request(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,trashed)&pageSize=100`);return ((await found.json() as {files?:DriveFile[]}).files||[]).filter(file=>file.name?.startsWith(normalized))}
  async createFolder(name:string,parentId:string){const created=await this.request("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,trashed",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:safeName(name),mimeType:GOOGLE_DRIVE_FOLDER_MIME,parents:[parentId]})});const folder=await created.json() as DriveFile;if(!folder.id)throw new GoogleDriveStorageUnavailableError();return folder.id}
  async ensureFolderWithResult(name:string,parentId:string){const files=await this.listFoldersByName(name,parentId);if(files[0]?.id)return {id:files[0].id,created:false};return {id:await this.createFolder(name,parentId),created:true}}
  async ensureFolder(name:string,parentId:string){return (await this.ensureFolderWithResult(name,parentId)).id}
  async renameFile(key:string,name:string){const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?fields=id,name,mimeType,parents,trashed`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:safeName(name)})});if(response.status===404)throw new GoogleDriveStorageUnavailableError();return response.json() as Promise<DriveFile>}
  async moveFile(key:string,parentId:string,currentParents?:string[]){const existing=currentParents?{id:key,parents:currentParents}:await this.getFile(key);if(!existing||existing.trashed)throw new GoogleDriveStorageUnavailableError();const parents=existing.parents||[],removeParents=parents.filter(parent=>parent!==parentId),query=new URLSearchParams({fields:"id,name,mimeType,parents,trashed"});if(!parents.includes(parentId))query.set("addParents",parentId);if(removeParents.length)query.set("removeParents",removeParents.join(","));if(parents.length===1&&parents[0]===parentId)return existing as DriveFile;const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?${query.toString()}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"});if(response.status===404)throw new GoogleDriveStorageUnavailableError();return response.json() as Promise<DriveFile>}
  async validateFolder(key:string){const file=await this.getFile(key);return Boolean(file&&!file.trashed&&file.mimeType===GOOGLE_DRIVE_FOLDER_MIME)}
}
