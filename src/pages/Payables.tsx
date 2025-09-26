import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, DollarSign, FileText, Calendar, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { formatIndianCurrency, calculateOverdueDays, determinePaymentStatus, calculateOutstanding } from '@/utils/currencyUtils';

interface Payable {
  id: string;
  vendor_name: string;
  vendor_email?: string;
  vendor_gst?: string;
  order_number: string;
  total_amount: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string;
  order_date: string;
  payment_status: 'paid' | 'unpaid' | 'partial';
  status: 'pending' | 'overdue' | 'paid';
  notes?: string;
  created_at: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-800',
};

export default function Payables() {
  const navigate = useNavigate();
  const [payables, setPayables] = useState<Payable[]>([]);
  const [filteredPayables, setFilteredPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { user } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchPayables();
    }
  }, [user]);

  useEffect(() => {
    filterPayables();
  }, [payables, searchTerm, statusFilter]);

  const fetchPayables = async () => {
    try {
      setLoading(true);
      
      // For now, since there's no purchase_orders table in the current schema,
      // we'll show an empty state with a message about setting up vendor management
      // This can be expanded once the purchase_orders/vendors tables are created
      
      // TODO: Once purchase_orders table is available, implement:
      // - Fetch from purchase_orders where payment_status is 'unpaid' or 'partial'
      // - Transform data to show vendor name, PO number, due date, balance amount
      // - Apply Indian currency formatting
      
      setPayables([]);
    } catch (error) {
      console.error('Error fetching payables:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch payables',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterPayables = () => {
    let filtered = payables;

    if (searchTerm) {
      filtered = filtered.filter(
        (payable) =>
          payable.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          payable.order_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((payable) => payable.status === statusFilter);
    }

    setFilteredPayables(filtered);
  };

  const markAsPaid = async (payableId: string, amount: number) => {
    // TODO: Implement when purchase_orders table is available
    toast({
      title: 'Feature Coming Soon',
      description: 'Payables management will be available once vendor and purchase order tables are set up',
    });
  };

  const getOverdueDays = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const calculateSummary = () => {
    const total = filteredPayables.reduce((sum, p) => sum + p.amount_remaining, 0);
    const overdue = filteredPayables
      .filter(p => p.status === 'overdue')
      .reduce((sum, p) => sum + p.amount_remaining, 0);
    const pending = filteredPayables
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount_remaining, 0);
    const paid = filteredPayables
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount_paid, 0);

    return { total, overdue, pending, paid };
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  const summary = calculateSummary();

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Payables</h1>
          <p className="text-muted-foreground">Track vendor payments and outstanding bills</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.total)}</div>
            <p className="text-xs text-muted-foreground">
              Amount to be paid
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Calendar className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatIndianCurrency(summary.overdue)}</div>
            <p className="text-xs text-muted-foreground">
              Past due date
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <FileText className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{formatIndianCurrency(summary.pending)}</div>
            <p className="text-xs text-muted-foreground">
              Not yet due
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatIndianCurrency(summary.paid)}</div>
            <p className="text-xs text-muted-foreground">
              Already paid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Vendor, Order No, Bill No"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payables Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payables ({filteredPayables.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Related Order</TableHead>
                <TableHead>Amount Due</TableHead>
                <TableHead>Amount Remaining</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {filteredPayables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-4 text-muted-foreground">
                      <FileText className="h-12 w-12" />
                      <div className="text-center">
                        <h3 className="font-medium text-foreground mb-2">No Payables Found</h3>
                        <p className="text-sm">
                          Payables functionality requires vendor and purchase order management.
                        </p>
                        <p className="text-sm">
                          This feature will be available once the purchase orders system is set up.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}