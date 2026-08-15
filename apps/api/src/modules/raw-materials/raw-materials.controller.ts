/**
 * OhMyPos — RawMaterials controller (ADR-011, Playbook §8).
 *
 * Scoped by role: writes require OWNER or ADMIN role; reads allow any authenticated role
 * (including KASIR for POS stock/recipe reads).
 *
 * No BranchScopeGuard is applied here deliberately: RawMaterial is a centralized pool (ADR-004)
 * with no branchId column (§6).
 */
import {
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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import {
  CreateRawMaterialDto,
  UpdateRawMaterialDto,
} from './raw-materials.dto';
import { RawMaterialsService } from './raw-materials.service';

@ApiTags('raw-materials')
@Controller('raw-materials')
@UseGuards(RoleGuard)
export class RawMaterialsController {
  constructor(private readonly service: RawMaterialsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Body() dto: CreateRawMaterialDto) {
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
    @Body() dto: UpdateRawMaterialDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
