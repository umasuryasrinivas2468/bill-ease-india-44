import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useAuth } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import Dashboard from '@/pages/Dashboard';
import Invoices from '@/pages/Invoices';
import Clients from '@/pages/Clients';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Support from '@/pages/Support';
import CA from '@/pages/CA';
import Marketplace from '@/pages/Marketplace';
import Notifications from '@/pages/Notifications';
import Inventory from '@/pages/Inventory';
import Quotations from '@/pages/Quotations';
import ManualJournals from '@/pages/accounting/ManualJournals';
import Ledgers from '@/pages/accounting/Ledgers';
import TrialBalance from '@/pages/accounting/TrialBalance';
import ChartOfAccounts from '@/pages/accounting/ChartOfAccounts';
import ProfitLoss from '@/pages/accounting/ProfitLoss';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  return userId ? (
    children
  ) : (
    <RedirectToSignIn />
  );
};

function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <div className="min-h-screen flex w-full">
            <AppSidebar />
            <main className="flex-1">
              <Router>
                <Routes>
                  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
                  <Route path="/quotations" element={<ProtectedRoute><Quotations /></ProtectedRoute>} />
                  <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
                  <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                  <Route path="/ca" element={<ProtectedRoute><CA /></ProtectedRoute>} />
                  <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                  <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
                  <Route path="/accounting/manual-journals" element={<ProtectedRoute><ManualJournals /></ProtectedRoute>} />
                  <Route path="/accounting/ledgers" element={<ProtectedRoute><Ledgers /></ProtectedRoute>} />
                  <Route path="/accounting/trial-balance" element={<ProtectedRoute><TrialBalance /></ProtectedRoute>} />
                  <Route path="/accounting/chart-of-accounts" element={<ProtectedRoute><ChartOfAccounts /></ProtectedRoute>} />
                  <Route path="/accounting/profit-loss" element={<ProtectedRoute><ProfitLoss /></ProtectedRoute>} />
                </Routes>
              </Router>
            </main>
          </div>
        </SidebarProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
