import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  AttachmentDomain,
  AttachmentOwnerKey,
  AttachmentRow,
  buildDomains,
} from './attachment-domains';

@Injectable()
export class AttachmentsService {
  private readonly domains: Record<AttachmentOwnerKey, AttachmentDomain>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.domains = buildDomains(this.prisma);
  }

  status() {
    return {
      enabled: this.storage.isEnabled(),
      maxFileSize: this.storage.maxFileSize,
    };
  }

  private requireEnabled() {
    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableException(
        'File storage is not configured on this server',
      );
    }
  }

  private getDomain(raw: string): AttachmentDomain {
    const key = raw.toUpperCase() as AttachmentOwnerKey;
    const domain = this.domains[key];
    if (!domain) {
      throw new BadRequestException(
        `Invalid owner type "${raw}". Allowed: ${Object.keys(this.domains).join(', ')}`,
      );
    }
    return domain;
  }

  private sanitizeFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? 'file';
    return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
  }

  async uploadMany(
    ownerTypeRaw: string,
    ownerId: number,
    files: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId: number,
  ) {
    this.requireEnabled();
    const domain = this.getDomain(ownerTypeRaw);
    if (!files?.length) {
      throw new BadRequestException('No files provided');
    }
    const created: AttachmentRow[] = [];
    for (const file of files) {
      if (file.size > this.storage.maxFileSize) {
        throw new BadRequestException(
          `File "${file.originalname}" exceeds the ${this.storage.maxFileSize} byte limit`,
        );
      }
      const safeName = this.sanitizeFileName(file.originalname);
      const objectKey = `${domain.key.toLowerCase()}/${ownerId}/${randomUUID()}-${safeName}`;
      await this.storage.upload(objectKey, file.buffer, file.mimetype);
      const row = await domain.create(ownerId, {
        url: objectKey,
        name: file.originalname,
        size: file.size,
        mime_type: file.mimetype || null,
      });
      created.push(row);
    }
    return { attachments: created };
  }

  list(ownerTypeRaw: string, ownerId: number) {
    const domain = this.getDomain(ownerTypeRaw);
    return domain.list(ownerId);
  }

  async getDownloadUrl(ownerTypeRaw: string, id: number) {
    this.requireEnabled();
    const domain = this.getDomain(ownerTypeRaw);
    const row = await domain.findById(id);
    if (!row) throw new NotFoundException('Attachment not found');
    const url = await this.storage.getPresignedGetUrl(row.url);
    return {
      url,
      name: row.name,
      size: row.size,
      mime_type: row.mime_type,
    };
  }

  async remove(ownerTypeRaw: string, id: number) {
    const domain = this.getDomain(ownerTypeRaw);
    const row = await domain.findById(id);
    if (!row) throw new NotFoundException('Attachment not found');
    // Best-effort removal from storage — if the object is already gone or
    // storage is down, we still drop the row so the UI stays consistent.
    if (this.storage.isEnabled()) {
      try {
        await this.storage.remove(row.url);
      } catch {
        /* swallow */
      }
    }
    await domain.remove(id);
    return { message: 'Attachment deleted' };
  }
}
