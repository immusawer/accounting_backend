import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  persistProfileImage,
  resolveProfileImageUrl,
} from '../auth/auth.service';
import { CreateUserDto } from './dto/user.dto';
import { UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { AdminCreateUserDto, AdminUpdateUserDto } from './dto/admin-user.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';

type FullUserRecord = Prisma.userGetPayload<{
  include: { permissions: true; role: true };
}>;

type UsernameLookupClient =
  | Pick<PrismaService, 'user'>
  | Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  private toIsoString(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }

  private async toFullUser(user: FullUserRecord) {
    const roleName = user.role?.name
      ? String(user.role.name).toLowerCase()
      : 'user';

    // Use stored first_name/last_name, fallback to splitting username for old records
    let firstName = user.first_name ?? null;
    let lastName = user.last_name ?? null;
    if (!firstName && !lastName) {
      const parts = (user.username ?? '').split(/[\s_]+/).filter(Boolean);
      firstName = parts[0] ?? null;
      lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    }

    const profileImage = await resolveProfileImageUrl(
      this.storage,
      user.profile_image,
    );

    return {
      id: String(user.id),
      email: user.email,
      firstName,
      lastName,
      fullName:
        [firstName, lastName].filter(Boolean).join(' ') ||
        user.username ||
        user.email,
      role: roleName,
      profileImage,
      isActive: user.status === 'active',
      deletedAt: null,
      createdAt: this.toIsoString(user.created_at),
      updatedAt: this.toIsoString(user.updated_at),
      permissions: (user.permissions ?? []).map(
        (permission) => `${permission.group_name}.${permission.name}`,
      ),
      permissionIds: (user.permissions ?? []).map(
        (permission) => permission.id,
      ),
    };
  }

  private async getOrCreateRoleId(roleName: string): Promise<number> {
    const normalized = roleName.trim().toLowerCase();
    const role = await this.prisma.roles.upsert({
      where: { name: normalized },
      update: {},
      create: { name: normalized },
      select: { id: true },
    });
    return role.id;
  }

  private async generateUniqueUsername(
    firstName: string,
    lastName: string,
    email: string,
    excludeUserId?: number,
    prismaClient: UsernameLookupClient = this.prisma,
  ): Promise<string> {
    const base =
      `${firstName ?? ''}_${lastName ?? ''}`.replace(/\s+/g, '_').trim() ||
      (email.split('@')[0] ?? 'user');
    const normalizedBase =
      base
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 48) || 'user';

    let candidate = normalizedBase;
    let counter = 0;
    while (true) {
      const exists = await prismaClient.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!exists) return candidate.slice(0, 64);
      if (excludeUserId !== undefined && exists.id === excludeUserId) {
        return candidate.slice(0, 64);
      }
      counter += 1;
      candidate = `${normalizedBase}_${counter}`;
    }
  }

  /** Fetch current user's role and permission names */
  async getUserAccess(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: { select: { name: true } },
        permissions: { select: { name: true, group_name: true } },
      },
    });
    const role = user?.role?.name ? String(user.role.name).toLowerCase() : null;
    const permissions = (user?.permissions ?? []).map(
      (p) =>
        `${String(p.group_name).toLowerCase()}.${String(p.name).toLowerCase()}`,
    );
    return { role, permissions };
  }

  /** Throws if user does not have the admin or super-admin role */
  async assertAdmin(userId: number) {
    const { role } = await this.getUserAccess(userId);
    if (role !== 'admin' && role !== 'super-admin') {
      throw new ForbiddenException('Admin access required');
    }
  }

  /** Throws if user does not have the specified permission */
  async assertPermission(userId: number, permission: string) {
    const { permissions, role } = await this.getUserAccess(userId);
    if (role === 'admin' || role === 'super-admin') return;
    if (!permissions.includes(permission.toLowerCase())) {
      throw new ForbiddenException(`Permission "${permission}" required`);
    }
  }

  /** Throws if user does not have the specified role */
  async assertRole(userId: number, requiredRole: string) {
    const { role } = await this.getUserAccess(userId);
    if (role !== requiredRole.toLowerCase()) {
      throw new ForbiddenException(`Role "${requiredRole}" required`);
    }
  }

  async needsBootstrap(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count === 0;
  }

  async bootstrapFirstAdmin(data: BootstrapAdminDto) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.user.count();
      if (count !== 0) {
        throw new ForbiddenException('Bootstrap already completed');
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const username = await this.generateUniqueUsername(
        data.firstName,
        data.lastName,
        data.email,
        undefined,
        tx,
      );

      const adminRole = await tx.roles.upsert({
        where: { name: 'super-admin' },
        update: {},
        create: { name: 'super-admin' },
        select: { id: true },
      });

      const permissionIds = await tx.permissions.findMany({
        select: { id: true },
      });

      const user = await tx.user.create({
        data: {
          username,
          first_name: data.firstName.trim(),
          last_name: data.lastName.trim(),
          email: data.email.toLowerCase().trim(),
          password: hashedPassword,
          status: 'active',
          role_id: adminRole.id,
          permissions:
            permissionIds.length > 0
              ? { connect: permissionIds.map((p) => ({ id: p.id })) }
              : undefined,
        },
        include: { permissions: true, role: true },
      });

      return {
        message: 'Admin user created successfully',
        user: await this.toFullUser(user),
      };
    });
  }

  async findAllFullUsers() {
    const users = await this.prisma.user.findMany({
      where: { status: 'active' },
      include: { permissions: true, role: true },
      orderBy: { id: 'asc' },
    });
    return Promise.all(users.map((u) => this.toFullUser(u)));
  }

  async findOneFullUser(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, status: 'active' },
      include: { permissions: true, role: true },
    });
    if (!user) return null;
    return this.toFullUser(user);
  }

  async listPermissions() {
    const permissions = await this.prisma.permissions.findMany({
      orderBy: [{ group_name: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: true, roles: true } },
      },
    });
    return permissions.map((p) => ({
      id: p.id,
      name: p.name,
      label: p.label,
      group_name: p.group_name,
      userCount: p._count.users,
      roleCount: p._count.roles,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
    }));
  }

  async createPermission(data: CreatePermissionDto) {
    const normalized = data.name.trim().toLowerCase();
    const normalizedGroup = data.group_name.trim().toLowerCase();
    const existing = await this.prisma.permissions.findUnique({
      where: {
        name_group_name: { name: normalized, group_name: normalizedGroup },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Permission "${data.name}" already exists in group "${data.group_name}"`,
      );
    }

    const permission = await this.prisma.permissions.create({
      data: {
        name: normalized,
        label: data.label?.trim() || null,
        group_name: normalizedGroup,
      },
      include: { _count: { select: { users: true, roles: true } } },
    });
    return {
      message: 'Permission created successfully',
      permission: {
        id: permission.id,
        name: permission.name,
        label: permission.label,
        group_name: permission.group_name,
        userCount: permission._count.users,
        roleCount: permission._count.roles,
      },
    };
  }

  async updatePermission(id: number, data: UpdatePermissionDto) {
    const perm = await this.prisma.permissions.findUnique({ where: { id } });
    if (!perm) throw new NotFoundException('Permission not found');

    const normalized = data.name.trim().toLowerCase();
    const normalizedGroup = data.group_name.trim().toLowerCase();
    if (normalized !== perm.name || normalizedGroup !== perm.group_name) {
      const conflict = await this.prisma.permissions.findFirst({
        where: { name: normalized, group_name: normalizedGroup, NOT: { id } },
      });
      if (conflict)
        throw new ConflictException(
          `Permission "${data.name}" already exists in group "${data.group_name}"`,
        );
    }

    const updated = await this.prisma.permissions.update({
      where: { id },
      data: {
        name: normalized,
        label: data.label?.trim() || null,
        group_name: normalizedGroup,
      },
      include: { _count: { select: { users: true, roles: true } } },
    });
    return {
      message: 'Permission updated successfully',
      permission: {
        id: updated.id,
        name: updated.name,
        label: updated.label,
        group_name: updated.group_name,
        userCount: updated._count.users,
        roleCount: updated._count.roles,
      },
    };
  }

  async deletePermission(id: number) {
    const perm = await this.prisma.permissions.findUnique({ where: { id } });
    if (!perm) throw new NotFoundException('Permission not found');

    await this.prisma.permissions.delete({ where: { id } });
    return { message: 'Permission deleted successfully' };
  }

  async createFromAdmin(data: AdminCreateUserDto, createdBy: number) {
    if (data.role?.toLowerCase() === 'super-admin') {
      throw new ForbiddenException('Cannot assign super-admin role');
    }
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const username = await this.generateUniqueUsername(
      data.firstName,
      data.lastName,
      data.email,
    );
    const roleId = await this.getOrCreateRoleId(data.role);

    const user = await this.prisma.user.create({
      data: {
        username,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email.toLowerCase().trim(),
        password: hashedPassword,
        status: 'active',
        created_by: createdBy,
        role_id: roleId,
        permissions: data.permissionIds
          ? { connect: data.permissionIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { permissions: true, role: true },
    });

    return {
      message: 'User created successfully',
      user: await this.toFullUser(user),
    };
  }

  async updateFromAdmin(
    id: number,
    data: AdminUpdateUserDto,
    updatedBy: number,
  ) {
    if (data.role?.toLowerCase() === 'super-admin') {
      throw new ForbiddenException('Cannot assign super-admin role');
    }
    const currentUser = await this.prisma.user.findUnique({ where: { id } });
    if (!currentUser) throw new Error('User not found');

    const nextEmail = data.email?.toLowerCase().trim();
    const nextUsername =
      data.firstName || data.lastName
        ? await this.generateUniqueUsername(
            data.firstName ?? currentUser.username.split(/[\s_]+/)[0] ?? 'user',
            data.lastName ?? '',
            nextEmail ?? currentUser.email,
            id,
          )
        : undefined;

    if (nextEmail || nextUsername) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(nextUsername ? [{ username: nextUsername }] : []),
            ...(nextEmail ? [{ email: nextEmail }] : []),
          ],
          NOT: { id },
        },
        select: { id: true },
      });
      if (conflict) throw new Error('Username or email already exists');
    }

    const roleId = data.role
      ? await this.getOrCreateRoleId(data.role)
      : undefined;
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: nextUsername,
        first_name: data.firstName?.trim(),
        last_name: data.lastName?.trim(),
        email: nextEmail,
        password: hashedPassword,
        updated_by: updatedBy,
        role_id: roleId,
        permissions:
          data.permissionIds !== undefined
            ? { set: data.permissionIds.map((pid) => ({ id: pid })) }
            : undefined,
      },
      include: { permissions: true, role: true },
    });

    return {
      message: 'User updated successfully',
      user: await this.toFullUser(user),
    };
  }

  async removeFromAdmin(id: number, deletedBy: number) {
    await this.remove(id, deletedBy);
    return { message: 'User deleted successfully' };
  }

  async setUserProfileImage(userId: number, file: Express.Multer.File) {
    const stored = await persistProfileImage(this.storage, userId, file);
    await this.prisma.user.update({
      where: { id: userId },
      data: { profile_image: stored },
    });
    const profileImage = await resolveProfileImageUrl(this.storage, stored);
    return { profileImage, message: 'Profile image updated' };
  }

  async create(data: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
        status: 'active',
        role_id: data.roleId,
        permissions: data.permissionIds
          ? { connect: data.permissionIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        permissions: true,
        role: true,
      },
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { status: 'active' },
      include: { permissions: true, role: true },
    });
  }

  findOne(id: number) {
    return this.prisma.user.findFirst({
      where: { id, status: 'active' },
      include: { permissions: true, role: true },
    });
  }

  async update(id: number, data: UpdateUserDto, updatedBy: number) {
    const currentUser = await this.prisma.user.findUnique({ where: { id } });
    if (!currentUser) throw new Error('User not found');

    const conflict = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
        NOT: { id },
      },
    });

    if (conflict) {
      throw new Error(
        conflict.username === data.username
          ? 'Username already exists'
          : 'Email already exists',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        username: data.username,
        email: data.email,
        updated_by: updatedBy,
        role_id: data.roleId,
        permissions: data.permissionIds
          ? { set: data.permissionIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { permissions: true, role: true },
    });
  }

  remove(id: number, deletedBy: number) {
    return this.prisma.user.update({
      where: { id },
      data: {
        status: 'deactive',
        updated_by: deletedBy,
      },
    });
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  async findAllRoles() {
    const roles = await this.prisma.roles.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: String(r.id),
      name: r.name,
      userCount: r._count.users,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
  }

  async createRole(data: CreateRoleDto, createdBy: number) {
    const normalized = data.name.trim().toLowerCase();
    const existing = await this.prisma.roles.findUnique({
      where: { name: normalized },
    });
    if (existing && !existing.deleted_at) {
      throw new ConflictException(`Role "${data.name}" already exists`);
    }

    if (existing && existing.deleted_at) {
      const role = await this.prisma.roles.update({
        where: { id: existing.id },
        data: { deleted_at: null, deleted_by: null, updated_by: createdBy },
        include: { _count: { select: { users: true } } },
      });
      return {
        message: 'Role restored successfully',
        role: {
          id: String(role.id),
          name: role.name,
          userCount: role._count.users,
        },
      };
    }

    const role = await this.prisma.roles.create({
      data: { name: normalized, created_by: createdBy },
      include: { _count: { select: { users: true } } },
    });
    return {
      message: 'Role created successfully',
      role: {
        id: String(role.id),
        name: role.name,
        userCount: role._count.users,
      },
    };
  }

  async updateRole(id: number, data: UpdateRoleDto, updatedBy: number) {
    const role = await this.prisma.roles.findFirst({
      where: { id, deleted_at: null },
    });
    if (!role) throw new NotFoundException('Role not found');

    const normalized = data.name.trim().toLowerCase();
    if (normalized !== role.name) {
      const conflict = await this.prisma.roles.findFirst({
        where: { name: normalized, deleted_at: null, NOT: { id } },
      });
      if (conflict)
        throw new ConflictException(`Role "${data.name}" already exists`);
    }

    const updated = await this.prisma.roles.update({
      where: { id },
      data: { name: normalized, updated_by: updatedBy },
      include: { _count: { select: { users: true } } },
    });
    return {
      message: 'Role updated successfully',
      role: {
        id: String(updated.id),
        name: updated.name,
        userCount: updated._count.users,
      },
    };
  }

  async deleteRole(id: number, deletedBy: number) {
    const role = await this.prisma.roles.findFirst({
      where: { id, deleted_at: null },
    });
    if (!role) throw new NotFoundException('Role not found');

    if (role.name === 'admin') {
      throw new ForbiddenException('Cannot delete the admin role');
    }

    await this.prisma.roles.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: deletedBy },
    });
    return { message: 'Role deleted successfully' };
  }
}
