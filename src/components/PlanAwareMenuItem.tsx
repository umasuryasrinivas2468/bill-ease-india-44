import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUserPlan, PlanFeatures } from '@/hooks/useUserPlan';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Lock } from 'lucide-react';

interface PlanAwareMenuItemProps {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: keyof PlanFeatures;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  asChild?: boolean;
}

export function PlanAwareMenuItem({ 
  title, 
  url, 
  icon: Icon, 
  feature,
  children,
  className,
  onClick,
  asChild = true 
}: PlanAwareMenuItemProps) {
  const { features, isLoading } = useUserPlan();

  // If no feature restriction is specified, render normally
  if (!feature) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild={asChild}>
          {onClick ? (
            <button
              onClick={onClick}
              className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground rounded-md text-left ${className || ''}`}
              title={title}
            >
              <Icon className="h-4 w-4" />
              <span>{title}</span>
            </button>
          ) : (
            <NavLink
              to={url}
              className={className}
              title={title}
            >
              <Icon className="h-4 w-4" />
              <span>{title}</span>
            </NavLink>
          )}
        </SidebarMenuButton>
        {children}
      </SidebarMenuItem>
    );
  }

  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  // Check if user has access to this feature
  const hasAccess = features[feature];

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild={asChild && hasAccess}>
        {hasAccess ? (
          onClick ? (
            <button
              onClick={onClick}
              className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground rounded-md text-left ${className || ''}`}
              title={title}
            >
              <Icon className="h-4 w-4" />
              <span>{title}</span>
            </button>
          ) : (
            <NavLink
              to={url}
              className={className}
              title={title}
            >
              <Icon className="h-4 w-4" />
              <span>{title}</span>
            </NavLink>
          )
        ) : (
          <div
            className="w-full flex items-center gap-2 px-3 py-2 text-muted-foreground cursor-not-allowed opacity-50"
            title={`${title} - Available in Growth/Scale plans`}
          >
            <Icon className="h-4 w-4" />
            <span>{title}</span>
            <Lock className="h-3 w-3 ml-auto" />
          </div>
        )}
      </SidebarMenuButton>
      {hasAccess && children}
    </SidebarMenuItem>
  );
}

interface PlanAwareMenuGroupProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: keyof PlanFeatures;
  children: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  pathPrefix: string;
}

export function PlanAwareMenuGroup({
  title,
  icon: Icon,
  feature,
  children,
  isOpen,
  onOpenChange,
  currentPath,
  pathPrefix
}: PlanAwareMenuGroupProps) {
  const { features, isLoading } = useUserPlan();

  // If no feature restriction is specified, render normally
  if (!feature) {
    return (
      <SidebarMenuItem>
        <div className="w-full">
          <div
            className={`flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer ${
              currentPath.startsWith(pathPrefix) ? 'bg-primary text-primary-foreground' : ''
            }`}
            onClick={() => onOpenChange(!isOpen)}
            title={title}
          >
            <Icon className="h-4 w-4" />
            <span>{title}</span>
          </div>
          {isOpen && children}
        </div>
      </SidebarMenuItem>
    );
  }

  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  // Check if user has access to this feature
  const hasAccess = features[feature];

  return (
    <SidebarMenuItem>
      <div className="w-full">
        {hasAccess ? (
          <div
            className={`flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer ${
              currentPath.startsWith(pathPrefix) ? 'bg-primary text-primary-foreground' : ''
            }`}
            onClick={() => onOpenChange(!isOpen)}
            title={title}
          >
            <Icon className="h-4 w-4" />
            <span>{title}</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 text-muted-foreground cursor-not-allowed opacity-50"
            title={`${title} - Available in Growth/Scale plans`}
          >
            <Icon className="h-4 w-4" />
            <span>{title}</span>
            <Lock className="h-3 w-3 ml-auto" />
          </div>
        )}
        {hasAccess && isOpen && children}
      </div>
    </SidebarMenuItem>
  );
}