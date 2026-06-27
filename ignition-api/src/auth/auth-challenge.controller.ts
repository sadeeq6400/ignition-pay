import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
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
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    example: 'G...wallet-address',
  })
  @ApiResponse({ status: 200, description: 'Returns challenge string' })
  @ApiResponse({ status: 400, description: 'Invalid Stellar wallet address' })
  async getChallenge(
    @Query('walletAddress') walletAddress: string,
  ): Promise<ChallengeResponse> {
    if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new BadRequestException('Invalid Stellar wallet address');
    }

    const challenge = await this.challengeService.issueChallenge(walletAddress);

    return { challenge };
  }
}
