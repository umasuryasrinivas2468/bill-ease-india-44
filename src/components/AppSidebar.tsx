
import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Users,
  BarChart3,
  Calculator,
  Bell,
  LogOut,
  Package,
  Quote,
  CalendarDays,
  Scale,
  ListTree,
  TrendingUp,
  ChevronRight,
  Percent,
  Banknote,
  ShoppingCart,
  Truck,
  Receipt,
  RefreshCw,
  Sparkles,
  ScrollText,
  Wallet,
  LayoutGrid
} from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
import { useBusinessData } from "@/hooks/useBusinessData";
import useSimpleBranding from '@/hooks/useSimpleBranding';
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CAClientSwitcher } from "@/components/auth/CAClientSwitcher";
import { PlanAwareMenuItem } from "@/components/PlanAwareMenuItem";

const salesMenuItems = [
  { title: "Quotations", url: "/quotations", icon: Quote },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Sales Orders", url: "/inventory/sales-orders", icon: ShoppingCart, feature: "salesOrders" as const },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Working Capital", url: "/working-capital", icon: Banknote },
  { title: "Cash Memo", url: "/cash-memo", icon: Wallet },
  { title: "E Way Bills", url: "/coming-soon?feature=E%20Way%20Bills", icon: Truck },
  { title: "Credit Notes", url: "/coming-soon?feature=Credit%20Notes", icon: ScrollText },
  { title: "Recurring Invoices", url: "/ca/recurring-invoices", icon: RefreshCw },
  { title: "Delivery Challan", url: "/inventory/delivery-challans", icon: Truck },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const purchasesMenuItems = [
  { title: "Vendors", url: "/vendors", icon: Users },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Bills", url: "/purchase-bills", icon: FileText },
  { title: "Purchase Orders", url: "/inventory/purchase-orders", icon: Truck, feature: "purchaseOrders" as const },
];

const inventoryMenuItems = [
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Inventory Insights", url: "/inventory/insights", icon: Sparkles },
];

const bankingMenuItems = [
  { title: "Banking", url: "/banking", icon: Banknote },
];

const complianceMenuItems = [
  { title: "Compliance Calendar", url: "/compliance", icon: CalendarDays },
  { title: "Reports", url: "/reports/tds", icon: Percent },
  { title: "ITR", url: "/ca/itr6", icon: FileText },
];

const reportsMenuItems = [
  { title: "Financial Statements", url: "/accounting/financial-statements", icon: FileText },
  { title: "Profit Loss", url: "/accounting/profit-loss", icon: TrendingUp },
];

const appsMenuItems = [
  { title: "Apps", url: "/apps", icon: LayoutGrid },
];

