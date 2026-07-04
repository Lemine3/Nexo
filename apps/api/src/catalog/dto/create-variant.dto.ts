import { IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverrideMinorUnits?: number;
}
