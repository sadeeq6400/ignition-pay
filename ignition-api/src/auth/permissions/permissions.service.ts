import { Injectable } from '@nestjs/common';
import { Permission, ROLE_PERMISSIONS } from './permissions.map';

@Injectable()
export class PermissionsService {
  getUserPermissions(role: string): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  hasPermission(role: string, permission: Permission): boolean {
    return this.getUserPermissions(role).includes(permission);
  }
}
