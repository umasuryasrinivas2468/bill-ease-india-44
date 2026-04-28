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
import { Badge } from '@/components/ui/badge';
import { Split, Plus, Trash2 } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useExpenses } from '@/hooks/useExpenses';
import { normalizeUserId } from '@/lib/userUtils';
import { formatINR } from '@/lib/gst';

interface Allocation {
  id: string;
  expense_id: string;
  cost_center: string;
  amount: number;
  percent: number | null;
  notes?: string;
}

// #12 Cost Center Allocation Engine — split a single expense (e.g. internet
// bill ₹10,000) across multiple cost centers (Admin / Sales / Ops). Tracks
// the allocations as separate rows so reports can roll up by cost center.
const DEFAULT_CENTERS = ['Admin', 'Sales', 'Ops', 'Marketing', 'Engineering', 'Finance', 'HR'];

const CostCenterAllocator: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [expenseId, setExpenseId] = useState('');
  const [splits, setSplits] = useState<{ cost_center: string; amount: string }[]>([
    { cost_center: 'Admin', amount: '' },
  ]);

  const expense = expenses.find((e: any) => e.id === expenseId);
  const total = Number(expense?.total_amount || 0);
  const allocated = splits.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining = total - allocated;

  const { data: existing = [] } = useQuery({
    queryKey: ['cost-allocations', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('expense_cost_allocations')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Allocation[];
    },
    enabled: !!uid,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!uid || !expense) throw new Error('Pick an expense');
      if (Math.abs(remaining) > 0.01) throw new Error(`Allocations must sum to ${formatINR(total)}`);
      const rows = splits
        .filter(s => s.cost_center && Number(s.amount) > 0)
        .map(s => ({
          user_id: uid,
          expense_id: expenseId,
          cost_center: s.cost_center,
          amount: Number(s.amount),
          percent: total > 0 ? Math.round((Number(s.amount) / total) * 10000) / 100 : null,
        }));
      if (rows.length === 0) throw new Error('Add at least one split');
      const { error } = await supabase.from('expense_cost_allocations').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Allocations saved' });
      qc.invalidateQueries({ queryKey: ['cost-allocations', uid] });
      setSplits([{ cost_center: 'Admin', amount: '' }]);
      setExpenseId('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const summary = useMemo(() => {
    const byCenter = new Map<string, number>();
    existing.forEach((a: Allocation) => {
      byCenter.set(a.cost_center, (byCenter.get(a.cost_center) || 0) + Number(a.amount));
    });
    return Array.from(byCenter.entries())
      .map(([c, amt]) => ({ center: c, amount: amt }))
      .sort((a, b) => b.amount - a.amount);
  }, [existing]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Split className="h-5 w-5" /> Cost Center Allocation Engine
        </CardTitle>
        <CardDescription>
          Split one expense across multiple cost centers — e.g. ₹10,000 internet bill = ₹3k Admin + ₹4k Sales + ₹3k Ops.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-sm">Allocate expense</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Expense</Label>
                <Select value={expenseId} onValueChange={setExpenseId}>
                  <SelectTrigger><SelectValue placeholder="Pick expense" /></SelectTrigger>
                  <SelectContent>
                    {expenses.slice(0, 100).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.expense_number} — {e.vendor_name} — {formatINR(e.total_amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Total to split</Label>
                <Input value={total ? formatINR(total) : ''} readOnly />
              </div>
            </div>

            {splits.map((s, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-2 mb-2">
                <div className="md:col-span-3">
                  <Select
                    value={s.cost_center}
                    onValueChange={(v) => {
                      const next = [...splits]; next[idx].cost_center = v; setSplits(next);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={s.amount}
                    onChange={(e) => {
                      const next = [...splits]; next[idx].amount = e.target.value; setSplits(next);
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSplits(splits.filter((_, i) => i !== idx))}
                  disabled={splits.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center justify-between mt-3">
              <Button
                variant="outline" size="sm"
                onClick={() => setSplits([...splits, { cost_center: 'Admin', amount: '' }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add split
              </Button>
              <div className="flex items-center gap-3 text-sm">
                <span className={Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-amber-600'}>
                  Allocated {formatINR(allocated)} / {formatINR(total)}
                </span>
                <Button onClick={() => save.mutate()} disabled={save.isPending || !expenseId}>
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <h3 className="text-sm font-semibold mb-2">Roll-up by cost center</h3>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cost Center</TableHead>
                <TableHead className="text-right">Total Allocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No allocations yet.</TableCell></TableRow>
              )}
              {summary.map((s) => (
                <TableRow key={s.center}>
                  <TableCell><Badge variant="outline">{s.center}</Badge></TableCell>
                  <TableCell className="text-right">{formatINR(s.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CostCenterAllocator;
