import { PrismaService } from '../prisma/prisma.service';

/**
 * One entry per owner type. Each handler speaks to its OWN Prisma delegate
 * (per-entity attachment tables with real foreign keys + ON DELETE CASCADE).
 *
 * Adding a new owner type is a three-step job:
 *   1. Add a `<foo>_attachments` model in schema.prisma with the canonical
 *      shape (id, url, name, size, mime_type, <foo>_id, uploaded_at) and an
 *      onDelete: Cascade relation to the owning model.
 *   2. Register a new handler in buildDomains() below — copy any of the
 *      existing blocks and swap the delegate + FK field name.
 *   3. Add the new key to AttachmentOwnerKey.
 *
 * The AttachmentsService is then agnostic: it just looks up the handler by
 * key and calls create/list/findById/remove.
 */
export type AttachmentOwnerKey = 'EXPENSE' | 'EMPLOYEE' | 'PAYMENT';

export interface NewAttachmentInput {
  url: string;
  name: string;
  size: number;
  mime_type: string | null;
}

export interface AttachmentRow {
  id: number;
  url: string;
  name: string;
  size: number;
  mime_type: string | null;
  uploaded_at: Date;
}

export interface AttachmentDomain {
  readonly key: AttachmentOwnerKey;
  create(ownerId: number, data: NewAttachmentInput): Promise<AttachmentRow>;
  list(ownerId: number): Promise<AttachmentRow[]>;
  findById(id: number): Promise<AttachmentRow | null>;
  remove(id: number): Promise<void>;
}

export function buildDomains(
  prisma: PrismaService,
): Record<AttachmentOwnerKey, AttachmentDomain> {
  return {
    EXPENSE: {
      key: 'EXPENSE',
      create: (ownerId, data) =>
        prisma.expense_attachments.create({
          data: { ...data, expense_id: ownerId },
        }),
      list: (ownerId) =>
        prisma.expense_attachments.findMany({
          where: { expense_id: ownerId },
          orderBy: { uploaded_at: 'desc' },
        }),
      findById: (id) => prisma.expense_attachments.findUnique({ where: { id } }),
      remove: async (id) => {
        await prisma.expense_attachments.delete({ where: { id } });
      },
    },
    EMPLOYEE: {
      key: 'EMPLOYEE',
      create: (ownerId, data) =>
        prisma.employee_attachments.create({
          data: { ...data, employee_id: ownerId },
        }),
      list: (ownerId) =>
        prisma.employee_attachments.findMany({
          where: { employee_id: ownerId },
          orderBy: { uploaded_at: 'desc' },
        }),
      findById: (id) =>
        prisma.employee_attachments.findUnique({ where: { id } }),
      remove: async (id) => {
        await prisma.employee_attachments.delete({ where: { id } });
      },
    },
    PAYMENT: {
      key: 'PAYMENT',
      create: (ownerId, data) =>
        prisma.payment_attachments.create({
          data: { ...data, payment_id: ownerId },
        }),
      list: (ownerId) =>
        prisma.payment_attachments.findMany({
          where: { payment_id: ownerId },
          orderBy: { uploaded_at: 'desc' },
        }),
      findById: (id) => prisma.payment_attachments.findUnique({ where: { id } }),
      remove: async (id) => {
        await prisma.payment_attachments.delete({ where: { id } });
      },
    },
  };
}
