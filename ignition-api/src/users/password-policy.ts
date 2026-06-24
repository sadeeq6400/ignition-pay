import { BadRequestException } from '@nestjs/common';

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters without using account details';

interface PasswordContext {
  email?: string | null;
  walletAddress?: string | null;
  displayName?: string | null;
  name?: string | null;
}

export function assertStrongPassword(
  password: string,
  context: PasswordContext,
): void {
  if (
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password) ||
    containsAccountFragment(password, context)
  ) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}

function containsAccountFragment(
  password: string,
  context: PasswordContext,
): boolean {
  const normalizedPassword = normalize(password);
  const fragments = [
    context.email?.split('@')[0],
    context.displayName,
    context.name,
    context.walletAddress?.slice(0, 6),
    context.walletAddress?.slice(-6),
  ]
    .flatMap((value) => fragmentVariants(value))
    .filter((value) => value.length >= 4);

  return fragments.some((fragment) => normalizedPassword.includes(fragment));
}

function fragmentVariants(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  const normalized = normalize(value);
  return [
    normalized,
    ...normalized.split(/[^a-z0-9]+/).filter(Boolean),
  ];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
