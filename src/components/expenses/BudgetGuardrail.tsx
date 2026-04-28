import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useExpenses } from '@/hooks/useExpenses';
import { useExpenseCategories } from '@/hooks/useExpenses';
import { normalizeUserId } from '@/lib/userUtils';
import { formatINR } from '@/lib/gst';

interface Budget {
  id: string;
  name: string;
  category_name?: string;
  cost_center?: string;
  department?: string;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  amount: number;
  warn_at_percent: number;
  is_active: boolean;
}

// #18 Budget Guardrail System — set monthly/quarterly/yearly budgets per
// category or cost center. App computes spend against each budget and
// raises the 80% / 100% / overspend alerts.
const BudgetGuardrail: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: expenses = [] } = useExpenses();
  const { data: categories = [] } = useExpenseCategories();

  const [name, setName] = useState('');
  const [categoryName, setCategoryName] = useState<string>('any');
  const [periodType, setPeriodType] = useState<Budget['period_type']>('monthly');
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return d.toISOString().slice(0, 10);
  });
  const [amount, setAmount] = useState('');

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', uid)
        .order('period_start', { ascending: false });
      if (error) throw error;
      return (data || []) as Budget[];
    },
    enabled: !!uid,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not signed in');
      if (!name || !amount) throw new Error('Name and amount required');
      const { error } = await supabase.from('budgets').insert({
        user_id: uid,
        name,
        category_name: categoryName === 'any' ? null : categoryName,
        period_type: periodType,
        period_start: start,
        period_end: end,
        amount: Number(amount),
        warn_at_percent: 80,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Budget created' });
      qc.invalidateQueries({ queryKey: ['budgets', uid] });
      setName(''); setAmount('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', uid] }),
  });

  const rows = useMemo(() => {
    return budgets.map((b) => {
      const spent = expenses
        .filter((e: any) => {
          if (b.category_name && e.category_name !== b.category_name) return false;
          if (b.cost_center && e.cost_center !== b.cost_center) return false;
          if (e.expense_date < b.period_start || e.expense_date > b.period_end) return false;
          return true;
        })
        .reduce((s, e: any) => s + Number(e.total_amount || 0), 0);
      const pct = b.amount > 0 ? (spent / Number(b.amount)) * 100 : 0;
      const status = pct > 100 ? 'overspend' : pct >= 100 ? 'reached' : pct >= b.warn_at_percent ? 'warn' : 'ok';
      return { ...b, spent, pct, status };
    });
  }, [budgets, expenses]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> Budget Guardrail System
        </CardTitle>
        <CardDescription>
          Set budgets per category / cost center. Get warned at 80%, 100%, and overspend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-sm">New budget</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing — Apr 2026" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={categoryName} onValueChange={setCategoryName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any (overall)</SelectItem>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.category_name}>{c.category_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Period</Label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as Budget['period_type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <Label className="text-xs">Budget amount</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-xs" />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Add budget
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No budgets configured.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-xs">{r.category_name || 'Overall'}</TableCell>
                  <TableCell className="text-xs">{r.period_start} → {r.period_end}</TableCell>
                  <TableCell className="text-right">{formatINR(r.amount)}</TableCell>
                  <TableCell className="text-right">{formatINR(r.spent)}</TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(100, r.pct)} className="h-2" />
                      <Badge variant={
                        r.status === 'overspend' ? 'destructive' :
                        r.status === 'reached' ? 'destructive' :
                        r.status === 'warn' ? 'secondary' : 'outline'
                      }>
                        {r.pct.toFixed(0)}%
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default BudgetGuardrail;
