import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PLATFORM_ACCESS_TOKEN_COOKIE } from '../constants/cookie.constants';
import { tenantStorage } from '../prisma/tenant-context';
import type { UnscopedPrismaService } from '../prisma/prisma.service';
import type { PlatformJwtPayload } from '../types/platform-jwt-payload.interface';
import {
  PLATFORM_ACCOUNT_DEACTIVATED,
  SERVER_MISCONFIGURED,
  SESSION_EXPIRED,
} from '../messages';

/**
 * ADR-025 Fase 3.
 *
 * These are the checks that stand between an anonymous request and every
 * tenant's data, and the guard has no e2e coverage until Fase 6 ships the
 * `/platform/*` routes it protects — so each rejection path is asserted here
 * individually rather than through one happy-path smoke test.
 */

const PLATFORM_SECRET = 'test-platform-secret-minimum-32-characters';
const ADMIN_ID = 'admin-1';

type RequestShape = {
  cookies?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  platformAdmin?: PlatformJwtPayload;
};

function contextFor(request: RequestShape): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

interface AdminRow {
  id: string;
  email: string;
  isActive: boolean;
  tokenValidFrom: Date;
}

function guardFor(admin: AdminRow | null) {
  const findUnique = jest.fn().mockResolvedValue(admin);
  const prisma = {
    platformAdmin: { findUnique },
  } as unknown as UnscopedPrismaService;
  return {
    guard: new PlatformAuthGuard(new JwtService({}), prisma),
    findUnique,
  };
}

