export type Role = 'student' | 'parent' | 'teacher' | 'admin';

export interface PermissionContext {
  /** domain users.id, not the better-auth authUser id */
  userId: string;
  schoolId: string;
  role: Role;
  membershipId: string;
}
