import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateAddressDto } from './dto/generate-address.dto';
import { WalletNetwork } from '../wallets/dto/create-wallet.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(userId: string, dto: GenerateAddressDto) {
    const { walletId, network = WalletNetwork.STELLAR, label } = dto;

    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId) throw new NotFoundException('Wallet not found');

    // Generate a unique Stellar keypair address
    let address: string;
    let attempts = 0;
    do {
      address = StellarSdk.Keypair.random().publicKey();
      const existing = await this.prisma.depositAddress.findUnique({ where: { address } });
      if (!existing) break;
      attempts++;
    } while (attempts < 5);

    if (attempts >= 5) {
      throw new ConflictException('Failed to generate a unique address');
    }

    const depositAddress = await this.prisma.depositAddress.create({
      data: { address, walletId, network, label: label ?? null },
    });

    return {
      id: depositAddress.id,
      address: depositAddress.address,
      walletId: depositAddress.walletId,
      network: depositAddress.network,
      status: depositAddress.status,
      label: depositAddress.label,
      allocatedAt: depositAddress.allocatedAt,
    };
  }

  async listByWallet(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.userId !== userId) throw new NotFoundException('Wallet not found');

    return this.prisma.depositAddress.findMany({
      where: { walletId },
      orderBy: { allocatedAt: 'desc' },
    });
  }
}