const activeAdmin: AdminRow = {
  id: ADMIN_ID,
  email: 'ops@ohmypos.local',
  isActive: true,
  tokenValidFrom: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * `exp` is set explicitly rather than through `expiresIn`, because
 * jsonwebtoken derives `exp` from the payload's own `iat` when one is supplied
 * — so the tokenValidFrom cases below, which backdate `iat` to a fixed 2026
 * instant, would otherwise mint tokens that expired an hour after that instant
 * and get rejected for expiry instead of for the reason under test.
 */
function sign(
  payload: Partial<PlatformJwtPayload> = {},
  secret = PLATFORM_SECRET,
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new JwtService({}).sign(
    {
      sub: ADMIN_ID,
      email: activeAdmin.email,
      iat: nowSeconds,
      ...payload,
      exp: nowSeconds + 3600,
    },
    { secret },
  );
}

/** Runs `fn` inside a request scope, the way TenantScopeMiddleware would. */
function inScope<T>(fn: () => Promise<T>) {
  return tenantStorage.run({ tenantId: null, platformAdminId: null }, fn);
}

describe('PlatformAuthGuard', () => {
  const originalSecret = process.env.PLATFORM_JWT_SECRET;

  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = PLATFORM_SECRET;
  });

  afterAll(() => {
    process.env.PLATFORM_JWT_SECRET = originalSecret;
  });

  it('accepts a valid cookie token and publishes the admin on the request', async () => {
    const { guard, findUnique } = guardFor(activeAdmin);
    const request: RequestShape = {
      cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign() },
      headers: {},
    };

    await expect(
      inScope(() => guard.canActivate(contextFor(request))),
    ).resolves.toBe(true);

    // Email comes from the row, not the claim — a renamed admin must not keep
    // showing a stale address for the life of the token.
    expect(request.platformAdmin).toEqual({
      sub: ADMIN_ID,
      email: activeAdmin.email,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADMIN_ID } }),
    );
  });

  it('accepts a Bearer header when no cookie is present', async () => {
    const { guard } = guardFor(activeAdmin);
    const request: RequestShape = {
      headers: { authorization: `Bearer ${sign()}` },
    };

    await expect(
      inScope(() => guard.canActivate(contextFor(request))),
    ).resolves.toBe(true);
  });

  it('sets platformAdminId in the request scope but leaves tenantId null', async () => {
    const { guard } = guardFor(activeAdmin);
    const request: RequestShape = {
      cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign() },
      headers: {},
    };

    // The whole point of ADR-025 §3.3: platform code that reaches for a
    // tenant-scoped model through the filtered client must throw, not read
    // some arbitrary tenant.
    const scope = await tenantStorage.run(
      { tenantId: null, platformAdminId: null },
      async () => {
        await guard.canActivate(contextFor(request));
        return tenantStorage.getStore();
      },
    );

    expect(scope).toEqual({ tenantId: null, platformAdminId: ADMIN_ID });
  });

  it('rejects a request with no token at all', async () => {
    const { guard } = guardFor(activeAdmin);

    await expect(
      inScope(() => guard.canActivate(contextFor({ headers: {} }))),
    ).rejects.toThrow(new UnauthorizedException(SESSION_EXPIRED));
  });

  it('rejects a token signed with the TENANT secret', async () => {
    // The core of the platform/tenant separation: an ordinary OWNER access
    // token presented to a platform route must not verify.
    const { guard } = guardFor(activeAdmin);
    const tenantToken = sign({}, 'a-completely-different-tenant-secret-32ch');

    await expect(
      inScope(() =>
        guard.canActivate(
          contextFor({
            cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: tenantToken },
            headers: {},
          }),
        ),
      ),
    ).rejects.toThrow(new UnauthorizedException(SESSION_EXPIRED));
  });

  it('rejects when PLATFORM_JWT_SECRET is unset, without naming the variable', async () => {
    delete process.env.PLATFORM_JWT_SECRET;
    const { guard } = guardFor(activeAdmin);

    await expect(
      inScope(() =>
        guard.canActivate(
          contextFor({
            cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign() },
            headers: {},
          }),
        ),
      ),
    ).rejects.toThrow(new UnauthorizedException(SERVER_MISCONFIGURED));
  });

  it('rejects a token whose admin row no longer exists', async () => {
    const { guard } = guardFor(null);

    await expect(
      inScope(() =>
        guard.canActivate(
          contextFor({
            cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign() },
            headers: {},
          }),
        ),
      ),
    ).rejects.toThrow(new UnauthorizedException(SESSION_EXPIRED));
  });

  it('rejects a deactivated admin with its own message', async () => {
    const { guard } = guardFor({ ...activeAdmin, isActive: false });

    await expect(
      inScope(() =>
        guard.canActivate(
          contextFor({
            cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign() },
            headers: {},
          }),
        ),
      ),
    ).rejects.toThrow(new UnauthorizedException(PLATFORM_ACCOUNT_DEACTIVATED));
  });

  it('rejects a token issued before tokenValidFrom', async () => {
    const validFrom = new Date('2026-06-01T00:00:00.000Z');
    const { guard } = guardFor({ ...activeAdmin, tokenValidFrom: validFrom });
    // Two seconds earlier — comfortably outside the 1000ms iat-resolution
    // allowance, so this is a revoked token and not a rounding artefact.
    const iat = Math.floor(validFrom.getTime() / 1000) - 2;

    await expect(
      inScope(() =>
        guard.canActivate(
          contextFor({
            cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign({ iat }) },
            headers: {},
          }),
        ),
      ),
    ).rejects.toThrow(new UnauthorizedException(SESSION_EXPIRED));
  });

  it('accepts a token minted in the same second as tokenValidFrom', async () => {
    // iat has whole-second resolution: a token minted at 10:00:00.900 carries
    // iat = 10:00:00 and must survive a tokenValidFrom of 10:00:00.500.
    const validFrom = new Date('2026-06-01T10:00:00.500Z');
    const { guard } = guardFor({ ...activeAdmin, tokenValidFrom: validFrom });
    const iat = Math.floor(validFrom.getTime() / 1000);

    await expect(
      inScope(() =>
        guard.canActivate(
          contextFor({
            cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign({ iat }) },
            headers: {},
          }),
        ),
      ),
    ).resolves.toBe(true);
  });

  it('fails closed when TenantScopeMiddleware did not open a scope', async () => {
    const { guard } = guardFor(activeAdmin);

    // No inScope() wrapper — deliberately.
    await expect(
      guard.canActivate(
        contextFor({
          cookies: { [PLATFORM_ACCESS_TOKEN_COOKIE]: sign() },
          headers: {},
        }),
      ),
    ).rejects.toThrow(new UnauthorizedException(SESSION_EXPIRED));
  });
});
