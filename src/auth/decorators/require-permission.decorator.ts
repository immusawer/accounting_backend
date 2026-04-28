import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/**
 * Marks a route or controller as requiring a specific permission.
 *
 * Usage:
 *   @RequirePermission('transactions.update_status')   — single permission
 *   @RequirePermission('sales.create', 'sales.update') — any one of these
 *
 * Must be used together with JwtAuthGuard (so req.user exists)
 * and PermissionGuard (which reads this metadata).
 *
 * Admin / super-admin bypass all permission checks automatically.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
