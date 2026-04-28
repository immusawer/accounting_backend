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
import { TransactionsDataService } from './transactions-data.service';
import {
  CreateTransactionDataDto,
  UpdateTransactionDataDto,
} from './dto/transactions-data.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('transactions-data')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TransactionsDataController {
  constructor(private readonly service: TransactionsDataService) {}

  @RequirePermission('transactions.view')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @RequirePermission('transactions.view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() data: CreateTransactionDataDto, @Req() req: AuthRequest) {
    return this.service.create(data, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateTransactionDataDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, data, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user.id);
  }
}
