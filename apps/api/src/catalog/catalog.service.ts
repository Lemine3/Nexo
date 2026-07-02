import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // --- Brands ---------------------------------------------------------

  createBrand(tenantId: string, storeId: string, dto: CreateBrandDto) {
    return this.prisma.brand.create({ data: { tenantId, storeId, name: dto.name, slug: dto.slug } });
  }

  listBrands(storeId: string) {
    return this.prisma.brand.findMany({ where: { storeId } });
  }

  // --- Categories -------------------------------------------------------

  createCategory(tenantId: string, storeId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        tenantId,
        storeId,
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  listCategories(storeId: string) {
    return this.prisma.category.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' } });
  }

  // --- Products -----------------------------------------------------------

  /**
   * SIMPLIFICATION of docs/srs/05-catalog-inventory-warehouse.md §5.1.2:
   * a SIMPLE product is created with one implicit default variant so it can
   * immediately carry inventory/order references; VARIABLE products add
   * variants afterwards via addVariant().
   */
  async createProduct(tenantId: string, actorId: string, storeId: string, dto: CreateProductDto) {
    const type = dto.type ?? 'SIMPLE';

    const product = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          storeId,
          brandId: dto.brandId,
          type,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          basePriceMinorUnits: dto.basePriceMinorUnits,
          currency: dto.currency ?? 'USD',
          categories: dto.categoryIds
            ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
            : undefined,
        },
      });

      if (type === 'SIMPLE') {
        await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: dto.sku ?? `${dto.slug}-default`,
          },
        });
      }

      return product;
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'product.create',
      resourceType: 'product',
      resourceId: product.id,
      after: product,
    });

    return this.getProduct(storeId, product.id);
  }

  listProducts(storeId: string) {
    return this.prisma.product.findMany({
      where: { storeId },
      include: { variants: true, brand: true, categories: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProduct(storeId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
      include: { variants: true, brand: true, categories: { include: { category: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(tenantId: string, actorId: string, storeId: string, productId: string, dto: UpdateProductDto) {
    await this.getProduct(storeId, productId);
    const product = await this.prisma.product.update({ where: { id: productId }, data: dto });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'product.update',
      resourceType: 'product',
      resourceId: productId,
      after: dto,
    });

    return product;
  }

  /**
   * docs/srs/05 §5.1.3: a product cannot be published without at least a
   * price (enforced at creation) and at least one variant to sell.
   */
  async publishProduct(tenantId: string, actorId: string, storeId: string, productId: string) {
    const product = await this.getProduct(storeId, productId);
    if (product.variants.length === 0) {
      throw new BadRequestException('Cannot publish a product with no variants');
    }
    const updated = await this.prisma.product.update({ where: { id: productId }, data: { status: 'ACTIVE' } });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'product.publish',
      resourceType: 'product',
      resourceId: productId,
    });

    return updated;
  }

  async addVariant(storeId: string, productId: string, dto: CreateVariantDto) {
    await this.getProduct(storeId, productId);
    return this.prisma.productVariant.create({
      data: {
        productId,
        sku: dto.sku,
        optionsJson: dto.options,
        priceOverrideMinorUnits: dto.priceOverrideMinorUnits,
      },
    });
  }

  /**
   * docs/srs/05 §5.1.3: hard delete is only permitted if the product has
   * never been ordered; otherwise it is forced into ARCHIVED status.
   */
  async removeProduct(tenantId: string, actorId: string, storeId: string, productId: string) {
    const product = await this.getProduct(storeId, productId);
    const variantIds = product.variants.map((v) => v.id);
    const orderItemCount = await this.prisma.orderItem.count({
      where: { productVariantId: { in: variantIds } },
    });

    if (orderItemCount > 0) {
      const archived = await this.prisma.product.update({ where: { id: productId }, data: { status: 'ARCHIVED' } });
      await this.auditLogService.record({
        tenantId,
        actorType: ActorType.STAFF,
        actorId,
        action: 'product.archive',
        resourceType: 'product',
        resourceId: productId,
      });
      return { archived: true, product: archived };
    }

    await this.prisma.product.delete({ where: { id: productId } });
    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'product.delete',
      resourceType: 'product',
      resourceId: productId,
    });
    return { archived: false };
  }
}
