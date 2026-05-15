export type Role = "superadmin" | "admin" | "gestor" | "user";

export type Permission =
  | "workspace:create"
  | "workspace:delete"
  | "workspace:edit"
  | "member:invite_admin"
  | "member:invite_gestor"
  | "member:invite_member"
  | "member:manage"
  | "settings:manage"
  | "reports:view"
  | "admin:access";

export const ALL_PERMISSIONS: Permission[] = [
  "workspace:create",
  "workspace:delete",
  "workspace:edit",
  "member:invite_admin",
  "member:invite_gestor",
  "member:invite_member",
  "member:manage",
  "settings:manage",
  "reports:view",
  "admin:access",
];

/**
 * Matriz de permissões por papel.
 * - superadmin: acesso total
 * - admin:    sem delete de workspace
 * - gestor:   sem delete e sem gerenciar membros
 * - user:     apenas convidar membro e gerenciar settings
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  superadmin: ALL_PERMISSIONS,
  admin: [
    "workspace:create",
    "workspace:edit",
    "member:invite_admin",
    "member:invite_gestor",
    "member:invite_member",
    "member:manage",
    "settings:manage",
    "reports:view",
    "admin:access",
  ],
  gestor: [
    "workspace:create",
    "workspace:edit",
    "member:invite_member",
    "settings:manage",
  ],
  user: [
    "member:invite_member",
    "settings:manage",
  ],
} as const;

/** Verifica se um papel possui uma permissão específica. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Verifica se um papel possui TODAS as permissões informadas. */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  const allowed = new Set(ROLE_PERMISSIONS[role]);
  return permissions.every((p) => allowed.has(p));
}

/** Verifica se um papel possui PELO MENOS UMA das permissões informadas. */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  const allowed = new Set(ROLE_PERMISSIONS[role]);
  return permissions.some((p) => allowed.has(p));
}
