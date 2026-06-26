import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import Keyv from 'keyv';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('keyv', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    })),
  };
});

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

interface PasswordHistoryRecord {
  id: string;
  passwordHash: string;
}

interface PrismaMock {
  user: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  passwordHistory: {
    findMany: jest.Mock<Promise<PasswordHistoryRecord[]>, []>;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock<
    Promise<unknown>,
    [(tx: PrismaMock) => Promise<unknown>]
  >;
}

const baseUser = {
  id: 'user-1',
  walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
  email: 'alex.river@example.com',
  displayName: 'Alex River',
  name: 'Alex River',
  passwordHash: null as string | null,
  role: 'USER',
  loginAttempts: 0,
  lockedUntil: null,
};

describe('UsersService password security', () => {
  let prisma: PrismaMock;
  let service: UsersService;
  let cache: Keyv;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      passwordHistory: {
        findMany: jest.fn<Promise<PasswordHistoryRecord[]>, []>(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as Keyv;

    bcryptMock.compare.mockReset();
    bcryptMock.hash.mockReset();
    bcryptMock.hash.mockResolvedValue('hash:new-password' as never);

    service = new UsersService(
      prisma as unknown as PrismaService,
      { sign: jest.fn() } as unknown as JwtService,
      new ConfigService({ PASSWORD_BCRYPT_ROUNDS: '12' }),
      cache,
    );
  });

  it('sets a first password, stores history, and returns success', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.passwordHistory.findMany.mockResolvedValue([]);

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'ValidPassw0rd!',
      }),
    ).resolves.toEqual({ success: true, message: 'Password set successfully' });

    expect(bcryptMock.hash).toHaveBeenCalledWith('ValidPassw0rd!', 12);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { passwordHash: 'hash:new-password' },
    });
    expect(prisma.passwordHistory.create).toHaveBeenCalledWith({
      data: {
        userId: baseUser.id,
        passwordHash: 'hash:new-password',
      },
    });
  });

  it('rejects setup when a password already exists', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:existing',
    });

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'ValidPassw0rd!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects weak setup passwords before hashing', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'weak',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('changes password when current password is valid', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:current',
    });
    prisma.passwordHistory.findMany.mockResolvedValue([
      { id: 'history-1', passwordHash: 'hash:current' },
    ]);
    bcryptMock.compare.mockResolvedValueOnce(true as never);
    bcryptMock.compare.mockResolvedValueOnce(false as never);

    await expect(
      service.changePassword({
        userId: baseUser.id,
        currentPassword: 'CurrentPassw0rd!',
        newPassword: 'FreshSecure2026!',
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Password changed successfully',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { passwordHash: 'hash:new-password' },
    });
  });

  it('rejects change when current password is invalid', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:current',
    });
    bcryptMock.compare.mockResolvedValueOnce(false as never);

    await expect(
      service.changePassword({
        userId: baseUser.id,
        currentPassword: 'WrongPassw0rd!',
        newPassword: 'FreshSecure2026!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('rejects reuse of any of the last five passwords', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:current',
    });
    prisma.passwordHistory.findMany.mockResolvedValue([
      { id: 'history-1', passwordHash: 'hash:old-1' },
      { id: 'history-2', passwordHash: 'hash:old-2' },
    ]);
    bcryptMock.compare
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never);

    await expect(
      service.changePassword({
        userId: baseUser.id,
        currentPassword: 'CurrentPassw0rd!',
        newPassword: 'ReuseSecure2026!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('prunes password history to the five newest records', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.passwordHistory.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'delete-1', passwordHash: 'hash:6' }]);

    await service.setupPassword({
      userId: baseUser.id,
      password: 'ValidPassw0rd!',
    });

    expect(prisma.passwordHistory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['delete-1'] },
      },
    });
  });
});

describe('UsersService login', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let cache: { set: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    cache = {
      set: jest.fn(),
    };

    service = new UsersService(
      prisma as unknown as PrismaService,
      {
        sign: jest.fn().mockReturnValue('signed-jwt-token'),
      } as unknown as JwtService,
      new ConfigService({
        JWT_SECRET: 'test-secret',
        REFRESH_TOKEN_SECRET: 'test-refresh-secret',
      }),
      cache as unknown as Keyv,
    );
  });

  it('stores refresh token in Redis on successful login', async () => {
    const mockUser = {
      id: 'user-123',
      walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      role: 'USER',
      loginAttempts: 0,
      lockedUntil: null,
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    bcryptMock.compare.mockResolvedValueOnce(true as never);

    await service.login('test@example.com', 'password123');

    expect(cache.set).toHaveBeenCalledWith(
      `refresh:${mockUser.walletAddress}`,
      expect.any(String),
      7 * 24 * 60 * 60 * 1000,
    );
  });
});
