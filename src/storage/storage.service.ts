import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client as MinioClient } from 'minio';

/**
 * Thin wrapper around the MinIO SDK. Storage is OPTIONAL — if
 * `STORAGE_ENABLED` isn't truthy the service stays dormant and every
 * upload/download method becomes a no-op that throws. Callers should
 * gate on `isEnabled()` or rely on the AttachmentsController to return
 * 503 when disabled.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: MinioClient | null = null;
  private enabled = false;
  readonly bucket: string;
  readonly urlTtlSec: number;
  readonly maxFileSize: number;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      (this.config.get<string>('STORAGE_ENABLED') ?? 'false').toLowerCase() ===
      'true';
    this.bucket =
      this.config.get<string>('STORAGE_BUCKET') ?? 'accounting-attachments';
    this.urlTtlSec = Number(
      this.config.get<string>('STORAGE_URL_TTL') ?? '900',
    );
    this.maxFileSize = Number(
      this.config.get<string>('STORAGE_MAX_FILE_SIZE') ?? '26214400',
    );
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Storage disabled (STORAGE_ENABLED != true)');
      return;
    }
    try {
      // Lazy-import so users who don't need storage don't pay the cost
      // of the minio dep being resolved at startup.
      const { Client } = await import('minio');

      // Be forgiving: if the user wrote `http://host:9000` or `https://host`
      // into STORAGE_ENDPOINT, strip the scheme and port so the SDK's strict
      // hostname check still accepts it.
      const rawEndpoint =
        this.config.get<string>('STORAGE_ENDPOINT') ?? 'localhost';
      const { host, port: parsedPort, ssl } = normaliseEndpoint(rawEndpoint);
      const port =
        parsedPort ?? Number(this.config.get<string>('STORAGE_PORT') ?? '9000');
      const useSSL =
        ssl ??
        (this.config.get<string>('STORAGE_USE_SSL') ?? 'false').toLowerCase() ===
          'true';

      this.client = new Client({
        endPoint: host,
        port,
        useSSL,
        accessKey: this.config.get<string>('STORAGE_ACCESS_KEY') ?? '',
        secretKey: this.config.get<string>('STORAGE_SECRET_KEY') ?? '',
        region: this.config.get<string>('STORAGE_REGION') ?? 'us-east-1',
      });
      await this.ensureBucket();
      this.logger.log(
        `Storage ready (${useSSL ? 'https' : 'http'}://${host}:${port}, bucket: ${this.bucket})`,
      );
    } catch (err) {
      // Don't crash the whole app if MinIO is unreachable — just disable
      // the feature and log. Users can still use the rest of the system.
      this.enabled = false;
      this.client = null;
      this.logger.error(
        `Storage initialisation failed, feature disabled: ${String(err)}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  private async ensureBucket() {
    if (!this.client) return;
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created bucket: ${this.bucket}`);
    }
  }

  async upload(objectKey: string, buffer: Buffer, mimeType: string) {
    if (!this.client) throw new Error('Storage is not configured');
    await this.client.putObject(
      this.bucket,
      objectKey,
      buffer,
      buffer.length,
      { 'Content-Type': mimeType },
    );
  }

  async remove(objectKey: string) {
    if (!this.client) return;
    await this.client.removeObject(this.bucket, objectKey);
  }

  async getPresignedGetUrl(objectKey: string): Promise<string> {
    if (!this.client) throw new Error('Storage is not configured');
    return this.client.presignedGetObject(
      this.bucket,
      objectKey,
      this.urlTtlSec,
    );
  }
}

/**
 * The MinIO SDK insists on a bare hostname (no scheme, no port). Accept
 * the common "copy-pasted URL" format too — strip the scheme and pick up
 * the port/ssl from the URL if present, so STORAGE_ENDPOINT=http://host:9000
 * works just as well as STORAGE_ENDPOINT=host + STORAGE_PORT=9000.
 */
function normaliseEndpoint(raw: string): {
  host: string;
  port: number | null;
  ssl: boolean | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { host: 'localhost', port: null, ssl: null };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const ssl = u.protocol === 'https:';
      const explicitPort = u.port ? Number(u.port) : null;
      return {
        host: u.hostname,
        port: explicitPort,
        ssl,
      };
    } catch {
      // fall through and treat as hostname
    }
  }
  // Allow "host:port" shorthand too.
  const [host, portStr] = trimmed.split(':');
  return {
    host,
    port: portStr ? Number(portStr) : null,
    ssl: null,
  };
}
