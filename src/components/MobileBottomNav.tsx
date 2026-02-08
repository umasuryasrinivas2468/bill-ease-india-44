import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Users, Home, BookOpen, MoreHorizontal, X, Search } from 'lucide-react';
import { MobileSearch } from '@/components/MobileSearch';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const mainNavItems = [
  { label: 'Home', icon: Home, path: '/dashboard' },
  { label: 'Invoices', icon: FileText, path: '/invoices' },
  { label: 'Clients', icon: Users, path: '/clients' },
  { label: 'Accounting', icon: BookOpen, path: '/accounting/chart-of-accounts' },
];

const moreItems = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Quotations', path: '/quotations' },
  { label: 'Reports', path: '/reports' },
  { label: 'Notifications', path: '/notifications' },
  { label: 'Settings', path: '/settings' },
  { label: 'Inventory', path: '/inventory' },
  { label: 'Delivery Challans', path: '/inventory/delivery-challans' },
  { label: 'Sales Orders', path: '/inventory/sales-orders' },
  { label: 'Purchase Orders', path: '/inventory/purchase-orders' },
  { label: 'Business Reports', path: '/reports' },
  { label: 'Cash Flow Forecasting', path: '/reports/cash-flow-forecasting' },
  { label: 'AI Tax Advisor', path: '/reports/ai-tax-advisor' },
  { label: 'Receivables', path: '/reports/receivables' },
  { label: 'Payables', path: '/reports/payables' },
  { label: 'TDS', path: '/reports/tds' },
  { label: 'Expenses', path: '/expenses' },
  { label: 'Vendors', path: '/vendors' },
  { label: 'Manual Journals', path: '/accounting/manual-journals' },
  { label: 'Ledgers', path: '/accounting/ledgers' },
  { label: 'Trial Balance', path: '/accounting/trial-balance' },
  { label: 'Profit & Loss', path: '/accounting/profit-loss' },
  { label: 'Compliance Calendar', path: '/compliance' },
  { label: 'Loans', path: '/loans' },
  { label: 'Payments', path: '/payments' },
  { label: 'Branding', path: '/branding' },
  { label: 'Support', path: '/support' },
  { label: 'UPI Collections', path: '/upi-collections' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard')) {
      return true;
    }
    return location.pathname.startsWith(path);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  const handleMoreItemClick = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Bottom Navigation Bar - Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
        <div className="flex items-center justify-around h-16 px-2">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}

          {/* More Button with Drawer */}
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                  'text-muted-foreground hover:text-foreground'
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs font-medium">More</span>
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="border-b">
                <DrawerTitle>All Features</DrawerTitle>
                <DrawerDescription>
                  Access all application features
                </DrawerDescription>
              </DrawerHeader>
              
              {/* Search Button */}
              <div className="px-4 pt-4">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setSearchOpen(true);
                    setDrawerOpen(false);
                  }}
                >
                  <Search className="h-4 w-4" />
                  Search everything...
                </Button>
              </div>
              
              <ScrollArea className="h-[55vh] px-4">
                <div className="py-4 space-y-1">
                  {moreItems.map((item) => (
                    <Button
                      key={item.path}
                      variant={isActive(item.path) ? 'secondary' : 'ghost'}
                      className="w-full justify-start"
                      onClick={() => handleMoreItemClick(item.path)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <DrawerClose asChild>
                  <Button variant="outline" className="w-full">
                    Close
                  </Button>
                </DrawerClose>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
      
      {/* Bottom Spacer - Prevents content from being hidden behind bottom nav */}
      <div className="md:hidden h-16" />
      
      {/* Mobile Search Dialog */}
      <MobileSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
