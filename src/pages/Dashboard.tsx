import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, IndianRupee, TrendingUp, Plus, Clock, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

const Dashboard = () => {
  const { data: dashboardData, isLoading } = useDashboardStats();
  const { user: clerkUser } = useAuth();
  const { supabaseUser, loading: userLoading } = useSupabaseUser();

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Loading your dashboard...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: "Total Invoices",
      value: dashboardData?.totalInvoices.toString() || "0",
      description: "All time",
      icon: FileText,
      color: "text-blue-600",
    },
    {
      title: "Total Clients",
      value: dashboardData?.totalClients.toString() || "0",
      description: "Active clients",
      icon: Users,
      color: "text-green-600",
    },
    {
      title: "Revenue",
      value: `₹${dashboardData?.totalRevenue.toLocaleString() || "0"}`,
      description: "Total earned",
      icon: IndianRupee,
      color: "text-purple-600",
    },
    {
      title: "Pending Amount",
      value: `₹${dashboardData?.pendingAmount.toLocaleString() || "0"}`,
      description: "Outstanding",
      icon: TrendingUp,
      color: "text-orange-600",
    },
  ];

  const updates = [
    {
      id: 1,
      title: "New Dashboard Design",
      description: "Updated dashboard with improved UI and dark mode support",
      date: "2024-07-15",
      type: "feature",
      status: "completed"
    }
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome to your Aczen Bilz dashboard</p>
          </div>
        </div>
        <div className="hidden sm:flex gap-3">
          <Button asChild variant="orange">
            <Link to="/create-invoice">
              <Plus className="h-4 w-4 mr-2" />
              Create Invoice
            </Link>
          </Button>
          <a 
            href="https://supernova.axisbank.com/current-account?cta=ca-productpagebanner-5thdec&_gl=1*1b8l05o*_gcl_au*MTUyODMzNjA2MC4xNzU0NzYwODQx*_ga*MTQ3NzU4NDg4NC4xNzU0NzYwODQx*_ga_CH41PE7401*czE3NTQ3NjA4NDEkbzEkZzAkdDE3NTQ3NjA4NDEkajYwJGwwJGgzOTc5NjY3Nzc."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white hover:from-[#4C51E6] hover:to-[#F16A3F] border-0"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Current Account
          </a>
        </div>
      </div>

      {/* Updates Section */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Updates</CardTitle>
          <CardDescription>Recent changes and announcements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {updates.map((update) => (
              <div key={update.id} className="flex items-start gap-3 p-3 border rounded-lg bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white">
                <div className="mt-1">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-white">{update.title}</h4>
                    <span className="text-xs px-2 py-1 rounded-full bg-white/20 text-white">
                      {update.type}
                    </span>
                  </div>
                  <p className="text-sm text-white/90 mb-1">{update.description}</p>
                  <p className="text-xs text-white/80">{update.date}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
            <CardDescription>Your latest invoice activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboardData?.recentInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No invoices created yet</p>
                  <Button asChild className="mt-4" variant="orange">
                    <Link to="/create-invoice">Create Your First Invoice</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {dashboardData?.recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">₹{Number(invoice.total_amount).toLocaleString()}</p>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          invoice.status === 'paid' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {invoice.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full mt-4" asChild>
                    <Link to="/invoices">View All Invoices</Link>
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/create-invoice">
                <Plus className="h-4 w-4 mr-2" />
                Create New Invoice
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/clients">
                <Users className="h-4 w-4 mr-2" />
                Add New Client
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/reports">
                <TrendingUp className="h-4 w-4 mr-2" />
                View GST Reports
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/settings">
                <FileText className="h-4 w-4 mr-2" />
                Update Business Info
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Quick Action Buttons */}
      <div className="fixed bottom-6 right-6 sm:hidden space-y-3">
        <a 
          href="https://supernova.axisbank.com/current-account?cta=ca-productpagebanner-5thdec&_gl=1*1b8l05o*_gcl_au*MTUyODMzNjA2MC4xNzU0NzYwODQx*_ga*MTQ3NzU4NDg4NC4xNzU0NzYwODQx*_ga_CH41PE7401*czE3NTQ3NjA4NDEkbzEkZzAkdDE3NTQ3NjA4NDEkajYwJGwwJGgzOTc5NjY3Nzc."
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full h-14 w-14 shadow-lg bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white hover:from-[#4C51E6] hover:to-[#F16A3F] transition-all duration-200"
        >
          <ExternalLink className="h-6 w-6" />
        </a>
        <Button asChild size="lg" className="rounded-full h-14 w-14 shadow-lg" variant="orange">
          <Link to="/create-invoice">
            <Plus className="h-6 w-6" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
