import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export class OrderItemInputDto {
  @IsUUID()
  productVariantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  @ArrayMinSize(1)
  items!: OrderItemInputDto[];
}
