import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import AuthProvider from "@/components/ClerkAuthProvider";
import ProtectedRoute from "@/components/ClerkProtectedRoute";

import Index from "./pages/Index";
import ClerkLogin from "./pages/ClerkLogin";
import Invoices from "./pages/Invoices";
import Quotations from "./pages/Quotations";
import Inventory from "./pages/Inventory";
import Banking from "./pages/Banking";
import TimeTracking from "./pages/TimeTracking";
import CreateInvoice from "./pages/CreateInvoice";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import CA from "./pages/CA";
import Marketplace from "./pages/Marketplace";
import UPICollections from "./pages/UPICollections";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <SidebarProvider>
          <div className="min-h-screen flex w-full">
            <AppSidebar />
            <SidebarInset>
              <Toaster />
              <BrowserRouter>
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
                    path="/banking" 
                    element={
                      <ProtectedRoute>
                        <Banking />
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
                    path="/upi-collections" 
                    element={
                      <ProtectedRoute>
                        <UPICollections />
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
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
