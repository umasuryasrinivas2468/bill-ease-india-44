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
        className={cn('inline-flex items-center', isSm ? 'gap-1' : 'gap-2')}
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
                'relative inline-flex items-center whitespace-nowrap transition-colors',
                isSm ? 'gap-1.5 px-3 py-3 text-xs' : 'gap-2 px-5 py-4 text-sm',
                isActive
                  ? 'font-semibold text-white'
                  : 'text-white/60 hover:text-white/90'
              )}
            >
              <Icon className={isSm ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              <span>{item.label}</span>
              {isActive && (
                <>
                  {/* Glowing underline beam */}
                  <span
                    className="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[#4f8cff]"
                    style={{ boxShadow: '0 0 12px 2px rgba(79,140,255,0.9), 0 0 24px 6px rgba(79,140,255,0.45)' }}
                  />
                  {/* Soft halo glow above the beam */}
                  <span
                    className="pointer-events-none absolute inset-x-0 -bottom-1 h-8 rounded-full opacity-70 blur-xl"
                    style={{ background: 'radial-gradient(ellipse at bottom, rgba(79,140,255,0.55), transparent 70%)' }}
                  />
                </>
              )}
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
          <header className="z-10">
              <div className="relative bg-[#0b0b0f] text-white rounded-t-none rounded-bl-[32px] rounded-br-[32px] shadow-[0_12px_30px_-14px_rgba(0,0,0,0.55)] overflow-hidden">
                {/* subtle top sheen */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1 overflow-x-auto">
                    {renderTopNav('sm')}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <NotificationCenter compact />
                    <SupportAssistantTrigger className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 text-white" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
                      onClick={() => setSettingsOpen(true)}
                      aria-label="Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="hidden md:grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-2">
                  <div />
                  <div className="flex justify-center">
                    {renderTopNav('md')}
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <UniversalSearchDropdown />
                    <NotificationCenter compact />
                    <SupportAssistantTrigger className="text-white hover:bg-white/10" />
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-white/5 hover:bg-white/10 text-white border border-white/10" onClick={() => setSettingsOpen(true)} aria-label="Settings">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
          </header>

          <main key={location.pathname} className="flex-1 w-full pb-36 md:pb-28 px-4 md:px-6 pt-4 md:pt-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
