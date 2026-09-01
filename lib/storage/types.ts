export type PutObjectInput={key:string;body:Uint8Array;contentType:string;displayName?:string;folderId?:string};
export type PutObjectResult={key:string};
export type SignedDownloadOptions={contentDisposition?:string;contentType?:string};
export interface FileStorage { putObject(input:PutObjectInput):Promise<PutObjectResult>; deleteObject(key:string):Promise<void>; getObject(key:string):Promise<Uint8Array>; getSignedDownloadUrl(key:string,expiresSeconds?:number,options?:SignedDownloadOptions):Promise<string>; exists(key:string):Promise<boolean>; }
export class StorageDisabledError extends Error { constructor(){super("Úložiště souborů není nakonfigurováno.");this.name="StorageDisabledError"} }
export class StorageTimeoutError extends Error { constructor(){super("Úložiště souborů neodpovědělo včas. Zkuste akci zopakovat.");this.name="StorageTimeoutError"} }
export class StorageUnavailableError extends Error { constructor(){super("Úložiště souborů je dočasně nedostupné. Zkuste akci zopakovat.");this.name="StorageUnavailableError"} }
