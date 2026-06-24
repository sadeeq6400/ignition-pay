import {
  assertStrongPassword,
  PASSWORD_POLICY_MESSAGE,
} from './password-policy';

const context = {
  email: 'alex.river@example.com',
  walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDE',
  displayName: 'Alex River',
  name: 'Alex River',
};

describe('assertStrongPassword', () => {
  it('accepts passwords that satisfy the balanced policy', () => {
    expect(() => assertStrongPassword('ValidPassw0rd!', context)).not.toThrow();
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(() => assertStrongPassword('short1!A', context)).toThrow(
      PASSWORD_POLICY_MESSAGE,
    );
  });

  it('rejects passwords missing required character categories', () => {
    expect(() => assertStrongPassword('longpassword123!', context)).toThrow(
      PASSWORD_POLICY_MESSAGE,
    );
  });

  it('rejects passwords containing personal account fragments', () => {
    expect(() => assertStrongPassword('AlexRiver2026!', context)).toThrow(
      PASSWORD_POLICY_MESSAGE,
    );
  });

  it('rejects passwords containing wallet address fragments', () => {
    expect(() => assertStrongPassword('SafeGBKXNR2026!', context)).toThrow(
      PASSWORD_POLICY_MESSAGE,
    );
  });
});
