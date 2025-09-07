
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/ClerkAuthProvider";
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
import TDS from "./pages/TDS";
import AIBusinessTaxAdvisor from "./pages/AIBusinessTaxAdvisor";
import Branding from "./pages/Branding";


// Accounting pages
import ChartOfAccounts from "./pages/accounting/ChartOfAccounts";
import Ledgers from "./pages/accounting/Ledgers";
import TrialBalance from "./pages/accounting/TrialBalance";
import ProfitLoss from "./pages/accounting/ProfitLoss";
import ManualJournals from "./pages/accounting/ManualJournals";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
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
                    <Route path="/reports/cash-flow-forecasting" element={<CashFlowForecasting />} />
                    <Route path="/reports/ai-tax-advisor" element={<AIBusinessTaxAdvisor />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/time-tracking" element={<TimeTracking />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/banking" element={<Banking />} />
                    <Route path="/upi-collections" element={<UPICollections />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/ca" element={<CA />} />
                    <Route path="/payout" element={<Payout />} />
                    <Route path="/quotations" element={<QuotationsInfo />} />
                    <Route path="/quotations/create" element={<Quotations />} />
                    <Route path="/branding" element={<Branding />} />
                    <Route path="/tds" element={<TDS />} />
                    
                    {/* Accounting Routes */}
                    <Route path="/accounting/chart-of-accounts" element={<ChartOfAccounts />} />
                    <Route path="/accounting/ledgers" element={<Ledgers />} />
                    <Route path="/accounting/trial-balance" element={<TrialBalance />} />
                    <Route path="/accounting/profit-loss" element={<ProfitLoss />} />
                    <Route path="/accounting/manual-journals" element={<ManualJournals />} />
                  </Route>
                  
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppLayout>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
