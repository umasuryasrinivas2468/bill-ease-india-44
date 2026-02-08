import React, { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuthorization } from '@/hooks/useAuthorization';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  ChevronDown, 
  Check, 
  Plus, 
  Settings,
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CreateOrganizationDialog from './CreateOrganizationDialog';
import OrganizationSettingsDialog from './OrganizationSettingsDialog';

interface OrganizationSwitcherProps {
  className?: string;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  className,
}) => {
  const { 
    organizations, 
    currentOrganization, 
    isLoading, 
    switchOrganization,
    refetch
  } = useOrganization();
  const { hasRole } = useAuthorization();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [settingsOrgId, setSettingsOrgId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Button variant="ghost" disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </Button>
    );
  }

  if (organizations.length === 0) {
    return (
      <>
        <Button 
          variant="outline" 
          onClick={() => setShowCreateDialog(true)} 
          className={className}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Organization
        </Button>
        <CreateOrganizationDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSuccess={() => {
            refetch();
          }}
        />
      </>
    );
  }

  const handleSwitch = async (orgId: string) => {
    await switchOrganization(orgId);
    setIsOpen(false);
    // Optionally reload page to refresh all data for new org context
    window.location.reload();
  };

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className={cn("justify-between min-w-[200px]", className)}
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {currentOrganization?.name || 'Select Organization'}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {organizations.map((userOrg) => {
            const org = userOrg.organization;
            if (!org) return null;
            
            const isActive = currentOrganization?.id === org.id;
            
            return (
              <DropdownMenuItem
                key={org.id}
                className={cn(
                  "flex items-center justify-between cursor-pointer",
                  isActive && "bg-accent"
                )}
                onClick={() => handleSwitch(org.id)}
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <div className="flex flex-col truncate">
                    <span className="truncate font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {userOrg.role.replace('_', ' ')}
                      {userOrg.is_ca_client && ' • CA Client'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </div>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          
          {/* Settings option for current organization if user is admin */}
          {currentOrganization && hasRole('org_admin', currentOrganization.id) && (
            <DropdownMenuItem 
              onClick={() => {
                setIsOpen(false);
                setSettingsOrgId(currentOrganization.id);
              }} 
              className="cursor-pointer text-blue-600 dark:text-blue-400 font-medium"
            >
              <Settings className="h-4 w-4 mr-2" />
              Organization Settings
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem 
            onClick={() => {
              setIsOpen(false);
              setShowCreateDialog(true);
            }} 
            className="cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          refetch();
        }}
      />

      <OrganizationSettingsDialog
        organizationId={settingsOrgId}
        open={settingsOrgId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSettingsOrgId(null);
          }
        }}
      />
    </>
  );
};

export default OrganizationSwitcher;
