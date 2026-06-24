import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  Body,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import Keyv from 'keyv';

import { SessionGuard, AuthenticatedRequest } from './session.guard';
import { SessionService, SessionMetadata } from './session.service';

class RefreshTokenDto {
  refreshToken: string;
}

class SessionInfoDto {
  sessionId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
  isCurrent: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
  ) {}

  /**
   * POST /auth/refresh
   * Exchange a valid refresh token for a new access token.
   * The existing session TTL is slid forward.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using a refresh token' })
  @ApiResponse({ status: 200, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<{ accessToken: string; tokenType: 'Bearer' }> {
    if (!dto?.refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.jwt.verify(dto.refreshToken, {
        secret: this.config.get<string>('REFRESH_TOKEN_SECRET', 'default-refresh-secret'),
      }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const sessionId = payload['sid'] as string | undefined;
    if (!sessionId) {
      throw new UnauthorizedException('Refresh token is missing session identifier');
    }

    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session has expired or been revoked');
    }

    // Slide the session TTL
    await this.sessionService.touchSession(sessionId);

    const accessToken = this.jwt.sign(
      {
        sub: session.userId,
        walletAddress: session.walletAddress,
        role: session.role,
        sid: sessionId,
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'stellaraid-default-secret'),
        expiresIn: `${this.config.get<number>('SESSION_ACCESS_TTL_SECONDS', 900)}s`,
      },
    );

    return { accessToken, tokenType: 'Bearer' };
  }

  /**
   * GET /auth/sessions
   * List all active sessions for the authenticated user.
   */
  @UseGuards(SessionGuard)
  @Get('sessions')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  @ApiResponse({ status: 200, description: 'Array of active session metadata' })
  async listSessions(
    @Req() req: AuthenticatedRequest,
  ): Promise<SessionInfoDto[]> {
    const sessions = await this.sessionService.getActiveSessions(req.user.userId);
    return sessions.map((s) => this.toDto(s, req.user.sessionId));
  }

  /**
   * DELETE /auth/sessions/:sessionId
   * Revoke a specific session (e.g., logout another device).
   */
  @UseGuards(SessionGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiParam({ name: 'sessionId', description: 'The session ID to revoke' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    // Users can only revoke their own sessions
    const session = await this.sessionService.getSession(sessionId);
    if (session && session.userId === req.user.userId) {
      await this.sessionService.revokeSession(req.user.userId, sessionId);
    }
  }

  /**
   * DELETE /auth/sessions
   * Revoke all sessions for the current user (sign out everywhere).
   */
  @UseGuards(SessionGuard)
  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke all sessions (sign out everywhere)' })
  @ApiResponse({ status: 204, description: 'All sessions revoked' })
  async revokeAllSessions(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.sessionService.revokeAllSessions(req.user.userId);
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private toDto(session: SessionMetadata, currentSessionId: string): SessionInfoDto {
    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isCurrent: session.sessionId === currentSessionId,
    };
  }
}
