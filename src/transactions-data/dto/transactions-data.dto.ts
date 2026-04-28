import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTransactionDataDto {
  @IsDateString()
  voucher_date!: string;

  @IsOptional()
  @IsInt()
  voucher_id?: number;

  @IsOptional()
  @IsString()
  voucher_number?: string;

  @IsOptional()
  @IsString()
  system_ref?: string;

  @IsInt()
  account_id!: number;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsNumber()
  exchange_rate?: number;

  @IsOptional()
  @IsNumber()
  base_currency_debit?: number;

  @IsOptional()
  @IsNumber()
  base_currency_credit?: number;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsInt()
  general_journal_id?: number;

  @IsOptional()
  @IsInt()
  company_id?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class UpdateTransactionDataDto extends CreateTransactionDataDto {}
