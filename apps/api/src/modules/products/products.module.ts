import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { ProductPhotoService } from './product-photo.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [RecipesModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductPhotoService],
  exports: [ProductsService, ProductPhotoService],
})
export class ProductsModule {}
