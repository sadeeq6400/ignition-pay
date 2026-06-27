import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChallengeQueryDto } from './dto/challenge-query.dto';
import { AuthChallengeService } from './auth-challenge.service';

interface ChallengeResponse {
  challenge: string;
}

@ApiTags('auth')
@Controller('auth')
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
export class AuthChallengeController {
  constructor(private readonly challengeService: AuthChallengeService) {}

  @Get('challenge')
  @ApiOperation({ summary: 'Get authentication challenge for wallet address' })
  @ApiResponse({ status: 200, description: 'Returns challenge string' })
  @ApiResponse({ status: 400, description: 'Invalid Stellar wallet address' })
  async getChallenge(
    @Query() query: ChallengeQueryDto,
  ): Promise<ChallengeResponse> {
    const { walletAddress } = query;

    const challenge = await this.challengeService.issueChallenge(walletAddress);

    return { challenge };
  }
}
