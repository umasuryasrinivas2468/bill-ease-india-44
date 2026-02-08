import React, { useState } from 'react';
import { useCAClients } from '@/hooks/useCAClients';
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
  Users, 
  ChevronDown, 
  Check, 
  Shield,
  Eye,
  Edit,
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CAClientSwitcherProps {
  className?: string;
}

const accessLevelIcons = {
  full: Edit,
  limited: Shield,
  view_only: Eye,
};

const accessLevelLabels = {
  full: 'Full Access',
  limited: 'Limited Access',
  view_only: 'View Only',
};

export const CAClientSwitcher: React.FC<CAClientSwitcherProps> = ({ className }) => {
  const { 
    clients, 
    currentClient, 
    isLoading, 
    switchClient,
    getCurrentAccessLevel,
  } = useCAClients();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <Button variant="ghost" disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading clients...
      </Button>
    );
  }

  if (clients.length === 0) {
    return null; // Don't show if user is not a CA with clients
  }

  const currentAccessLevel = getCurrentAccessLevel();
  const AccessIcon = currentAccessLevel ? accessLevelIcons[currentAccessLevel] : Shield;

  const handleSwitch = (clientOrgId: string) => {
    switchClient(clientOrgId);
    setIsOpen(false);
    // Reload to refresh data for new client context
    window.location.reload();
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className={cn("justify-between min-w-[220px]", className)}
        >
          <div className="flex items-center gap-2 truncate">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {currentClient?.name || 'Select Client'}
            </span>
            {currentAccessLevel && (
              <Badge variant="secondary" className="text-xs">
                {accessLevelLabels[currentAccessLevel]}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Client Organizations
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {clients.map((assignment) => {
          const org = assignment.organization;
          if (!org) return null;
          
          const isActive = currentClient?.id === org.id;
          const Icon = accessLevelIcons[assignment.access_level];
          
          return (
            <DropdownMenuItem
              key={org.id}
              className={cn(
                "flex items-center justify-between cursor-pointer py-3",
                isActive && "bg-accent"
              )}
              onClick={() => handleSwitch(org.id)}
            >
              <div className="flex flex-col gap-1 truncate">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{org.name}</span>
                  {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  <span>{accessLevelLabels[assignment.access_level]}</span>
                  {org.gstin && (
                    <>
                      <span>•</span>
                      <span>{org.gstin}</span>
                    </>
                  )}
                </div>
                {assignment.notes && (
                  <span className="text-xs text-muted-foreground truncate">
                    {assignment.notes}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-xs text-muted-foreground">
          Switching clients will reload the page to show their data.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CAClientSwitcher;
