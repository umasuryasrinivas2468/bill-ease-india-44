// Authorization System Exports
export { useAuthorization, usePermission, usePermissions } from '@/hooks/useAuthorization';
export type { AppRole, UserRole, Permission, AuthorizationState } from '@/hooks/useAuthorization';

export { useConcurrentUserManagement, useSessionExpiry } from '@/hooks/useConcurrentUserManagement';
export type { SessionInfo, ConcurrentUser } from '@/hooks/useConcurrentUserManagement';

export { useCAClient, useCAClientState } from '@/hooks/useCAClientState';
export type { CAClientAccess, CAClientState } from '@/hooks/useCAClientState';

export { useCAClients } from '@/hooks/useCAClients';
export type { CAClientAssignment, CAClientsState } from '@/hooks/useCAClients';

export { useAuditLog } from '@/hooks/useAuditLog';
export type { AuditLog, AuditLogEntry, AuditSeverity } from '@/hooks/useAuditLog';

// Components
export { OrganizationProvider } from './OrganizationProvider';
export { OrganizationSwitcher } from './OrganizationSwitcher';
export { CreateOrganizationDialog } from './CreateOrganizationDialog';
export { OrganizationSettingsDialog } from './OrganizationSettingsDialog';
export { SessionExpiryWarning } from './SessionExpiryWarning';
export { CAClientSwitcher } from './CAClientSwitcher';
export { PermissionGate, AccessDenied } from './PermissionGate';
export { withPermission, createPermissionRestrictedRoute } from './withPermission';
export { AuditLogViewer } from './AuditLogViewer';
