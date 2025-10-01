import React, { useState, useEffect } from 'react';
import { Search, DollarSign, FileText, Calendar, TrendingUp } from 'lucide-react';
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

interface Receivable {
  id: string;
  customer_name: string;
  customer_email?: string;
  related_sales_order_id?: string;
  related_sales_order_number?: string;
  invoice_number?: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string;
  status: 'pending' | 'overdue' | 'paid' | 'partial';
  payment_date?: string;
  notes?: string;
  is_from_sales_order?: boolean;
  created_at: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-800',
};

export default function Receivables() {
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
      
      // Fetch existing receivables
      const { data: receivablesData, error: receivablesError } = await supabase
        .from('receivables' as any)
        .select('*')
        .eq('user_id', user?.id)
        .order('due_date', { ascending: true });

      if (receivablesError) throw receivablesError;

      // Fetch confirmed sales orders that are not fully paid and don't have receivables yet
      const { data: salesOrdersData, error: salesOrdersError } = await supabase
        .from('sales_orders' as any)
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'confirmed')
        .neq('payment_status', 'paid')
        .order('due_date', { ascending: true });

      if (salesOrdersError) throw salesOrdersError;

      // Convert sales orders to receivable format and filter out those that already have receivables
      const existingOrderIds = (receivablesData || [])
        .map((r: any) => r.related_sales_order_id)
        .filter(Boolean);

      const salesOrdersAsReceivables = (salesOrdersData || [])
        .filter((order: any) => !existingOrderIds.includes(order.id))
        .map((order: any) => ({
          id: `so-${order.id}`, // Prefix to distinguish from real receivables
          user_id: order.user_id,
          customer_name: order.client_name,
          customer_email: order.client_email,
          customer_phone: order.client_phone,
          related_sales_order_id: order.id,
          related_sales_order_number: order.order_number,
          invoice_number: order.order_number,
          amount_due: order.total_amount,
          amount_paid: 0,
          amount_remaining: order.total_amount,
          due_date: order.due_date,
          status: new Date(order.due_date) < new Date() ? 'overdue' : 'pending',
          payment_date: null,
          notes: order.notes,
          created_at: order.created_at,
          updated_at: order.updated_at,
          is_from_sales_order: true // Flag to identify these
        }));

      // Combine both datasets
      const allReceivables = [...(receivablesData || []), ...salesOrdersAsReceivables] as Receivable[];
      setReceivables(allReceivables);
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
          receivable.related_sales_order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      const receivable = receivables.find(r => r.id === receivableId);
      
      // If this is from a sales order (not a real receivable yet), handle differently
      if (receivable?.is_from_sales_order) {
        // Update the sales order payment status directly
        const actualOrderId = receivableId.replace('so-', '');
        const { error } = await supabase
          .from('sales_orders' as any)
          .update({ payment_status: 'paid' })
          .eq('id', actualOrderId);

        if (error) throw error;
      } else {
        // Handle regular receivables
        const { error } = await supabase
          .from('receivables' as any)
          .update({
            status: 'paid',
            amount_paid: amount,
            amount_remaining: 0,
            payment_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', receivableId);

        if (error) throw error;

        // Also update the related sales order payment status if exists
        if (receivable?.related_sales_order_id) {
          await supabase
            .from('sales_orders' as any)
            .update({ payment_status: 'paid' })
            .eq('id', receivable.related_sales_order_id);
        }
      }

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

  const getOverdueDays = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
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
            <div className="text-2xl font-bold">₹{summary.total.toFixed(2)}</div>
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
            <div className="text-2xl font-bold text-red-600">₹{summary.overdue.toFixed(2)}</div>
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
            <div className="text-2xl font-bold text-yellow-600">₹{summary.pending.toFixed(2)}</div>
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
            <div className="text-2xl font-bold text-green-600">₹{summary.paid.toFixed(2)}</div>
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
                <TableHead>Related Order</TableHead>
                <TableHead>Amount Due</TableHead>
                <TableHead>Amount Remaining</TableHead>
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
                    <div>
                      {receivable.related_sales_order_number && (
                        <div className="font-medium">{receivable.related_sales_order_number}</div>
                      )}
                      {receivable.invoice_number && (
                        <div className="text-sm text-muted-foreground">Invoice: {receivable.invoice_number}</div>
                      )}
                      {!receivable.related_sales_order_number && !receivable.invoice_number && (
                        <div className="text-sm text-muted-foreground">Direct entry</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>₹{receivable.amount_due.toFixed(2)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">₹{receivable.amount_remaining.toFixed(2)}</div>
                      {receivable.amount_paid > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Paid: ₹{receivable.amount_paid.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{new Date(receivable.due_date).toLocaleDateString()}</div>
                      {receivable.status === 'overdue' && (
                        <div className="text-sm text-red-500">
                          {getOverdueDays(receivable.due_date)} days overdue
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[receivable.status]}>
                      {receivable.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {receivable.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAsPaid(receivable.id, receivable.amount_due)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Mark Paid
                      </Button>
                    )}
                    {receivable.payment_date && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Paid: {new Date(receivable.payment_date).toLocaleDateString()}
                      </div>
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