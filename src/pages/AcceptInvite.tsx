import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, UserPlus } from 'lucide-react';

const AcceptInvite: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { supabase, isReady } = useSupabase();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login_required'>('loading');
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (authLoading || !isReady) return;

    if (!token) {
      setStatus('error');
      setMessage('Invalid invitation link. No token provided.');
      return;
    }

    if (!user) {
      setStatus('login_required');
      return;
    }

    acceptInvitation();
  }, [token, user, authLoading, isReady]);

  const acceptInvitation = async () => {
    if (!token || !user) return;

    try {
      setStatus('loading');

      // Find the invitation
      const { data: invite, error: findError } = await supabase
        .from('invitations')
        .select('*, organizations(name)')
        .eq('token', token)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (findError || !invite) {
        setStatus('error');
        setMessage('This invitation is invalid, expired, or has already been used.');
        return;
      }

      setOrgName((invite as any).organizations?.name || 'the organization');

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('user_organizations')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', invite.organization_id)
        .eq('is_active', true)
        .single();

      if (existingMember) {
        setStatus('error');
        setMessage('You are already a member of this organization.');
        return;
      }

      // Add user to organization
      const { error: orgError } = await supabase.from('user_organizations').insert({
        user_id: user.id,
        organization_id: invite.organization_id,
        invited_by: invite.invited_by,
        is_active: true,
      });

      if (orgError) throw orgError;

      // Assign role
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: user.id,
        role: invite.role,
        organization_id: invite.organization_id,
        granted_by: invite.invited_by,
        is_active: true,
      });

      if (roleError) throw roleError;

      // Mark invitation as accepted
      await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      setStatus('success');
      setMessage(`You've been added to ${orgName} as ${invite.role}.`);
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setStatus('error');
      setMessage('An error occurred while accepting the invitation. Please try again.');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserPlus className="h-12 w-12 mx-auto mb-2 text-primary" />
          <CardTitle>Team Invitation</CardTitle>
          <CardDescription>
            {orgName ? `You've been invited to join ${orgName}` : 'Accept your team invitation'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Processing your invitation...</p>
            </div>
          )}

          {status === 'login_required' && (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Please sign in or create an account to accept this invitation.
                </AlertDescription>
              </Alert>
              <Button
                className="w-full"
                onClick={() => navigate(`/login?redirect=/accept-invite?token=${token}`)}
              >
                Sign In to Accept
              </Button>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="text-center font-medium">{message}</p>
              </div>
              <Button className="w-full" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-center text-muted-foreground">{message}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
