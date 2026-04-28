import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { Observable, from, map, switchMap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

export const AUDIT_LOG_KEY = 'AUDIT_LOG_META';

export interface AuditLogMeta {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  module: string;
  getId?: (body: unknown, req: AuditRequest) => number | undefined;
  getSummary?: (body: unknown, req: AuditRequest) => string;
}

export const AuditLog = (meta: AuditLogMeta) =>
  SetMetadata(AUDIT_LOG_KEY, meta);

type AuditUser = { id?: number; email?: string };

type AuditRequest = Request & {
  user?: AuditUser;
  body?: unknown;
  params: Record<string, string | undefined>;
};

type SerializableRecord = Record<string, unknown>;

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditLogMeta | undefined>(
      AUDIT_LOG_KEY,
      ctx.getHandler(),
    );
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuditRequest>();
    const user = req.user;
    const requestBody =
      req.method !== 'GET' && this.isRecord(req.body)
        ? { ...req.body }
        : undefined;
    const paramId = req.params?.id ? parseInt(req.params.id, 10) : undefined;
    const paramCode = req.params?.code;

    const fetchOldRecord = async (): Promise<SerializableRecord | null> => {
      if (meta.action !== 'UPDATE') return null;
      if (!paramId && !paramCode) return null;

      try {
        return await this.fetchModelRecord(meta.module, paramId, paramCode);
      } catch {
        return null;
      }
    };

    return from(fetchOldRecord()).pipe(
      switchMap((oldRecord) =>
        next.handle().pipe(
          switchMap((responseBody: unknown) =>
            from(
              this.handleAuditLog({
                meta,
                req,
                user,
                responseBody,
                paramId,
                oldRecord,
                requestBody,
              }),
            ).pipe(map((): unknown => responseBody)),
          ),
        ),
      ),
    );
  }

  private async fetchModelRecord(
    moduleName: string,
    id?: number,
    code?: string,
  ): Promise<SerializableRecord | null> {
    switch (moduleName) {
      case 'payment':
        return this.asRecord(
          id ? await this.prisma.payment.findUnique({ where: { id } }) : null,
        );
      case 'invoice':
        return this.asRecord(
          id ? await this.prisma.invoice.findUnique({ where: { id } }) : null,
        );
      case 'expense':
        return this.asRecord(
          id ? await this.prisma.expense.findUnique({ where: { id } }) : null,
        );
      case 'customer':
        return this.asRecord(
          id ? await this.prisma.customer.findUnique({ where: { id } }) : null,
        );
      case 'product':
        return this.asRecord(
          id ? await this.prisma.product.findUnique({ where: { id } }) : null,
        );
      case 'stock':
        return this.asRecord(
          id ? await this.prisma.stock.findUnique({ where: { id } }) : null,
        );
      case 'salary':
        return this.asRecord(
          id
            ? await this.prisma.salary_payment.findUnique({ where: { id } })
            : null,
        );
      case 'employee':
        return this.asRecord(
          id ? await this.prisma.employee.findUnique({ where: { id } }) : null,
        );
      case 'department':
        return this.asRecord(
          id
            ? await this.prisma.department.findUnique({ where: { id } })
            : null,
        );
      case 'user':
        return this.asRecord(
          id ? await this.prisma.user.findUnique({ where: { id } }) : null,
        );
      case 'role':
        return this.asRecord(
          id ? await this.prisma.roles.findUnique({ where: { id } }) : null,
        );
      case 'permission':
        return this.asRecord(
          id
            ? await this.prisma.permissions.findUnique({ where: { id } })
            : null,
        );
      case 'account':
      case 'vendor-account':
        return this.asRecord(
          id
            ? await this.prisma.chart_of_accounts.findUnique({ where: { id } })
            : null,
        );
      case 'transaction':
        return this.asRecord(
          id
            ? await this.prisma.transactions_data.findUnique({ where: { id } })
            : null,
        );
      case 'currency':
        return this.asRecord(
          code
            ? await this.prisma.currency_setting.findUnique({ where: { code } })
            : null,
        );
      default:
        return null;
    }
  }

  private async handleAuditLog({
    meta,
    req,
    user,
    responseBody,
    paramId,
    oldRecord,
    requestBody,
  }: {
    meta: AuditLogMeta;
    req: AuditRequest;
    user: AuditUser | undefined;
    responseBody: unknown;
    paramId?: number;
    oldRecord: SerializableRecord | null;
    requestBody?: SerializableRecord;
  }): Promise<void> {
    try {
      let userName: string | null = null;
      if (user?.id) {
        const dbUser = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { first_name: true, last_name: true, username: true },
        });
        if (dbUser) {
          const fullName = [dbUser.first_name, dbUser.last_name]
            .filter(Boolean)
            .join(' ');
          userName = fullName || dbUser.username || null;
        }
      }

      let recordId: number | undefined;
      if (meta.getId) {
        recordId = meta.getId(responseBody, req);
      } else if (paramId) {
        recordId = paramId;
      } else {
        recordId = this.extractRecordId(meta.module, responseBody);
      }

      let summary: string;
      if (meta.getSummary) {
        summary = meta.getSummary(responseBody, req);
      } else {
        const label =
          meta.module.charAt(0).toUpperCase() + meta.module.slice(1);
        const who = userName || user?.email || '';
        summary = `${meta.action} ${label}${recordId ? ` #${recordId}` : ''}`;
        if (who) summary += ` by ${who}`;
      }

      let oldData: Prisma.InputJsonValue | undefined;
      let newData: Prisma.InputJsonValue | undefined;

      if (meta.action === 'UPDATE') {
        const changedFields = this.cleanUpdatePayload(requestBody);
        if (changedFields && oldRecord) {
          const oldValues: SerializableRecord = {};
          for (const key of Object.keys(changedFields)) {
            if (key in oldRecord) {
              oldValues[key] = oldRecord[key];
            }
          }
          oldData =
            Object.keys(oldValues).length > 0
              ? this.toJsonValue(oldValues)
              : undefined;
        }
        newData = changedFields ? this.toJsonValue(changedFields) : undefined;
      } else if (meta.action === 'CREATE') {
        const sanitized = this.sanitize(responseBody);
        newData = sanitized ? this.toJsonValue(sanitized) : undefined;
      } else if (meta.action === 'DELETE' && requestBody) {
        oldData = this.toJsonValue(requestBody);
      }

      await this.auditService.logDirect({
        userId: user?.id,
        userEmail: user?.email,
        userName,
        action: meta.action,
        module: meta.module,
        recordId,
        summary,
        oldData,
        newData,
        ip: req.ip || req.socket.remoteAddress,
        userAgent:
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : undefined,
      });
    } catch {
      // never break the request
    }
  }

  private extractRecordId(
    moduleName: string,
    responseBody: unknown,
  ): number | undefined {
    if (!this.isRecord(responseBody)) return undefined;

    const nested = this.isRecord(responseBody[moduleName])
      ? responseBody[moduleName]
      : undefined;
    const rawId = nested?.id ?? responseBody.id;
    if (rawId == null) return undefined;

    if (typeof rawId !== 'number' && typeof rawId !== 'string') {
      return undefined;
    }

    const parsed = typeof rawId === 'number' ? rawId : parseInt(rawId, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private cleanUpdatePayload(body: unknown): SerializableRecord | undefined {
    if (!this.isRecord(body)) return undefined;

    const cleaned: SerializableRecord = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null && key !== 'password') {
        cleaned[key] = value;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  private sanitize(data: unknown): SerializableRecord | undefined {
    if (!this.isRecord(data)) return undefined;

    try {
      const str = JSON.stringify(data);
      if (str.length > 5000) {
        const { message, id, ...rest } = data;
        const compact: SerializableRecord = { message, id };
        for (const [key, value] of Object.entries(rest)) {
          if (this.isRecord(value) && value.id !== undefined) {
            compact[`${key}_id`] = value.id;
          }
        }
        return compact;
      }
      return data;
    } catch {
      return { note: 'data too large to store' };
    }
  }

  private asRecord(value: unknown): SerializableRecord | null {
    return this.isRecord(value) ? value : null;
  }

  private isRecord(value: unknown): value is SerializableRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toJsonValue(value: SerializableRecord): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
