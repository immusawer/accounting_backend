import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TransactionLineDto {
  @IsInt()
  account_id!: number;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;

  @IsOptional()
  @IsString()
  narration?: string;
}

export class CreateGeneralJournalDto {
  @IsDateString()
  journal_date!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  exchange_rate?: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => TransactionLineDto)
  transactions!: TransactionLineDto[];
}

export class UpdateGeneralJournalDto extends CreateGeneralJournalDto {}
