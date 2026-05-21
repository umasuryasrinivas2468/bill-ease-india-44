import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HardHat, Plus } from 'lucide-react';
import { useCwipProjects, useCreateCwipProject } from '@/hooks/useCwip';
import type { CreateCwipProjectInput } from '@/types/cwip';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

const CwipDashboard: React.FC = () => {
  const { data: projects = [] } = useCwipProjects();
  const create = useCreateCwipProject();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CreateCwipProjectInput>({
    name: '',
    start_date: today(),
    expected_useful_life_years: 5,
    expected_depreciation_method: 'SLM',
    budget_amount: 0,
  });

  const active = projects.filter((p) => p.status === 'in_progress' || p.status === 'planning');
  const totalAccumulated = active.reduce((s, p) => s + Number(p.total_accumulated_cost || 0), 0);
  const totalCapitalized = projects.reduce((s, p) => s + Number(p.total_capitalized || 0), 0);

  const submit = () => {
    if (!draft.name.trim()) return;
    create.mutate(draft, {
      onSuccess: () => {
        setOpen(false);
        setDraft({
          name: '',
          start_date: today(),
          expected_useful_life_years: 5,
          expected_depreciation_method: 'SLM',
          budget_amount: 0,
        });
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Capital Work-In-Progress</h1>
          <p className="text-sm text-muted-foreground">
            Under-construction asset costs that haven't been capitalised yet.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New CWIP project</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> Active projects</div><div className="text-2xl font-bold">{active.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Accumulated (uncap.)</div><div className="text-xl font-bold">{inr(totalAccumulated)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Lifetime capitalized</div><div className="text-xl font-bold text-emerald-600">{inr(totalCapitalized)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Projects</div><div className="text-2xl font-bold">{projects.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Projects</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Target completion</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Accumulated</TableHead>
                <TableHead className="text-right">Capitalized</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to={`/assets/cwip/${p.id}`} className="text-primary hover:underline">{p.cwip_code}</Link>
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs">{p.start_date}</TableCell>
                  <TableCell className="text-xs">{p.expected_completion_date || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(p.budget_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(p.total_accumulated_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(p.total_capitalized)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.status === 'capitalized' ? 'default' :
                        p.status === 'cancelled' ? 'destructive' :
                        p.status === 'on_hold' ? 'secondary' :
                        'outline'
                      }
                      className="text-[10px] capitalize"
                    >
                      {p.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No CWIP projects yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New CWIP project</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="New factory shed" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date</Label>
                <Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Target completion</Label>
                <Input
                  type="date"
                  value={draft.expected_completion_date || ''}
                  onChange={(e) => setDraft({ ...draft, expected_completion_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Budget</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.budget_amount || ''}
                  onChange={(e) => setDraft({ ...draft, budget_amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Expected useful life (yrs)</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.expected_useful_life_years || 5}
                  onChange={(e) => setDraft({ ...draft, expected_useful_life_years: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="rounded-md bg-muted p-3 text-xs">
              Add costs (material, labour, contractor, etc.) on the project page. When the asset is ready, capitalize the project to convert accumulated costs into a Fixed Asset (with depreciation kicked off automatically).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CwipDashboard;
