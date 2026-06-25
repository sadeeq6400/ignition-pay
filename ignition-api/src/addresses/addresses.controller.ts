import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { GenerateAddressDto } from './dto/generate-address.dto';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a new deposit address for a wallet' })
  @ApiResponse({ status: 201, description: 'Address generated and allocated' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async generate(@Request() req: any, @Body() dto: GenerateAddressDto) {
    return this.addressesService.generate(req.user.sub, dto);
  }

  @Get('wallet/:walletId')
  @ApiOperation({ summary: 'List all deposit addresses for a wallet' })
  @ApiResponse({ status: 200, description: 'List of deposit addresses' })
  async listByWallet(@Request() req: any, @Param('walletId') walletId: string) {
    return this.addressesService.listByWallet(req.user.sub, walletId);
  }
}
