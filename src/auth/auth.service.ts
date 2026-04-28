import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as bcrypt from 'bcrypt';

export const MINIO_PROFILE_PREFIX = 'minio:';

export async function resolveProfileImageUrl(
  storage: StorageService,
  raw: string | null | undefined,
): Promise<string | null> {
  if (!raw) return null;
  if (!raw.startsWith(MINIO_PROFILE_PREFIX)) return raw;
  if (!storage.isEnabled()) return null;
  const objectKey = raw.slice(MINIO_PROFILE_PREFIX.length);
  try {
    return await storage.getPresignedGetUrl(objectKey);
  } catch {
    return null;
  }
}

export async function persistProfileImage(
  storage: StorageService,
  userId: number,
  file: Express.Multer.File,
): Promise<string> {
  const ext = extname(file.originalname) || '';
  if (storage.isEnabled()) {
    const objectKey = `profile-images/${userId}/${randomUUID()}${ext}`;
    await storage.upload(objectKey, file.buffer, file.mimetype);
    return `${MINIO_PROFILE_PREFIX}${objectKey}`;
  }
  // Disk fallback when MinIO is disabled — preserve existing static-serve path.
  const dir = path.resolve(process.cwd(), 'uploads', 'profile-images');
  await fs.mkdir(dir, { recursive: true });
  const filename = `profile-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/profile-images/${filename}`;
}

type AuthUserRecord = Prisma.userGetPayload<{
  select: {
    id: true;
    username: true;
    first_name: true;
    last_name: true;
    email: true;
    password: true;
    profile_image: true;
    role: { select: { name: true } };
    permissions: { select: { name: true; group_name: true } };
  };
}>;

type ProfileUserRecord = Prisma.userGetPayload<{
  select: {
    id: true;
    username: true;
    first_name: true;
    last_name: true;
    email: true;
    status: true;
    profile_image: true;
    created_at: true;
    role: { select: { name: true } };
    permissions: { select: { name: true; group_name: true } };
  };
}>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private storage: StorageService,
  ) {}

  private getRoleName(user: { role: { name: string } | null }): string {
    return user.role?.name ? String(user.role.name).toLowerCase() : 'user';
  }

  private getPermissionNames(
    permissions: Array<{ group_name: string; name: string }>,
  ): string[] {
    return permissions.map(
      (permission) => `${permission.group_name}.${permission.name}`,
    );
  }

  private getFullName(user: {
    first_name?: string | null;
    last_name?: string | null;
    username?: string;
  }) {
    const first = user.first_name ?? null;
    const last = user.last_name ?? null;
    if (first || last) {
      return {
        firstName: first,
        lastName: last,
        fullName: [first, last].filter(Boolean).join(' '),
      };
    }
    // Fallback for old users without first_name/last_name
    const parts = (user.username ?? '').split(/[\s_]+/).filter(Boolean);
    return {
      firstName: parts[0] ?? null,
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
      fullName: parts.join(' ') || null,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, status: 'active' },
      select: {
        id: true,
        username: true,
        first_name: true,
        last_name: true,
        email: true,
        password: true,
        profile_image: true,
        role: { select: { name: true } },
        permissions: { select: { name: true, group_name: true } },
      },
    });
    if (!user) return null;

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) return null;

    return user;
  }

  async login(user: AuthUserRecord) {
    const payload = { sub: user.id, email: user.email };
    const roleName = this.getRoleName(user);
    const permissionNames = this.getPermissionNames(user.permissions);
    const { firstName, lastName, fullName } = this.getFullName(user);
    const profileImage = await resolveProfileImageUrl(
      this.storage,
      user.profile_image,
    );

    return {
      message: 'Login successful',
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName,
        lastName,
        fullName,
        role: roleName,
        isAdmin: roleName === 'admin' || roleName === 'super-admin',
        permissions: permissionNames,
        profileImage,
      },
    };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        first_name: true,
        last_name: true,
        email: true,
        status: true,
        profile_image: true,
        created_at: true,
        role: { select: { name: true } },
        permissions: { select: { name: true, group_name: true } },
      },
    });

    if (!user) return null;

    const typedUser: ProfileUserRecord = user;
    const roleName = this.getRoleName(typedUser);
    const permissionNames = this.getPermissionNames(typedUser.permissions);
    const { firstName, lastName, fullName } = this.getFullName(typedUser);

    const profileImage = await resolveProfileImageUrl(
      this.storage,
      typedUser.profile_image,
    );

    return {
      id: String(typedUser.id),
      email: typedUser.email,
      firstName,
      lastName,
      fullName,
      phone: null,
      address: null,
      role: roleName,
      permissions: permissionNames,
      isActive: typedUser.status === 'active',
      profileImage,
      lastLogin: null,
      createdAt: typedUser.created_at
        ? new Date(typedUser.created_at).toISOString()
        : new Date().toISOString(),
    };
  }

  async uploadProfileImage(userId: number, file: Express.Multer.File) {
    const stored = await persistProfileImage(this.storage, userId, file);
    await this.prisma.user.update({
      where: { id: userId },
      data: { profile_image: stored },
    });
    const profileImage = await resolveProfileImageUrl(this.storage, stored);
    return {
      profileImage,
      message: 'Profile image updated successfully',
    };
  }
}
