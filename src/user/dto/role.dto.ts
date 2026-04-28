import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'Role name is required' })
  @MaxLength(255)
  name: string;
}

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'Role name is required' })
  @MaxLength(255)
  name: string;
}
