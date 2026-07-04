import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CatalogService } from './catalog.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';

@Controller('admin/stores/:storeId')
@UseGuards(PermissionsGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('brands')
  @RequirePermission('brand', 'create')
  createBrand(@CurrentUser() user: AuthenticatedUser, @Param('storeId') storeId: string, @Body() dto: CreateBrandDto) {
    return this.catalogService.createBrand(user.tenantId, storeId, dto);
  }

  @Get('brands')
  @RequirePermission('brand', 'view')
  listBrands(@Param('storeId') storeId: string) {
    return this.catalogService.listBrands(storeId);
  }

  @Post('categories')
  @RequirePermission('category', 'create')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalogService.createCategory(user.tenantId, storeId, dto);
  }

  @Get('categories')
  @RequirePermission('category', 'view')
  listCategories(@Param('storeId') storeId: string) {
    return this.catalogService.listCategories(storeId);
  }

  @Post('products')
  @RequirePermission('product', 'create')
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.catalogService.createProduct(user.tenantId, user.staffUserId, storeId, dto);
  }

  @Get('products')
  @RequirePermission('product', 'view')
  listProducts(@Param('storeId') storeId: string) {
    return this.catalogService.listProducts(storeId);
  }

  @Get('products/:productId')
  @RequirePermission('product', 'view')
  getProduct(@Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.catalogService.getProduct(storeId, productId);
  }

  @Patch('products/:productId')
  @RequirePermission('product', 'update')
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(user.tenantId, user.staffUserId, storeId, productId, dto);
  }

  @Post('products/:productId/publish')
  @RequirePermission('product', 'update')
  publishProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
  ) {
    return this.catalogService.publishProduct(user.tenantId, user.staffUserId, storeId, productId);
  }

  @Post('products/:productId/variants')
  @RequirePermission('product', 'update')
  addVariant(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.catalogService.addVariant(storeId, productId, dto);
  }

  @Delete('products/:productId')
  @RequirePermission('product', 'delete')
  removeProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
  ) {
    return this.catalogService.removeProduct(user.tenantId, user.staffUserId, storeId, productId);
  }
}
