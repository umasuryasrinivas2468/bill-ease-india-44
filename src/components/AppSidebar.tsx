
import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Users,
  BarChart3,
  Building2,
  Calculator,
  Bell,
  LogOut,
  Package,
  Quote,
  CalendarDays,
  Scale,
  ListTree,
  TrendingUp,
  TrendingDown,
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
  LayoutGrid,
  Clock,
  FolderKanban,
  GitMerge,
  IndianRupee,
  Brain,
  Filter,
} from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
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
  { title: "Invoice Intelligence", url: "/invoices/intelligence", icon: Filter },
  { title: "Payment Links", url: "/payments", icon: Wallet },
  { title: "Payment Received", url: "/payment-received", icon: IndianRupee },
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
  { title: "Expense Intelligence", url: "/expenses/intelligence", icon: Filter },
  { title: "Bills", url: "/purchase-bills", icon: FileText },
  { title: "Vendor Advances", url: "/vendor-advances", icon: Banknote },
  { title: "Bill Payments", url: "/vendor-bill-payments", icon: Wallet },
  { title: "Recurring Bills", url: "/expenses?tab=recurring", icon: RefreshCw },
  { title: "Purchase Orders", url: "/inventory/purchase-orders", icon: Truck, feature: "purchaseOrders" as const },
];

const inventorySubItems = [
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Inventory Insights", url: "/inventory/insights", icon: Sparkles },
];

const bankingSubItems = [
  { title: "Banking", url: "/banking", icon: Banknote },
  { title: "Reconciliation", url: "/banking/reconciliation", icon: GitMerge },
];

const complianceMenuItems = [
  { title: "Compliance Calendar", url: "/compliance", icon: CalendarDays },
  { title: "GST", url: "/compliance/gst", icon: Scale },
  { title: "MCA Filing", url: "/compliance/mca", icon: Building2 },
  { title: "TDS Reports", url: "/reports/tds", icon: Percent },
  { title: "ITR", url: "/ca/itr6", icon: FileText },
];

const reportsMenuItems = [
  { title: "Financial Statements", url: "/accounting/financial-statements", icon: FileText },
  { title: "Profit Loss", url: "/accounting/profit-loss", icon: TrendingUp },
  { title: "Project P&L", url: "/accounting/project-profit-loss", icon: FolderKanban },
  { title: "Aczen CFO", url: "/aczen-cfo", icon: Brain },
];

const appsMenuItems = [
  { title: "Apps", url: "/apps", icon: LayoutGrid },
];

const spaceMenuItems = [
  { title: "Projects", url: "/space/projects", icon: FolderKanban },
  { title: "Timesheet", url: "/space/timesheet", icon: Clock },
  { title: "Payroll", url: "/payroll", icon: IndianRupee },
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
  { title: "Payment Hub", url: "/payment-hub", icon: IndianRupee },
];

