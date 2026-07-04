import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsIn(['WAREHOUSE', 'RETAIL', 'PICKUP_POINT', 'HYBRID'])
  type?: 'WAREHOUSE' | 'RETAIL' | 'PICKUP_POINT' | 'HYBRID';

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
