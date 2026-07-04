import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
