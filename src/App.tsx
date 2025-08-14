
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/components/ClerkAuthProvider";
import ClerkProtectedRoute from "@/components/ClerkProtectedRoute";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import CreateInvoice from "./pages/CreateInvoice";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Marketplace from "./pages/Marketplace";
import Support from "./pages/Support";
import Notifications from "./pages/Notifications";
import CA from "./pages/CA";
import Payout from "./pages/Payout";
import UPICollections from "./pages/UPICollections";
import ClerkLogin from "./pages/ClerkLogin";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import Quotations from "./pages/Quotations";
import Inventory from "./pages/Inventory";
import TimeTracking from "./pages/TimeTracking";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<ClerkLogin />} />
                <Route path="/onboarding/:sessionId?" element={<Onboarding />} />
                <Route path="/" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Index />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/dashboard" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Dashboard />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/create-invoice" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <CreateInvoice />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/invoices" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Invoices />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/quotations" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Quotations />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/inventory" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Inventory />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/time-tracking" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <TimeTracking />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/clients" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Clients />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Reports />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Settings />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/marketplace" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Marketplace />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/support" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Support />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/notifications" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Notifications />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/ca" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <CA />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/payout" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <Payout />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="/upi-collections" element={
                  <ClerkProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full bg-background">
                        <AppSidebar />
                        <main className="flex-1 overflow-auto">
                          <UPICollections />
                        </main>
                      </div>
                    </SidebarProvider>
                  </ClerkProtectedRoute>
                } />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
