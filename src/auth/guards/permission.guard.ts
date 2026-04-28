import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Reusable guard that enforces permission checks on any route.
 *
 * How it works:
 *  1. Reads the permissions array set by @RequirePermission() decorator.
 *  2. If no permissions are set on the route, access is allowed (open route).
 *  3. Fetches the user's role and permissions from the database.
 *  4. Admin / super-admin bypass all checks.
 *  5. Otherwise, the user must have at least ONE of the required permissions.
 *
 * Usage on a controller or route:
 *
 *   @UseGuards(JwtAuthGuard, PermissionGuard)
 *   @RequirePermission('transactions.update_status')
 *   @Patch(':id/status')
 *   updateStatus(...) { ... }
 *
 * Or apply to the whole controller and override per-route:
 *
 *   @Controller('transactions-data')
 *   @UseGuards(JwtAuthGuard, PermissionGuard)
 *   export class TransactionsDataController {
 *
 *     @Get()                                    // no decorator = open (auth only)
 *     findAll() {}
 *
 *     @RequirePermission('transactions.update_status')
 *     @Patch(':id/status')
 *     updateStatus() {}
 *   }
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Get required permissions from decorator metadata
    //    Check method-level first, fall back to class-level
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermission decorator → route is open (auth-only)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 2. Get user from request (set by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    // 3. Fetch role + permissions from DB
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: { select: { name: true } },
        permissions: { select: { name: true, group_name: true } },
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // 4. Admin / super-admin bypass
    const role = user.role?.name?.toLowerCase() ?? '';
    if (role === 'admin' || role === 'super-admin') {
      return true;
    }

    // 5. Build user's permission set: "group_name.permission_name"
    const userPermissions = new Set(
      user.permissions.map(
        (p) => `${p.group_name.toLowerCase()}.${p.name.toLowerCase()}`,
      ),
    );

    // 6. Check if user has at least ONE of the required permissions
    const hasPermission = requiredPermissions.some((perm) =>
      userPermissions.has(perm.toLowerCase()),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Permission required: ${requiredPermissions.join(' or ')}`,
      );
    }

    return true;
  }
}
