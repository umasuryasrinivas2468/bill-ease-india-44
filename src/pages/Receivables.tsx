import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, DollarSign, FileText, Calendar, TrendingUp, ExternalLink } from 'lucide-react';
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

interface Receivable {
  id: string;
  customer_name: string;
  customer_email?: string;
  customer_gst_number?: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string;
  invoice_date: string;
  status: 'paid' | 'pending' | 'overdue' | 'partial';
  notes?: string;
  related_sales_order_id?: string;
  related_sales_order_number?: string;
  created_at: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-800',
};

export default function Receivables() {
  const navigate = useNavigate();
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [filteredReceivables, setFilteredReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { user } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchReceivables();
    }
  }, [user]);

  useEffect(() => {
    filterReceivables();
  }, [receivables, searchTerm, statusFilter]);

  const fetchReceivables = async () => {
    try {
      setLoading(true);
      
      // Fetch unpaid and partially paid invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          client_name,
          client_email,
          client_gst_number,
          total_amount,
          status,
          invoice_date,
          due_date,
          notes,
          created_at
        `)
        .eq('user_id', user?.id)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true });

      if (invoicesError) throw invoicesError;

      // Transform invoices data to receivables format
      const receivablesFromInvoices = (invoicesData || []).map(invoice => {
        const amount_paid = 0; // For now, assuming no partial payments are tracked in invoices table
        const amount_remaining = calculateOutstanding(invoice.total_amount, amount_paid);
        const overdueDays = calculateOverdueDays(invoice.due_date);
        
        return {
          id: invoice.id,
          customer_name: invoice.client_name,
          customer_email: invoice.client_email,
          customer_gst_number: invoice.client_gst_number,
          invoice_number: invoice.invoice_number,
          total_amount: invoice.total_amount,
          amount_paid,
          amount_remaining,
          due_date: invoice.due_date,
          invoice_date: invoice.invoice_date,
          status: overdueDays > 0 ? 'overdue' as const : invoice.status as 'pending' | 'overdue',
          notes: invoice.notes,
          created_at: invoice.created_at,
        };
      });

      setReceivables(receivablesFromInvoices);
    } catch (error) {
      console.error('Error fetching receivables:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch receivables',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterReceivables = () => {
    let filtered = receivables;

    if (searchTerm) {
      filtered = filtered.filter(
        (receivable) =>
          receivable.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          receivable.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((receivable) => receivable.status === statusFilter);
    }

    setFilteredReceivables(filtered);
  };

  const markAsPaid = async (receivableId: string, amount: number) => {
    try {
      // Update the invoice status to 'paid'
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
        })
        .eq('id', receivableId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment marked as received',
      });

      fetchReceivables();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark as paid',
        variant: 'destructive',
      });
    }
  };



  const calculateSummary = () => {
    const total = filteredReceivables.reduce((sum, r) => sum + r.amount_remaining, 0);
    const overdue = filteredReceivables
      .filter(r => r.status === 'overdue')
      .reduce((sum, r) => sum + r.amount_remaining, 0);
    const pending = filteredReceivables
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.amount_remaining, 0);
    const paid = filteredReceivables
      .filter(r => r.status === 'paid')
      .reduce((sum, r) => sum + r.amount_paid, 0);

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
          <h1 className="text-3xl font-bold">Receivables</h1>
          <p className="text-muted-foreground">Track customer payments and outstanding amounts</p>
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
              Amount to be received
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
            <CardTitle className="text-sm font-medium">Received</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatIndianCurrency(summary.paid)}</div>
            <p className="text-xs text-muted-foreground">
              Already received
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
                  placeholder="Customer, Order No, Invoice No"
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

      {/* Receivables Table */}
      <Card>
        <CardHeader>
          <CardTitle>Receivables ({filteredReceivables.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Balance Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReceivables.map((receivable) => (
                <TableRow key={receivable.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{receivable.customer_name}</div>
                      {receivable.customer_email && (
                        <div className="text-sm text-muted-foreground">{receivable.customer_email}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{receivable.invoice_number}</span>
                  </TableCell>
                  <TableCell>{formatIndianCurrency(receivable.total_amount)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-orange-600">{formatIndianCurrency(receivable.amount_remaining)}</div>
                      {receivable.amount_paid > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Paid: {formatIndianCurrency(receivable.amount_paid)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{new Date(receivable.due_date).toLocaleDateString('en-IN')}</div>
                      {receivable.status === 'overdue' && (
                        <div className="text-sm text-red-500">
                          {calculateOverdueDays(receivable.due_date)} days overdue
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[receivable.status]}>
                      {receivable.status.charAt(0).toUpperCase() + receivable.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {receivable.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAsPaid(receivable.id, receivable.amount_remaining)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Mark Paid
                      </Button>
                    )}

                  </TableCell>
                </TableRow>
              ))}
              {filteredReceivables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No receivables found
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