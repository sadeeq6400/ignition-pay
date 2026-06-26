import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from './auth-token.service';
import { PrismaService } from '../prisma/prisma.service';
import Keyv from 'keyv';
import { UserRole } from '@prisma/client';

jest.mock('keyv', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    })),
  };
});

interface MockKeyv {
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
}

interface MockJwtService {
  verify: jest.Mock;
  sign: jest.Mock;
}

interface MockPrismaService {
  user: {
    findUnique: jest.Mock;
  };
}

const mockPrisma = (): MockPrismaService => ({
  user: {
    findUnique: jest.fn(),
  },
});

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let jwt: MockJwtService;
  let prisma: MockPrismaService;
  let cache: MockKeyv;
  let config: ConfigService;

  const testUser = {
    id: 'user-123',
    walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
    role: UserRole.USER,
    isActive: true,
  };

  const validRefreshToken = 'valid-refresh-token';
  const newRefreshToken = 'new-refresh-token';
  const newAccessToken = 'new-access-token';

  beforeEach(() => {
    jwt = {
      verify: jest.fn(),
      sign: jest.fn(),
    };
    prisma = mockPrisma();
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    config = new ConfigService({
      JWT_SECRET: 'test-jwt-secret',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    });

    service = new AuthTokenService(
      jwt as unknown as JwtService,
      config,
      prisma as unknown as PrismaService,
      cache as unknown as Keyv,
    );
  });

  describe('validateAndRotate', () => {
    // Feature: token-refresh-endpoint, Property 1: Empty and whitespace refresh tokens are always rejected
    it('rejects empty refresh token', async () => {
      await expect(service.validateAndRotate('')).rejects.toThrow(UnauthorizedException);
    });

    // Feature: token-refresh-endpoint, Property 2: Payloads without a valid sub claim are always rejected
    it('returns 401 "Invalid refresh token" for missing sub claim', async () => {
      jwt.verify.mockReturnValue({ exp: Date.now() / 1000 + 604800 });

      await expect(service.validateAndRotate('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Invalid refresh token" for empty sub claim', async () => {
      jwt.verify.mockReturnValue({ sub: '', exp: Date.now() / 1000 + 604800 });

      await expect(service.validateAndRotate('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Refresh token expired" for expired token', async () => {
      const expiredError = new Error('Token expired');
      (expiredError as any).name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw expiredError;
      });

      await expect(service.validateAndRotate('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Invalid refresh token" for invalid signature', async () => {
      const invalidError = new Error('Invalid signature');
      jwt.verify.mockImplementation(() => {
        throw invalidError;
      });

      await expect(service.validateAndRotate('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Invalid refresh token" when user not found', async () => {
      jwt.verify.mockReturnValue({ sub: 'non-existent-user' });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Account is inactive" when user is not active', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue({ ...testUser, isActive: false });

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Refresh token has been revoked" when no stored token', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(undefined);

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // Feature: token-refresh-endpoint, Property 3: Token mismatch always produces a revoked response
    it('returns 401 "Refresh token has been revoked" when stored token does not match', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue('different-stored-token');

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 503 when Prisma throws', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns 503 when cache.get throws', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockRejectedValue(new Error('Redis error'));

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    // Feature: token-refresh-endpoint, Property 6: Token rotation replaces the stored token
    it('returns new token pair and rotates stored token on success', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(validRefreshToken);

      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      cache.delete.mockResolvedValue(true);
      cache.set.mockResolvedValue('OK');

      const result = await service.validateAndRotate(validRefreshToken);

      // Feature: token-refresh-endpoint, Property 4: New access token always contains the correct claims
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: testUser.id,
          walletAddress: testUser.walletAddress,
          role: testUser.role,
        }),
        expect.objectContaining({
          secret: 'test-jwt-secret',
          expiresIn: '15m',
        }),
      );

      // Feature: token-refresh-endpoint, Property 5: New refresh token always embeds the correct sub
      expect(jwt.sign).toHaveBeenCalledWith(
        { sub: testUser.id },
        expect.objectContaining({
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        }),
      );

      expect(cache.delete).toHaveBeenCalledWith(`refresh:${testUser.walletAddress}`);
      expect(cache.set).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
        newRefreshToken,
        7 * 24 * 60 * 60 * 1000,
      );

      // Feature: token-refresh-endpoint, Property 7: Successful refresh response always contains all required fields
      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
      });
    });

    it('returns 503 when cache rotation write fails', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(validRefreshToken);

      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      cache.delete.mockResolvedValue(true);
      cache.set.mockRejectedValue(new Error('Redis write error'));

      await expect(service.validateAndRotate(validRefreshToken)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    // Feature: token-refresh-endpoint, Property 10: Error responses never leak the refresh token
    it('does not leak refresh token in error response', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(undefined);

      try {
        await service.validateAndRotate(validRefreshToken);
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).message).toBe('Refresh token has been revoked');
        expect(JSON.stringify(error)).not.toContain(validRefreshToken);
      }
    });
  });
});