/**
 * Branch Selector Component
 * Allows users to switch between branches within active organization
 * Branches are defined in Clerk organization publicMetadata
 */

import React, { useMemo } from 'react';
import { useOrganization } from '@clerk/clerk-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Loader2 } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface BranchSelectorProps {
  className?: string;
  onBranchChange?: (branchId: string) => void;
}

/**
 * Branch Selector - Switch between organization branches
 * Reads branches from Clerk organization publicMetadata (not privateMetadata)
 */
export const BranchSelector: React.FC<BranchSelectorProps> = ({
  className,
  onBranchChange,
}) => {
  const { organization, isLoaded } = useOrganization();

  const branches: Branch[] = useMemo(() => {
    if (!organization) return [];
    // Use publicMetadata instead of privateMetadata (client-side accessible)
    const metadata = organization.publicMetadata || {};
    return (metadata.branches as Branch[]) || [];
  }, [organization]);

  const activeBranch = useMemo(() => {
    if (!organization) return null;
    const branchId = sessionStorage.getItem(`active-branch-${organization.id}`);
    return branches.find(b => b.id === branchId) || branches[0] || null;
  }, [branches, organization]);

  const handleBranchChange = (branchId: string) => {
    if (organization) {
      sessionStorage.setItem(`active-branch-${organization.id}`, branchId);
      onBranchChange?.(branchId);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded border">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (branches.length === 0) {
    return null;
  }

  if (branches.length === 1) {
    // Single branch - show as readonly
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded border ${className || ''}`}>
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{activeBranch?.name}</span>
      </div>
    );
  }

  // Multiple branches - show selector
  return (
    <Select value={activeBranch?.id} onValueChange={handleBranchChange}>
      <SelectTrigger className={`w-[200px] ${className || ''}`}>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <SelectValue placeholder="Select branch" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {branches.map(branch => (
          <SelectItem key={branch.id} value={branch.id}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{branch.name}</span>
              <span className="text-xs text-muted-foreground">({branch.code})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default BranchSelector;
