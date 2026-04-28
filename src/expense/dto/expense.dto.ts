import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateExpenseDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsInt()
  debitAccountId!: number;

  @IsInt()
  creditAccountId!: number;

  @IsOptional()
  @IsDateString()
  date?: string;
}
