import "server-only";
import type { UserRole } from "./types";

/**
 * Enterprise Auth & RBAC Manager
 *
 * Defines granular role permissions and session context verification.
 */

export interface AuthSession {
  userId: string;
  businessId: string;
  email: string;
  name: string;
  role: UserRole;
  isDemo: boolean;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  marketer: 2,
  viewer: 1,
};

/** Checks if a user's role satisfies the required minimum role level. */
export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

/** Action permissions matrix. */
export const PERMISSIONS = {
  canApproveRun: (role: UserRole) => hasMinRole(role, "marketer"),
  canCreateContent: (role: UserRole) => hasMinRole(role, "marketer"),
  canPublishContent: (role: UserRole) => hasMinRole(role, "marketer"),
  canManageKeys: (role: UserRole) => hasMinRole(role, "admin"),
  canManageSettings: (role: UserRole) => hasMinRole(role, "admin"),
  canManageBilling: (role: UserRole) => hasMinRole(role, "owner"),
};

/** Asserts permission or throws a readable HTTP 403 authorization error. */
export function requirePermission(role: UserRole, check: (r: UserRole) => boolean, actionName: string): void {
  if (!check(role)) {
    throw new Error(`Forbidden: Role '${role}' is not authorized to perform '${actionName}'.`);
  }
}
