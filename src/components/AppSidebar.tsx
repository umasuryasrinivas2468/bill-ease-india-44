
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Users,
  BarChart3,
  Building2,
  Calculator,
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
  FolderKanban,
  GitMerge,
  IndianRupee,
  Brain,
  Filter,
  Send,
  UserRound,
  ScanLine,
  LayoutDashboard,
  BookOpen,
  RotateCcw,
  ShieldCheck,
  Boxes,
  Move3d,
  ClipboardList,
  FileSpreadsheet,
  CalendarClock,
  Lock,
  Briefcase,
  PieChart,
  TrendingDown,
  ClipboardCheck,
  Plus,
  Wrench,
  Shield,
  HardHat,
  ArrowDownToLine,
  Bell,
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

type FeatureKey = "salesOrders" | "purchaseOrders";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: FeatureKey;
}

interface NavSection {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const comingSoon = (feature: string) =>
  `/coming-soon?feature=${encodeURIComponent(feature)}`;

const SECTIONS: NavSection[] = [
  {
    key: "sales",
    title: "Sales",
    icon: ShoppingCart,
    items: [
      { title: "AR Dashboard", url: "/ar-dashboard", icon: LayoutDashboard },
      { title: "Clients", url: "/clients", icon: Users },
      { title: "Quotations", url: "/quotations", icon: Quote },
      { title: "Sales Orders", url: "/inventory/sales-orders", icon: ClipboardList, feature: "salesOrders" },
      { title: "Delivery Challan", url: "/inventory/delivery-challans", icon: Truck },
      { title: "Invoices", url: "/invoices", icon: FileText },
      { title: "Payment Receipts", url: "/payment-received", icon: IndianRupee },
      { title: "Credit Notes", url: comingSoon("Credit Notes"), icon: ScrollText },
      { title: "Sales Returns", url: "/sales-returns", icon: RotateCcw },
      { title: "Recurring Invoices", url: "/ca/recurring-invoices", icon: RefreshCw },
      { title: "E-Way Bills", url: comingSoon("E-Way Bills"), icon: Truck },
      { title: "Customer Ledger", url: "/customer-ledger", icon: BookOpen },
      { title: "AR Reports", url: "/ar-reports", icon: BarChart3 },
      { title: "Invoice Intelligence", url: "/invoices/intelligence", icon: Filter },
    ],
  },
  {
    key: "purchases",
    title: "Purchases",
    icon: Truck,
    items: [
      { title: "AP Dashboard", url: "/ap-dashboard", icon: LayoutDashboard },
      { title: "Vendors", url: "/vendors", icon: Users },
      { title: "Purchase Orders", url: "/inventory/purchase-orders", icon: ClipboardList, feature: "purchaseOrders" },
      { title: "AP Intake", url: "/ap-intake", icon: ScanLine },
      { title: "Purchase Bills", url: "/purchase-bills", icon: FileText },
      { title: "Expenses", url: "/expenses", icon: Receipt },
      { title: "Vendor Advances", url: "/vendor-advances", icon: Banknote },
      { title: "Bill Payments", url: "/vendor-bill-payments", icon: Wallet },
      { title: "Purchase Returns", url: "/purchase-returns", icon: RotateCcw },
      { title: "Debit Notes", url: comingSoon("Debit Notes"), icon: ScrollText },
      { title: "Recurring Bills", url: "/expenses?tab=recurring", icon: RefreshCw },
      { title: "Vendor Ledger", url: "/vendor-ledger", icon: BookOpen },
      { title: "AP Reports", url: "/ap-dashboard", icon: BarChart3 },
      { title: "Expense Intelligence", url: "/expenses/intelligence", icon: Filter },
    ],
  },
  {
    key: "inventory",
    title: "Inventory",
    icon: Package,
    items: [
      { title: "Inventory Dashboard", url: "/inventory/dashboard", icon: LayoutDashboard },
      { title: "Item Master", url: "/inventory", icon: Boxes },
      { title: "Stock Movements", url: "/accounting/financial-statements?tab=stock", icon: Move3d },
      { title: "Warehouse Transfers", url: "/inventory/transfers", icon: Truck },
      { title: "Stock Adjustments", url: "/inventory/adjustments", icon: Calculator },
      { title: "Inventory MIS", url: "/inventory/dashboard", icon: BarChart3 },
      { title: "Inventory Insights", url: "/inventory/insights", icon: Sparkles },
    ],
  },
  {
    key: "banking",
    title: "Banking",
    icon: Banknote,
    items: [
      { title: "Banking Dashboard", url: "/banking", icon: LayoutDashboard },
      { title: "Beneficiaries", url: "/banking/beneficiaries", icon: UserRound },
      { title: "Send Money", url: "/banking/send-money", icon: Send },
      { title: "Payment Hub", url: "/payment-hub", icon: IndianRupee },
      { title: "Payment Links", url: "/payments", icon: Wallet },
      { title: "Bank Reconciliation", url: "/banking/reconciliation", icon: GitMerge },
    ],
  },
  {
    key: "compliance",
    title: "Compliance",
    icon: ShieldCheck,
    items: [
      { title: "GST Dashboard", url: "/compliance/gst", icon: Scale },
      { title: "GSTR-1", url: comingSoon("GSTR-1"), icon: FileText },
      { title: "GSTR-3B", url: "/reports/gst3-filing", icon: FileText },
      { title: "GSTR-2A", url: "/compliance/gstr-2a", icon: FileText },
      { title: "GSTR-2B", url: "/accounting/financial-statements?tab=journal-first", icon: FileText },
      { title: "GST Reconciliation", url: "/compliance/gst-reconciliation", icon: GitMerge },
      { title: "ITC Center", url: "/reports/gst-itc", icon: Percent },
      { title: "TDS", url: "/reports/tds", icon: Percent },
      { title: "ITR", url: "/ca/itr6", icon: FileText },
      { title: "MCA Filing", url: "/compliance/mca", icon: Building2 },
      { title: "Compliance Calendar", url: "/compliance", icon: CalendarDays },
    ],
  },
  {
    key: "accounting",
    title: "Accounting",
    icon: Calculator,
    items: [
      { title: "Journal Entries", url: "/accounting/manual-journals", icon: ClipboardCheck },
      { title: "General Ledger", url: "/accounting/ledgers", icon: BookOpen },
      { title: "Sub-Ledgers", url: "/accounting/sub-ledgers", icon: BookOpen },
      { title: "Customer Ledger", url: "/customer-ledger", icon: BookOpen },
      { title: "Vendor Ledger", url: "/vendor-ledger", icon: BookOpen },
      { title: "Chart of Accounts", url: "/accounting/chart-of-accounts", icon: ListTree },
      { title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
      { title: "Cost Centers", url: "/cost-centers", icon: FolderKanban },
      { title: "Financial Year Closing", url: comingSoon("Financial Year Closing"), icon: Lock },
      { title: "CA Workspace", url: "/ca", icon: Briefcase },
    ],
  },
  {
    key: "space",
    title: "Space",
    icon: FolderKanban,
    items: [
      { title: "Projects", url: "/space/projects", icon: FolderKanban },
      { title: "Timesheet", url: "/space/timesheet", icon: CalendarClock },
    ],
  },
  {
    key: "fixed-assets",
    title: "Fixed Assets",
    icon: Boxes,
    items: [
      { title: "Asset Dashboard", url: "/assets", icon: BarChart3 },
      { title: "Asset Register", url: "/assets/register", icon: ListTree },
      { title: "New Asset", url: "/assets/create", icon: Plus },
      { title: "Capitalization Queue", url: "/assets/capitalize", icon: Receipt },
      { title: "Depreciation Run", url: "/assets/depreciation", icon: CalendarClock },
      { title: "Depreciation Calendar", url: "/assets/depreciation-calendar", icon: CalendarDays },
      { title: "Maintenance", url: "/assets/maintenance", icon: Wrench },
      { title: "Warranty & Insurance", url: "/assets/coverage", icon: Shield },
      { title: "Transfers", url: "/assets/transfers", icon: Move3d },
      { title: "Allocations", url: "/assets/allocations", icon: UserRound },
      { title: "Verification & Audit", url: "/assets/audit", icon: ClipboardCheck },
      { title: "Leased Assets", url: "/leases", icon: Briefcase },
      { title: "Capital WIP", url: "/assets/cwip", icon: HardHat },
      { title: "Disposal Approvals", url: "/assets/disposals", icon: ArrowDownToLine },
    ],
  },
  {
    key: "liabilities",
    title: "Liabilities & Loans",
    icon: Banknote,
    items: [
      { title: "Liabilities Dashboard", url: "/liabilities", icon: BarChart3 },
      { title: "All Liabilities", url: "/liabilities/list", icon: ListTree },
      { title: "New Liability", url: "/liabilities/create", icon: Plus },
      { title: "EMI Calendar", url: "/liabilities/emi-calendar", icon: CalendarDays },
      { title: "Forecast", url: "/liabilities/forecast", icon: TrendingDown },
      { title: "Covenants", url: "/liabilities/covenants", icon: ShieldCheck },
      { title: "Net Worth", url: "/liabilities/health", icon: PieChart },
      { title: "Automation Hub", url: "/automation", icon: Bell },
    ],
  },
  {
    key: "reports",
    title: "Reports",
    icon: BarChart3,
    items: [
      { title: "Financial Statements", url: "/accounting/financial-statements", icon: FileSpreadsheet },
      { title: "Profit & Loss", url: "/accounting/profit-loss", icon: TrendingUp },
      { title: "Balance Sheet", url: "/accounting/financial-statements?tab=balance", icon: Scale },
      { title: "Cash Flow", url: "/reports/cash-flow-forecasting", icon: TrendingDown },
      { title: "Project P&L", url: "/accounting/project-profit-loss", icon: FolderKanban },
      { title: "Profitability (Project/Branch/CC)", url: "/reports/profitability", icon: PieChart },
      { title: "AP Aging", url: "/ap-dashboard", icon: CalendarClock },
      { title: "AR Aging", url: "/ar-reports?tab=aging", icon: CalendarClock },
      { title: "GST Reports", url: "/reports/gst-itc", icon: Percent },
      { title: "Inventory Reports", url: "/accounting/financial-statements?tab=inv-ageing", icon: Package },
      { title: "MIS Reports", url: "/accounting/financial-statements?tab=mis", icon: PieChart },
      { title: "Asset/Liability MIS", url: "/reports/asset-liability-mis", icon: PieChart },
      { title: "CFO Snapshot", url: "/reports/cfo-snapshot", icon: Brain },
      { title: "AI Insights", url: "/insights", icon: Sparkles },
      { title: "Document Vault", url: "/vault", icon: FileText },
      { title: "Approvals", url: "/approvals", icon: ClipboardCheck },
      { title: "Aczen CFO Insights", url: "/aczen-cfo", icon: Brain },
    ],
  },
];

const SCOPED_SECTION_KEYS = new Set(["banking", "compliance"]);

const findActiveSectionKey = (path: string): string | null => {
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const section of SECTIONS) {
    for (const item of section.items) {
      const base = item.url.split("?")[0];
      if (base && (path === base || path.startsWith(`${base}/`))) {
        if (base.length > bestLen) {
          bestLen = base.length;
          bestKey = section.key;
        }
      }
    }
  }
  return bestKey;
};

const findScopedSectionKey = (path: string): string | null => {
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const section of SECTIONS) {
    if (!SCOPED_SECTION_KEYS.has(section.key)) continue;
    for (const item of section.items) {
      const base = item.url.split("?")[0];
      if (base && (path === base || path.startsWith(`${base}/`))) {
        if (base.length > bestLen) {
          bestLen = base.length;
          bestKey = section.key;
        }
      }
    }
  }
  return bestKey;
};

