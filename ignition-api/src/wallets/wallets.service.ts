import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import StellarSdk, { StrKey } from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class WalletsService {
  private horizonUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Keyv,
  ) {
    this.horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
  }

  /**
   * Get current balances and recent transaction summary for a Stellar account
   */
  async getBalanceAndRecentTransactions(walletAddress: string) {
    if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new BadRequestException('Invalid Stellar wallet address');
    }

    const cacheKey = `balance:${walletAddress}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const server = new StellarSdk.Server(this.horizonUrl);

    // Fetch account info
    const account = await server.accounts().accountId(walletAddress).call();

    const balances = (account.balances || []).map((b: any) => ({
      assetType: b.asset_type,
      assetCode: b.asset_code ?? (b.asset_type === 'native' ? 'XLM' : undefined),
      balance: b.balance,
    }));

    // Fetch recent payments (as a lightweight transaction summary)
    const payments = await server
      .payments()
      .forAccount(walletAddress)
      .order('desc')
      .limit(5)
      .call();

    const recentTransactions = (payments.records || []).map((r: any) => ({
      id: r.id ?? r.transaction_hash,
      type: r.type,
      from: r.from,
      to: r.to,
      amount: r.amount,
      assetCode: r.asset_code ?? (r.asset_type === 'native' ? 'XLM' : undefined),
      createdAt: r.created_at,
    }));

    const result = { balances, recentTransactions };

    // Cache result; TTL configurable in seconds (default 30s)
    const ttlSec = Number(this.config.get<number>('BALANCE_CACHE_TTL_SEC') ?? 30);
    // Keyv expects ttl in milliseconds
    await this.cacheManager.set(cacheKey, result, ttlSec * 1000);

    return result;
  }
}
