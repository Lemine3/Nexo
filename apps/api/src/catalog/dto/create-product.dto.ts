import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['SIMPLE', 'VARIABLE', 'DIGITAL', 'BUNDLE'])
  type?: 'SIMPLE' | 'VARIABLE' | 'DIGITAL' | 'BUNDLE';

  @IsInt()
  @Min(0)
  basePriceMinorUnits!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString({ each: true })
  categoryIds?: string[];

  /** Required only for type=SIMPLE to seed the implicit default variant. */
  @IsOptional()
  @IsString()
  sku?: string;
}
