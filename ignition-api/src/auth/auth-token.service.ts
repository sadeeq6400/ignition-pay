import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import Keyv from 'keyv';
import { LoginResponseDto } from '../users/dto/login.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

interface RefreshTokenPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

interface AccessTokenPayload {
  sub: string;
  walletAddress: string;
  role: UserRole;
}

@Injectable()
export class AuthTokenService {
  private readonly REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
  ) {}

  async validateAndRotate(refreshToken: string): Promise<LoginResponseDto> {
    let payload: RefreshTokenPayload;

    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>(
          'REFRESH_TOKEN_SECRET',
          'default-refresh-secret',
        ),
      }) as RefreshTokenPayload;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException('Refresh token expired');
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.sub || payload.sub.trim() === '') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const cacheKey = `refresh:${user.walletAddress}`;
    let storedToken: string | undefined;

    try {
      storedToken = await this.cache.get(cacheKey);
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: '15m',
    });

    const newRefreshToken = this.jwt.sign({ sub: user.id }, {
      secret: this.config.get<string>(
        'REFRESH_TOKEN_SECRET',
        'default-refresh-secret',
      ),
      expiresIn: '7d',
    });

    try {
      await this.cache.delete(cacheKey);
      await this.cache.set(cacheKey, newRefreshToken, this.REFRESH_TTL_MS);
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    return { accessToken, refreshToken: newRefreshToken, tokenType: 'Bearer' };
  }
}