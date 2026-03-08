import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Calendar, Clock, Trash2, Play, Pause } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import ClientSelector from '@/components/ClientSelector';
import { Client } from '@/hooks/useClients';
import { normalizeUserId } from '@/lib/userUtils';

interface RecurringInvoice {
  id: string;
  user_id: string;
  client_name: string;
  client_email?: string;
  client_gst_number?: string;
  amount: number;
  gst_rate: number;
  items: any[];
  frequency: string;
  cron_expression: string;
  next_run_date: string;
  last_run_date?: string;
  is_active: boolean;
  total_generated: number;
  notes?: string;
  created_at: string;
}

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Every Week', cron: '0 9 * * 1' },
  { value: 'biweekly', label: 'Every 2 Weeks', cron: '0 9 1,15 * *' },
  { value: 'monthly_1st', label: 'Monthly (1st)', cron: '0 9 1 * *' },
  { value: 'monthly_15th', label: 'Monthly (15th)', cron: '0 9 15 * *' },
  { value: 'quarterly', label: 'Quarterly', cron: '0 9 1 1,4,7,10 *' },
  { value: 'half_yearly', label: 'Half Yearly', cron: '0 9 1 1,7 *' },
  { value: 'yearly', label: 'Yearly', cron: '0 9 1 4 *' },
  { value: 'custom', label: 'Custom Cron', cron: '' },
];

const getNextRunDate = (frequency: string, customCron?: string): string => {
  const now = new Date();
  switch (frequency) {
    case 'weekly': {
      const next = new Date(now);
      next.setDate(next.getDate() + (7 - next.getDay() + 1) % 7 || 7);
      return next.toISOString().split('T')[0];
    }
    case 'monthly_1st': {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return next.toISOString().split('T')[0];
    }
    case 'monthly_15th': {
      const day = now.getDate();
      const next = day < 15
        ? new Date(now.getFullYear(), now.getMonth(), 15)
        : new Date(now.getFullYear(), now.getMonth() + 1, 15);
      return next.toISOString().split('T')[0];
    }
    case 'quarterly': {
      const qMonth = Math.ceil((now.getMonth() + 1) / 3) * 3;
      const next = new Date(now.getFullYear(), qMonth, 1);
      return next.toISOString().split('T')[0];
    }
    case 'yearly': {
      const next = new Date(now.getFullYear() + 1, 3, 1);
      return next.toISOString().split('T')[0];
    }
    default: {
      const next = new Date(now);
      next.setDate(next.getDate() + 30);
      return next.toISOString().split('T')[0];
    }
  }
};

const RecurringInvoices = () => {
  const { toast } = useToast();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const userId = user ? normalizeUserId(user.id) : null;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [frequency, setFrequency] = useState('monthly_1st');
  const [customCron, setCustomCron] = useState('');
  const [notes, setNotes] = useState('');

  const { data: recurring = [], isLoading } = useQuery({
    queryKey: ['recurring-invoices', userId],
    queryFn: async () => {
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('recurring_invoices')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RecurringInvoice[];
    },
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !selectedClient) throw new Error('Missing data');
      const freq = FREQUENCY_OPTIONS.find(f => f.value === frequency);
      const cronExpr = frequency === 'custom' ? customCron : (freq?.cron || '0 9 1 * *');
      const amountNum = parseFloat(amount) || 0;
      const gstNum = parseFloat(gstRate) || 18;
      
      const { error } = await supabase.from('recurring_invoices').insert({
        user_id: userId,
        client_name: selectedClient.name,
        client_email: selectedClient.email,
        client_gst_number: selectedClient.gst_number,
        amount: amountNum,
        gst_rate: gstNum,
        items: [],
        frequency,
        cron_expression: cronExpr,
        next_run_date: getNextRunDate(frequency, customCron),
        is_active: true,
        total_generated: 0,
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      toast({ title: 'Recurring invoice created' });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('recurring_invoices')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      toast({ title: 'Recurring invoice deleted' });
    },
  });

  const generateNowMutation = useMutation({
    mutationFn: async (rec: RecurringInvoice) => {
      if (!userId) throw new Error('Not authenticated');
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      const today = new Date();
      const due = new Date(today.getTime() + 30 * 86400000);
      const invoiceNumber = `INV-${today.getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
      const gstAmount = Math.round((rec.amount * rec.gst_rate) / 100);

      const { error } = await supabase.from('invoices').insert({
        user_id: userId,
        invoice_number: invoiceNumber,
        client_name: rec.client_name,
        client_email: rec.client_email,
        client_gst_number: rec.client_gst_number,
        amount: rec.amount,
        gst_rate: rec.gst_rate,
        gst_amount: gstAmount,
        total_amount: rec.amount + gstAmount,
        invoice_date: today.toISOString().split('T')[0],
        due_date: due.toISOString().split('T')[0],
        status: 'pending',
        items: rec.items,
        notes: `Auto-generated from recurring invoice`,
      });
      if (error) throw error;

      await supabase
        .from('recurring_invoices')
        .update({
          last_run_date: today.toISOString().split('T')[0],
          next_run_date: getNextRunDate(rec.frequency),
          total_generated: (rec.total_generated || 0) + 1,
        })
        .eq('id', rec.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Invoice generated successfully' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setSelectedClient(null);
    setAmount('');
    setGstRate('18');
    setFrequency('monthly_1st');
    setCustomCron('');
    setNotes('');
  };

  const activeCount = recurring.filter(r => r.is_active).length;
  const totalGenerated = recurring.reduce((s, r) => s + (r.total_generated || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recurring Invoices</h1>
            <p className="text-sm text-muted-foreground">Automate invoice generation with custom schedules</p>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Schedule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Recurring Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Client</Label>
                <ClientSelector selectedClient={selectedClient} onSelect={setSelectedClient} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (₹)</Label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" />
                </div>
                <div>
                  <Label>GST Rate (%)</Label>
                  <Select value={gstRate} onValueChange={setGstRate}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[0, 5, 12, 18, 28].map(r => (
                        <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {frequency === 'custom' && (
                <div>
                  <Label>Cron Expression</Label>
                  <Input value={customCron} onChange={e => setCustomCron(e.target.value)} placeholder="0 9 1 * *" />
                  <p className="text-xs text-muted-foreground mt-1">Format: minute hour day month weekday</p>
                </div>
              )}
              <div>
                <Label>Notes (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Monthly retainer" />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={!selectedClient || !amount || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{recurring.length}</p>
                <p className="text-sm text-muted-foreground">Total Schedules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Play className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalGenerated}</p>
                <p className="text-sm text-muted-foreground">Invoices Generated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Schedules</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : recurring.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No recurring invoices yet. Create one to automate billing.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurring.map(rec => {
                  const freqLabel = FREQUENCY_OPTIONS.find(f => f.value === rec.frequency)?.label || rec.cron_expression;
                  const gstAmt = Math.round((rec.amount * rec.gst_rate) / 100);
                  const total = rec.amount + gstAmt;
                  return (
                    <TableRow key={rec.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rec.client_name}</p>
                          {rec.client_email && <p className="text-xs text-muted-foreground">{rec.client_email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>₹{total.toLocaleString('en-IN')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{freqLabel}</Badge>
                      </TableCell>
                      <TableCell>{rec.next_run_date}</TableCell>
                      <TableCell>{rec.total_generated}</TableCell>
                      <TableCell>
                        <Switch
                          checked={rec.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: rec.id, is_active: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => generateNowMutation.mutate(rec)}
                            disabled={generateNowMutation.isPending}
                            title="Generate now"
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(rec.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecurringInvoices;
