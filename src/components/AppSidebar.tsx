
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
  ChevronRight
} from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
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

const mainMenuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Quotations", url: "/quotations", icon: Quote },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Support", url: "/support", icon: HelpCircle },
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
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const [isCAToolsOpen, setIsCAToolsOpen] = useState(false);

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
              <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
                  Aczen
                </h1>
              </div>
            </div>
          ) : (
            <div className="flex justify-center w-full">
              <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
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
    </Sidebar>
  );
}
