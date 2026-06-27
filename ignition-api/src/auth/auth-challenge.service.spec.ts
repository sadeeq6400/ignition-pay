import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import { AuthChallengeService } from './auth-challenge.service';

jest.mock('keyv', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

interface MockKeyv {
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
}

describe('AuthChallengeService', () => {
  let service: AuthChallengeService;
  let cache: MockKeyv;
  let config: ConfigService;

  const walletAddress = 'GABC1234567890ABCDEF1234567890ABCDEF12345';

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    config = new ConfigService({
      AUTH_CHALLENGE_TTL_MS: '300000',
    });

    service = new AuthChallengeService(cache as unknown as Keyv, config);
  });

  it('stores a newly issued challenge and consumes it once', async () => {
    cache.set.mockResolvedValue('OK');
    cache.get.mockResolvedValue('stored-challenge');
    cache.delete.mockResolvedValue(true);

    const challenge = await service.issueChallenge(walletAddress);

    expect(challenge).toContain('stellaraid:login:');
    expect(cache.set).toHaveBeenCalledWith(
      `auth:challenge:${walletAddress}`,
      challenge,
      300000,
    );

    await service.consumeChallenge(walletAddress, challenge);

    expect(cache.delete).toHaveBeenCalledWith(
      `auth:challenge:${walletAddress}`,
    );
  });

  it('rejects a replayed or expired challenge', async () => {
    cache.get.mockResolvedValue(undefined);

    await expect(
      service.consumeChallenge(walletAddress, 'expired-challenge'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
