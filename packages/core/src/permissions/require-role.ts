import type { PermissionContext, Role } from '../types';

export class ForbiddenError extends Error {}

export function requireRole(...allowed: Role[]) {
  return (ctx: PermissionContext): void => {
    if (!allowed.includes(ctx.role)) {
      throw new ForbiddenError(`Requires role: ${allowed.join(' or ')}`);
    }
  };
}
