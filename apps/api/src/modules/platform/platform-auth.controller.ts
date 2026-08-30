import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { PlatformAdminLoginDto } from './platform.dto';

/**
 * ADR-025 Fase 4.
 *
 * `@Public()` is what gets past the globally registered `JwtAuthGuard`, which
 * only understands tenant tokens. It does NOT mean unauthenticated: every route
 * here except login and refresh carries `@UseGuards(PlatformAuthGuard)`.
 *
 * That arrangement fails open if the guard is ever forgotten on a new route —
 * see DEBT-066 and `platform-auth.e2e-spec.ts`, which enumerates the router and
 * requires a 401 from every `/platform/*` path.
 */
@ApiTags('platform-auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Same 10/60s as POST /auth/login. This endpoint guards more than any tenant
  // login does, so it is not the place to be more generous.
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
