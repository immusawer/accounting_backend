import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDepartmentDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateSalaryPaymentDto,
} from './dto/hr.dto';
import { baseFields } from '../currency/convert';

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

  private async getRate(code: string): Promise<number> {
    const c = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    return c?.exchangeRate ?? 1;
  }

  // ── Departments ──────────────────────────────────────────────────────────
  async getDepartments() {
    return this.prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async createDepartment(data: CreateDepartmentDto) {
    const dept = await this.prisma.department.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
      },
    });
    return { message: 'Department created', department: dept };
  }

  async deleteDepartment(id: number) {
    await this.prisma.department.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Department deactivated' };
  }

  // ── Employees ────────────────────────────────────────────────────────────
  async getEmployees() {
    return this.prisma.employee.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { firstName: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { salaryPayments: true } },
      },
    });
  }

  async createEmployee(data: CreateEmployeeDto) {
    if (data.email) {
      const existing = await this.prisma.employee.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (existing && !existing.deletedAt)
        throw new ConflictException('Employee with this email already exists');
    }
    const emp = await this.prisma.employee.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email?.toLowerCase().trim() || null,
        phone: data.phone?.trim() || null,
        position: data.position?.trim() || null,
        departmentId: data.departmentId || null,
        baseSalary: data.baseSalary,
        currency: data.currency || 'USD',
        hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
        bankAccount: data.bankAccount?.trim() || null,
        bankName: data.bankName?.trim() || null,
        taxId: data.taxId?.trim() || null,
      },
      include: { department: { select: { id: true, name: true } } },
    });
    return { message: 'Employee added', employee: emp };
  }

  async updateEmployee(id: number, data: UpdateEmployeeDto) {
    const existing = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Employee not found');
    const emp = await this.prisma.employee.update({
      where: { id },
      data: {
        firstName: data.firstName?.trim(),
        lastName: data.lastName?.trim(),
        email: data.email?.toLowerCase().trim(),
        phone: data.phone?.trim(),
        position: data.position?.trim(),
        departmentId: data.departmentId,
        baseSalary: data.baseSalary,
        currency: data.currency,
        hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        bankAccount: data.bankAccount?.trim(),
        bankName: data.bankName?.trim(),
        taxId: data.taxId?.trim(),
      },
      include: { department: { select: { id: true, name: true } } },
    });
    return { message: 'Employee updated', employee: emp };
  }

  async deleteEmployee(id: number, deletedBy?: string) {
    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    return { message: 'Employee deleted' };
  }

  // ── Salary Payments ──────────────────────────────────────────────────────
  async getSalaryPayments() {
    return this.prisma.salary_payment.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            position: true,
            department: { select: { name: true } },
          },
        },
      },
    });
  }

  async createSalaryPayment(data: CreateSalaryPaymentDto, userId?: number) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: data.employeeId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // Check duplicate period
    const existing = await this.prisma.salary_payment.findUnique({
      where: {
        employeeId_period: { employeeId: data.employeeId, period: data.period },
      },
    });
    if (existing && !existing.deleted_at) {
      throw new ConflictException(
        `Salary for ${data.period} already exists for this employee`,
      );
    }

    const allowances = data.allowances ?? 0;
    const deductions = data.deductions ?? 0;
    const overtime = data.overtime ?? 0;
    const netSalary = employee.baseSalary + allowances + overtime - deductions;
    const currency = employee.currency || 'USD';
    const rate = await this.getRate(currency);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.salary_payment.create({
        data: {
          employeeId: data.employeeId,
          period: data.period,
          baseSalary: employee.baseSalary,
          allowances,
          deductions,
          overtime,
          netSalary,
          currency,
          status: 'PAID',
          paidDate: now,
          reference: data.reference?.trim() || null,
          notes: data.notes?.trim() || null,
          debitAccountId: data.debitAccountId,
          creditAccountId: data.creditAccountId,
          created_by: userId,
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              position: true,
              department: { select: { name: true } },
            },
          },
        },
      });

      // Auto-generate transactions_data (double-entry)
      // Debit: Salary Expense account
      // Credit: Cash / Bank account
      const empName = `${employee.firstName} ${employee.lastName}`;
      const narration = `Salary ${data.period} - ${empName}`;
      const refNum = `SAL-${payment.id}`;

      await tx.transactions_data.create({
        data: {
          voucher_date: now,
          voucher_number: refNum,
          system_ref: `SAL:${payment.id}`,
          account_id: data.debitAccountId,
          ...baseFields(netSalary, 0, currency, rate),
          narration,
          created_by: userId,
        },
      });
      await tx.transactions_data.create({
        data: {
          voucher_date: now,
          voucher_number: refNum,
          system_ref: `SAL:${payment.id}`,
          account_id: data.creditAccountId,
          ...baseFields(0, netSalary, currency, rate),
          narration,
          created_by: userId,
        },
      });

      return payment;
    });

    return { message: 'Salary paid & transactions generated', payment: result };
  }

  async deleteSalaryPayment(id: number, userId?: number) {
    const existing = await this.prisma.salary_payment.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Salary payment not found');

    await this.prisma.$transaction(async (tx) => {
      // 1. Soft-delete the salary payment
      await tx.salary_payment.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: userId },
      });

      // 2. Soft-delete related journal entries so they don't affect reports
      await tx.transactions_data.updateMany({
        where: { system_ref: `SAL:${id}`, deleted_at: null },
        data: { deleted_at: new Date(), deleted_by: userId },
      });
    });

    return {
      message:
        'Salary payment deleted and journal entries reversed successfully',
    };
  }
}
