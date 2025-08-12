
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Users, FileText, TrendingUp, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardStats } from '@/hooks/useDashboardStats';

const Dashboard = () => {
  const { data: stats, isLoading } = useDashboardStats();

  // Provide default values for all stats properties
  const statsWithDefaults = {
    totalRevenue: stats?.totalRevenue || 0,
    totalInvoices: stats?.totalInvoices || 0,
    totalClients: stats?.totalClients || 0,
    pendingAmount: stats?.pendingAmount || 0,
    thisMonthRevenue: stats?.thisMonthRevenue || 0,
    outstandingInvoices: stats?.outstandingInvoices || 0,
    averageInvoiceValue: stats?.averageInvoiceValue || 0,
    recentInvoices: stats?.recentInvoices || []
  };

  const quickActions = [
    {
      title: 'Create Invoice',
      description: 'Generate a new invoice for your client',
      icon: PlusCircle,
      href: '/invoices/create',
      color: 'bg-blue-500',
    },
    {
      title: 'Add Client',
      description: 'Add a new client to your database',
      icon: Users,
      href: '/clients',
      color: 'bg-green-500',
    },
    {
      title: 'View Reports',
      description: 'Check your business analytics',
      icon: TrendingUp,
      href: '/reports',
      color: 'bg-purple-500',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-6 bg-gray-200 rounded w-16 animate-pulse mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome back! Here's what's happening with your business.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{statsWithDefaults.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+20.1% from last month</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsWithDefaults.totalInvoices}</div>
            <p className="text-xs text-muted-foreground">+180.1% from last month</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsWithDefaults.totalClients}</div>
            <p className="text-xs text-muted-foreground">+19% from last month</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{statsWithDefaults.pendingAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+201 since last hour</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => (
          <Card key={action.title} className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link to={action.href}>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <div className={`p-2 rounded-lg ${action.color}`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{action.title}</CardTitle>
                </div>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
            </Link>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">No recent activity to display.</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">This Month's Revenue:</span>
                <span className="text-sm font-medium">₹{statsWithDefaults.thisMonthRevenue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Outstanding Invoices:</span>
                <span className="text-sm font-medium">{statsWithDefaults.outstandingInvoices}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Average Invoice Value:</span>
                <span className="text-sm font-medium">₹{statsWithDefaults.averageInvoiceValue.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
