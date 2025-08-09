
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import CreateInvoice from "./pages/CreateInvoice";
import Notifications from "./pages/Notifications";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import CA from "./pages/CA";
import Marketplace from "./pages/Marketplace";
import ClerkLogin from "./pages/ClerkLogin";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./components/ClerkAuthProvider";
import ClerkProtectedRoute from "./components/ClerkProtectedRoute";
import Chatbot from "./components/Chatbot";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="lovable-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Chatbot />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<ClerkLogin />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <Dashboard />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/invoices" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <Invoices />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/create-invoice" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <CreateInvoice />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <Notifications />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/clients" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
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
                    <div className="min-h-screen flex w-full">
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
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <Settings />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/support" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <Support />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/ca" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <CA />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="/marketplace" element={
                <ClerkProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full">
                      <AppSidebar />
                      <main className="flex-1 overflow-auto">
                        <Marketplace />
                      </main>
                    </div>
                  </SidebarProvider>
                </ClerkProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