export function AppSidebar() {
  const { state, setOpen } = useSidebar();
  const location = useLocation();
  const { signOut } = useClerk();
  const { hasRole } = useAuthorization();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const [isSalesOpen, setIsSalesOpen] = useState(false);
  const [isPurchasesOpen, setIsPurchasesOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isComplianceOpen, setIsComplianceOpen] = useState(false);
  const [isCAToolsOpen, setIsCAToolsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isSpaceOpen, setIsSpaceOpen] = useState(false);
  const [isBankingOpen, setIsBankingOpen] = useState(false);

  const isCA = hasRole('ca');
  const collapseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    collapseTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const logoSrc = "/aczen-logo.png";

  const isActive = (path: string) => {
    if (path === "/dashboard" && (currentPath === "/" || currentPath === "/dashboard")) return true;
    if (path !== "/dashboard" && currentPath.startsWith(path)) return true;
    return false;
  };

  const getNavCls = (path: string) =>
    isActive(path)
      ? "rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
      : "rounded-xl text-foreground font-medium hover:bg-primary/10 hover:text-foreground";

  const collapsibleActiveCls = (paths: string[]) =>
    paths.some(p => currentPath.startsWith(p))
      ? "rounded-xl bg-primary text-primary-foreground font-semibold"
      : "rounded-xl text-foreground font-medium hover:bg-primary/10 hover:text-foreground";

  /* shared class for every top-level collapsible trigger */
  const triggerCls = isCollapsed
    ? "flex w-full items-center justify-center rounded-xl px-0 py-3"
    : "flex w-full items-center rounded-xl px-3 py-3";

  return (
    <Sidebar
      variant="floating"
      style={{ "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}
      className={isCollapsed ? "border-r-0 bg-transparent p-2" : "border-r-0 bg-transparent px-3 py-4"}
      collapsible="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className={`border border-border bg-background ${isCollapsed ? "rounded-2xl" : "rounded-[18px]"}`}>
        <div className={`flex items-center ${isCollapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-3"}`}>
          {!isCollapsed && (
            <div className="flex flex-col">
              <h2 className="text-lg font-bold text-primary">Aczen</h2>
              <span className="text-xs text-muted-foreground">Workspace</span>
            </div>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="Aczen Logo"
                className="h-6 w-6 object-contain"
              />
            ) : (
              <span className="text-sm font-bold text-primary">A</span>
            )}
          </div>
        </div>

        {!isCollapsed && isCA && (
          <div className="border-t border-border/50 p-3">
            <CAClientSwitcher className="w-full" />
          </div>
        )}
      </div>

      <SidebarContent className={`mt-4 flex h-full flex-col overflow-y-auto border border-border bg-background ${isCollapsed ? "rounded-2xl px-1.5 py-2" : "rounded-[18px] px-2 py-3"}`}>
        <div className="flex-1">
          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="px-3 pb-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Navigation
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>

                {/* Dashboard */}
                {standaloneMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="px-0 py-1">
                      <NavLink
                        to={item.url}
                        className={`${getNavCls(item.url)} flex w-full items-center ${isCollapsed ? "justify-center px-0 py-3" : "px-3 py-3"}`}
                        title={item.title}
                      >
                        <item.icon className="h-7 w-7 shrink-0" />
                        {!isCollapsed && <span className="ml-2">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Sales */}
                <SidebarMenuItem>
                  <Collapsible open={isSalesOpen} onOpenChange={setIsSalesOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/quotations', '/clients', '/invoices', '/payments', '/payment-received', '/notifications', '/cash-memo', '/coming-soon', '/inventory/sales-orders', '/inventory/delivery-challans', '/ca/recurring-invoices'])}`}
                        title="Sales"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsSalesOpen(!isSalesOpen)}>
                          <ShoppingCart className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Sales</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isSalesOpen ? "rotate-90" : ""}`} />
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
                                      className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`}
                                      asChild={false}
                                    />
                                  ) : (
                                    <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                      <item.icon className="h-5 w-5" />
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

                {/* Purchases */}
                <SidebarMenuItem>
                  <Collapsible open={isPurchasesOpen} onOpenChange={setIsPurchasesOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/vendors', '/expenses', '/purchase-bills', '/vendor-advances', '/vendor-bill-payments', '/inventory/purchase-orders'])}`}
                        title="Purchases"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsPurchasesOpen(!isPurchasesOpen)}>
                          <Truck className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Purchases</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isPurchasesOpen ? "rotate-90" : ""}`} />
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
                                      className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`}
                                      asChild={false}
                                    />
                                  ) : (
                                    <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                      <item.icon className="h-5 w-5" />
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

                {/* Inventory */}
                <SidebarMenuItem>
                  <Collapsible open={isInventoryOpen} onOpenChange={setIsInventoryOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/inventory'])}`}
                        title="Inventory"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsInventoryOpen(!isInventoryOpen)}>
                          <Package className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Inventory</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isInventoryOpen ? "rotate-90" : ""}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>
                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {inventorySubItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                    <item.icon className="h-5 w-5" />
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

                {/* Banking */}
                <SidebarMenuItem>
                  <Collapsible open={isBankingOpen} onOpenChange={setIsBankingOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/banking'])}`}
                        title="Banking"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsBankingOpen(!isBankingOpen)}>
                          <Banknote className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Banking</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isBankingOpen ? "rotate-90" : ""}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>
                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {bankingSubItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                    <item.icon className="h-5 w-5" />
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

                {/* Compliance */}
                <SidebarMenuItem>
                  <Collapsible open={isComplianceOpen} onOpenChange={setIsComplianceOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/compliance', '/compliance/gst', '/compliance/mca', '/reports/tds', '/ca/itr6'])}`}
                        title="Compliance"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsComplianceOpen(!isComplianceOpen)}>
                          <CalendarDays className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Compliance</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isComplianceOpen ? "rotate-90" : ""}`} />
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
                                  <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                    <item.icon className="h-5 w-5" />
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

                {/* CA */}
                <SidebarMenuItem>
                  <Collapsible open={isCAToolsOpen} onOpenChange={setIsCAToolsOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/ca', '/accounting'])}`}
                        title="CA"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsCAToolsOpen(!isCAToolsOpen)}>
                          <Calculator className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">CA</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isCAToolsOpen ? "rotate-90" : ""}`} />
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
                                  <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                    <item.icon className="h-5 w-5" />
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

                {/* Reports */}
                <SidebarMenuItem>
                  <Collapsible open={isReportsOpen} onOpenChange={setIsReportsOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/accounting/financial-statements', '/accounting/profit-loss', '/accounting/project-profit-loss'])}`}
                        title="Reports"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsReportsOpen(!isReportsOpen)}>
                          <BarChart3 className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Reports</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isReportsOpen ? "rotate-90" : ""}`} />
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
                                  <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                    <item.icon className="h-5 w-5" />
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

                {/* Space */}
                <SidebarMenuItem>
                  <Collapsible open={isSpaceOpen} onOpenChange={setIsSpaceOpen} className="w-full">
                    <div className="w-full">
                      <SidebarMenuButton
                        asChild
                        className={`w-full px-0 py-1 ${collapsibleActiveCls(['/space'])}`}
                        title="Space"
                      >
                        <CollapsibleTrigger className={triggerCls} onClick={() => setIsSpaceOpen(!isSpaceOpen)}>
                          <FolderKanban className="h-6 w-6 shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="ml-2">Space</span>
                              <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 ${isSpaceOpen ? "rotate-90" : ""}`} />
                            </>
                          )}
                        </CollapsibleTrigger>
                      </SidebarMenuButton>
                      {!isCollapsed && (
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                          <SidebarMenuSub>
                            {spaceMenuItems.map((item) => (
                              <SidebarMenuSubItem key={item.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink to={item.url} className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`} title={item.title}>
                                    <item.icon className="h-5 w-5" />
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

                {/* Apps */}
                {appsMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="px-0 py-1">
                      <NavLink
                        to={item.url}
                        className={`${getNavCls(item.url)} flex w-full items-center ${isCollapsed ? "justify-center px-0 py-3" : "px-3 py-3"}`}
                        title={item.title}
                      >
                        <item.icon className="h-7 w-7 shrink-0" />
                        {!isCollapsed && <span className="ml-2">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>

        {/* Footer */}
        <div className={`mt-2 space-y-2 border-t border-border/50 pt-3 ${isCollapsed ? "px-0" : "px-1"}`}>
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            onClick={() => signOut()}
            className={`w-full rounded-xl border border-primary/10 bg-background/60 ${isCollapsed ? "justify-center px-0" : "justify-start px-3"}`}
            title="Sign Out"
          >
            <LogOut className="h-6 w-6 shrink-0" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
