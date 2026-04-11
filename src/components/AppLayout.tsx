import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { UniversalSearchDropdown } from '@/components/UniversalSearchDropdown';
import AICommandBar from '@/components/AICommandBar';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useBusinessData } from '@/hooks/useBusinessData';
import useSimpleBranding from '@/hooks/useSimpleBranding';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SettingsPage from '@/pages/Settings';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, loading } = useAuth();
  const { getBusinessInfo, getBusinessAssets } = useBusinessData();
  const { getBrandingWithFallback } = useSimpleBranding();

  const pagesWithoutSidebar = ['/login', '/clerk-login', '/onboarding'];
  const shouldHideSidebar =
    pagesWithoutSidebar.includes(location.pathname) ||
    (location.pathname === '/' && !user && !loading);
  const isBankingPage = location.pathname === '/banking';

  const businessInfo = getBusinessInfo();
  const businessAssets = getBusinessAssets();
  const brandingAssets = getBrandingWithFallback();

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
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-[radial-gradient(circle_at_top_left,hsl(232_82%_88%/0.72),transparent_20%),linear-gradient(180deg,hsl(227_100%_97%)_0%,hsl(var(--background))_30%)] dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.24),transparent_20%),linear-gradient(180deg,hsl(226_30%_18%)_0%,hsl(var(--background))_30%)] pb-0 md:pb-0">
        <AppSidebar />

        <SidebarInset className="flex-1 w-full overflow-x-hidden bg-transparent">
          {!isBankingPage && (
            <header className="z-10 px-4 pt-4 md:px-6 md:pt-5">
              <div className="md:hidden flex items-center justify-between gap-3 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {logoSrc && (
                    <img
                      src={logoSrc}
                      alt="Business Logo"
                      className="h-9 w-9 flex-shrink-0 rounded-[12px] bg-background/80 p-1 object-contain"
                    />
                  )}
                  <div className="min-w-0">
                    <h1 className="truncate text-sm font-semibold">
                      {businessInfo?.businessName || 'Business Dashboard'}
                    </h1>
                    <p className="text-xs text-muted-foreground">Dashboard overview</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 flex-shrink-0 rounded-[14px] border border-primary/15 bg-background/70"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>

              <div className="hidden md:flex items-center gap-4 px-4 py-4">
                {logoSrc && (
                  <img
                    src={logoSrc}
                    alt="Business Logo"
                    className="h-11 w-11 flex-shrink-0 rounded-[16px] bg-background/80 p-1.5 object-contain"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <h1 className="truncate text-lg font-semibold leading-none">
                    {businessInfo?.businessName || 'Business Dashboard'}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">Finance workspace</p>
                </div>
                <UniversalSearchDropdown />
                <Button variant="ghost" className="h-11 rounded-full border border-primary/15 bg-background/70 px-4 flex items-center gap-2" onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Button>
              </div>
            </header>
          )}

          <main className={isBankingPage ? 'flex-1 w-full' : 'flex-1 w-full pb-36 md:pb-28'}>
            {children}
          </main>
        </SidebarInset>

        {!isBankingPage && <MobileBottomNav />}
        {!isBankingPage && <AICommandBar />}
      </div>

      {/* Settings right panel */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col border-l border-white/30 bg-[linear-gradient(160deg,hsl(225_100%_99%/0.97),hsl(var(--background)/0.98))] dark:bg-[linear-gradient(160deg,hsl(226_28%_16%/0.98),hsl(var(--background)/0.99))] shadow-[-24px_0_80px_-20px_hsl(var(--primary)/0.18)] backdrop-blur-xl"
        >
          {/* Decorative gradient orb */}
          <div className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.12),transparent_70%)] blur-3xl" />

          <SheetHeader className="relative z-10 flex flex-row items-center gap-3 border-b border-white/30 bg-white/40 px-6 py-4 dark:bg-white/5 backdrop-blur">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">Settings</SheetTitle>
              <p className="text-xs text-muted-foreground">Manage your business preferences</p>
            </div>
          </SheetHeader>

          <div className="relative z-10 flex-1 overflow-y-auto">
            <SettingsPage />
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
};

export default AppLayout;
