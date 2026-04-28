import { IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  permissionIds?: number[];

  @IsOptional()
  @IsInt()
  roleId?: number;
}

export class UpdateUserDto extends CreateUserDto {}
