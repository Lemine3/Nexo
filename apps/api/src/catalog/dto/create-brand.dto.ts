import { IsString, Matches, MinLength } from 'class-validator';

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}
