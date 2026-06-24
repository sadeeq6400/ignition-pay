import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('@stellar/stellar-sdk', () => {
  const validPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS';
  return {
    __esModule: true,
    default: {
      Server: jest.fn().mockImplementation(() => ({
        accounts() {
          return {
            accountId: () => ({ call: async () => ({ balances: [{ asset_type: 'native', balance: '100.0' }] }) }),
          };
        },
        payments() {
          return {
            forAccount: () => ({
              order: () => ({
                limit: () => ({
                  call: async () => ({
                    records: [{ id: '1', type: 'payment', from: 'A', to: 'B', amount: '50', asset_type: 'native', created_at: new Date().toISOString() }],
                  }),
                }),
              }),
            }),
          };
        },
      })),
      Keypair: {
        random: jest.fn(() => ({ publicKey: () => validPublicKey })),
      },
    },
    StrKey: {
      isValidEd25519PublicKey: (s: string) => !!s && s.startsWith('G'),
    },
  };
});

import { WalletsService } from './wallets.service';
import { WalletNetwork } from './dto/create-wallet.dto';

const mockWallet = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  network: 'STELLAR',
  depositAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
  label: null,
  dailyLimit: 1000,
  monthlyLimit: 10000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildMockPrisma = (overrides: Partial<{ user: any; wallet: any }> = {}) => ({
  user: {
    findUnique: jest.fn().mockResolvedValue('user' in overrides ? overrides.user : { id: 'user-uuid' }),
  },
  wallet: {
    findUnique: jest.fn().mockResolvedValue('wallet' in overrides ? overrides.wallet : null),
    create: jest.fn().mockResolvedValue(mockWallet),
  },
});

describe('WalletsService', () => {
  let service: WalletsService;
  let cache: Keyv;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    const config = new ConfigService({
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      BALANCE_CACHE_TTL_SEC: '1',
    });
    cache = new Keyv();
    prisma = buildMockPrisma();
    // @ts-ignore
    service = new WalletsService(config, cache, prisma);
  });

  // ------- createWallet tests -------

  describe('createWallet', () => {
    it('creates a wallet with auto-generated deposit address', async () => {
      const result = await service.createWallet('user-uuid', {});
      expect(result).toHaveProperty('id', 'wallet-uuid');
      expect(result).toHaveProperty('depositAddress');
      expect(result.network).toBe('STELLAR');
      expect(result.dailyLimit).toBe(1000);
      expect(result.monthlyLimit).toBe(10000);
    });

    it('creates a wallet with a provided valid deposit address', async () => {
      const result = await service.createWallet('user-uuid', {
        depositAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        label: 'My Wallet',
        dailyLimit: 500,
        monthlyLimit: 5000,
      });
      expect(result.label).toBe(null); // mock returns null for label from prisma
      expect(prisma.wallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-uuid',
            dailyLimit: 500,
            monthlyLimit: 5000,
          }),
        }),
      );
    });

    it('throws NotFoundException if user does not exist', async () => {
      const noPrisma = buildMockPrisma({ user: null });
      // @ts-ignore
      service = new WalletsService(new ConfigService(), cache, noPrisma);
      await expect(service.createWallet('bad-user', {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid Stellar deposit address', async () => {
      await expect(
        service.createWallet('user-uuid', { depositAddress: 'invalid-address' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if deposit address is already taken', async () => {
      const conflictPrisma = buildMockPrisma({ wallet: mockWallet });
      // @ts-ignore
      service = new WalletsService(new ConfigService(), cache, conflictPrisma);
      await expect(
        service.createWallet('user-uuid', {
          depositAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ------- getBalanceAndRecentTransactions tests -------

  describe('getBalanceAndRecentTransactions', () => {
    it('returns balances and recent transactions for valid address', async () => {
      const res = await service.getBalanceAndRecentTransactions('GABCDEF123');
      expect(res).toHaveProperty('balances');
      expect(Array.isArray(res.balances)).toBe(true);
      expect(res.balances[0].balance).toBe('100.0');
      expect(res).toHaveProperty('recentTransactions');
      expect(res.recentTransactions.length).toBeGreaterThan(0);
    });

    it('caches result', async () => {
      const spySet = jest.spyOn(cache as any, 'set');
      await service.getBalanceAndRecentTransactions('GABCDEF123');
      expect(spySet).toHaveBeenCalled();
    });
  });
});
