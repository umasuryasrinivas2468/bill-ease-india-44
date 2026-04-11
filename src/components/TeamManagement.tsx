import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Users, UserPlus, Shield, Trash2, Clock, Copy, Link2, Building2, CheckCircle } from 'lucide-react';
import { useTeamManagement, TeamRole } from '@/hooks/useTeamManagement';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useToast } from '@/hooks/use-toast';

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  org_admin: 'bg-destructive text-destructive-foreground',
  manager: 'bg-primary text-primary-foreground',
  accountant: 'bg-accent text-accent-foreground',
  viewer: 'bg-muted text-muted-foreground',
};

const TeamManagement: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    members,
    pendingInvites,
    isLoading,
    isAdmin,
    activeOrgId,
    userOrg,
    inviteMember,
    updateMemberRole,
    removeMember,
    revokeInvite,
    createOrganization,
  } = useTeamManagement();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Create org state
  const [orgName, setOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setIsInviting(true);
    setGeneratedLink(null);
    const link = await inviteMember(inviteEmail, inviteRole);
    if (link) {
      setGeneratedLink(link);
      setInviteEmail('');
      setInviteRole('viewer');
      // Auto-copy
      try {
        await navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
        toast({ title: 'Invite link generated & copied!', description: 'Share this link with the team member.' });
      } catch {
        toast({ title: 'Invite link generated', description: 'Click the copy button to copy the link.' });
      }
    }
    setIsInviting(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
      toast({ title: 'Copied!', description: 'Link copied to clipboard.' });
    } catch {
      toast({ title: 'Link', description: text });
    }
  };

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/accept-invite?token=${token}`;
    await copyToClipboard(link);
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return;
    setIsCreatingOrg(true);
    await createOrganization(orgName.trim());
    setOrgName('');
    setIsCreatingOrg(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // No organization - show create org prompt
  if (!activeOrgId) {
    return (
      <Card>
        <CardHeader className="text-center">
          <Building2 className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
          <CardTitle>Create Your Organization</CardTitle>
          <CardDescription>
            Set up an organization to start inviting team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              placeholder="Organization name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
            />
            <Button onClick={handleCreateOrg} disabled={!orgName.trim() || isCreatingOrg}>
              {isCreatingOrg ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Org Info */}
      {userOrg && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>Organization: <strong className="text-foreground">{userOrg.name}</strong></span>
        </div>
      )}

      {/* Invite Section */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite Team Member
            </CardTitle>
            <CardDescription>
              Generate a shareable invite link to add new members
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="invite-email" className="sr-only">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TeamRole)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={!inviteEmail || isInviting}>
                <Link2 className="h-4 w-4 mr-2" />
                {isInviting ? 'Generating...' : 'Generate Link'}
              </Button>
            </div>

            {/* Generated Link Display */}
            {generatedLink && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <CheckCircle className="h-4 w-4" />
                  Invite link generated! Share it with the team member.
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={generatedLink}
                    className="font-mono text-xs bg-background"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(generatedLink)}
                    className="shrink-0"
                  >
                    {copiedLink ? (
                      <><CheckCircle className="h-4 w-4 mr-1" /> Copied</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-1" /> Copy</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link expires in 7 days. The invitee must sign in or create an account to accept.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Invitations ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => {
                  const daysLeft = Math.ceil(
                    (new Date(invite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ROLE_LABELS[invite.role] || invite.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={
                          daysLeft <= 2 ? 'text-destructive' :
                          daysLeft <= 5 ? 'text-yellow-600' : 'text-muted-foreground'
                        }>
                          {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                        </span>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyInviteLink(invite.token)}
                          title="Copy invite link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeInvite(invite.id)}
                            className="text-destructive hover:text-destructive"
                            title="Revoke invitation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members ({members.length})
          </CardTitle>
          <CardDescription>
            Manage your organization's team members and their roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{member.full_name || 'Unnamed'}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin && member.user_id !== user?.id ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          updateMemberRole(member.id, member.user_id, v as TeamRole)
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="org_admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="accountant">Accountant</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={ROLE_COLORS[member.role] || ''}>
                        <Shield className="h-3 w-3 mr-1" />
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(member.joined_at).toLocaleDateString()}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {member.user_id !== user?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove {member.full_name || member.email} from the organization. They will lose access to all shared data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMember(member.id, member.user_id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No team members yet. Invite someone to get started!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamManagement;
