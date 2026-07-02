import { IsInt, IsNotEmpty, IsString, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @NotEquals(0)
  delta!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
