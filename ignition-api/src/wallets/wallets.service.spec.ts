import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';

jest.mock('@stellar/stellar-sdk', () => {
  return {
    __esModule: true,
    default: {
      Server: jest.fn().mockImplementation((url: string) => ({
        accounts() {
          return {
            accountId: () => ({ call: async () => ({ balances: [ { asset_type: 'native', balance: '100.0' } ] }) }),
          };
        },
        payments() {
          return {
            forAccount: () => ({ order: () => ({ limit: () => ({ call: async () => ({ records: [ { id: '1', type: 'payment', from: 'A', to: 'B', amount: '50', asset_type: 'native', created_at: new Date().toISOString() } ] }) }) }) }),
          };
        },
      })),
    },
    StrKey: {
      isValidEd25519PublicKey: (s: string) => !!s && s.startsWith('G'),
    },
  };
});

import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let cache: Keyv;

  beforeEach(() => {
    const config = new ConfigService({ STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org', BALANCE_CACHE_TTL_SEC: '1' });
    cache = new Keyv();
    // @ts-ignore
    service = new WalletsService(config, cache);
  });

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
