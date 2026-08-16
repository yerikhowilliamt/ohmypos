import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { ImportService } from './import.service';

@ApiTags('import')
@Controller('import')
@UseGuards(RoleGuard)
@Roles('ADMIN', 'OWNER')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('csv/:accountId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import a bank statement CSV into an account' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'format', enum: ['BCA', 'MANDIRI'] })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async importCsv(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query('format') format: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!format) {
      throw new BadRequestException('Query parameter `format` is required');
    }
    return this.importService.importCsv(accountId, format, file.buffer);
  }
}
