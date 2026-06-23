import {
  Controller,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':id/balance')
  @ApiOperation({ summary: "Get wallet's current balance and recent transactions" })
  @ApiResponse({ status: 200, description: 'Balance and recent transactions' })
  async getBalance(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing wallet id');
    }

    return this.walletsService.getBalanceAndRecentTransactions(id);
  }
}
