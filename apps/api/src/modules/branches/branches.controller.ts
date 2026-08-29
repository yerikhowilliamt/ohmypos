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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './branches.dto';

@ApiTags('branches')
@Controller('branches')
@UseGuards(RoleGuard)
@Roles('OWNER', 'ADMIN')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a branch' })
  @ApiResponse({ status: 201, description: 'branch created' })
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all branches' })
  findAll() {
    return this.branchesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one branch' })
  @ApiResponse({ status: 404, description: 'branch not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.findOne(id);
  }

  // Declared BEFORE `@Patch(':id')` so the bare `:id` route cannot swallow it.
  @Patch(':id/main-store')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Designate a branch as the main store' })
  @ApiResponse({ status: 409, description: 'branch is the system location' })
  setMainStore(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.setMainStore(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a branch' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a branch' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.remove(id);
  }
}
