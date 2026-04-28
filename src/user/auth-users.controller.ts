import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './user.service';
import { AdminCreateUserDto, AdminUpdateUserDto } from './dto/admin-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('auth/users')
@UseGuards(JwtAuthGuard)
export class AuthUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.findAllFullUsers();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.findOneFullUser(Number(id));
  }

  @AuditLog({ action: 'CREATE', module: 'user' })
  @Post()
  async create(@Body() data: AdminCreateUserDto, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.createFromAdmin(data, req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'user' })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: AdminUpdateUserDto,
    @Req() req: AuthRequest,
  ) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.updateFromAdmin(Number(id), data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'user' })
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.usersService.assertAdmin(req.user.id);
    return this.usersService.removeFromAdmin(Number(id), req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'user-profile-image' })
  @Post(':id/profile-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadProfileImage(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.usersService.assertAdmin(req.user.id);
    if (!file) throw new BadRequestException('No file uploaded');
    return this.usersService.setUserProfileImage(Number(id), file);
  }
}
