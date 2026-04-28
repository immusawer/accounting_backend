import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

// IDs are per-table now (not globally unique), so every op that targets a
// single attachment has to know which table to look in — hence the
// `ownerType` segment on the download/delete routes.
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @AuditLog({ action: 'CREATE', module: 'attachment' })
  @Post(':ownerType/:ownerId')
  @UseInterceptors(FilesInterceptor('files', 20))
  upload(
    @Param('ownerType') ownerType: string,
    @Param('ownerId', ParseIntPipe) ownerId: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: AuthRequest,
  ) {
    return this.service.uploadMany(ownerType, ownerId, files, req.user.id);
  }

  @Get(':ownerType/:ownerId')
  list(
    @Param('ownerType') ownerType: string,
    @Param('ownerId', ParseIntPipe) ownerId: number,
  ) {
    return this.service.list(ownerType, ownerId);
  }

  @Get(':ownerType/file/:id/url')
  getUrl(
    @Param('ownerType') ownerType: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getDownloadUrl(ownerType, id);
  }

  @AuditLog({ action: 'DELETE', module: 'attachment' })
  @Delete(':ownerType/file/:id')
  remove(
    @Param('ownerType') ownerType: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(ownerType, id);
  }
}
