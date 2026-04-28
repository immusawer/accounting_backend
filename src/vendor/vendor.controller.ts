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
import { VendorService } from './vendor.service';
import {
  CreateVendorAccountDto,
  UpdateVendorAccountDto,
} from './dto/vendor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('vendor-accounts')
@UseGuards(JwtAuthGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Get()
  findAll() {
    return this.vendorService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vendorService.findOne(id);
  }

  @AuditLog({ action: 'CREATE', module: 'vendor-account' })
  @Post()
  create(@Body() data: CreateVendorAccountDto, @Req() req: AuthRequest) {
    return this.vendorService.create(data, req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'vendor-account' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateVendorAccountDto,
    @Req() req: AuthRequest,
  ) {
    return this.vendorService.update(id, data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'vendor-account' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.vendorService.remove(id, req.user.id);
  }
}
