/**
 * OhMyPos — Products controller (ADR-011, Playbook §8).
 *
 * Handles Product CRUD and Recipe sub-routes (`PUT`/`GET /products/:id/recipe`), delegating
 * recipe operations to `RecipesService` (§3, R1).
 *
 * Role scoping: write actions require OWNER or ADMIN; read actions allow any authenticated role
 * (including KASIR for POS product/recipe reads).
 *
 * No BranchScopeGuard is applied here deliberately: Product is centralized master data
 * with no branchId column (§6).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { ReplaceRecipeDto } from '../recipes/recipes.dto';
import { RecipesService } from '../recipes/recipes.service';
import { ProductPhotoService } from './product-photo.service';
import { CreateProductDto, UpdateProductDto } from './products.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
@UseGuards(RoleGuard)
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly recipesService: RecipesService,
    private readonly photoService: ProductPhotoService,
  ) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/photo')
  @Roles('OWNER', 'ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Invalid image file. Allowed formats: JPG, PNG, WebP, GIF.',
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Upload product photo (OWNER, ADMIN only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const photoUrl = await this.photoService.upload(id, file);
    return { photoUrl };
  }

  // --- Recipe Sub-Routes (R1) ---

  @Put(':id/recipe')
  @Roles('OWNER', 'ADMIN')
  replaceRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRecipeDto,
  ) {
    return this.recipesService.replaceRecipe(id, dto);
  }

  @Get(':id/recipe')
  getRecipe(@Param('id', ParseUUIDPipe) id: string) {
    return this.recipesService.getRecipe(id);
  }
}
