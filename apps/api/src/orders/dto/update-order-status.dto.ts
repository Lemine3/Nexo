import { IsIn, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsIn(['PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'REFUNDED'])
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
