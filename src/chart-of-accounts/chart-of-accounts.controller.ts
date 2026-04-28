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
import { ChartOfAccountsService } from './chart-of-accounts.service';
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
} from './dto/chart-of-accounts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('chart-of-accounts')
@UseGuards(JwtAuthGuard)
export class ChartOfAccountsController {
  constructor(private readonly service: ChartOfAccountsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('/accounts')
  getAccounts() {
    return this.service.findAllAccounts();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @AuditLog({ action: 'CREATE', module: 'account' })
  @Post()
  create(@Body() data: CreateChartOfAccountDto, @Req() req: AuthRequest) {
    console.log('Creating account with data:', data, 'by user:', req.user);
    return this.service.create(data, req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'account' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateChartOfAccountDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'account' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user.id);
  }
}
