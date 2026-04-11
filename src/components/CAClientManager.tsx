import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, ArrowRightLeft, Building2, Check } from 'lucide-react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';

interface ClientOrg {
  id: string;
  name: string;
  slug: string;
  gstin: string | null;
  is_active: boolean;
}

const CAClientManager: React.FC = () => {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const [clients, setClients] = useState<ClientOrg[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(
    sessionStorage.getItem('ca-active-client') || null
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    if (!user?.id || !isReady) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('ca_client_assignments')
        .select('*, organizations:client_organization_id(id, name, slug, gstin, is_active)')
        .eq('ca_user_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      const clientOrgs = (data || [])
        .map((d: any) => d.organizations)
        .filter(Boolean);

      setClients(clientOrgs);
    } catch (err) {
      console.error('Error fetching CA clients:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isReady, supabase]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const switchClient = (clientId: string) => {
    setActiveClientId(clientId);
    sessionStorage.setItem('ca-active-client', clientId);
    window.location.reload(); // Reload to refresh all data with new org context
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Client Assignments</h3>
          <p className="text-muted-foreground max-w-sm">
            You haven't been assigned to any client organizations yet. Contact the organization admin to get access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Switch Client Organization
          </CardTitle>
          <CardDescription>
            Select a client to view and manage their data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => switchClient(client.id)}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors text-left w-full ${
                  activeClientId === client.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{client.name}</p>
                    {client.gstin && (
                      <p className="text-sm text-muted-foreground">GSTIN: {client.gstin}</p>
                    )}
                  </div>
                </div>
                {activeClientId === client.id ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Check className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Button variant="ghost" size="sm">
                    Switch
                  </Button>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CAClientManager;
