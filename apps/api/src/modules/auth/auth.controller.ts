import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
} from '../../common/constants/cookie.constants';
import { Public } from '../../common/decorators/public.decorator';
import { ReqUser } from '../../common/decorators/req-user.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, UpdateSelfDto } from './auth.dto';
import { ProfilePhotoService } from './profile-photo.service';
import { InvalidImageFileException } from './profile-photo.exceptions';

/**
 * There is no `register` endpoint. User creation is OWNER-only and lives on
 * `POST /users` (ADR-011 §5) — Kasync's public self-registration is exactly
 * what that ADR rules out.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly profilePhotoService: ProfilePhotoService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Log in and receive HttpOnly session cookies' })
  @ApiResponse({ status: 200, description: 'Authenticated' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or deactivated account',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(dto);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the access and refresh tokens' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_TOKEN_COOKIE
    ];
    const tokens = await this.authService.refreshTokens(refreshToken ?? '');
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Token refreshed' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and revoke every existing session' })
  async logout(
    @ReqUser('sub') userId: string | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (userId) {
      await this.authService.logout(userId);
    }
    res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Current user, used by the frontend to gate routes',
  })
  getProfile(@ReqUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change own password; revokes all existing sessions',
  })
  changePassword(
    @ReqUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own display name' })
  updateProfile(@ReqUser('sub') userId: string, @Body() dto: UpdateSelfDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('me/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload your own profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadPhoto(
    @ReqUser('sub') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new InvalidImageFileException();
    }
    const photoUrl = await this.profilePhotoService.upload(userId, file);
    return { photoUrl };
  }

  @Patch('deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate own account (soft) and clear the session',
  })
  @ApiResponse({
    status: 400,
    description: 'Caller is the last active OWNER',
  })
  async deactivateSelf(
    @ReqUser('sub') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.deactivateSelf(userId);
    res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
    return result;
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }
}
