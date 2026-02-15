
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, IndianRupee, TrendingUp, Plus, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

// Ad component renders the AdSense <ins> and ensures the script is loaded.
function OnlyForYouAd() {
  React.useEffect(() => {
    try {
      // add script if not already present
      const existing = Array.from(document.scripts).find(s => s.src.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));
      if (!existing) {
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7244347008549487';
        s.crossOrigin = 'anonymous';
        document.head.appendChild(s);
      }
      // push ad render
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      ;(window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // ignore errors in ad render
      // console.warn('adsbygoogle push failed', e);
    }
  }, []);

  return (
    <div>
      <ins className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-7244347008549487"
        data-ad-slot="4310946291"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>
    </div>
  );
}

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
        <Button asChild className="hidden sm:flex" variant="orange">
          <Link to="/create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Link>
        </Button>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-none lg:col-span-2">
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
                    <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-none">
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

        {/* Only For You ad panel */}
        <Card>
          <CardHeader>
            <CardTitle>Only For You</CardTitle>
            <CardDescription>Sponsored</CardDescription>
          </CardHeader>
          <CardContent>
            <OnlyForYouAd />
          </CardContent>
        </Card>
      </div>

      {/* Mobile Quick Action Button removed per request */}
    </div>
  );
};

export default Dashboard;
