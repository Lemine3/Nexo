import { IsInt, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
