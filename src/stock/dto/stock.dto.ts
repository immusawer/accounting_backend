import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

enum StockType {
  IN = 'IN',
  OUT = 'OUT',
}

export class CreateStockDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(StockType)
  type!: StockType;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  price!: number;

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
