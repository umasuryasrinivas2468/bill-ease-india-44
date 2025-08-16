
import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/components/ClerkAuthProvider";
import ProtectedRoute from "@/components/ClerkProtectedRoute";

import Index from "./pages/Index";
import ClerkLogin from "./pages/ClerkLogin";
import Invoices from "./pages/Invoices";
import Quotations from "./pages/Quotations";
import Inventory from "./pages/Inventory";
import TimeTracking from "./pages/TimeTracking";
import CreateInvoice from "./pages/CreateInvoice";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import CA from "./pages/CA";
import Marketplace from "./pages/Marketplace";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

// New Accounting pages
import ManualJournals from "./pages/accounting/ManualJournals";
import Ledgers from "./pages/accounting/Ledgers";
import TrialBalance from "./pages/accounting/TrialBalance";
import ChartOfAccounts from "./pages/accounting/ChartOfAccounts";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          <BrowserRouter>
            <SidebarProvider>
              <div className="min-h-screen flex w-full">
                <AppSidebar />
                <SidebarInset>
                  <Toaster />
                  <Routes>
                    <Route path="/login" element={<ClerkLogin />} />
                    <Route 
                      path="/" 
                      element={
                        <ProtectedRoute>
                          <Index />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/invoices" 
                      element={
                        <ProtectedRoute>
                          <Invoices />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/quotations" 
                      element={
                        <ProtectedRoute>
                          <Quotations />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/inventory" 
                      element={
                        <ProtectedRoute>
                          <Inventory />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/time-tracking" 
                      element={
                        <ProtectedRoute>
                          <TimeTracking />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/create-invoice" 
                      element={
                        <ProtectedRoute>
                          <CreateInvoice />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/clients" 
                      element={
                        <ProtectedRoute>
                          <Clients />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/reports" 
                      element={
                        <ProtectedRoute>
                          <Reports />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/ca" 
                      element={
                        <ProtectedRoute>
                          <CA />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/marketplace" 
                      element={
                        <ProtectedRoute>
                          <Marketplace />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/notifications" 
                      element={
                        <ProtectedRoute>
                          <Notifications />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/settings" 
                      element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/support" 
                      element={
                        <ProtectedRoute>
                          <Support />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/onboarding" 
                      element={
                        <ProtectedRoute>
                          <Onboarding />
                        </ProtectedRoute>
                      } 
                    />

                    {/* Accounting routes */}
                    <Route 
                      path="/accounting/manual-journals" 
                      element={
                        <ProtectedRoute>
                          <ManualJournals />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/accounting/ledgers" 
                      element={
                        <ProtectedRoute>
                          <Ledgers />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/accounting/trial-balance" 
                      element={
                        <ProtectedRoute>
                          <TrialBalance />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/accounting/chart-of-accounts" 
                      element={
                        <ProtectedRoute>
                          <ChartOfAccounts />
                        </ProtectedRoute>
                      } 
                    />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
