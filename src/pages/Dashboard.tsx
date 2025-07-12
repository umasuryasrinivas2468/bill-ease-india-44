
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, IndianRupee, TrendingUp, Plus } from 'lucide-react';
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
        <Button asChild className="hidden sm:flex">
          <Link to="/create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Link>
        </Button>
      </div>

      {/* Debug User Info */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-sm">Debug: User Sync Status</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div>
              <strong>Clerk User ID:</strong> {clerkUser?.id || 'Not logged in'}
            </div>
            <div>
              <strong>Clerk Email:</strong> {clerkUser?.primaryEmailAddress?.emailAddress || 'N/A'}
            </div>
            <div>
              <strong>Supabase User:</strong> {userLoading ? 'Loading...' : supabaseUser ? 'Found' : 'Not found'}
            </div>
            {supabaseUser && (
              <div>
                <strong>Supabase Record ID:</strong> {supabaseUser.id}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  <Button asChild className="mt-4">
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

      {/* Mobile Quick Action Button */}
      <div className="fixed bottom-6 right-6 sm:hidden">
        <Button asChild size="lg" className="rounded-full h-14 w-14 shadow-lg">
          <Link to="/create-invoice">
            <Plus className="h-6 w-6" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
