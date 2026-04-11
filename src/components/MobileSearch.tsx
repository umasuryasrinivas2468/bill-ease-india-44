import React, { useState, useEffect } from 'react';
import { Search, Filter, X, FileText, Users, Building2, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/ClerkAuthProvider';

interface SearchResult {
  id: string;
  type: 'invoice' | 'client' | 'vendor' | 'product';
  title: string;
  subtitle: string;
  amount?: number;
  route: string;
}

interface MobileSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSearch({ open, onOpenChange }: MobileSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'invoice' | 'client' | 'vendor' | 'product'>('all');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setResults([]);
      return;
    }

    const searchData = async () => {
      if (!user) return;
      
      setLoading(true);
      const searchResults: SearchResult[] = [];
      const query = searchQuery.toLowerCase();

      try {
        // Search Invoices
        if (filterType === 'all' || filterType === 'invoice') {
          const { data: invoices } = await supabase
            .from('invoices')
            .select('id, invoice_number, client_name, total_amount, status')
            .eq('user_id', user.id)
            .or(`invoice_number.ilike.%${query}%,client_name.ilike.%${query}%`)
            .limit(5);

          invoices?.forEach(invoice => {
            searchResults.push({
              id: invoice.id,
              type: 'invoice',
              title: invoice.invoice_number,
              subtitle: invoice.client_name,
              amount: invoice.total_amount,
              route: '/invoices',
            });
          });
        }

        // Search Clients
        if (filterType === 'all' || filterType === 'client') {
          const { data: clients } = await supabase
            .from('clients')
            .select('id, name, email, phone')
            .eq('user_id', user.id)
            .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(5);

          clients?.forEach(client => {
            searchResults.push({
              id: client.id,
              type: 'client',
              title: client.name,
              subtitle: client.email || client.phone || 'No contact info',
              route: '/clients',
            });
          });
        }

        // Search Vendors
        if (filterType === 'all' || filterType === 'vendor') {
          const { data: vendors } = await supabase
            .from('vendors')
            .select('id, name, email, phone')
            .eq('user_id', user.id)
            .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(5);

          vendors?.forEach(vendor => {
            searchResults.push({
              id: vendor.id,
              type: 'vendor',
              title: vendor.name,
              subtitle: vendor.email || vendor.phone || 'No contact info',
              route: '/vendors',
            });
          });
        }

        // Search Products
        if (filterType === 'all' || filterType === 'product') {
          const { data: products } = await supabase
            .from('inventory')
            .select('id, product_name, sku, selling_price')
            .eq('user_id', user.id)
            .or(`product_name.ilike.%${query}%,sku.ilike.%${query}%`)
            .limit(5);

          products?.forEach(product => {
            searchResults.push({
              id: product.id,
              type: 'product',
              title: product.product_name,
              subtitle: `SKU: ${product.sku}`,
              amount: product.selling_price,
              route: '/inventory',
            });
          });
        }

        setResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      searchData();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, filterType, user]);

  const handleResultClick = (result: SearchResult) => {
    navigate(result.route);
    onOpenChange(false);
    setSearchQuery('');
  };

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
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search across invoices, clients, vendors, and products
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-4 pb-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Type to search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4"
                autoFocus
              />
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFilterType('all')}>
                  All Types
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('invoice')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Invoices
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('client')}>
                  <Users className="mr-2 h-4 w-4" />
                  Clients
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('vendor')}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Vendors
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('product')}>
                  <Package className="mr-2 h-4 w-4" />
                  Products
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {filterType !== 'all' && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {filterType}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterType('all')}
                className="h-6 text-xs"
              >
                Clear filter
              </Button>
            </div>
          )}
        </div>

        <ScrollArea className="h-[400px] px-4 pb-4">
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              Searching...
            </div>
          )}
          
          {!loading && searchQuery && results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No results found for "{searchQuery}"
            </div>
          )}
          
          {!loading && results.length > 0 && (
            <div className="space-y-2">
              {results.map((result) => (
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
                      {result.amount && (
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
          
          {!loading && !searchQuery && (
            <div className="text-center py-8 text-muted-foreground">
              Start typing to search...
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
