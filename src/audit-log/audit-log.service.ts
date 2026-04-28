import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogEntry {
  userId?: number;
  userEmail?: string;
  userName?: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  module: string;
  recordId?: number;
  summary?: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  /** Called from interceptor, username already resolved */
  async logDirect(entry: CreateAuditLogEntry) {
    try {
      await this.prisma.audit_log.create({
        data: {
          user_id: entry.userId ?? null,
          user_email: entry.userEmail ?? null,
          user_name: entry.userName ?? null,
          action: entry.action,
          module: entry.module,
          record_id: entry.recordId ?? null,
          summary: entry.summary ?? null,
          old_data: entry.oldData,
          new_data: entry.newData,
          ip: entry.ip ?? null,
          user_agent: entry.userAgent ?? null,
        },
      });
    } catch {
      // Silently swallow
    }
  }

  /** Called manually, looks up username from DB */
  async log(entry: CreateAuditLogEntry) {
    try {
      let userName = entry.userName ?? null;
      if (!userName && entry.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: entry.userId },
          select: { first_name: true, last_name: true, username: true },
        });
        if (user) {
          const fullName = [user.first_name, user.last_name]
            .filter(Boolean)
            .join(' ');
          userName = fullName || user.username || null;
        }
      }
      await this.logDirect({ ...entry, userName });
    } catch {
      // Silently swallow
    }
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    userId?: number;
    action?: string;
    module?: string;
    from?: string;
    to?: string;
    search?: string;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.audit_logWhereInput = {};
    if (query.userId) where.user_id = query.userId;
    if (query.action) where.action = query.action;
    if (query.module) where.module = query.module;
    if (query.from || query.to) {
      where.created_at = {};
      if (query.from) where.created_at.gte = new Date(query.from);
      if (query.to) {
        where.created_at.lte = new Date(`${query.to}T23:59:59.999Z`);
      }
    }
    if (query.search) {
      where.OR = [
        { summary: { contains: query.search, mode: 'insensitive' } },
        { user_name: { contains: query.search, mode: 'insensitive' } },
        { user_email: { contains: query.search, mode: 'insensitive' } },
        { module: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.audit_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.audit_log.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    return this.prisma.audit_log.findUnique({ where: { id } });
  }

  async getModules(): Promise<string[]> {
    const rows = await this.prisma.audit_log.findMany({
      select: { module: true },
      distinct: ['module'],
      orderBy: { module: 'asc' },
    });
    return rows.map((row) => row.module);
  }

  async getUsers(): Promise<{ id: number; name: string; email: string }[]> {
    const rows = await this.prisma.audit_log.findMany({
      where: { user_id: { not: null } },
      select: { user_id: true, user_name: true, user_email: true },
      distinct: ['user_id'],
      orderBy: { user_name: 'asc' },
    });

    return rows
      .filter(
        (row): row is typeof row & { user_id: number } => row.user_id !== null,
      )
      .map((row) => ({
        id: row.user_id,
        name: row.user_name || '',
        email: row.user_email || '',
      }));
  }
}
