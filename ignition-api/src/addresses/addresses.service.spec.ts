import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';

const mockAddress = {
  id: 'address-uuid',
  walletId: null,
  address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
  network: 'STELLAR',
  label: null,
  isActive: true,
  allocatedAt: null,
  lastActivityAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockWallet = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  network: 'STELLAR',
  depositAddress: 'GANOTHERADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
  label: null,
  dailyLimit: 1000,
  monthlyLimit: 10000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildMockPrisma = (overrides: Partial<{ address: any; addressNull: boolean; wallet: any }> = {}) => {
  const mock = {
    address: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === 'not-found' || where.address === 'nonexistent') return null;
        if (overrides.addressNull) return null;
        if ('address' in overrides) return overrides.address;
        if (where.id) return mockAddress;
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([mockAddress]),
      create: jest.fn().mockResolvedValue(mockAddress),
      update: jest.fn().mockResolvedValue(mockAddress),
      delete: jest.fn().mockResolvedValue(mockAddress),
    },
    wallet: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === 'not-found') return null;
        return 'wallet' in overrides ? overrides.wallet : mockWallet;
      }),
    },
  };
  return mock;
};

describe('AddressesService', () => {
  let service: AddressesService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    prisma = buildMockPrisma();
    // @ts-ignore
    service = new AddressesService(prisma);
  });

  describe('create', () => {
    it('creates an address', async () => {
      const result = await service.create({
        address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
      });
      expect(result).toHaveProperty('id', 'address-uuid');
      expect(result).toHaveProperty('address');
      expect(result.network).toBe('STELLAR');
      expect(result.isActive).toBe(true);
    });

    it('throws ConflictException if address already exists', async () => {
      const conflictPrisma = buildMockPrisma({ address: mockAddress });
      // @ts-ignore
      service = new AddressesService(conflictPrisma);
      await expect(
        service.create({
          address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('sets allocatedAt when walletId is provided', async () => {
      const result = await service.create({
        address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        walletId: 'wallet-uuid',
      });
      expect(result).toBeDefined();
      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'wallet-uuid',
            allocatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException if wallet does not exist', async () => {
      const noWalletPrisma = buildMockPrisma({ addressNull: true });
      // @ts-ignore
      service = new AddressesService(noWalletPrisma);
      await expect(
        service.create({
          address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
          walletId: 'not-found',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns all addresses', async () => {
      const results = await service.findAll();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('findOne', () => {
    it('returns an address by id', async () => {
      const result = await service.findOne('address-uuid');
      expect(result).toHaveProperty('id', 'address-uuid');
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.findOne('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAddress', () => {
    it('returns an address by address string', async () => {
      const addrPrisma = buildMockPrisma({ address: mockAddress });
      // @ts-ignore
      service = new AddressesService(addrPrisma);
      const result = await service.findByAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS');
      expect(result).toHaveProperty('address');
    });

    it('throws NotFoundException for unknown address', async () => {
      await expect(service.findByAddress('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByWallet', () => {
    it('returns addresses for a wallet', async () => {
      const results = await service.findByWallet('wallet-uuid');
      expect(Array.isArray(results)).toBe(true);
      expect(prisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walletId: 'wallet-uuid' },
        }),
      );
    });
  });

  describe('update', () => {
    it('updates an address', async () => {
      const result = await service.update('address-uuid', { label: 'Updated' });
      expect(result).toBeDefined();
      expect(prisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'address-uuid' },
        }),
      );
    });

    it('sets allocatedAt when allocating previously unallocated address', async () => {
      const unallocatedPrisma = buildMockPrisma({
        address: { ...mockAddress, walletId: null, allocatedAt: null },
      });
      // @ts-ignore
      service = new AddressesService(unallocatedPrisma);

      await service.update('address-uuid', { walletId: 'wallet-uuid' });
      expect(unallocatedPrisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'wallet-uuid',
            allocatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException if address does not exist', async () => {
      const missingPrisma = buildMockPrisma();
      missingPrisma.address.findUnique.mockResolvedValue(null);
      // @ts-ignore
      service = new AddressesService(missingPrisma);
      await expect(service.update('not-found', { label: 'Nope' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes an address', async () => {
      await expect(service.remove('address-uuid')).resolves.toBeUndefined();
    });

    it('throws NotFoundException if address does not exist', async () => {
      const missingPrisma = buildMockPrisma();
      missingPrisma.address.findUnique.mockResolvedValue(null);
      // @ts-ignore
      service = new AddressesService(missingPrisma);
      await expect(service.remove('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('touchActivity', () => {
    it('updates lastActivityAt', async () => {
      await service.touchActivity('address-uuid');
      expect(prisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'address-uuid' },
          data: { lastActivityAt: expect.any(Date) },
        }),
      );
    });
  });
});
