import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileStorage, PutObjectInput, SignedDownloadOptions } from "./types";
import { StorageTimeoutError, StorageUnavailableError } from "./types";

export const DEFAULT_S3_CONNECTION_TIMEOUT_MS = 5_000;
export const DEFAULT_S3_REQUEST_TIMEOUT_MS = 20_000;
export const DEFAULT_S3_MAX_ATTEMPTS = 2;
type S3Environment = Record<string, string | undefined>;

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return parsed;
}

export function s3RequestConfiguration(environment: S3Environment = process.env) {
  return {
    connectionTimeout: boundedInteger(environment.S3_CONNECTION_TIMEOUT_MS, DEFAULT_S3_CONNECTION_TIMEOUT_MS, 1_000, 60_000, "S3_CONNECTION_TIMEOUT_MS"),
    requestTimeout: boundedInteger(environment.S3_REQUEST_TIMEOUT_MS, DEFAULT_S3_REQUEST_TIMEOUT_MS, 5_000, 300_000, "S3_REQUEST_TIMEOUT_MS"),
    maxAttempts: boundedInteger(environment.S3_MAX_ATTEMPTS, DEFAULT_S3_MAX_ATTEMPTS, 1, 5, "S3_MAX_ATTEMPTS"),
  };
}

function storageError(error: unknown) {
  if (error instanceof StorageTimeoutError || error instanceof StorageUnavailableError) return error;
  const candidate = error as { name?: string; code?: string; message?: string } | null;
  if (candidate && (candidate.name === "TimeoutError" || candidate.code === "ETIMEDOUT" || /timed?\s*out|timeout/i.test(candidate.message || ""))) return new StorageTimeoutError();
  return new StorageUnavailableError();
}

export class S3FileStorage implements FileStorage {
  private client: S3Client;
  private bucket: string;

  constructor(environment: S3Environment = process.env) {
    this.bucket = required(environment, "S3_BUCKET");
    const timeouts = s3RequestConfiguration(environment);
    this.client = new S3Client({
      endpoint: environment.S3_ENDPOINT || undefined,
      region: required(environment, "S3_REGION"),
      forcePathStyle: environment.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: required(environment, "S3_ACCESS_KEY_ID"), secretAccessKey: required(environment, "S3_SECRET_ACCESS_KEY") },
      maxAttempts: timeouts.maxAttempts,
      requestHandler: { connectionTimeout: timeouts.connectionTimeout, requestTimeout: timeouts.requestTimeout, socketTimeout: timeouts.requestTimeout, throwOnRequestTimeout: true },
    });
  }

  private async send<T>(operation: () => Promise<T>) { try { return await operation(); } catch (error) { throw storageError(error); } }
  async putObject(input: PutObjectInput) { await this.send(() => this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: input.key, Body: input.body, ContentType: input.contentType }))); }
  async deleteObject(key: string) { await this.send(() => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))); }
  async getObject(key: string) { const result = await this.send(() => this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))); if (!result.Body) throw new StorageUnavailableError(); return new Uint8Array(await this.send(() => result.Body!.transformToByteArray())); }
  async getSignedDownloadUrl(key: string, expiresSeconds = 300, options: SignedDownloadOptions = {}) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: options.contentDisposition, ResponseContentType: options.contentType }), { expiresIn: expiresSeconds }); }
  async exists(key: string) { try { await this.send(() => this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))); return true; } catch (error) { if (error instanceof StorageTimeoutError) throw error; return false; } }
}

function required(environment: S3Environment, name: string) { const value = environment[name]; if (!value) throw new Error(`${name} is required for S3 storage.`); return value; }
