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
import { ReviewStatus } from '@prisma/client';
import { HrService } from './hr.service';
import {
  CreateDepartmentDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateSalaryPaymentDto,
} from './dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('hr')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class HrController {
  constructor(private readonly service: HrService) {}

  // Departments
  @Get('departments')
  getDepartments() {
    return this.service.getDepartments();
  }

  @AuditLog({ action: 'CREATE', module: 'department' })
  @Post('departments')
  createDepartment(@Body() data: CreateDepartmentDto) {
    return this.service.createDepartment(data);
  }

  @AuditLog({ action: 'DELETE', module: 'department' })
  @Delete('departments/:id')
  deleteDepartment(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteDepartment(id);
  }

  // Employees
  @Get('employees')
  getEmployees() {
    return this.service.getEmployees();
  }

  @AuditLog({ action: 'CREATE', module: 'employee' })
  @Post('employees')
  createEmployee(@Body() data: CreateEmployeeDto) {
    return this.service.createEmployee(data);
  }

  @AuditLog({ action: 'UPDATE', module: 'employee' })
  @Patch('employees/:id')
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateEmployeeDto,
  ) {
    return this.service.updateEmployee(id, data);
  }

  @AuditLog({ action: 'DELETE', module: 'employee' })
  @Delete('employees/:id')
  deleteEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.deleteEmployee(id, String(req.user.id));
  }

  // Salary Payments
  @Get('salary-payments')
  getSalaryPayments() {
    return this.service.getSalaryPayments();
  }

  @AuditLog({ action: 'CREATE', module: 'salary' })
  @Post('salary-payments')
  createSalaryPayment(
    @Body() data: CreateSalaryPaymentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createSalaryPayment(data, req.user.id);
  }

  @RequirePermission('hr.update')
  @AuditLog({ action: 'UPDATE', module: 'salary' })
  @Patch('salary-payments/:id')
  updateSalaryPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<CreateSalaryPaymentDto>,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateSalaryPayment(id, data, req.user.id);
  }

  @RequirePermission('hr.change_status')
  @AuditLog({ action: 'UPDATE', module: 'salary' })
  @Patch('salary-payments/:id/review-status')
  updateSalaryStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: ReviewStatus },
    @Req() req: AuthRequest,
  ) {
    return this.service.updateSalaryStatus(id, body.status, req.user.id);
  }

  @RequirePermission('hr.delete')
  @AuditLog({ action: 'DELETE', module: 'salary' })
  @Delete('salary-payments/:id')
  deleteSalaryPayment(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.deleteSalaryPayment(id, req.user.id);
  }
}
