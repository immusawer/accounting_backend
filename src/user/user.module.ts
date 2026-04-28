import { Module } from '@nestjs/common';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUsersController } from './auth-users.controller';
import { PermissionsController } from './permissions.controller';
import { BootstrapController } from './bootstrap.controller';
import { RolesController } from './roles.controller';

@Module({
  controllers: [
    UsersController,
    AuthUsersController,
    PermissionsController,
    BootstrapController,
    RolesController,
  ],
  providers: [UsersService, PrismaService],
})
export class UsersModule {}
