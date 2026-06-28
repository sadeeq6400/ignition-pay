import { PermissionsService } from './permissions.service';
import { Permission, UserRole } from './permissions.map';

describe('PermissionsService', () => {
  const service = new PermissionsService();

  describe('getUserPermissions', () => {
    it('returns permissions for USER role', () => {
      const perms = service.getUserPermissions(UserRole.USER);
      expect(perms).toContain(Permission.WALLET_READ);
      expect(perms).toContain(Permission.USER_READ_OWN);
      expect(perms).not.toContain(Permission.ADMIN_USERS_KYC);
    });

    it('returns all permissions for ADMIN role', () => {
      const perms = service.getUserPermissions(UserRole.ADMIN);
      expect(perms).toContain(Permission.ADMIN_USERS_KYC);
      expect(perms).toContain(Permission.ADMIN_USERS_ROLE);
      expect(perms).toContain(Permission.WALLET_CREATE);
    });

    it('CREATOR can create campaigns, USER cannot', () => {
      expect(service.getUserPermissions(UserRole.CREATOR)).toContain(
        Permission.CAMPAIGN_CREATE,
      );
      expect(service.getUserPermissions(UserRole.USER)).not.toContain(
        Permission.CAMPAIGN_CREATE,
      );
    });

    it('returns empty array for unknown role', () => {
      expect(service.getUserPermissions('UNKNOWN')).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('returns true when role has permission', () => {
      expect(service.hasPermission(UserRole.ADMIN, Permission.ADMIN_USERS_KYC)).toBe(true);
    });

    it('returns false when role lacks permission', () => {
      expect(service.hasPermission(UserRole.USER, Permission.ADMIN_USERS_KYC)).toBe(false);
    });
  });
});
