import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, Plus, CheckCircle2, Building2 } from 'lucide-react';
import { useCwipProject, useCwipCosts, useAddCwipCost, useCapitalizeCwip, useCancelCwipProject } from '@/hooks/useCwip';
import type { AddCwipCostInput, CapitalizeCwipInput, CwipCostType } from '@/types/cwip';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

const CwipDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useCwipProject(id);
  const { data: costs = [] } = useCwipCosts(id);
  const addCost = useAddCwipCost();
  const capitalize = useCapitalizeCwip();
  const cancel = useCancelCwipProject();

  const [costOpen, setCostOpen] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedCostIds, setSelectedCostIds] = useState<string[]>([]);

  const [costDraft, setCostDraft] = useState<AddCwipCostInput>({
    cwip_id: id || '',
    cost_type: 'material',
    cost_date: today(),
    description: '',
    amount: 0,
    gst_amount: 0,
    itc_eligible: false,
    payment_mode: 'bank',
  });

  const [capDraft, setCapDraft] = useState<Omit<CapitalizeCwipInput, 'cwip_id'>>({
    capitalized_on: today(),
    asset_name: '',
    useful_life_years: 5,
    depreciation_method: 'SLM',
    salvage_value: 0,
    close_project: true,
  });

  const [cancelReason, setCancelReason] = useState('');

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="p-6 text-sm text-red-600">Project not found.</div>;

  const uncapitalised = costs.filter((c) => !c.capitalized);
  const phased = selectedCostIds.length > 0;
  const phasedAmount = phased
    ? uncapitalised
        .filter((c) => selectedCostIds.includes(c.id))
        .reduce((s, c) => s + (c.itc_eligible ? c.amount : c.amount + c.gst_amount), 0)
    : uncapitalised.reduce((s, c) => s + (c.itc_eligible ? c.amount : c.amount + c.gst_amount), 0);

  const isClosed = project.status === 'capitalized' || project.status === 'cancelled';

  const submitCost = () => {
    if (!costDraft.description.trim() || !costDraft.amount) return;
    addCost.mutate({ ...costDraft, cwip_id: project.id }, {
      onSuccess: () => {
        setCostOpen(false);
        setCostDraft({
          cwip_id: project.id,
          cost_type: 'material',
          cost_date: today(),
          description: '',
          amount: 0,
          gst_amount: 0,
          itc_eligible: false,
          payment_mode: 'bank',
        });
      },
    });
  };

  const submitCapitalize = () => {
    capitalize.mutate({
      cwip_id: project.id,
      capitalized_on: capDraft.capitalized_on,
      cost_ids: phased ? selectedCostIds : undefined,
      asset_name: capDraft.asset_name || project.name,
      asset_serial_number: capDraft.asset_serial_number,
      asset_location: capDraft.asset_location,
      asset_custodian: capDraft.asset_custodian,
      useful_life_years: capDraft.useful_life_years,
      depreciation_method: capDraft.depreciation_method,
      depreciation_rate: capDraft.depreciation_rate,
      salvage_value: capDraft.salvage_value,
      close_project: capDraft.close_project,
    }, {
      onSuccess: () => {
        setCapOpen(false);
        setSelectedCostIds([]);
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/assets/cwip"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <Badge
                variant={
                  project.status === 'capitalized' ? 'default' :
                  project.status === 'cancelled' ? 'destructive' :
                  'secondary'
                }
                className="text-[10px] capitalize"
              >
                {project.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground font-mono">{project.cwip_code}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {!isClosed && (
            <>
              <Button onClick={() => setCostOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add cost</Button>
              <Button
                variant="outline"
                onClick={() => setCapOpen(true)}
                disabled={uncapitalised.length === 0}
                title={uncapitalised.length === 0 ? 'No uncapitalized costs' : ''}
              >
                <Building2 className="h-4 w-4 mr-1" /> Capitalize
              </Button>
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>Cancel project</Button>
            </>
          )}
          {project.fixed_asset_id && (
            <Link to={`/assets/${project.fixed_asset_id}`}>
              <Button variant="outline">View asset →</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Budget</div><div className="text-xl font-bold">{inr(project.budget_amount)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Uncapitalized cost</div><div className="text-xl font-bold text-amber-600">{inr(project.total_accumulated_cost)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Capitalized</div><div className="text-xl font-bold text-emerald-600">{inr(project.total_capitalized)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Cost rows</div><div className="text-xl font-bold">{costs.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costs incurred</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {!c.capitalized && !isClosed && (
                      <input
                        type="checkbox"
                        checked={selectedCostIds.includes(c.id)}
                        onChange={(e) =>
                          setSelectedCostIds((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                          )
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{c.cost_date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[10px]">{c.cost_type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-[250px] truncate">{c.description}</TableCell>
                  <TableCell className="text-xs">{c.vendor_name || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(c.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(c.gst_amount)}</TableCell>
                  <TableCell>
                    {c.capitalized ? (
                      <Badge variant="default" className="text-[10px]">capitalized</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">accumulating</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {costs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No costs recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add cost dialog */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add cost to {project.cwip_code}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={costDraft.cost_type}
                  onValueChange={(v) => setCostDraft({ ...costDraft, cost_type: v as CwipCostType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="labour">Labour</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="consultancy">Consultancy</SelectItem>
                    <SelectItem value="overhead">Overhead</SelectItem>
                    <SelectItem value="interest">Borrowing cost / interest</SelectItem>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={costDraft.cost_date} onChange={(e) => setCostDraft({ ...costDraft, cost_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={costDraft.description} onChange={(e) => setCostDraft({ ...costDraft, description: e.target.value })} />
            </div>
            <div>
              <Label>Vendor</Label>
              <Input value={costDraft.vendor_name || ''} onChange={(e) => setCostDraft({ ...costDraft, vendor_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" min={0} step="0.01" value={costDraft.amount || ''} onChange={(e) => setCostDraft({ ...costDraft, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>GST</Label>
                <Input type="number" min={0} step="0.01" value={costDraft.gst_amount || ''} onChange={(e) => setCostDraft({ ...costDraft, gst_amount: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment mode</Label>
                <Select
                  value={costDraft.payment_mode || 'bank'}
                  onValueChange={(v) => setCostDraft({ ...costDraft, payment_mode: v as 'cash' | 'bank' | 'credit' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit">On credit (AP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <input
                  type="checkbox"
                  id="itc"
                  checked={costDraft.itc_eligible || false}
                  onChange={(e) => setCostDraft({ ...costDraft, itc_eligible: e.target.checked })}
                />
                <Label htmlFor="itc" className="font-normal">GST is ITC eligible</Label>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={costDraft.notes || ''} onChange={(e) => setCostDraft({ ...costDraft, notes: e.target.value })} />
            </div>
            <div className="rounded-md bg-muted p-3 text-xs">
              Posts <span className="font-mono">Dr CWIP</span> /{' '}
              <span className="font-mono">
                Cr {costDraft.payment_mode === 'credit' ? 'Accounts Payable' : costDraft.payment_mode === 'cash' ? 'Cash' : 'Bank'}
              </span>.
              {!costDraft.itc_eligible && costDraft.gst_amount ? ' GST capitalised into CWIP.' : ''}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button>
            <Button onClick={submitCost} disabled={addCost.isPending}>{addCost.isPending ? 'Saving…' : 'Add cost'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Capitalize dialog */}
      <Dialog open={capOpen} onOpenChange={setCapOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Capitalize CWIP — create fixed asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-muted p-3 text-xs">
              Capitalising <strong>{phased ? selectedCostIds.length : uncapitalised.length}</strong> cost row(s) totalling{' '}
              <strong>{inr(phasedAmount)}</strong>. A new fixed asset will be created and depreciation kicked off automatically.
            </div>

            <div>
              <Label>Capitalized on</Label>
              <Input
                type="date"
                value={capDraft.capitalized_on}
                onChange={(e) => setCapDraft({ ...capDraft, capitalized_on: e.target.value })}
              />
            </div>
            <div>
              <Label>Asset name</Label>
              <Input
                value={capDraft.asset_name || project.name}
                onChange={(e) => setCapDraft({ ...capDraft, asset_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Useful life (yrs)</Label>
                <Input
                  type="number"
                  min={1}
                  value={capDraft.useful_life_years || 5}
                  onChange={(e) => setCapDraft({ ...capDraft, useful_life_years: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Method</Label>
                <Select
                  value={capDraft.depreciation_method || 'SLM'}
                  onValueChange={(v) => setCapDraft({ ...capDraft, depreciation_method: v as 'SLM' | 'WDV' | 'None' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SLM">Straight-line</SelectItem>
                    <SelectItem value="WDV">Written-down value</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {capDraft.depreciation_method === 'WDV' && (
              <div>
                <Label>WDV rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={capDraft.depreciation_rate || ''}
                  onChange={(e) => setCapDraft({ ...capDraft, depreciation_rate: Number(e.target.value) })}
                />
              </div>
            )}
            <div>
              <Label>Salvage value</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={capDraft.salvage_value || ''}
                onChange={(e) => setCapDraft({ ...capDraft, salvage_value: Number(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input
                  value={capDraft.asset_location || ''}
                  onChange={(e) => setCapDraft({ ...capDraft, asset_location: e.target.value })}
                />
              </div>
              <div>
                <Label>Custodian</Label>
                <Input
                  value={capDraft.asset_custodian || ''}
                  onChange={(e) => setCapDraft({ ...capDraft, asset_custodian: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="close"
                checked={capDraft.close_project ?? !phased}
                onChange={(e) => setCapDraft({ ...capDraft, close_project: e.target.checked })}
              />
              <Label htmlFor="close" className="font-normal">
                Close the CWIP project after this capitalization
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCapOpen(false)}>Cancel</Button>
            <Button onClick={submitCapitalize} disabled={capitalize.isPending}>
              {capitalize.isPending ? 'Capitalizing…' : 'Capitalize & create asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel project dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancel CWIP project</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              The accumulated CWIP balance will remain on the balance sheet under "Capital Work-In-Progress" unless written off separately.
            </p>
            <div>
              <Label>Reason</Label>
              <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button
              variant="destructive"
              onClick={() => cancel.mutate({ id: project.id, reason: cancelReason }, {
                onSuccess: () => setCancelOpen(false),
              })}
              disabled={cancel.isPending || !cancelReason.trim()}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CwipDetail;
