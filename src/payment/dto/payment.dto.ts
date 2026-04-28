import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum PaymentStatusDto {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
}

export class CreatePaymentDto {
  @IsInt()
  customerId!: number;

  @IsOptional()
  @IsInt()
  invoiceId?: number;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePaymentDto {
  // All fields that are safe to edit while the payment is still PENDING.
  // Customer / invoice aren't editable — changing them would change the
  // journal entries we'd generate later; recreate the payment instead.
  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatusDto)
  status!: PaymentStatusDto;
}
