import React from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import AICommandBar from '@/components/AICommandBar';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useBusinessData } from '@/hooks/useBusinessData';
import useSimpleBranding from '@/hooks/useSimpleBranding';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { getBusinessInfo, getBusinessAssets } = useBusinessData();
  const { getBrandingWithFallback } = useSimpleBranding();
  
  // Pages where sidebar should be hidden
  const pagesWithoutSidebar = ['/login', '/clerk-login', '/onboarding'];
  
  // For root path, hide sidebar if user is not authenticated (showing landing page)
  const shouldHideSidebar = pagesWithoutSidebar.includes(location.pathname) || 
    (location.pathname === '/' && !user && !loading);

  const businessInfo = getBusinessInfo();
  const businessAssets = getBusinessAssets();
  const brandingAssets = getBrandingWithFallback();

  // Get the best logo URL, prioritizing new branding system over old base64 data
  const getLogoSrc = () => {
    if (brandingAssets?.logo_url) {
      return brandingAssets.logo_url;
    }
    if (businessAssets?.logoBase64) {
      return `data:image/png;base64,${businessAssets.logoBase64}`;
    }
    return null;
  };

  const logoSrc = getLogoSrc();

  if (shouldHideSidebar) {
    // Return content without sidebar for auth pages
    return <div className="min-h-screen w-full">{children}</div>;
  }

  // Return content with sidebar for authenticated pages
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full pb-0 md:pb-0">
        {/* Desktop Sidebar - Hidden on mobile */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        
        <SidebarInset className="flex-1 w-full overflow-x-hidden">
          {/* Header with business name and logo */}
          <header className="sticky top-0 z-10 border-b border-sidebar-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* Mobile Header */}
            <div className="md:hidden flex h-14 items-center justify-between gap-2 px-2">
              {logoSrc && (
                <img 
                  src={logoSrc} 
                  alt="Business Logo" 
                  className="h-8 w-8 object-contain flex-shrink-0"
                />
              )}
              <a
                href="https://nas.io/aczen-1"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center p-2 text-primary flex-shrink-0"
                aria-label="Announcements"
              >
                📢
              </a>
            </div>
            
            {/* Desktop Header */}
            <div className="hidden md:flex h-14 items-center gap-2 sm:gap-3 px-2 sm:px-4">
              {/* Desktop trigger only */}
              <SidebarTrigger className="flex h-8 w-8 flex-shrink-0" />
              {logoSrc && (
                <img 
                  src={logoSrc} 
                  alt="Business Logo" 
                  className="h-6 w-6 sm:h-8 sm:w-8 object-contain flex-shrink-0"
                />
              )}
              <div className="flex flex-col flex-1 min-w-0">
                <h1 className="text-sm sm:text-lg font-semibold leading-none truncate">
                  {businessInfo?.businessName || 'Business Dashboard'}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Powered by Aczen
                </p>
              </div>
              <a
                href="https://nas.io/aczen-1"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors flex-shrink-0"
              >
                📢 Announcements
              </a>
            </div>
          </header>
          <main className="flex-1 w-full pb-36 md:pb-28">
            {children}
          </main>
        </SidebarInset>
        
        {/* Mobile Bottom Navigation */}
        <MobileBottomNav />

        {/* AI Command Bar */}
        <AICommandBar />
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
