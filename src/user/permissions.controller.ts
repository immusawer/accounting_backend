import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';
import { AuditLog } from '../audit-log/audit-log.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.listPermissions();
  }

  @AuditLog({ action: 'CREATE', module: 'permission' })
  @Post()
  async create(@Body() data: CreatePermissionDto, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.createPermission(data);
  }

  @AuditLog({ action: 'UPDATE', module: 'permission' })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdatePermissionDto,
    @Req() req: AuthRequest,
  ) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.updatePermission(Number(id), data);
  }

  @AuditLog({ action: 'DELETE', module: 'permission' })
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.deletePermission(Number(id));
  }
}
