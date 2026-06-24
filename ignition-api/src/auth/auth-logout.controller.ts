import {
  Controller,
  Post,
  Req,
  UnauthorizedException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SessionGuard, AuthenticatedRequest } from '../session/session.guard';
import { SessionService } from '../session/session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthLogoutController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('logout')
  @UseGuards(SessionGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout and revoke the current session' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session successfully revoked' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid token' })
  async logout(@Req() req: AuthenticatedRequest): Promise<{ message: string }> {
    if (!req.user) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.sessionService.revokeSession(req.user.userId, req.user.sessionId);
    return { message: 'Logged out successfully' };
  }
}