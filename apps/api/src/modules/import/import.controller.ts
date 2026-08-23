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
import { isPdfBuffer } from './parsers/pdf-text.util';

@ApiTags('import')
@Controller('import')
@UseGuards(RoleGuard)
@Roles('ADMIN', 'OWNER')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('csv/:accountId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
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
    // Checked by signature rather than mimetype: a PDF fed to a CSV parser
    // would otherwise import zero rows and look like an empty statement.
    if (isPdfBuffer(file.buffer)) {
      throw new BadRequestException(
        'File PDF tidak dapat diimpor sebagai CSV. Pilih format PDF.',
      );
    }
    return this.importService.importStatement(accountId, format, file.buffer);
  }

  /**
   * Kept separate from the CSV route so the existing CSV contract stays
   * byte-for-byte unchanged and each container can reject the other's files.
   * Role restrictions are inherited from the controller-level
   * `RoleGuard`/`Roles` above.
   */
  @Post('pdf/:accountId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Import a bank statement PDF into an account' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'format', enum: ['MANDIRI_PDF'] })
  @ApiQuery({ name: 'password', required: false, type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async importPdf(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query('format') format: string,
    @Query('password') password: string | undefined,
    @UploadedFile(
      // The PDF signature is verified downstream in `extractPdfPages`, which
      // rejects anything that is not a real PDF regardless of declared type.
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!format) {
      throw new BadRequestException('Query parameter `format` is required');
    }
    return this.importService.importStatement(
      accountId,
      format,
      file.buffer,
      password ? { password } : undefined,
    );
  }
}
