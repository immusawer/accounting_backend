import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GeneralJournalService } from './general-journal.service';
import {
  CreateGeneralJournalDto,
  UpdateGeneralJournalDto,
} from './dto/general-journal.dto';
import { AuditLog } from '../audit-log/audit-log.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('general-journal')
@UseGuards(JwtAuthGuard)
export class GeneralJournalController {
  constructor(private readonly service: GeneralJournalService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @AuditLog({ action: 'CREATE', module: 'general_journal' })
  @Post()
  create(@Body() data: CreateGeneralJournalDto, @Req() req: AuthRequest) {
    return this.service.create(data, req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'general_journal' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateGeneralJournalDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'general_journal' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user.id);
  }
}
