export type PutObjectInput={key:string;body:Uint8Array;contentType:string};
export type SignedDownloadOptions={contentDisposition?:string;contentType?:string};
export interface FileStorage { putObject(input:PutObjectInput):Promise<void>; deleteObject(key:string):Promise<void>; getObject(key:string):Promise<Uint8Array>; getSignedDownloadUrl(key:string,expiresSeconds?:number,options?:SignedDownloadOptions):Promise<string>; exists(key:string):Promise<boolean>; }
export class StorageDisabledError extends Error { constructor(){super("File uploads are disabled. Configure FILE_STORAGE_DRIVER.")} }
export class StorageTimeoutError extends Error { constructor(){super("Úložiště souborů neodpovědělo včas. Zkuste akci zopakovat.");this.name="StorageTimeoutError"} }
export class StorageUnavailableError extends Error { constructor(){super("Úložiště souborů je dočasně nedostupné. Zkuste akci zopakovat.");this.name="StorageUnavailableError"} }
