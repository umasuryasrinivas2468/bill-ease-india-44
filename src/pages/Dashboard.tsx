
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Users, IndianRupee, TrendingUp, Plus, CheckCircle, Search, Building2, Package, BookOpen, FileSpreadsheet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SearchResult {
  id: string;
  type: 'invoice' | 'client' | 'vendor' | 'product' | 'journal' | 'account';
  title: string;
  subtitle: string;
  amount?: number;
  route: string;
}

const Dashboard = () => {
  const { data: dashboardData, isLoading } = useDashboardStats();
  const { user: clerkUser } = useAuth();
  const { supabaseUser, loading: userLoading } = useSupabaseUser();
  const navigate = useNavigate();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const searchData = async () => {
      if (!clerkUser) return;
      
      setSearching(true);
      setShowResults(true);
      const results: SearchResult[] = [];
      const query = searchQuery.toLowerCase();

      try {
        // Search Invoices
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, client_name, total_amount, status')
          .eq('user_id', clerkUser.id)
          .or(`invoice_number.ilike.%${query}%,client_name.ilike.%${query}%`)
          .limit(5);

        invoices?.forEach(invoice => {
          results.push({
            id: invoice.id,
            type: 'invoice',
            title: invoice.invoice_number,
            subtitle: invoice.client_name,
            amount: invoice.total_amount,
            route: '/invoices',
          });
        });

        // Search Clients
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name, email, phone')
          .eq('user_id', clerkUser.id)
          .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        clients?.forEach(client => {
          results.push({
            id: client.id,
            type: 'client',
            title: client.name,
            subtitle: client.email || client.phone || 'No contact info',
            route: '/clients',
          });
        });

        // Search Vendors
        const { data: vendors } = await supabase
          .from('vendors')
          .select('id, name, email, phone')
          .eq('user_id', clerkUser.id)
          .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        vendors?.forEach(vendor => {
          results.push({
            id: vendor.id,
            type: 'vendor',
            title: vendor.name,
            subtitle: vendor.email || vendor.phone || 'No contact info',
            route: '/vendors',
          });
        });

        // Search Products
        const { data: products } = await supabase
          .from('inventory')
          .select('id, product_name, sku, selling_price')
          .eq('user_id', clerkUser.id)
          .or(`product_name.ilike.%${query}%,sku.ilike.%${query}%`)
          .limit(5);

        products?.forEach(product => {
          results.push({
            id: product.id,
            type: 'product',
            title: product.product_name,
            subtitle: `SKU: ${product.sku}`,
            amount: product.selling_price,
            route: '/inventory',
          });
        });

        // Search Journals
        const { data: journals } = await supabase
          .from('journals')
          .select('id, journal_number, narration, total_debit')
          .eq('user_id', clerkUser.id)
          .or(`journal_number.ilike.%${query}%,narration.ilike.%${query}%`)
          .limit(5);

        journals?.forEach(journal => {
          results.push({
            id: journal.id,
            type: 'journal',
            title: journal.journal_number,
            subtitle: journal.narration,
            amount: journal.total_debit,
            route: '/accounting/journals',
          });
        });

        // Search Accounts (Ledgers)
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, account_name, account_code, opening_balance')
          .eq('user_id', clerkUser.id)
          .or(`account_name.ilike.%${query}%,account_code.ilike.%${query}%`)
          .limit(5);

        accounts?.forEach(account => {
          results.push({
            id: account.id,
            type: 'account',
            title: account.account_name,
            subtitle: `Code: ${account.account_code}`,
            amount: account.opening_balance,
            route: '/accounting/ledgers',
          });
        });

        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(() => {
      searchData();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, clerkUser]);

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'invoice':
        return <FileText className="h-4 w-4" />;
      case 'client':
        return <Users className="h-4 w-4" />;
      case 'vendor':
        return <Building2 className="h-4 w-4" />;
      case 'product':
        return <Package className="h-4 w-4" />;
      case 'journal':
        return <BookOpen className="h-4 w-4" />;
      case 'account':
        return <FileSpreadsheet className="h-4 w-4" />;
    }
  };

  const getTypeBadgeColor = (type: SearchResult['type']) => {
    switch (type) {
      case 'invoice':
        return 'bg-blue-500/10 text-blue-600';
      case 'client':
        return 'bg-green-500/10 text-green-600';
      case 'vendor':
        return 'bg-purple-500/10 text-purple-600';
      case 'product':
        return 'bg-orange-500/10 text-orange-600';
      case 'journal':
        return 'bg-pink-500/10 text-pink-600';
      case 'account':
        return 'bg-cyan-500/10 text-cyan-600';
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.route);
    setSearchQuery('');
    setShowResults(false);
  };

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
      <div className="flex flex-col gap-4">
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

        {/* Search Bar */}
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search invoices, clients, vendors, products, journals, ledgers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery && setShowResults(true)}
            className="pl-10 rounded-full"
          />
          
          {/* Search Results Dropdown */}
          {showResults && (
            <Card className="absolute top-full mt-2 w-full z-50 shadow-lg max-h-[400px] overflow-hidden">
              <ScrollArea className="h-full max-h-[400px]">
                <CardContent className="p-4">
                  {searching && (
                    <div className="text-center py-4 text-muted-foreground">
                      Searching...
                    </div>
                  )}
                  
                  {!searching && searchResults.length === 0 && searchQuery && (
                    <div className="text-center py-4 text-muted-foreground">
                      No results found for "{searchQuery}"
                    </div>
                  )}
                  
                  {!searching && searchResults.length > 0 && (
                    <div className="space-y-2">
                      {searchResults.map((result) => (
                        <button
                          key={`${result.type}-${result.id}`}
                          onClick={() => handleResultClick(result)}
                          className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-muted-foreground">
                              {getIcon(result.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">{result.title}</span>
                                <Badge className={`text-xs ${getTypeBadgeColor(result.type)}`}>
                                  {result.type}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground truncate">
                                {result.subtitle}
                              </div>
                              {result.amount !== undefined && (
                                <div className="text-sm font-medium text-primary mt-1">
                                  ₹{result.amount.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          )}
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

      {/* Mobile Quick Action Button */}
      <div className="fixed bottom-6 right-6 sm:hidden">
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
