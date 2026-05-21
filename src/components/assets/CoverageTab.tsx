import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Shield, ShieldCheck, AlertTriangle, FileText, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import {
  useWarranties,
  usePolicies,
  useClaims,
  useCoverageSummary,
  useCreateWarranty,
  useCreatePolicy,
  useDeactivateWarranty,
  useMarkPremiumPaid,
  useCreateClaim,
  useSettleClaim,
} from '@/hooks/useAssetCoverage';
import type {
  CreateInsuranceClaimInput,
  CreateInsurancePolicyInput,
  CreateWarrantyInput,
  PolicyType,
  WarrantyType,
} from '@/types/assetCoverage';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (iso: string) => {
  const t = new Date(today() + 'T00:00:00Z').getTime();
  const d = new Date(iso + 'T00:00:00Z').getTime();
  return Math.round((d - t) / (1000 * 60 * 60 * 24));
};

interface Props {
  assetId: string;
  assetName: string;
}

const CoverageTab: React.FC<Props> = ({ assetId, assetName }) => {
  const { data: warranties = [] } = useWarranties(assetId);
  const { data: policies = [] } = usePolicies(assetId);
  const { data: claims = [] } = useClaims(assetId);
  const { data: summary } = useCoverageSummary(assetId);

  const createWarranty = useCreateWarranty();
  const createPolicy = useCreatePolicy();
  const createClaim = useCreateClaim();
  const settleClaim = useSettleClaim();
  const markPaid = useMarkPremiumPaid();
  const deactivate = useDeactivateWarranty();

  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState<string | null>(null);

  const [wDraft, setWDraft] = useState<CreateWarrantyInput>({
    asset_id: assetId,
    warranty_type: 'manufacturer',
    provider_name: '',
    start_date: today(),
    end_date: today(),
    reminder_days_before: 30,
  });

  const [pDraft, setPDraft] = useState<CreateInsurancePolicyInput>({
    asset_id: assetId,
    policy_type: 'comprehensive',
    insurer_name: '',
    policy_number: '',
    coverage_amount: 0,
    premium_amount: 0,
    gst_amount: 0,
    itc_eligible: true,
    start_date: today(),
    end_date: today(),
    premium_paid: false,
    payment_mode: 'bank',
    reminder_days_before: 30,
  });

  const [cDraft, setCDraft] = useState<CreateInsuranceClaimInput & { policy_id_local: string }>({
    asset_id: assetId,
    policy_id: '',
    policy_id_local: '',
    claim_number: '',
    incident_date: today(),
    claim_filed_date: today(),
    claim_amount: 0,
    status: 'filed',
  });

  const [settleDraft, setSettleDraft] = useState({
    settled_amount: 0,
    settled_on: today(),
    payment_mode: 'bank' as 'bank' | 'cash',
    partially_settled: false,
    notes: '',
  });

  const submitWarranty = () => {
    if (!wDraft.provider_name.trim()) return;
    createWarranty.mutate({ ...wDraft, asset_id: assetId }, {
      onSuccess: () => {
        setWarrantyOpen(false);
        setWDraft({
          asset_id: assetId,
          warranty_type: 'manufacturer',
          provider_name: '',
          start_date: today(),
          end_date: today(),
          reminder_days_before: 30,
        });
      },
    });
  };

  const submitPolicy = () => {
    if (!pDraft.insurer_name.trim() || !pDraft.policy_number.trim()) return;
    createPolicy.mutate({ ...pDraft, asset_id: assetId }, {
      onSuccess: () => {
        setPolicyOpen(false);
        setPDraft({
          asset_id: assetId,
          policy_type: 'comprehensive',
          insurer_name: '',
          policy_number: '',
          coverage_amount: 0,
          premium_amount: 0,
          gst_amount: 0,
          itc_eligible: true,
          start_date: today(),
          end_date: today(),
          premium_paid: false,
          payment_mode: 'bank',
          reminder_days_before: 30,
        });
      },
    });
  };

  const submitClaim = () => {
    if (!cDraft.policy_id_local || !cDraft.claim_number.trim()) return;
    const { policy_id_local, ...payload } = cDraft;
    createClaim.mutate({ ...payload, policy_id: policy_id_local, asset_id: assetId }, {
      onSuccess: () => {
        setClaimOpen(false);
        setCDraft({
          asset_id: assetId,
          policy_id: '',
          policy_id_local: '',
          claim_number: '',
          incident_date: today(),
          claim_filed_date: today(),
          claim_amount: 0,
          status: 'filed',
        });
      },
    });
  };

  const submitSettle = (claimId: string) => {
    settleClaim.mutate(
      {
        claim_id: claimId,
        settled_amount: settleDraft.settled_amount,
        settled_on: settleDraft.settled_on,
        payment_mode: settleDraft.payment_mode,
        partially_settled: settleDraft.partially_settled,
        notes: settleDraft.notes,
      },
      {
        onSuccess: () => {
          setSettleOpen(null);
          setSettleDraft({
            settled_amount: 0,
            settled_on: today(),
            payment_mode: 'bank',
            partially_settled: false,
            notes: '',
          });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Warranty
            </div>
            <div className="text-sm font-bold">
              {summary?.has_active_warranty ? `Until ${summary.warranty_until}` : 'None'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" /> Active policies
            </div>
            <div className="text-xl font-bold">{summary?.active_policies || 0}</div>
            <div className="text-xs text-muted-foreground">Coverage {inr(summary?.total_coverage)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Lifetime premium</div>
            <div className="text-xl font-bold">{inr(summary?.total_premium)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Claims</div>
            <div className="text-xl font-bold">
              {summary?.total_claims || 0}
              {(summary?.open_claims || 0) > 0 && (
                <span className="text-xs font-normal text-amber-600 ml-2">{summary?.open_claims} open</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">Recovered {inr(summary?.lifetime_settlement)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Warranties */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Warranties
          </CardTitle>
          <Button size="sm" onClick={() => setWarrantyOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New warranty
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Warranty #</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {warranties.map((w) => {
                const days = daysFromNow(w.end_date);
                const expired = days < 0;
                const expiring = !expired && days <= w.reminder_days_before;
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {w.warranty_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{w.provider_name}</TableCell>
                    <TableCell className="text-xs font-mono">{w.warranty_number || '—'}</TableCell>
                    <TableCell className="text-xs">{w.start_date}</TableCell>
                    <TableCell className="text-xs">
                      <div>{w.end_date}</div>
                      {expired && <div className="text-xs text-red-600">expired</div>}
                      {expiring && <div className="text-xs text-amber-600">in {days}d</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.is_active && !expired ? 'default' : 'secondary'} className="text-[10px]">
                        {!w.is_active ? 'inactive' : expired ? 'expired' : 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {w.document_url && (
                        <a href={w.document_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" title="Document">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivate.mutate(w.id)}
                        title="Deactivate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {warranties.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No warranties recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Policies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Insurance policies
          </CardTitle>
          <Button size="sm" onClick={() => setPolicyOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New policy
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Insurer</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Premium</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => {
                const days = daysFromNow(p.end_date);
                const expired = days < 0;
                const expiring = !expired && days <= p.reminder_days_before;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {p.policy_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{p.insurer_name}</TableCell>
                    <TableCell className="text-xs font-mono">{p.policy_number}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(p.coverage_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(p.premium_amount)}</TableCell>
                    <TableCell className="text-xs">
                      <div>{p.start_date} → {p.end_date}</div>
                      {expired && <div className="text-red-600">expired</div>}
                      {expiring && <div className="text-amber-600">in {days}d</div>}
                    </TableCell>
                    <TableCell>
                      {p.premium_paid ? (
                        <Badge variant="default" className="text-[10px]">paid</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markPaid.mutate({ id: p.id, paidOn: today() })}
                          disabled={markPaid.isPending}
                        >
                          Mark paid
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.document_url && (
                        <a href={p.document_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {policies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No policies on file.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Claims */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Claims
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setClaimOpen(true)}
            disabled={policies.length === 0}
            title={policies.length === 0 ? 'Add a policy first' : ''}
          >
            <Plus className="h-4 w-4 mr-1" /> File claim
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim #</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead>Policy</TableHead>
                <TableHead className="text-right">Claim amt</TableHead>
                <TableHead className="text-right">Settled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => {
                const policy = policies.find((p) => p.id === c.policy_id);
                const settled = c.status === 'settled' || c.status === 'partially_settled';
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs font-mono">{c.claim_number}</TableCell>
                    <TableCell className="text-xs">{c.claim_filed_date}</TableCell>
                    <TableCell className="text-xs">{policy?.policy_number || c.policy_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.claim_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.settled_amount ? inr(c.settled_amount) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === 'rejected'
                            ? 'destructive'
                            : settled
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-[10px] capitalize"
                      >
                        {c.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!settled && c.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSettleOpen(c.id);
                            setSettleDraft({
                              settled_amount: c.claim_amount,
                              settled_on: today(),
                              payment_mode: 'bank',
                              partially_settled: false,
                              notes: '',
                            });
                          }}
                        >
                          Settle
                        </Button>
                      )}
                      {settled && <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />}
                    </TableCell>
                  </TableRow>
                );
              })}
              {claims.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No claims filed.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New warranty dialog */}
      <Dialog open={warrantyOpen} onOpenChange={setWarrantyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New warranty</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={wDraft.warranty_type} onValueChange={(v) => setWDraft({ ...wDraft, warranty_type: v as WarrantyType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manufacturer">Manufacturer</SelectItem>
                    <SelectItem value="extended">Extended</SelectItem>
                    <SelectItem value="third_party">Third-party</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Provider</Label>
                <Input value={wDraft.provider_name} onChange={(e) => setWDraft({ ...wDraft, provider_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Warranty number</Label>
                <Input value={wDraft.warranty_number || ''} onChange={(e) => setWDraft({ ...wDraft, warranty_number: e.target.value })} />
              </div>
              <div>
                <Label>Claim contact</Label>
                <Input value={wDraft.claim_contact || ''} onChange={(e) => setWDraft({ ...wDraft, claim_contact: e.target.value })} placeholder="phone / email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="date" value={wDraft.start_date} onChange={(e) => setWDraft({ ...wDraft, start_date: e.target.value })} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="date" value={wDraft.end_date} onChange={(e) => setWDraft({ ...wDraft, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Coverage terms</Label>
              <Textarea rows={2} value={wDraft.coverage_terms || ''} onChange={(e) => setWDraft({ ...wDraft, coverage_terms: e.target.value })} />
            </div>
            <div>
              <Label>Document URL</Label>
              <Input value={wDraft.document_url || ''} onChange={(e) => setWDraft({ ...wDraft, document_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Reminder (days before expiry)</Label>
              <Input type="number" min={0} value={wDraft.reminder_days_before || 30} onChange={(e) => setWDraft({ ...wDraft, reminder_days_before: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarrantyOpen(false)}>Cancel</Button>
            <Button onClick={submitWarranty} disabled={createWarranty.isPending}>{createWarranty.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New policy dialog */}
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New insurance policy — {assetName}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Policy type</Label>
                <Select value={pDraft.policy_type} onValueChange={(v) => setPDraft({ ...pDraft, policy_type: v as PolicyType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comprehensive">Comprehensive</SelectItem>
                    <SelectItem value="fire">Fire</SelectItem>
                    <SelectItem value="theft">Theft</SelectItem>
                    <SelectItem value="liability">Liability</SelectItem>
                    <SelectItem value="transit">Transit</SelectItem>
                    <SelectItem value="marine">Marine</SelectItem>
                    <SelectItem value="health">Health</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Insurer</Label>
                <Input value={pDraft.insurer_name} onChange={(e) => setPDraft({ ...pDraft, insurer_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Policy number</Label>
                <Input value={pDraft.policy_number} onChange={(e) => setPDraft({ ...pDraft, policy_number: e.target.value })} />
              </div>
              <div>
                <Label>Broker</Label>
                <Input value={pDraft.broker_name || ''} onChange={(e) => setPDraft({ ...pDraft, broker_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sum insured</Label>
                <Input type="number" min={0} step="0.01" value={pDraft.coverage_amount || ''} onChange={(e) => setPDraft({ ...pDraft, coverage_amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Premium (excl. GST)</Label>
                <Input type="number" min={0} step="0.01" value={pDraft.premium_amount || ''} onChange={(e) => setPDraft({ ...pDraft, premium_amount: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GST amount</Label>
                <Input type="number" min={0} step="0.01" value={pDraft.gst_amount || ''} onChange={(e) => setPDraft({ ...pDraft, gst_amount: Number(e.target.value) })} />
              </div>
              <div className="flex items-end gap-2">
                <input
                  type="checkbox"
                  id="pitc"
                  checked={pDraft.itc_eligible ?? true}
                  onChange={(e) => setPDraft({ ...pDraft, itc_eligible: e.target.checked })}
                />
                <Label htmlFor="pitc" className="font-normal">GST is ITC eligible</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Policy start</Label>
                <Input type="date" value={pDraft.start_date} onChange={(e) => setPDraft({ ...pDraft, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Policy end</Label>
                <Input type="date" value={pDraft.end_date} onChange={(e) => setPDraft({ ...pDraft, end_date: e.target.value })} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ppaid"
                checked={pDraft.premium_paid ?? false}
                onChange={(e) => setPDraft({ ...pDraft, premium_paid: e.target.checked, paid_on: e.target.checked ? today() : undefined })}
              />
              <Label htmlFor="ppaid" className="font-normal">Premium has been paid — post journal now</Label>
            </div>
            {pDraft.premium_paid && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Paid on</Label>
                  <Input type="date" value={pDraft.paid_on || today()} onChange={(e) => setPDraft({ ...pDraft, paid_on: e.target.value })} />
                </div>
                <div>
                  <Label>Paid via</Label>
                  <Select value={pDraft.payment_mode || 'bank'} onValueChange={(v) => setPDraft({ ...pDraft, payment_mode: v as 'cash' | 'bank' | 'credit' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="credit">On credit (AP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <Label>Document URL</Label>
              <Input value={pDraft.document_url || ''} onChange={(e) => setPDraft({ ...pDraft, document_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Reminder (days before expiry)</Label>
              <Input type="number" min={0} value={pDraft.reminder_days_before || 30} onChange={(e) => setPDraft({ ...pDraft, reminder_days_before: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyOpen(false)}>Cancel</Button>
            <Button onClick={submitPolicy} disabled={createPolicy.isPending}>{createPolicy.isPending ? 'Saving…' : 'Save policy'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New claim dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>File insurance claim</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Policy</Label>
              <Select value={cDraft.policy_id_local} onValueChange={(v) => setCDraft({ ...cDraft, policy_id_local: v })}>
                <SelectTrigger><SelectValue placeholder="Select policy" /></SelectTrigger>
                <SelectContent>
                  {policies.filter((p) => p.status === 'active').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.insurer_name} — {p.policy_number} ({p.policy_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Claim number</Label>
                <Input value={cDraft.claim_number} onChange={(e) => setCDraft({ ...cDraft, claim_number: e.target.value })} />
              </div>
              <div>
                <Label>Claim amount</Label>
                <Input type="number" min={0} step="0.01" value={cDraft.claim_amount || ''} onChange={(e) => setCDraft({ ...cDraft, claim_amount: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Incident date</Label>
                <Input type="date" value={cDraft.incident_date} onChange={(e) => setCDraft({ ...cDraft, incident_date: e.target.value })} />
              </div>
              <div>
                <Label>Filed on</Label>
                <Input type="date" value={cDraft.claim_filed_date} onChange={(e) => setCDraft({ ...cDraft, claim_filed_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Incident description</Label>
              <Textarea rows={2} value={cDraft.incident_description || ''} onChange={(e) => setCDraft({ ...cDraft, incident_description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Surveyor name</Label>
                <Input value={cDraft.surveyor_name || ''} onChange={(e) => setCDraft({ ...cDraft, surveyor_name: e.target.value })} />
              </div>
              <div>
                <Label>Surveyor contact</Label>
                <Input value={cDraft.surveyor_contact || ''} onChange={(e) => setCDraft({ ...cDraft, surveyor_contact: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Document URL</Label>
              <Input value={cDraft.document_url || ''} onChange={(e) => setCDraft({ ...cDraft, document_url: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimOpen(false)}>Cancel</Button>
            <Button onClick={submitClaim} disabled={createClaim.isPending}>{createClaim.isPending ? 'Filing…' : 'File claim'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle claim dialog */}
      <Dialog open={!!settleOpen} onOpenChange={(o) => !o && setSettleOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Settle claim</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Settled amount</Label>
              <Input type="number" min={0} step="0.01" value={settleDraft.settled_amount || ''} onChange={(e) => setSettleDraft({ ...settleDraft, settled_amount: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Settled on</Label>
                <Input type="date" value={settleDraft.settled_on} onChange={(e) => setSettleDraft({ ...settleDraft, settled_on: e.target.value })} />
              </div>
              <div>
                <Label>Received via</Label>
                <Select value={settleDraft.payment_mode} onValueChange={(v) => setSettleDraft({ ...settleDraft, payment_mode: v as 'cash' | 'bank' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="partial" checked={settleDraft.partially_settled} onChange={(e) => setSettleDraft({ ...settleDraft, partially_settled: e.target.checked })} />
              <Label htmlFor="partial" className="font-normal">Partial settlement (claim stays open for top-up)</Label>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={settleDraft.notes} onChange={(e) => setSettleDraft({ ...settleDraft, notes: e.target.value })} />
            </div>
            <div className="rounded-md bg-muted p-3 text-xs">
              Posts <span className="font-mono">Dr {settleDraft.payment_mode === 'cash' ? 'Cash' : 'Bank'}</span> /{' '}
              <span className="font-mono">Cr Insurance Claim Recovery (Income)</span>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(null)}>Cancel</Button>
            <Button onClick={() => settleOpen && submitSettle(settleOpen)} disabled={settleClaim.isPending}>
              {settleClaim.isPending ? 'Posting…' : 'Settle & post journal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoverageTab;
