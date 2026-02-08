import React, { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuthorization } from '@/hooks/useAuthorization';
import {
  useInviteUser,
  useOrganizationRoles,
  useAuditLogs,
} from '@/hooks/useOrganizationManagement';
import { useConcurrentUserManagement } from '@/hooks/useConcurrentUserManagement';
import { useAuth } from '@/components/ClerkAuthProvider';
import { supabase } from '@/lib/supabaseClient';
import organizationService from '@/services/organizationService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Users,
  Shield,
  Activity,
  LogOut,
  Loader2,
  FileText,
  CheckCircle2,
  Copy,
  Trash2,
  Clock,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface OrganizationSettingsDialogProps {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['org_admin', 'manager', 'accountant', 'viewer']),
});

type InviteUserFormData = z.infer<typeof inviteUserSchema>;

/**
 * Organization Settings Dialog
 * Allows org_admin users to manage users, roles, and view audit logs
 */
export const OrganizationSettingsDialog: React.FC<OrganizationSettingsDialogProps> = ({
  organizationId,
  open,
  onOpenChange,
}) => {
  const { currentOrganization } = useOrganization();
  const { hasRole } = useAuthorization();
  const { user: currentUser } = useAuth();
  const { inviteUser, isLoading: inviting, error: inviteError } = useInviteUser();
  const { removeUser, updateUserRole, isLoading: rolesLoading } = useOrganizationRoles();
  const { logs: auditLogs, fetchAuditLogs } = useAuditLogs(organizationId);
  const {
    concurrentUsers,
    sessions,
    revokeSession,
    revokeOtherSessions,
  } = useConcurrentUserManagement(organizationId);

  const [organizationUsers, setOrganizationUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitationLink, setInvitationLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const form = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      role: 'accountant',
    },
  });

  // Check if current user is org_admin for this specific organization
  useEffect(() => {
    const checkUserRole = async () => {
      if (!organizationId || !currentUser) {
        setCheckingRole(false);
        return;
      }

      try {
        setCheckingRole(true);
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', currentUser.id)
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .single();

        if (error) {
          console.error('Failed to check user role:', error);
          setUserRole(null);
        } else {
          setUserRole(data?.role || null);
        }
      } catch (err) {
        console.error('Error checking user role:', err);
        setUserRole(null);
      } finally {
        setCheckingRole(false);
      }
    };

    checkUserRole();
  }, [organizationId, currentUser, open]);

  // Fetch organization users
  useEffect(() => {
    const fetchOrganizationUsers = async () => {
      if (!organizationId) return;
      
      try {
        setLoadingUsers(true);
        const { data, error } = await supabase
          .from('user_roles')
          .select(`
            id,
            user_id,
            role,
            created_at,
            is_active
          `)
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setOrganizationUsers(data || []);
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchOrganizationUsers();
  }, [organizationId, open]);

  // Fetch pending invitations
  useEffect(() => {
    const fetchPendingInvitations = async () => {
      if (!organizationId) return;
      
      try {
        setLoadingInvitations(true);
        const invitations = await organizationService.getPendingInvitations(organizationId);
        setPendingInvitations(invitations || []);
      } catch (err) {
        console.error('Failed to fetch invitations:', err);
      } finally {
        setLoadingInvitations(false);
      }
    };

    fetchPendingInvitations();
  }, [organizationId, open]);

  // Fetch audit logs on mount
  useEffect(() => {
    if (organizationId) {
      fetchAuditLogs(organizationId);
    }
  }, [organizationId, fetchAuditLogs]);

  // Check if user is org admin for this specific organization
  const isOrgAdmin = userRole === 'org_admin';

  // Show loading while checking role
  if (checkingRole) {
    return (
      <Dialog open={open} onOpenChange={() => {}} modal={true}>
        <DialogContent 
          className="select-none"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Loading settings...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!isOrgAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access Denied</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only organization administrators can access these settings.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  const handleInviteUser = async (data: InviteUserFormData) => {
    try {
      const result = await inviteUser(data.email, data.role, organizationId);
      
      // Display the invitation link
      if (result) {
        setInvitationLink({
          link: result.invitationLink,
          expiresAt: result.expiresAt,
        });
        setCopiedLink(false);
      }
      
      form.reset();
      
      // Refresh invitations list
      const invitations = await organizationService.getPendingInvitations(organizationId);
      setPendingInvitations(invitations || []);
    } catch (error) {
      console.error('Failed to invite user:', error);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to remove this user?')) {
      try {
        await removeUser(userId, organizationId);
      } catch (error) {
        console.error('Failed to remove user:', error);
      }
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (window.confirm('Are you sure you want to revoke this invitation?')) {
      try {
        setRevoking(invitationId);
        await organizationService.revokeInvitation(invitationId, organizationId, currentUser?.id || '');
        
        // Refresh invitations list
        const invitations = await organizationService.getPendingInvitations(organizationId);
        setPendingInvitations(invitations || []);
      } catch (error) {
        console.error('Failed to revoke invitation:', error);
      } finally {
        setRevoking(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-3xl max-h-[80vh] overflow-y-auto"
        onInteractOutside={(e) => {
          // Prevent closing when clicking outside
          // User must click the X button or press Escape to close
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Organization Settings</DialogTitle>
          <DialogDescription>
            Manage users, roles, and view audit logs for {currentOrganization?.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Roles</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Sessions</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4 mt-4">
            {inviteError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleInviteUser)} className="space-y-3 p-3 border rounded">
                <h3 className="font-semibold">Invite New User</h3>
                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="user@example.com"
                            {...field}
                            disabled={inviting}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Role</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={inviting}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="org_admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="accountant">Accountant</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      disabled={inviting}
                      className="w-full"
                      size="sm"
                    >
                      {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Invite
                    </Button>
                  </div>
                </div>
              </form>
            </Form>

            {/* Invitation Link Display */}
            {invitationLink && (
              <div className="border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4 rounded space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <h4 className="font-semibold text-green-900 dark:text-green-100">Invitation Created!</h4>
                </div>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Share this link with the accountant. It will expire in 7 days.
                </p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={invitationLink.link}
                      readOnly
                      className="bg-white dark:bg-slate-950 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(invitationLink.link)}
                      className={cn(
                        'transition-colors',
                        copiedLink && 'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700'
                      )}
                    >
                      <Copy className="h-4 w-4" />
                      {copiedLink ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Expires: {format(new Date(invitationLink.expiresAt), 'MMM dd, yyyy')}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setInvitationLink(null)}
                  className="text-xs"
                >
                  Dismiss
                </Button>
              </div>
            )}

            <div className="border rounded overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingUsers ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : organizationUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                        No users in this organization yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    organizationUsers.map((userRole) => (
                      <TableRow key={userRole.id}>
                        <TableCell className="text-xs font-mono">
                          {userRole.user_id.substring(0, 12)}...
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          <Badge variant="outline">{userRole.role.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(userRole.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {userRole.user_id !== currentUser?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveUser(userRole.user_id)}
                              disabled={rolesLoading}
                              className="h-7 w-7 p-0 text-xs"
                            >
                              ×
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pending Invitations Section */}
            {pendingInvitations.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pending Invitations ({pendingInvitations.length})
                </h3>
                <div className="border rounded overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Invited</TableHead>
                        <TableHead>Expires In</TableHead>
                        <TableHead className="w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingInvitations.map((invitation) => {
                        const expiresAt = new Date(invitation.expires_at);
                        const daysLeft = differenceInDays(expiresAt, new Date());
                        const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://billeaseindia.com';
                        const inviteLink = `${appUrl}/signup?token=${invitation.token}&email=${encodeURIComponent(invitation.email)}`;

                        return (
                          <TableRow key={invitation.id}>
                            <TableCell className="text-xs font-mono">
                              {invitation.email}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              <Badge variant="secondary">{invitation.role.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {format(new Date(invitation.created_at), 'MMM dd, yyyy')}
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className={cn(
                                'px-2 py-1 rounded bg-opacity-10',
                                daysLeft <= 2
                                  ? 'bg-red-500 text-red-700 dark:text-red-300 font-semibold'
                                  : daysLeft <= 5
                                  ? 'bg-yellow-500 text-yellow-700 dark:text-yellow-300'
                                  : 'bg-green-500 text-green-700 dark:text-green-300'
                              )}>
                                {daysLeft} days
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyLink(inviteLink)}
                                  title="Copy invitation link"
                                  className="h-7 w-7 p-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevokeInvitation(invitation.id)}
                                  disabled={revoking === invitation.id}
                                  title="Revoke invitation"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  {revoking === invitation.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4 mt-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <strong>Role Hierarchy:</strong> Super Admin &gt; Org Admin &gt; CA &gt; Manager &gt; Accountant &gt; Viewer
              </p>
            </div>

            <div className="grid gap-4">
              {[
                {
                  role: 'org_admin',
                  name: 'Organization Admin',
                  description: 'Full access to organization settings, user management, and all features',
                  permissions: [
                    'Manage users',
                    'Assign roles',
                    'Access all reports',
                    'Configure settings',
                    'View audit logs',
                  ],
                },
                {
                  role: 'manager',
                  name: 'Manager',
                  description: 'Operational permissions to create and manage documents',
                  permissions: [
                    'Create invoices',
                    'Manage expenses',
                    'Approve expenses',
                    'View reports',
                  ],
                },
                {
                  role: 'accountant',
                  name: 'Accountant',
                  description: 'Standard accounting operations',
                  permissions: [
                    'Create invoices',
                    'Manage expenses',
                    'Create journal entries',
                  ],
                },
                {
                  role: 'viewer',
                  name: 'Viewer',
                  description: 'Read-only access to organization data',
                  permissions: ['View invoices', 'View reports', 'View dashboard'],
                },
              ].map((roleInfo) => (
                <div key={roleInfo.role} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{roleInfo.name}</h4>
                      <p className="text-xs text-muted-foreground">{roleInfo.description}</p>
                    </div>
                    <Badge variant="outline">{roleInfo.role}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {roleInfo.permissions.map((perm) => (
                      <Badge key={perm} variant="secondary" className="text-xs">
                        ✓ {perm}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold mb-2">Concurrent Users ({concurrentUsers.length})</h3>
                <div className="border rounded overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Sessions</TableHead>
                        <TableHead>Last Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {concurrentUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                            No active sessions
                          </TableCell>
                        </TableRow>
                      ) : (
                        concurrentUsers.map((user) => (
                          <TableRow key={user.userId}>
                            <TableCell className="font-mono text-xs">
                              {user.userId.substring(0, 12)}...
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{user.sessionCount}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(user.lastActive, 'MMM dd, HH:mm:ss')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Your Sessions ({sessions.length})</h3>
                <div className="space-y-2">
                  {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active sessions</p>
                  ) : (
                    <>
                      {sessions.map((session: any) => {
                        const sessionToken = session.session_token || session.sessionToken;
                        const createdAt = session.created_at || session.createdAt;
                        const lastActivity = session.last_activity_at || session.lastActivityAt;
                        
                        return (
                          <div
                            key={session.id}
                            className="flex items-center justify-between p-2 border rounded"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-mono">
                                {sessionToken && sessionToken.substring ? sessionToken.substring(0, 12) : 'N/A'}...
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Created: {createdAt ? format(new Date(createdAt), 'MMM dd, HH:mm') : 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Last Activity: {lastActivity ? format(new Date(lastActivity), 'MMM dd, HH:mm') : 'Unknown'}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeSession(session.id)}
                              disabled={rolesLoading}
                            >
                              <LogOut className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={revokeOtherSessions}
                        disabled={rolesLoading || sessions.length <= 1}
                      >
                        Revoke Other Sessions
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Audit Tab */}
          <TabsContent value="audit" className="space-y-4 mt-4">
            <div className="border rounded overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Severity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                        No audit logs
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLogs.slice(0, 10).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                        </TableCell>
                        <TableCell className="text-sm">{log.action}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {log.user_id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.severity === 'critical'
                                ? 'destructive'
                                : log.severity === 'warning'
                                  ? 'secondary'
                                  : 'outline'
                            }
                            className="text-xs"
                          >
                            {log.severity}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default OrganizationSettingsDialog;
