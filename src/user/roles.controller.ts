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
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { AuditLog } from '../audit-log/audit-log.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll() {
    return this.usersService.findAllRoles();
  }

  @AuditLog({ action: 'CREATE', module: 'role' })
  @Post()
  async create(@Body() data: CreateRoleDto, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.createRole(data, req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'role' })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateRoleDto,
    @Req() req: AuthRequest,
  ) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.updateRole(Number(id), data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'role' })
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.deleteRole(Number(id), req.user.id);
  }
}
