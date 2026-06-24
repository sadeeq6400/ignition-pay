import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  /**
   * POST /wallets
   * Create a new wallet for the authenticated user.
   * Auto-generates a Stellar deposit address if none is provided.
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new wallet with deposit address and limits' })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid deposit address' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Deposit address already in use' })
  async createWallet(@Request() req: any, @Body() dto: CreateWalletDto) {
    return this.walletsService.createWallet(req.user.sub, dto);
  }

  /**
   * GET /wallets/:id/balance
   * Get wallet's current balance and recent transactions.
   */
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
