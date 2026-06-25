import { NotFoundException, ConflictException } from '@nestjs/common';

jest.mock('@stellar/stellar-sdk', () => ({
  __esModule: true,
  default: {
    Keypair: {
      random: jest.fn(() => ({ publicKey: () => 'GNEWADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567' })),
    },
  },
}));

import { AddressesService } from './addresses.service';

const mockWallet = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  network: 'STELLAR',
  depositAddress: 'GABCDEF',
  isActive: true,
};

const mockDepositAddress = {
  id: 'addr-uuid',
  address: 'GNEWADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
  walletId: 'wallet-uuid',
  network: 'STELLAR',
  status: 'ALLOCATED',
  label: null,
  allocatedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildMockPrisma = (overrides: Partial<{ wallet: any; depositAddress: any; created: any }> = {}) => ({
  wallet: {
    findUnique: jest.fn().mockResolvedValue('wallet' in overrides ? overrides.wallet : mockWallet),
  },
  depositAddress: {
    findUnique: jest.fn().mockResolvedValue('depositAddress' in overrides ? overrides.depositAddress : null),
    create: jest.fn().mockResolvedValue('created' in overrides ? overrides.created : mockDepositAddress),
    findMany: jest.fn().mockResolvedValue([mockDepositAddress]),
  },
});

describe('AddressesService', () => {
  let service: AddressesService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    prisma = buildMockPrisma();
    // @ts-ignore
    service = new AddressesService(prisma);
  });

  describe('generate', () => {
    it('generates and returns a new deposit address for a valid wallet', async () => {
      const result = await service.generate('user-uuid', { walletId: 'wallet-uuid' });
      expect(result).toHaveProperty('id', 'addr-uuid');
      expect(result).toHaveProperty('address', 'GNEWADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567');
      expect(result).toHaveProperty('walletId', 'wallet-uuid');
      expect(result).toHaveProperty('status', 'ALLOCATED');
      expect(result).toHaveProperty('allocatedAt');
    });

    it('persists the generated address via prisma.depositAddress.create', async () => {
      await service.generate('user-uuid', { walletId: 'wallet-uuid', label: 'test-label' });
      expect(prisma.depositAddress.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ walletId: 'wallet-uuid', label: 'test-label' }),
        }),
      );
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      const p = buildMockPrisma({ wallet: null });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(service.generate('user-uuid', { walletId: 'bad-id' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when wallet belongs to a different user', async () => {
      const p = buildMockPrisma({ wallet: { ...mockWallet, userId: 'other-user' } });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(service.generate('user-uuid', { walletId: 'wallet-uuid' })).rejects.toThrow(NotFoundException);
    });

    it('retries if generated address already exists and succeeds on second attempt', async () => {
      const StellarSdk = require('@stellar/stellar-sdk').default;
      let call = 0;
      StellarSdk.Keypair.random
        .mockImplementationOnce(() => ({ publicKey: () => 'DUPLICATE_ADDR' }))
        .mockImplementationOnce(() => ({ publicKey: () => 'UNIQUE_ADDR' }));

      prisma.depositAddress.findUnique
        .mockResolvedValueOnce({ id: 'existing' }) // first address is taken
        .mockResolvedValueOnce(null);               // second is unique

      prisma.depositAddress.create.mockResolvedValueOnce({ ...mockDepositAddress, address: 'UNIQUE_ADDR' });

      const result = await service.generate('user-uuid', { walletId: 'wallet-uuid' });
      expect(result.address).toBe('UNIQUE_ADDR');
    });
  });

  describe('listByWallet', () => {
    it('returns all deposit addresses for a wallet', async () => {
      const result = await service.listByWallet('user-uuid', 'wallet-uuid');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('walletId', 'wallet-uuid');
    });

    it('throws NotFoundException if wallet not found', async () => {
      const p = buildMockPrisma({ wallet: null });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(service.listByWallet('user-uuid', 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if wallet belongs to another user', async () => {
      const p = buildMockPrisma({ wallet: { ...mockWallet, userId: 'other-user' } });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(service.listByWallet('user-uuid', 'wallet-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
