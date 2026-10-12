import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  COOKIE_OPTIONS,
  PLATFORM_ACCESS_TOKEN_COOKIE,
  PLATFORM_ACCESS_TOKEN_MAX_AGE,
  PLATFORM_REFRESH_TOKEN_COOKIE,
  PLATFORM_REFRESH_TOKEN_MAX_AGE,
} from '../../common/constants/cookie.constants';
import { Public } from '../../common/decorators/public.decorator';
import { ReqPlatformAdmin } from '../../common/decorators/req-platform-admin.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';
import {
  PlatformAdminChangePasswordDto,
  PlatformAdminLoginDto,
} from './platform.dto';

/**
 * Platform admin authentication.
 *
 * `@Public()` only bypasses the tenant `JwtAuthGuard`. Every route except login
 * and refresh must also carry `@UseGuards(PlatformAuthGuard)` (DEBT-066).
 */
@ApiTags('platform-auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Log in as a platform admin' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or deactivated',
  })
  async login(
    @Body() dto: PlatformAdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { admin, tokens } = await this.platformAuthService.login(dto);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return admin;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the platform access and refresh tokens' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      PLATFORM_REFRESH_TOKEN_COOKIE
    ];
    const tokens = await this.platformAuthService.refreshTokens(
      refreshToken ?? '',
    );
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Token refreshed' };
  }

  @Public()
  @UseGuards(PlatformAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out and revoke every existing platform session',
  })
  async logout(
    @ReqPlatformAdmin('sub') adminId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.platformAuthService.logout(adminId);
    res.clearCookie(PLATFORM_ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.clearCookie(PLATFORM_REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
    return { message: 'Logged out successfully' };
  }

  @Public()
  @UseGuards(PlatformAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Current platform admin' })
  getProfile(@ReqPlatformAdmin('sub') adminId: string) {
    return this.platformAuthService.getProfile(adminId);
  }

  /** Throttled: a wrong-old-password answer is a guessing oracle. */
  @Public()
  @UseGuards(PlatformAuthGuard)
  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Change own platform password; revokes all existing sessions',
  })
  @ApiResponse({ status: 401, description: 'Current password is wrong' })
  changePassword(
    @ReqPlatformAdmin('sub') adminId: string,
    @Body() dto: PlatformAdminChangePasswordDto,
  ) {
    return this.platformAuthService.changePassword(adminId, dto);
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie(PLATFORM_ACCESS_TOKEN_COOKIE, accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: PLATFORM_ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie(PLATFORM_REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: PLATFORM_REFRESH_TOKEN_MAX_AGE,
    });
  }
}