export function AppSidebar() {
  const { state, setOpen } = useSidebar();
  const location = useLocation();
  const { signOut } = useClerk();
  const { hasRole } = useAuthorization();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const isCA = hasRole("ca");

  const activeKey = useMemo(() => findActiveSectionKey(currentPath), [currentPath]);
  const scopedKey = useMemo(() => findScopedSectionKey(currentPath), [currentPath]);
  const visibleSections = useMemo(
    () =>
      scopedKey
        ? SECTIONS.filter((s) => s.key === scopedKey)
        : SECTIONS.filter((s) => !SCOPED_SECTION_KEYS.has(s.key)),
    [scopedKey]
  );
  const [openSection, setOpenSection] = useState<string | null>(scopedKey ?? activeKey);

  useEffect(() => {
    if (scopedKey) setOpenSection(scopedKey);
    else if (activeKey) setOpenSection(activeKey);
  }, [scopedKey, activeKey]);

  const collapseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    collapseTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const logoSrc = "/aczen-logo.png";

  const isActive = (url: string) => {
    const base = url.split("?")[0];
    if (!base) return false;
    if (base === "/dashboard") return currentPath === "/" || currentPath === "/dashboard";
    if (currentPath === base) return true;
    return currentPath.startsWith(`${base}/`);
  };

  const getNavCls = (url: string) =>
    isActive(url)
      ? "rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
      : "rounded-xl text-foreground font-medium hover:bg-primary/10 hover:text-foreground";

  const sectionActiveCls = (key: string) =>
    activeKey === key
      ? "rounded-xl bg-primary text-primary-foreground font-semibold"
      : "rounded-xl text-foreground font-medium hover:bg-primary/10 hover:text-foreground";

  const triggerCls = isCollapsed
    ? "flex w-full items-center justify-center rounded-xl px-0 py-3"
    : "flex w-full items-center rounded-xl px-3 py-3";

  const handleSectionToggle = (key: string, next: boolean) => {
    setOpenSection(next ? key : null);
  };

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
              <img src={logoSrc} alt="Aczen Logo" className="h-6 w-6 object-contain" />
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

      <SidebarContent
        className={`mt-4 flex h-full flex-col overflow-y-auto border border-border bg-background ${
          isCollapsed ? "rounded-2xl px-1.5 py-2" : "rounded-[18px] px-2 py-3"
        }`}
      >
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
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="px-0 py-1">
                    <NavLink
                      to="/dashboard"
                      className={`${getNavCls("/dashboard")} flex w-full items-center ${
                        isCollapsed ? "justify-center px-0 py-3" : "px-3 py-3"
                      }`}
                      title="Dashboard"
                    >
                      <LayoutDashboard className="h-6 w-6 shrink-0" />
                      {!isCollapsed && <span className="ml-2">Dashboard</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {visibleSections.map((section) => {
                  const SectionIcon = section.icon;
                  const isOpen = openSection === section.key;
                  return (
                    <SidebarMenuItem key={section.key}>
                      <Collapsible
                        open={isOpen}
                        onOpenChange={(next) => handleSectionToggle(section.key, next)}
                        className="w-full"
                      >
                        <div className="w-full">
                          <SidebarMenuButton
                            asChild
                            className={`w-full px-0 py-1 ${sectionActiveCls(section.key)}`}
                            title={section.title}
                          >
                            <CollapsibleTrigger className={triggerCls}>
                              <SectionIcon className="h-6 w-6 shrink-0" />
                              {!isCollapsed && (
                                <>
                                  <span className="ml-2">{section.title}</span>
                                  <ChevronRight
                                    className={`ml-auto h-4 w-4 transition-transform duration-200 ${
                                      isOpen ? "rotate-90" : ""
                                    }`}
                                  />
                                </>
                              )}
                            </CollapsibleTrigger>
                          </SidebarMenuButton>
                          {!isCollapsed && (
                            <CollapsibleContent className="transition-all duration-200 ease-in-out">
                              <SidebarMenuSub>
                                {section.items.map((item) => (
                                  <SidebarMenuSubItem key={item.title}>
                                    <SidebarMenuSubButton asChild>
                                      {item.feature ? (
                                        <PlanAwareMenuItem
                                          title={item.title}
                                          url={item.url}
                                          icon={item.icon}
                                          feature={item.feature}
                                          className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`}
                                          asChild={false}
                                        />
                                      ) : (
                                        <NavLink
                                          to={item.url}
                                          className={`${getNavCls(item.url)} ml-4 px-3 py-2.5 text-sm`}
                                          title={item.title}
                                        >
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
                  );
                })}
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
            className={`w-full rounded-xl border border-primary/10 bg-background/60 ${
              isCollapsed ? "justify-center px-0" : "justify-start px-3"
            }`}
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
