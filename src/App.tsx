
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/ClerkAuthProvider";
import { SupabaseAuthProvider } from "@/components/SupabaseAuthProvider";
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from "./components/AppLayout";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Invoices from "./pages/Invoices";
import CreateInvoice from "./pages/CreateInvoice";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import ClerkLogin from "./pages/ClerkLogin";
import Onboarding from "./pages/Onboarding";
import TimeTracking from "./pages/TimeTracking";
import Inventory from "./pages/Inventory";
import SalesOrders from "./pages/SalesOrders";
import PurchaseOrders from "./pages/PurchaseOrders";
import Receivables from "./pages/Receivables";
import Payables from "./pages/Payables";
import Banking from "./pages/Banking";
import UPICollections from "./pages/UPICollections";
import Marketplace from "./pages/Marketplace";
import Support from "./pages/Support";
import Notifications from "./pages/Notifications";
import CA from "./pages/CA";
import Payout from "./pages/Payout";
import Quotations from "./pages/Quotations";
import QuotationsInfo from "./pages/QuotationsInfo";
import NotFound from "./pages/NotFound";
import CashFlowForecasting from "./pages/CashFlowForecasting";

import AIBusinessTaxAdvisor from "./pages/AIBusinessTaxAdvisor";
import Branding from "./pages/Branding";
import ComplianceCalendar from "./pages/ComplianceCalendar";
import Loans from "./pages/Loans";
import Payments from "./pages/Payments";
import Vendors from "./pages/Vendors";
import PayLink from "./pages/PayLink";
import GST3Filing from "./pages/reports/GST3Filing";
import Expenses from "./pages/Expenses";
import Payroll from "./pages/Payroll";
import TDS from "./pages/TDS";
import DeliveryChallans from "./pages/DeliveryChallans";
import ITR6Filing from "./pages/ITR6Filing";

// License pages
import StarterPage from "./pages/StarterPage";
import GrowthPage from "./pages/GrowthPage";
import ScalePage from "./pages/ScalePage";
import { LicenseVerificationHandler } from "./components/LicenseVerificationHandler";
import { UnauthorizedAccessPage } from "./pages/UnauthorizedAccessPage";
import PlanTestPage from "./pages/PlanTestPage";
// Plan-restricted components
import { createPlanRestrictedRoute } from "./components/withPlanAccess";


// Accounting pages
import ChartOfAccounts from "./pages/accounting/ChartOfAccounts";
import Ledgers from "./pages/accounting/Ledgers";
import TrialBalance from "./pages/accounting/TrialBalance";
import ProfitLoss from "./pages/accounting/ProfitLoss";
import ManualJournals from "./pages/accounting/ManualJournals";
import FinancialStatements from "./pages/FinancialStatements";

const queryClient = new QueryClient();

// Create plan-restricted route components
const PlanRestrictedLoans = createPlanRestrictedRoute(
  Loans,
  'loans',
  'Loans',
  'Access loan products and financing options for your business'
);

// Business Reports is now available for all plans - no restriction needed

const PlanRestrictedAITaxAdvisor = createPlanRestrictedRoute(
  AIBusinessTaxAdvisor,
  'virtualCFO',
  'AI Tax Advisor',
  'Get AI-powered tax advice and CFO insights for your business'
);

const PlanRestrictedCashFlowForecasting = createPlanRestrictedRoute(
  CashFlowForecasting,
  'cashFlowForecasting',
  'Cash Flow Forecasting',
  'Predict and manage your business cash flow with advanced analytics'
);

const PlanRestrictedSalesOrders = createPlanRestrictedRoute(
  SalesOrders,
  'salesOrders',
  'Sales Orders',
  'Manage and track your sales orders efficiently'
);

const PlanRestrictedPurchaseOrders = createPlanRestrictedRoute(
  PurchaseOrders,
  'purchaseOrders',
  'Purchase Orders',
  'Create and manage purchase orders for your business'
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <AuthProvider>
          <SupabaseAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <LicenseVerificationHandler />
              <Routes>
                {/* Public license pages without sidebar */}
                <Route path="/starter.202512a" element={<StarterPage />} />
                <Route path="/growth.202514b" element={<GrowthPage />} />
                <Route path="/scale.202516c" element={<ScalePage />} />

                {/* Unauthorized access page */}
                <Route path="/unauthorized-access" element={<UnauthorizedAccessPage />} />

                {/* Routes with AppLayout (sidebar) */}
                <Route path="/*" element={
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/clerk-login" element={<ClerkLogin />} />

                      {/* Protected Routes */}
                      <Route element={<ProtectedRoute />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/invoices" element={<Invoices />} />
                        <Route path="/create-invoice" element={<CreateInvoice />} />
                        <Route path="/clients" element={<Clients />} />
                        <Route path="/reports" element={<Reports />} />
                        <Route path="/compliance" element={<ComplianceCalendar />} />
                        <Route path="/loans" element={<PlanRestrictedLoans />} />
                        <Route path="/reports/cash-flow-forecasting" element={<PlanRestrictedCashFlowForecasting />} />
                        <Route path="/reports/ai-tax-advisor" element={<PlanRestrictedAITaxAdvisor />} />
                        <Route path="/reports/gst3-filing" element={<GST3Filing />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/onboarding" element={<Onboarding />} />
                        <Route path="/time-tracking" element={<TimeTracking />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/inventory/delivery-challans" element={<DeliveryChallans />} />
                        <Route path="/inventory/sales-orders" element={<PlanRestrictedSalesOrders />} />
                        <Route path="/inventory/purchase-orders" element={<PlanRestrictedPurchaseOrders />} />
                        <Route path="/reports/receivables" element={<Receivables />} />
                        <Route path="/reports/payables" element={<Payables />} />
                        <Route path="/banking" element={<Banking />} />
                        <Route path="/payroll" element={<Payroll />} />
                        <Route path="/upi-collections" element={<UPICollections />} />
                        <Route path="/marketplace" element={<Marketplace />} />
                        <Route path="/support" element={<Support />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/ca" element={<CA />} />
                        <Route path="/ca/itr6" element={<ITR6Filing />} />
                        <Route path="/payout" element={<Payout />} />
                        <Route path="/quotations" element={<QuotationsInfo />} />
                        <Route path="/quotations/create" element={<Quotations />} />
                        <Route path="/branding" element={<Branding />} />
                        <Route path="/payments" element={<Payments />} />
                        <Route path="/vendors" element={<Vendors />} />

                        {/* Plan Test Route - For development/testing */}
                        <Route path="/plan-test" element={<PlanTestPage />} />

                        {/* Accounting Routes */}
                        <Route path="/accounting/chart-of-accounts" element={<ChartOfAccounts />} />
                        <Route path="/accounting/ledgers" element={<Ledgers />} />
                        <Route path="/accounting/trial-balance" element={<TrialBalance />} />
                        <Route path="/accounting/profit-loss" element={<ProfitLoss />} />
                        <Route path="/accounting/manual-journals" element={<ManualJournals />} />
                        <Route path="/accounting/financial-statements" element={<FinancialStatements />} />
                        <Route path="/expenses" element={<Expenses />} />
                        <Route path="/reports/tds" element={<TDS />} />
                      </Route>

                      {/* Public payment landing (customers) */}
                      <Route path="/pay" element={<PayLink />} />

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                } />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
          </SupabaseAuthProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
