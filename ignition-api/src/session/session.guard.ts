import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SessionService } from './session.service';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    walletAddress: string;
    role: string;
    sessionId: string;
  };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    let payload: Record<string, unknown>;

    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET', 'stellaraid-default-secret'),
      }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const sessionId = payload['sid'] as string | undefined;
    if (!sessionId) {
      throw new UnauthorizedException('Token is missing session identifier');
    }

    // Validate session is still active in Redis
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session has expired or been revoked');
    }

    // Slide the session TTL on each use
    void this.sessionService.touchSession(sessionId);

    request.user = {
      userId: payload['sub'] as string,
      walletAddress: payload['walletAddress'] as string,
      role: payload['role'] as string,
      sessionId,
    };

    return true;
  }
}
