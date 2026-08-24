import { Module } from '@nestjs/common';
import { RecipesService } from './recipes.service';

@Module({
  providers: [RecipesService],
  exports: [RecipesService],
})
export class RecipesModule {}
