import React from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/components/ClerkAuthProvider';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  
  // Pages where sidebar should be hidden
  const pagesWithoutSidebar = ['/login', '/clerk-login', '/onboarding'];
  
  // For root path, hide sidebar if user is not authenticated (showing landing page)
  const shouldHideSidebar = pagesWithoutSidebar.includes(location.pathname) || 
    (location.pathname === '/' && !user && !loading);

  if (shouldHideSidebar) {
    // Return content without sidebar for auth pages
    return <div className="min-h-screen w-full">{children}</div>;
  }

  // Return content with sidebar for authenticated pages
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;