const caToolsMenuItems = [
  { title: "Manual Journals", url: "/accounting/manual-journals", icon: Calculator },
  { title: "TDS", url: "/reports/tds", icon: Percent },
  { title: "Ledgers", url: "/accounting/ledgers", icon: Receipt },
  { title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
  { title: "Chart of Accounts", url: "/accounting/chart-of-accounts", icon: ListTree },
  { title: "CA", url: "/ca", icon: Users },
];

const standaloneMenuItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { signOut } = useClerk();
  const { getBusinessInfo, getBusinessAssets } = useBusinessData();
  const { getBrandingWithFallback } = useSimpleBranding();
  const { hasRole, currentRole } = useAuthorization();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const [isSalesOpen, setIsSalesOpen] = useState(false);
  const [isPurchasesOpen, setIsPurchasesOpen] = useState(false);
  const [isComplianceOpen, setIsComplianceOpen] = useState(false);
  const [isCAToolsOpen, setIsCAToolsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  const isCA = hasRole('ca');

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

  const isActive = (path: string) => {
    // Handle dashboard routing - both "/" and "/dashboard" should highlight dashboard
    if (path === "/dashboard" && (currentPath === "/" || currentPath === "/dashboard")) return true;
    if (path !== "/dashboard" && currentPath.startsWith(path)) return true;
    return false;
  };

  const getNavCls = (path: string) =>
    isActive(path)
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "hover:bg-accent hover:text-accent-foreground";

  const handleSignOut = () => {
    signOut();
  };

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-60"} collapsible="icon">
      {/* Compact Header with Trigger and Aczen Brand */}
      <div className="mt-4">
        <div className="flex items-center justify-between p-2 border-b border-sidebar-border">
          {!isCollapsed && (
            <h2 className="text-lg font-bold text-primary">Aczen</h2>
          )}
          <SidebarTrigger className="h-6 w-6" />
        </div>
        
        {/* CA Client Switcher */}
        {!isCollapsed && isCA && (
          <div className="p-2 space-y-2 border-b border-sidebar-border">
            <CAClientSwitcher className="w-full" />
          </div>
        )}
      </div>

      <SidebarContent className="flex flex-col h-full">
        <div className="flex-1">
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
              Navigation
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {standaloneMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={getNavCls(item.url)}
                        title={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Sales Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible
                    open={isSalesOpen}
                    onOpenChange={setIsSalesOpen}
                    className="w-full"
                  >
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full ${currentPath.startsWith('/quotations') || currentPath.startsWith('/clients') || currentPath.startsWith('/invoices') || currentPath.startsWith('/notifications') || currentPath.startsWith('/cash-memo') || currentPath.startsWith('/coming-soon') || currentPath.startsWith('/inventory/sales-orders') || currentPath.startsWith('/inventory/delivery-challans') || currentPath.startsWith('/ca/recurring-invoices') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="Sales"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsSalesOpen(!isSalesOpen)}
                        >
                          <ShoppingCart className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>Sales</span>
                              <ChevronRight className={`h-4 w-4 ml-auto transition-transform duration-200 ${isSalesOpen ? 'rotate-90' : ''}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>

                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {salesMenuItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild={!(item as any).feature || true}>
                                  {(item as any).feature ? (
                                    <PlanAwareMenuItem
                                      title={item.title}
                                      url={item.url}
                                      icon={item.icon}
                                      feature={(item as any).feature}
                                      className={`${getNavCls(item.url)} ml-4 text-sm`}
                                      asChild={false}
                                    />
                                  ) : (
                                    <NavLink
                                      to={item.url}
                                      className={`${getNavCls(item.url)} ml-4 text-sm`}
                                      title={item.title}
                                    >
                                      <item.icon className="h-3 w-3" />
                                      <span>{item.title}</span>
                                    </NavLink>
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                </SidebarMenuItem>

                {/* Purchases Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible
                    open={isPurchasesOpen}
                    onOpenChange={setIsPurchasesOpen}
                    className="w-full"
                  >
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full ${currentPath.startsWith('/vendors') || currentPath.startsWith('/expenses') || currentPath.startsWith('/purchase-bills') || currentPath.startsWith('/inventory/purchase-orders') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="Purchases"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsPurchasesOpen(!isPurchasesOpen)}
                        >
                          <Truck className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>Purchases</span>
                              <ChevronRight className={`h-4 w-4 ml-auto transition-transform duration-200 ${isPurchasesOpen ? 'rotate-90' : ''}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>

                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {purchasesMenuItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild={!(item as any).feature || true}>
                                  {(item as any).feature ? (
                                    <PlanAwareMenuItem
                                      title={item.title}
                                      url={item.url}
                                      icon={item.icon}
                                      feature={(item as any).feature}
                                      className={`${getNavCls(item.url)} ml-4 text-sm`}
                                      asChild={false}
                                    />
                                  ) : (
                                    <NavLink
                                      to={item.url}
                                      className={`${getNavCls(item.url)} ml-4 text-sm`}
                                      title={item.title}
                                    >
                                      <item.icon className="h-3 w-3" />
                                      <span>{item.title}</span>
                                    </NavLink>
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                </SidebarMenuItem>

                {inventoryMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={getNavCls(item.url)}
                        title={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {bankingMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={getNavCls(item.url)}
                        title={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Compliance Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible
                    open={isComplianceOpen}
                    onOpenChange={setIsComplianceOpen}
                    className="w-full"
                  >
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full ${currentPath.startsWith('/compliance') || currentPath.startsWith('/reports/tds') || currentPath.startsWith('/ca/itr6') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="Compliance"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsComplianceOpen(!isComplianceOpen)}
                        >
                          <CalendarDays className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>Compliance</span>
                              <ChevronRight className={`h-4 w-4 ml-auto transition-transform duration-200 ${isComplianceOpen ? 'rotate-90' : ''}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>

                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {complianceMenuItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={item.url}
                                    className={`${getNavCls(item.url)} ml-4 text-sm`}
                                    title={item.title}
                                  >
                                    <item.icon className="h-3 w-3" />
                                    <span>{item.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                </SidebarMenuItem>

                {/* CA Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible
                    open={isCAToolsOpen}
                    onOpenChange={setIsCAToolsOpen}
                    className="w-full"
                  >
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full ${(currentPath.startsWith('/ca') || currentPath.startsWith('/accounting')) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="CA"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsCAToolsOpen(!isCAToolsOpen)}
                        >
                          <Calculator className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>CA</span>
                              <ChevronRight className={`h-4 w-4 ml-auto transition-transform duration-200 ${isCAToolsOpen ? 'rotate-90' : ''}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>

                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {caToolsMenuItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={item.url}
                                    className={`${getNavCls(item.url)} ml-4 text-sm`}
                                    title={item.title}
                                  >
                                    <item.icon className="h-3 w-3" />
                                    <span>{item.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                </SidebarMenuItem>

                {/* Reports Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible
                    open={isReportsOpen}
                    onOpenChange={setIsReportsOpen}
                    className="w-full"
                  >
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full ${currentPath.startsWith('/accounting/financial-statements') || currentPath.startsWith('/accounting/profit-loss') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="Reports"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsReportsOpen(!isReportsOpen)}
                        >
                          <BarChart3 className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>Reports</span>
                              <ChevronRight className={`h-4 w-4 ml-auto transition-transform duration-200 ${isReportsOpen ? 'rotate-90' : ''}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>

                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {reportsMenuItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={item.url}
                                    className={`${getNavCls(item.url)} ml-4 text-sm`}
                                    title={item.title}
                                  >
                                    <item.icon className="h-3 w-3" />
                                    <span>{item.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                </SidebarMenuItem>

                {appsMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={getNavCls(item.url)}
                        title={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>


        </div>

        <div className="p-2 border-t space-y-2">
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full justify-start"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarContent>


    </Sidebar>
  );
}
