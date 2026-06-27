import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { AuthChallengeService } from './auth-challenge.service';

import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { AuthTokenService } from './auth-token.service';
import { LoginResponseDto } from '../users/dto/login.dto';

export class VerifyDto {
  @ApiProperty({ example: 'G...wallet-address' })
  walletAddress: string;

  @ApiProperty({ example: 'signature-string' })
  signedChallenge: string;

  @ApiProperty({ example: 'stellaraid:login:nonce:timestamp' })
  challenge: string;
}

export class AuthResponse {
  @ApiProperty({ example: 'eyJhbGci...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGci...' })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer', enum: ['Bearer'] })
  tokenType: 'Bearer';
}

/**
 * POST /auth/verify — Stellar wallet login.
 *
 * Verifies the Ed25519 signature, upserts the user (issues #222 and #225),
 * opens a tracked session, and returns a (access, refresh) token pair
 * minted by AuthTokenService. Issue #110: refresh tokens are issued here
 * so wallet-authenticated users can call /auth/refresh without re-signing.
 */
@ApiTags('auth')
@Controller('auth')
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
export class AuthVerifyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly challengeService: AuthChallengeService,
  ) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify signature and issue JWT token' })
  @ApiResponse({
    status: 201,
    description: 'Successful login',
    type: AuthResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  @ApiResponse({ status: 401, description: 'Signature verification failed' })
  async verify(@Body() dto: VerifyDto): Promise<AuthResponse> {
    const { walletAddress, signedChallenge, challenge } = dto;

    if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new BadRequestException('Invalid wallet address');
    }
    if (!signedChallenge || !challenge) {
      throw new BadRequestException('Missing signedChallenge or challenge');
    }

    const keypair = Keypair.fromPublicKey(walletAddress);
    const messageBytes = Buffer.from(challenge, 'utf8');
    const signatureBytes = Buffer.from(signedChallenge, 'base64');

    const valid = keypair.verify(messageBytes, signatureBytes);
    if (!valid) {
      throw new UnauthorizedException('Signature verification failed');
    }

    await this.challengeService.consumeChallenge(walletAddress, challenge);

    // Issue #222: resolve role from admin allowlist
    const adminWallets = this.config
      .get<string>('ADMIN_WALLETS', '')
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const isAdmin = adminWallets.includes(walletAddress);
    const roleFromAllowlist: UserRole | undefined = isAdmin
      ? UserRole.ADMIN
      : undefined;

    // Issue #225: upsert user on first login
    const displayName = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

    const user = await this.prisma.user.upsert({
      where: { walletAddress },
      create: {
        walletAddress,
        displayName,
        role: roleFromAllowlist ?? UserRole.USER,
      },
      update: roleFromAllowlist ? { role: roleFromAllowlist } : {},
    });

    const role = roleFromAllowlist ?? user.role;

    // Issue #110: open a session and mint access + refresh tokens.
    // SessionGuard-authenticated endpoints (e.g. /auth/logout) require
    // the `sid` claim, so we always create a session here.
    const roleValue = String(role);
    const session = await this.sessionService.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      role: roleValue,
    });

    return this.tokenService.issueTokenPair(
      { id: user.id, walletAddress: user.walletAddress, role: roleValue },
      session.sessionId,
    );
  }
}
