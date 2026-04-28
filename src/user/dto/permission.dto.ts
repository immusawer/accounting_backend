import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty({ message: 'Permission name is required' })
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  label?: string;

  @IsString()
  @IsNotEmpty({ message: 'Group name is required' })
  @MaxLength(255)
  group_name: string;
}

export class UpdatePermissionDto {
  @IsString()
  @IsNotEmpty({ message: 'Permission name is required' })
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  label?: string;

  @IsString()
  @IsNotEmpty({ message: 'Group name is required' })
  @MaxLength(255)
  group_name: string;
}
