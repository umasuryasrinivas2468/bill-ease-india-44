import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Settings,
  Calculator,
  Banknote,
  ShieldCheck,
  HandCoins,
  Umbrella,
  type LucideIcon,
} from 'lucide-react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { UniversalSearchDropdown } from '@/components/UniversalSearchDropdown';
import { NotificationCenter } from '@/components/NotificationCenter';
import AICommandBar from '@/components/AICommandBar';
import SupportAssistant, { SupportAssistantTrigger } from '@/components/SupportAssistant';
import { useAuth } from '@/components/ClerkAuthProvider';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SettingsPage from '@/pages/Settings';
import { cn } from '@/lib/utils';

const TOP_NAV_ITEMS: Array<{ label: string; to: string; matchPrefix: string; icon: LucideIcon }> = [
  { label: 'Accounting', to: '/accounting/chart-of-accounts', matchPrefix: '/accounting', icon: Calculator },
  { label: 'Banking', to: '/banking', matchPrefix: '/banking', icon: Banknote },
  { label: 'Compliance', to: '/compliance', matchPrefix: '/compliance', icon: ShieldCheck },
  { label: 'Credit', to: '/credit', matchPrefix: '/credit', icon: HandCoins },
  { label: 'Insurance', to: '/insurance', matchPrefix: '/insurance', icon: Umbrella },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, loading } = useAuth();

  const pagesWithoutSidebar = ['/login', '/clerk-login', '/onboarding'];
  const shouldHideSidebar =
    pagesWithoutSidebar.includes(location.pathname) ||
    (location.pathname === '/' && !user && !loading);

  if (shouldHideSidebar) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  const renderTopNav = (size: 'sm' | 'md') => {
    const isSm = size === 'sm';
    return (
      <nav
        className={cn(
          'inline-flex items-center rounded-full border border-black/20 bg-black p-1 shadow-sm',
          isSm ? 'gap-0.5' : 'gap-1'
        )}
        aria-label="Primary"
      >
        {TOP_NAV_ITEMS.map((item) => {
          const isActive = location.pathname.startsWith(item.matchPrefix);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                'inline-flex items-center rounded-full text-sm transition-colors whitespace-nowrap',
                isSm ? 'gap-1 px-3 py-1.5 text-xs' : 'gap-2 px-5 py-2',
                isActive
                  ? 'bg-white font-medium text-black shadow-sm'
                  : 'text-white/70 hover:text-white'
              )}
            >
              <Icon className={isSm ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-background pb-0 md:pb-0">
        <AppSidebar />

        <SidebarInset className="flex-1 w-full overflow-x-hidden bg-transparent">
          <header className="z-10 px-4 pt-4 md:px-6 md:pt-5">
              <div className="md:hidden flex items-center justify-between gap-2 px-1 py-2">
                <div className="min-w-0 flex-1 overflow-x-auto">
                  {renderTopNav('sm')}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <NotificationCenter compact />
                  <SupportAssistantTrigger className="h-10 w-10 rounded-[14px]" />
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
              </div>

              <div className="hidden md:grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-4">
                <div />
                <div className="flex justify-center">
                  {renderTopNav('md')}
                </div>
                <div className="flex items-center justify-end gap-3">
                  <UniversalSearchDropdown />
                  <NotificationCenter compact />
                  <SupportAssistantTrigger />
                  <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full border border-primary/15 bg-background/70" onClick={() => setSettingsOpen(true)} aria-label="Settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
          </header>

          <main key={location.pathname} className="flex-1 w-full pb-36 md:pb-28 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </main>
        </SidebarInset>

        <MobileBottomNav />
        <AICommandBar />
        <SupportAssistant />
      </div>

      {/* Settings right panel */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col border-l border-border bg-background"
        >
          <SheetHeader className="flex flex-row items-center gap-3 border-b border-border bg-background px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">Settings</SheetTitle>
              <p className="text-xs text-muted-foreground">Manage your business preferences</p>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <SettingsPage />
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
};

export default AppLayout;
