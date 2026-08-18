import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { MatchingService } from './matching.service';
import { ProposeMatchesDto, ResetMatchesDto } from './matching.dto';

@ApiTags('matching')
@Controller('matching')
@UseGuards(RoleGuard)
@Roles('ADMIN', 'OWNER')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('propose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Propose matches between bank transactions and ledger entries',
  })
  @ApiResponse({ status: 200, description: 'Match candidates returned' })
  propose(@Body() dto: ProposeMatchesDto) {
    return this.matchingService.proposeMatches(dto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset PENDING_REVIEW transactions back to UNRESOLVED',
  })
  reset(@Body() dto: ResetMatchesDto) {
    return this.matchingService.resetMatches(dto.accountId);
  }

  @Post('reject/:bankTransactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reject a single proposed match, returning that transaction to UNRESOLVED',
  })
  reject(@Param('bankTransactionId', ParseUUIDPipe) bankTransactionId: string) {
    return this.matchingService.rejectMatch(bankTransactionId);
  }
}
