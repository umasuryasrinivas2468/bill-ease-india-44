
import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  Calculator,
  Bell,
  LogOut,
  Package,
  Quote,
  BookOpen,
  BookOpenText,
  Scale,
  ListTree,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  LineChart,
  Percent,
  Brain,
  Banknote,
  HandCoins,
  ShoppingCart,
  Truck,
  CreditCard,
  Receipt,
  UserCheck,
  Building2,
  Shield
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

const mainMenuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Quotations", url: "/quotations", icon: Quote },
  { title: "Clients", url: "/clients", icon: Users },

  { title: "Banking", url: "/banking", icon: Banknote },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Settings", url: "/settings", icon: Settings },
];

const inventoryMenuItems = [
  { title: "Manage Inventory", url: "/inventory", icon: Package },
  { title: "Delivery Challans", url: "/inventory/delivery-challans", icon: Truck },
  { title: "Sales Orders", url: "/inventory/sales-orders", icon: ShoppingCart, feature: "salesOrders" as const },
  { title: "Purchase Orders", url: "/inventory/purchase-orders", icon: Truck, feature: "purchaseOrders" as const },
];

const reportsMenuItems = [
  { title: "Business Reports", url: "/reports", icon: BarChart3 }, // Available for all plans
  { title: "Cash Flow Forecasting", url: "/reports/cash-flow-forecasting", icon: LineChart, feature: "cashFlowForecasting" as const },
  { title: "AI Business Tax Advisor", url: "/reports/ai-tax-advisor", icon: Brain, feature: "virtualCFO" as const },
  { title: "Receivables", url: "/reports/receivables", icon: CreditCard },
  { title: "Payables", url: "/reports/payables", icon: Receipt },
  { title: "Vendor TDS", url: "/reports/tds", icon: Percent },
];

const caToolsMenuItems = [
  { title: "CA Dashboard", url: "/ca", icon: Calculator },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Vendors", url: "/vendors", icon: Users },
  { title: "TDS Management", url: "/reports/tds", icon: Percent },
  { title: "Manual Journals", url: "/accounting/manual-journals", icon: BookOpen },
  { title: "Ledgers", url: "/accounting/ledgers", icon: BookOpenText },
  { title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
  { title: "Chart of Accounts", url: "/accounting/chart-of-accounts", icon: ListTree },
  { title: "Profit & Loss", url: "/accounting/profit-loss", icon: TrendingUp },
  { title: "Financial Statements", url: "/accounting/financial-statements", icon: FileText },
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
  const [isCAToolsOpen, setIsCAToolsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);

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
                {mainMenuItems.map((item) => (
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

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/payroll"
                      className={getNavCls('/payroll')}
                      title="Payroll"
                    >
                      <UserCheck className="h-4 w-4" />
                      {!isCollapsed && <span>Payroll</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Loans - Plan Restricted */}
                {!isCollapsed && (
                  <PlanAwareMenuItem
                    title="Loans"
                    url="/loans"
                    icon={HandCoins}
                    feature="loans"
                    className={getNavCls('/loans')}
                  />
                )}
                {/* Compliance Calendar at main level */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/compliance" className={getNavCls('/compliance')} title="Compliance Calendar">
                      <BookOpenText className="h-4 w-4" />
                      {!isCollapsed && <span>Compliance Calendar</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Inventory Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible
                    open={isInventoryOpen}
                    onOpenChange={setIsInventoryOpen}
                    className="w-full"
                  >
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full ${currentPath.startsWith('/inventory') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="Inventory Management"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsInventoryOpen(!isInventoryOpen)}
                        >
                          <Package className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>Inventory Management</span>
                              <ChevronRight className={`h-4 w-4 ml-auto transition-transform duration-200 ${isInventoryOpen ? 'rotate-90' : ''}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>

                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {inventoryMenuItems.map((item) => (
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
                        className={`w-full ${currentPath.startsWith('/reports') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        title="Reports & Analytics"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsReportsOpen(!isReportsOpen)}
                        >
                          <BarChart3 className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>Reports & Analytics</span>
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

                {/* CA Tools Collapsible Menu */}
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
                        title="CA Tools & Accounting"
                      >
                        <CollapsibleTrigger
                          className="w-full"
                          onClick={() => setIsCAToolsOpen(!isCAToolsOpen)}
                        >
                          <Calculator className="h-4 w-4" />
                          {!isCollapsed && (
                            <>
                              <span>CA Tools & Accounting</span>
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
