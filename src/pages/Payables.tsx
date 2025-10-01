import React, { useState, useEffect } from 'react';
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

interface Payable {
  id: string;
  vendor_name: string;
  vendor_email?: string;
  related_purchase_order_id?: string;
  related_purchase_order_number?: string;
  bill_number?: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string;
  status: 'pending' | 'overdue' | 'paid' | 'partial';
  payment_date?: string;
  notes?: string;
  created_at: string;
  is_from_purchase_order?: boolean;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-800',
};

export default function Payables() {
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
      
      // Fetch payables only (no purchase_orders or apps table)
      const { data: payablesData, error: payablesError } = await supabase
        .from('payables' as any)
        .select('*')
        .eq('user_id', user?.id)
        .order('due_date', { ascending: true });

      if (payablesError) throw payablesError;

      setPayables((payablesData || []) as any);
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
          payable.related_purchase_order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          payable.bill_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((payable) => payable.status === statusFilter);
    }

    setFilteredPayables(filtered);
  };

  const markAsPaid = async (payableId: string, amount: number) => {
    try {
      const payable = payables.find(p => p.id === payableId);
      
      // If this is from a purchase order (not a real payable yet), handle differently
      if (payable?.is_from_purchase_order) {
        // Update the purchase order payment status directly
        const actualOrderId = payableId.replace('po-', '');
        const { error } = await supabase
          .from('purchase_orders' as any)
          .update({ payment_status: 'paid' } as any)
          .eq('id', actualOrderId);

        if (error) throw error;
      } else {
        // Handle regular payables
        const { error } = await supabase
          .from('payables' as any)
          .update({
            status: 'paid',
            amount_paid: amount,
            amount_remaining: 0,
            payment_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', payableId);

        if (error) throw error;

        // Also update the related purchase order payment status if exists
        if (payable?.related_purchase_order_id) {
          await supabase
            .from('purchase_orders' as any)
            .update({ payment_status: 'paid' } as any)
            .eq('id', payable.related_purchase_order_id);
        }
      }

      toast({
        title: 'Success',
        description: 'Payment marked as made',
      });

      fetchPayables();
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
            <div className="text-2xl font-bold">₹{summary.total.toFixed(2)}</div>
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
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{summary.paid.toFixed(2)}</div>
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
              {filteredPayables.map((payable) => (
                <TableRow key={payable.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{payable.vendor_name}</div>
                      {payable.vendor_email && (
                        <div className="text-sm text-muted-foreground">{payable.vendor_email}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      {payable.related_purchase_order_number && (
                        <div className="font-medium">{payable.related_purchase_order_number}</div>
                      )}
                      {payable.bill_number && (
                        <div className="text-sm text-muted-foreground">Bill: {payable.bill_number}</div>
                      )}
                      {!payable.related_purchase_order_number && !payable.bill_number && (
                        <div className="text-sm text-muted-foreground">Direct entry</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>₹{payable.amount_due.toFixed(2)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">₹{payable.amount_remaining.toFixed(2)}</div>
                      {payable.amount_paid > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Paid: ₹{payable.amount_paid.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{new Date(payable.due_date).toLocaleDateString()}</div>
                      {payable.status === 'overdue' && (
                        <div className="text-sm text-red-500">
                          {getOverdueDays(payable.due_date)} days overdue
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[payable.status]}>
                      {payable.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {payable.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAsPaid(payable.id, payable.amount_due)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Mark Paid
                      </Button>
                    )}
                    {payable.payment_date && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Paid: {new Date(payable.payment_date).toLocaleDateString()}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredPayables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No payables found
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