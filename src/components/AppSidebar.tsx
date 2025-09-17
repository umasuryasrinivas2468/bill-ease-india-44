
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
  CreditCard,
  Brain,
  Palette,
  Banknote,
  HandCoins
} from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
import { useBusinessData } from "@/hooks/useBusinessData";
import useSimpleBranding from '@/hooks/useSimpleBranding';
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
import { BankingUnavailableModal } from "@/components/BankingUnavailableModal";

const mainMenuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Quotations", url: "/quotations", icon: Quote },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Banking", url: "#", icon: Banknote, special: "banking" },
  { title: "Branding", url: "/branding", icon: Palette },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Settings", url: "/settings", icon: Settings },
];

const reportsMenuItems = [
  { title: "Business Reports", url: "/reports", icon: BarChart3 },
  { title: "Cash Flow Forecasting", url: "/reports/cash-flow-forecasting", icon: LineChart },
  { title: "AI Business Tax Advisor", url: "/reports/ai-tax-advisor", icon: Brain },
];

const caToolsMenuItems = [
  { title: "CA Dashboard", url: "/ca", icon: Calculator },
  { title: "Manual Journals", url: "/accounting/manual-journals", icon: BookOpen },
  { title: "Ledgers", url: "/accounting/ledgers", icon: BookOpenText },
  { title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
  { title: "Chart of Accounts", url: "/accounting/chart-of-accounts", icon: ListTree },
  { title: "Profit & Loss", url: "/accounting/profit-loss", icon: TrendingUp },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { signOut } = useClerk();
  const { getBusinessInfo, getBusinessAssets } = useBusinessData();
  const { getBrandingWithFallback } = useSimpleBranding();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const [isCAToolsOpen, setIsCAToolsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isBankingModalOpen, setIsBankingModalOpen] = useState(false);
  
  const businessInfo = getBusinessInfo();
  const businessAssets = getBusinessAssets();
  const brandingAssets = getBrandingWithFallback();

  // Get the best logo URL, prioritizing new branding system over old base64 data
  const getLogoSrc = () => {
    if (brandingAssets.logo_url) {
      return brandingAssets.logo_url;
    }
    if (businessAssets.logoBase64) {
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
      {/* Compact Header with Trigger and Logo - positioned slightly down */}
      <div className="mt-4">
        <div className="flex items-center justify-between p-2 border-b border-sidebar-border">
          {!isCollapsed ? (
            <div className="flex items-center space-x-3">
              {logoSrc ? (
                <img 
                  src={logoSrc}
                  alt="Business Logo" 
                  className="h-8 w-8 object-contain rounded"
                />
              ) : (
                <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {businessInfo?.businessName ? businessInfo.businessName.charAt(0).toUpperCase() : 'B'}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
                  {businessInfo?.businessName || 'Business'}
                </h1>
              </div>
            </div>
          ) : (
            <div className="flex justify-center w-full">
              {logoSrc ? (
                <img 
                  src={logoSrc}
                  alt="Business Logo" 
                  className="h-8 w-8 object-contain rounded"
                />
              ) : (
                <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {businessInfo?.businessName ? businessInfo.businessName.charAt(0).toUpperCase() : 'B'}
                  </span>
                </div>
              )}
            </div>
          )}
          <SidebarTrigger className="h-6 w-6" />
        </div>
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
                    <SidebarMenuButton asChild={!(item as any).special}>
                      {(item as any).special === "banking" ? (
                        <button
                          onClick={() => setIsBankingModalOpen(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground rounded-md text-left"
                          title={item.title}
                        >
                          <item.icon className="h-4 w-4" />
                          {!isCollapsed && <span>{item.title}</span>}
                        </button>
                      ) : (
                        <NavLink
                          to={item.url}
                          className={getNavCls(item.url)}
                          title={item.title}
                        >
                          <item.icon className="h-4 w-4" />
                          {!isCollapsed && <span>{item.title}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {/* Compliance and Loans links immediately under Banking */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/compliance" className={`${getNavCls('/compliance')} ml-4 text-sm`} title="Compliance Calendar">
                      <BookOpenText className="h-3 w-3" />
                      {!isCollapsed && <span>Compliance</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/loans" className={`${getNavCls('/loans')} ml-4 text-sm`} title="Business Loans">
                      <HandCoins className="h-3 w-3" />
                      {!isCollapsed && <span>Loans</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                
                {/* Reports Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible 
                    open={isReportsOpen} 
                    onOpenChange={setIsReportsOpen}
                    className="w-full"
                  >
                    <div
                      onMouseEnter={() => !isCollapsed && setIsReportsOpen(true)}
                      onMouseLeave={() => !isCollapsed && setIsReportsOpen(false)}
                      className="w-full"
                    >
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
                
                {/* CA Tools Collapsible Menu */}
                <SidebarMenuItem>
                  <Collapsible 
                    open={isCAToolsOpen} 
                    onOpenChange={setIsCAToolsOpen}
                    className="w-full"
                  >
                    <div
                      onMouseEnter={() => !isCollapsed && setIsCAToolsOpen(true)}
                      onMouseLeave={() => !isCollapsed && setIsCAToolsOpen(false)}
                      className="w-full"
                    >
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
      
      <BankingUnavailableModal 
        isOpen={isBankingModalOpen}
        onClose={() => setIsBankingModalOpen(false)}
      />
    </Sidebar>
  );
}
