import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

/**
 * Bootstrap endpoints for initializing the very first admin user.
 *
 * Security model:
 * - These routes are intentionally unauthenticated.
 * - They are only enabled when there are zero users in the database.
 */
@Controller('auth/bootstrap')
export class BootstrapController {
  constructor(private readonly usersService: UsersService) {}

  @Get('status')
  async status() {
    const needsBootstrap = await this.usersService.needsBootstrap();
    return { needsBootstrap };
  }

  @Post('admin')
  async createFirstAdmin(@Body() data: BootstrapAdminDto) {
    const needsBootstrap = await this.usersService.needsBootstrap();
    if (!needsBootstrap) {
      throw new ForbiddenException('Bootstrap already completed');
    }
    return this.usersService.bootstrapFirstAdmin(data);
  }
}
