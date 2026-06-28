import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { Permission, UserRole } from './permissions.map';

const mockReflector = (permissions: Permission[] | undefined) =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(permissions),
  }) as unknown as Reflector;

const buildContext = (role: string | undefined) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: role !== undefined ? { role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  const service = new PermissionsService();

  it('passes when no permissions are required', () => {
    const guard = new PermissionsGuard(mockReflector(undefined), service);
    expect(guard.canActivate(buildContext(UserRole.USER))).toBe(true);
  });

  it('passes when USER has the required permission', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ]),
      service,
    );
    expect(guard.canActivate(buildContext(UserRole.USER))).toBe(true);
  });

  it('throws ForbiddenException when USER lacks admin permission', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_KYC]),
      service,
    );
    expect(() => guard.canActivate(buildContext(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });

  it('passes when ADMIN has any permission', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_ROLE, Permission.WALLET_CREATE]),
      service,
    );
    expect(guard.canActivate(buildContext(UserRole.ADMIN))).toBe(true);
  });

  it('throws ForbiddenException when user has no role', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ]),
      service,
    );
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('error message lists the required permissions', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_KYC]),
      service,
    );
    try {
      guard.canActivate(buildContext(UserRole.USER));
    } catch (err) {
      expect((err as ForbiddenException).message).toContain(
        Permission.ADMIN_USERS_KYC,
      );
    }
  });
});
