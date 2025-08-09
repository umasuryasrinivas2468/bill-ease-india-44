
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  Users, 
  FileText, 
  TrendingUp, 
  Calendar,
  Bell,
  ExternalLink,
  CreditCard
} from 'lucide-react';
import { useBusinessData } from '@/hooks/useBusinessData';
import { useDashboardStats } from '@/hooks/useDashboardStats';

const Dashboard = () => {
  const { getBusinessInfo } = useBusinessData();
  const businessInfo = getBusinessInfo();
  const { data: stats, isLoading } = useDashboardStats();

  const handleOpenCurrentAccount = () => {
    window.open('https://supernova.axisbank.com/current-account?cta=ca-productpagebanner-5thdec&_gl=1*1b8l05o*_gcl_au*MTUyODMzNjA2MC4xNzU0NzYwODQx*_ga*MTQ3NzU4NDg4NC4xNzU0NzYwODQx*_ga_CH41PE7401*czE3NTQ3NjA4NDEkbzEkZzAkdDE3NTQ3NjA4NDEkajYwJGwwJGgzOTc5NjY3Nzc.', '_blank');
  };

  const recentUpdates = [
    {
      type: 'feature' as const,
      title: 'New Dashboard Design',
      description: 'Enhanced user experience with improved navigation and analytics',
      date: '2024-07-15',
      gradient: true
    }
  ];

  const getUpdateTypeColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'improvement':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'announcement':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back{businessInfo?.ownerName ? `, ${businessInfo.ownerName}` : ''}!
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening with your business today.
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button onClick={handleOpenCurrentAccount} className="bg-orange-500 hover:bg-orange-600">
            <CreditCard className="w-4 h-4 mr-2" />
            Open Current Account
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
          <Button>
            <Calendar className="w-4 h-4 mr-2" />
            Today
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : `₹${(stats?.totalRevenue || 0).toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Clients
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : stats?.totalClients || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              +180.1% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : stats?.totalInvoices || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              +19% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Growth Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+12.5%</div>
            <p className="text-xs text-muted-foreground">
              +4% from last month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Updates */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Invoice INV-001 paid</p>
                <p className="text-xs text-muted-foreground">2 hours ago</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">New client added: Acme Corp</p>
                <p className="text-xs text-muted-foreground">5 hours ago</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Invoice INV-002 sent</p>
                <p className="text-xs text-muted-foreground">1 day ago</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Updates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Latest Updates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentUpdates.map((update, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={getUpdateTypeColor(update.type)}>
                    {update.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{update.date}</span>
                </div>
                <div className={update.gradient ? 'bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white p-3 rounded-lg' : ''}>
                  <h4 className="font-medium">{update.title}</h4>
                  <p className={`text-sm ${update.gradient ? 'text-white/90' : 'text-muted-foreground'}`}>
                    {update.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
