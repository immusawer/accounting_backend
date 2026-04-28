import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

enum AccountType {
  main = 'main',
  sub1 = 'sub1',
  sub2 = 'sub2',
  sub3 = 'sub3',
}

enum AccountCategory {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export class CreateChartOfAccountDto {
  @IsString()
  @IsNotEmpty()
  account_name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsEnum(AccountCategory)
  category?: AccountCategory;

  @IsOptional()
  @IsInt()
  parent_id?: number;

  @IsOptional()
  @IsInt()
  company_id?: number;
}

export class UpdateChartOfAccountDto extends CreateChartOfAccountDto {}
