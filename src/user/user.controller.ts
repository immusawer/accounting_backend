import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { AuditLog } from '../audit-log/audit-log.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AuditLog({ action: 'CREATE', module: 'user' })
  @Post()
  create(@Body() data: CreateUserDto) {
    return this.usersService.create(data);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(Number(id));
  }

  @AuditLog({ action: 'UPDATE', module: 'user' })
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() data: UpdateUserDto,
    @Req() req: AuthRequest,
  ) {
    const userId = req.user.id;
    return this.usersService.update(Number(id), data, userId);
  }

  @AuditLog({ action: 'DELETE', module: 'user' })
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req: AuthRequest) {
    const userId = req.user.id;
    return this.usersService.remove(Number(id), userId);
  }
}
