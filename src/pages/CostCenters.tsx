import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import {
  useCostCenters, useCostCenterSpend, useUpsertCostCenter, useDeleteCostCenter, CostCenter,
} from '@/hooks/useCostCenters';

const TYPES = ['department', 'project', 'branch', 'team', 'product', 'other'] as const;

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const blank = {
  id: undefined as string | undefined,
  code: '',
  name: '',
  type: 'department' as CostCenter['type'],
  description: '',
  budget_amount: 0,
  is_active: true,
};

const CostCenters: React.FC = () => {
  const { data: list = [], isLoading } = useCostCenters();
  const { data: spend = [] } = useCostCenterSpend();
  const upsert = useUpsertCostCenter();
  const remove = useDeleteCostCenter();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);

  const spendMap = new Map(spend.map(s => [s.cost_center_id, s]));

  const onEdit = (cc: CostCenter) => {
    setForm({
      id: cc.id,
      code: cc.code,
      name: cc.name,
      type: cc.type,
      description: cc.description || '',
      budget_amount: cc.budget_amount || 0,
      is_active: cc.is_active,
    });
    setOpen(true);
  };

  const onSave = async () => {
    if (!form.code || !form.name) return;
    await upsert.mutateAsync(form);
    setOpen(false);
    setForm(blank);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Cost Centers</h1>
          <p className="text-muted-foreground">
            Tag bills, expenses & journals to a department, project or branch to track spend.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(blank); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm(blank)}>
              <Plus className="mr-2 h-4 w-4" />
              New Cost Center
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Edit' : 'New'} Cost Center</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code *</Label>
                <Input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="DEPT-01" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v as CostCenter['type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Sales · North Zone" />
              </div>
              <div className="col-span-2">
                <Label>Budget (annual)</Label>
                <Input type="number" value={form.budget_amount} onChange={(e) => setForm(p => ({ ...p, budget_amount: Number(e.target.value || 0) }))} />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onSave} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            All Cost Centers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cost centers yet. Create one and start tagging bills & expenses.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spend (Bills + Exp)</TableHead>
                  <TableHead className="text-right">Utilization</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(cc => {
                  const s = spendMap.get(cc.id);
                  const total = Number(s?.total_spend || 0);
                  const util = cc.budget_amount > 0 ? (total / cc.budget_amount) * 100 : 0;
                  return (
                    <TableRow key={cc.id}>
                      <TableCell className="font-mono">{cc.code}</TableCell>
                      <TableCell>
                        {cc.name}
                        {!cc.is_active && <Badge variant="secondary" className="ml-2">inactive</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{cc.type}</Badge></TableCell>
                      <TableCell className="text-right">{inr(cc.budget_amount)}</TableCell>
                      <TableCell className="text-right">{inr(total)}</TableCell>
                      <TableCell className={`text-right ${util > 100 ? 'text-red-600' : util > 80 ? 'text-amber-600' : ''}`}>
                        {cc.budget_amount > 0 ? `${util.toFixed(0)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(cc)}><Pencil className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => {
                            if (confirm(`Delete cost center "${cc.name}"? Linked bills/expenses will keep their tag set to NULL.`)) {
                              remove.mutate(cc.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
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

export default CostCenters;
