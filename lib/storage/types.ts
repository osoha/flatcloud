export type PutObjectInput={key:string;body:Uint8Array;contentType:string};
export interface FileStorage { putObject(input:PutObjectInput):Promise<void>; deleteObject(key:string):Promise<void>; getSignedDownloadUrl(key:string,expiresSeconds?:number):Promise<string>; exists(key:string):Promise<boolean>; }
export class StorageDisabledError extends Error { constructor(){super("File uploads are disabled. Configure FILE_STORAGE_DRIVER.")} }
