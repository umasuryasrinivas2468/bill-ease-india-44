
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, IndianRupee, TrendingUp, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';

const Dashboard = () => {
  const stats = [
    {
      title: "Total Invoices",
      value: "24",
      description: "This month",
      icon: FileText,
      color: "text-blue-600",
    },
    {
      title: "Total Clients",
      value: "12",
      description: "Active clients",
      icon: Users,
      color: "text-green-600",
    },
    {
      title: "Revenue",
      value: "₹1,24,500",
      description: "This month",
      icon: IndianRupee,
      color: "text-purple-600",
    },
    {
      title: "Pending Amount",
      value: "₹45,200",
      description: "Outstanding",
      icon: TrendingUp,
      color: "text-orange-600",
    },
  ];

  const recentInvoices = [
    { id: "INV-001", client: "ABC Technologies", amount: "₹25,000", status: "Paid", date: "2024-01-15" },
    { id: "INV-002", client: "XYZ Solutions", amount: "₹18,500", status: "Pending", date: "2024-01-14" },
    { id: "INV-003", client: "Digital Corp", amount: "₹32,000", status: "Paid", date: "2024-01-13" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome to your BillEase dashboard</p>
          </div>
        </div>
        <Button asChild className="hidden sm:flex">
          <Link to="/create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Link>
        </Button>
      </div>

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
              {recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{invoice.id}</p>
                    <p className="text-sm text-muted-foreground">{invoice.client}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{invoice.amount}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      invoice.status === 'Paid' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link to="/invoices">View All Invoices</Link>
            </Button>
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
