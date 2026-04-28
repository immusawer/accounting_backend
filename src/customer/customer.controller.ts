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
import { CustomerService } from './customer.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll() {
    return this.customerService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.findOne(id);
  }

  @AuditLog({ action: 'CREATE', module: 'customer' })
  @Post()
  create(@Body() data: CreateCustomerDto) {
    return this.customerService.create(data);
  }

  @AuditLog({ action: 'UPDATE', module: 'customer' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, data);
  }

  @AuditLog({ action: 'DELETE', module: 'customer' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.customerService.remove(id, String(req.user.id));
  }
}
