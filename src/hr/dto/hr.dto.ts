import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// ─── Department ─────────────────────────────────────────────
export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ─── Employee ───────────────────────────────────────────────
export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsInt()
  departmentId?: number;

  @IsNumber()
  baseSalary!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;
}

export class UpdateEmployeeDto extends CreateEmployeeDto {}

// ─── Salary Payment ─────────────────────────────────────────
export class CreateSalaryPaymentDto {
  @IsInt()
  employeeId!: number;

  @IsString()
  @IsNotEmpty()
  period!: string; // "2026-03"

  @IsOptional()
  @IsNumber()
  allowances?: number;

  @IsOptional()
  @IsNumber()
  deductions?: number;

  @IsOptional()
  @IsNumber()
  overtime?: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsInt()
  debitAccountId!: number; // Salary Expense

  @IsInt()
  creditAccountId!: number; // Cash / Bank
}
