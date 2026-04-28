import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class AdminCreateUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  role: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  permissionIds?: number[];
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string | null;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  permissionIds?: number[];
}
