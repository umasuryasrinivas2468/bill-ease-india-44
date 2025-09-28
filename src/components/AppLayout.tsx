import React from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
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
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1">
          {/* Header with business name and logo */}
          <header className="border-b border-sidebar-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center gap-3 px-4">
              {logoSrc && (
                <img 
                  src={logoSrc} 
                  alt="Business Logo" 
                  className="h-8 w-8 object-contain"
                />
              )}
              <div className="flex flex-col flex-1">
                <h1 className="text-lg font-semibold leading-none">
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
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                📢 Announcements
              </a>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;