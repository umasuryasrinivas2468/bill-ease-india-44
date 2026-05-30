import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Building2, Plus, Trash2, Loader2, RefreshCw, Users, Layers, AlertCircle,
  Scissors, Edit,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  listConsolidationGroups, createConsolidationGroup,
  listConsolidationMembers, addConsolidationMember, removeConsolidationMember,
  fetchConsolidatedBalanceSheet, fetchConsolidatedPL,
  ConsolidationGroup, ConsolidationMember,
  ConsolidatedBalanceSheet, ConsolidatedPL,
  getFinancialYearOptions,
  listEliminations, addElimination, updateElimination, deleteElimination,
  IntercompanyElimination,
  fetchConsolidatedSOCIE, ConsolidatedSOCIE,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const fyDates = (fy: string): { start: string; end: string } => {
  const s = parseInt(fy.split('-')[0], 10);
  return { start: `${s}-04-01`, end: `${s + 1}-03-31` };
};

const ConsolidatedStatements: React.FC = () => {
  const { user } = useUser();
  const fyOptions = getFinancialYearOptions();
  const [fy, setFy] = useState(fyOptions[0]);

  const [groups, setGroups] = useState<ConsolidationGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<ConsolidationMember[]>([]);
  const [bs, setBs] = useState<ConsolidatedBalanceSheet | null>(null);
  const [pl, setPl] = useState<ConsolidatedPL | null>(null);
  const [loading, setLoading] = useState(false);

  // New-group dialog state
  const [openNewGroup, setOpenNewGroup] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentUserId, setNewParentUserId] = useState('');
  const [creating, setCreating] = useState(false);

  // New-member dialog
  const [openNewMember, setOpenNewMember] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberOwnership, setMemberOwnership] = useState<number>(100);
  const [memberIsParent, setMemberIsParent] = useState(false);

  // Eliminations
  const [eliminations, setEliminations] = useState<IntercompanyElimination[]>([]);
  const [openNewElim, setOpenNewElim] = useState(false);
  const [elimType, setElimType] = useState<IntercompanyElimination['elim_type']>('intercompany_loan');
  const [elimAmount, setElimAmount] = useState<number>(0);
  const [elimLineCode, setElimLineCode] = useState<string>('BS.NCL.1');
  const [elimAffects, setElimAffects] = useState<'BS' | 'PL' | 'BOTH'>('BS');
  const [elimDescription, setElimDescription] = useState('');
  const [elimFromUid, setElimFromUid] = useState('');
  const [elimToUid, setElimToUid] = useState('');
  const [editingElimId, setEditingElimId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDescription, setEditDescription] = useState('');

  // Consolidated SOCIE
  const [csocie, setCsocie] = useState<ConsolidatedSOCIE | null>(null);

  const loadGroups = async () => {
    if (!user?.id) return;
    setGroups(await listConsolidationGroups(user.id));
  };

  const loadMembers = async (gid: string) => {
    setMembers(await listConsolidationMembers(gid));
  };

  const loadEliminations = async (gid: string) => {
    setEliminations(await listEliminations(gid, fy));
  };

  const loadStatements = async () => {
    if (!user?.id || !selectedGroupId) return;
    setLoading(true);
    const { start, end } = fyDates(fy);
    const [bsR, plR, socieR] = await Promise.all([
      fetchConsolidatedBalanceSheet(user.id, selectedGroupId, end),
      fetchConsolidatedPL(user.id, selectedGroupId, start, end),
      fetchConsolidatedSOCIE(user.id, selectedGroupId, fy),
    ]);
    setBs(bsR); setPl(plR); setCsocie(socieR);
    setLoading(false);
  };

  useEffect(() => { loadGroups(); /* eslint-disable-next-line */ }, [user?.id]);
  useEffect(() => {
    if (selectedGroupId) {
      loadMembers(selectedGroupId);
      loadEliminations(selectedGroupId);
      loadStatements();
    }
    /* eslint-disable-next-line */
  }, [selectedGroupId, fy]);

  const handleCreate = async () => {
    if (!user?.id || !newName.trim()) return;
    setCreating(true);
    try {
      const parentUid = newParentUserId.trim() || user.id;
      const id = await createConsolidationGroup(user.id, newName.trim(), parentUid, fy);
      if (id) {
        // Auto-add the parent as the first member
        await addConsolidationMember(id, {
          member_user_id: parentUid,
          display_name: 'Parent Entity',
          ownership_pct: 100,
          is_parent: true,
        });
        toast.success('Consolidation group created');
        setOpenNewGroup(false);
        setNewName(''); setNewParentUserId('');
        await loadGroups();
        setSelectedGroupId(id);
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create group');
    } finally { setCreating(false); }
  };

  const handleAddMember = async () => {
    if (!selectedGroupId || !memberUserId.trim() || !memberName.trim()) return;
    try {
      await addConsolidationMember(selectedGroupId, {
        member_user_id: memberUserId.trim(),
        display_name: memberName.trim(),
        ownership_pct: memberOwnership,
        is_parent: memberIsParent,
      });
      toast.success('Member added');
      setOpenNewMember(false);
      setMemberUserId(''); setMemberName(''); setMemberOwnership(100); setMemberIsParent(false);
      await loadMembers(selectedGroupId);
      await loadStatements();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to add member');
    }
  };

  const handleAddElim = async () => {
    if (!selectedGroupId || !elimDescription.trim() || elimAmount <= 0 || !elimFromUid || !elimToUid) {
      toast.error('Fill description, amount, and both entities');
      return;
    }
    if (elimFromUid === elimToUid) {
      toast.error('From and To entity must be different');
      return;
    }
    try {
      await addElimination({
        group_id: selectedGroupId,
        fiscal_year: fy,
        elim_type: elimType,
        description: elimDescription.trim(),
        amount: elimAmount,
        line_code: elimLineCode,
        affects_statement: elimAffects,
        from_user_id: elimFromUid,
        to_user_id: elimToUid,
      });
      toast.success('Elimination added');
      setOpenNewElim(false);
      setElimDescription(''); setElimAmount(0); setElimFromUid(''); setElimToUid('');
      await loadEliminations(selectedGroupId);
      await loadStatements();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to add elimination');
    }
  };

  const startEditElim = (e: IntercompanyElimination) => {
    setEditingElimId(e.id ?? null);
    setEditAmount(e.amount);
    setEditDescription(e.description);
  };

  const cancelEditElim = () => {
    setEditingElimId(null); setEditAmount(0); setEditDescription('');
  };

  const saveEditElim = async () => {
    if (!editingElimId || !selectedGroupId) return;
    try {
      await updateElimination(editingElimId, { amount: editAmount, description: editDescription });
      toast.success('Elimination updated');
      setEditingElimId(null);
      await loadEliminations(selectedGroupId);
      await loadStatements();
    } catch {
      toast.error('Failed to update elimination');
    }
  };

  const handleDeleteElim = async (id?: string) => {
    if (!id || !selectedGroupId) return;
    if (!confirm('Delete this elimination entry?')) return;
    try {
      await deleteElimination(id);
      toast.success('Elimination removed');
      await loadEliminations(selectedGroupId);
      await loadStatements();
    } catch {
      toast.error('Failed to delete elimination');
    }
  };

  const handleRemoveMember = async (id?: string) => {
    if (!id || !selectedGroupId) return;
    if (!confirm('Remove this member from the consolidation group?')) return;
    try {
      await removeConsolidationMember(id);
      toast.success('Member removed');
      await loadMembers(selectedGroupId);
      await loadStatements();
    } catch {
      toast.error('Failed to remove member');
    }
  };

  return (
    <div className="space-y-4">
      {/* Group selector + new-group */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" /> Multi-Entity Consolidation
              </CardTitle>
              <CardDescription>
                Roll up multiple standalone entities into consolidated Schedule III statements (AS 21 / Ind AS 110).
              </CardDescription>
            </div>
            <Dialog open={openNewGroup} onOpenChange={setOpenNewGroup}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New Group</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New consolidation group</DialogTitle>
                  <DialogDescription>
                    A group bundles parent + subsidiary entities. Add members after creation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="g-name">Group name *</Label>
                    <Input id="g-name" placeholder="e.g. Acme Group FY 2025-26"
                           value={newName} onChange={e => setNewName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-parent">Parent entity user_id (defaults to you)</Label>
                    <Input id="g-parent" placeholder="user_xyz123 (optional)"
                           value={newParentUserId} onChange={e => setNewParentUserId(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground">
                      The current logged-in user becomes parent by default. Use a different user_id only when
                      consolidating books across separate Aczen accounts.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenNewGroup(false)} disabled={creating}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No consolidation groups yet. Click <strong>New Group</strong> above to set one up.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-2">
                <Label className="text-xs">Active group</Label>
                <Select value={selectedGroupId ?? ''} onValueChange={setSelectedGroupId}>
                  <SelectTrigger><SelectValue placeholder="Select a group" /></SelectTrigger>
                  <SelectContent>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} — {g.member_count} member{g.member_count === 1 ? '' : 's'}
                        {g.fiscal_year ? ` · FY ${g.fiscal_year}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Reporting FY</Label>
                <Select value={fy} onValueChange={setFy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {fyOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedGroupId && (
        <>
          {/* Members */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Members
                </CardTitle>
                <CardDescription>Entities consolidated into the parent's statements</CardDescription>
              </div>
              <Dialog open={openNewMember} onOpenChange={setOpenNewMember}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1.5" />Add Member</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add consolidation member</DialogTitle>
                    <DialogDescription>
                      Enter the entity's user_id (Aczen account identifier) and ownership percentage.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-uid">Member user_id *</Label>
                      <Input id="m-uid" placeholder="user_xyz123"
                             value={memberUserId} onChange={e => setMemberUserId(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-name">Display name *</Label>
                      <Input id="m-name" placeholder="Acme Subsidiary Pvt Ltd"
                             value={memberName} onChange={e => setMemberName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-pct">Ownership %</Label>
                      <Input id="m-pct" type="number" min={0} max={100} step={0.01}
                             value={memberOwnership}
                             onChange={e => setMemberOwnership(parseFloat(e.target.value) || 0)} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={memberIsParent}
                             onChange={e => setMemberIsParent(e.target.checked)} />
                      Mark as Parent entity
                    </label>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenNewMember(false)}>Cancel</Button>
                    <Button onClick={handleAddMember}
                            disabled={!memberUserId.trim() || !memberName.trim()}>
                      Add
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No members yet. Add at least one entity to consolidate.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Entity</th>
                        <th className="px-3 py-2 text-left font-medium">user_id</th>
                        <th className="px-3 py-2 text-right font-medium">Ownership</th>
                        <th className="px-3 py-2 text-center font-medium">Role</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.id} className="border-t">
                          <td className="px-3 py-2">{m.display_name}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{m.member_user_id}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Number(m.ownership_pct).toFixed(2)}%</td>
                          <td className="px-3 py-2 text-center">
                            {m.is_parent ? <Badge>Parent</Badge> : <Badge variant="secondary">Subsidiary</Badge>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(m.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inter-company eliminations */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scissors className="h-4 w-4" /> Inter-Company Eliminations
                </CardTitle>
                <CardDescription>
                  Adjustments that net out across the group · {eliminations.length} entry(s) for FY {fy}
                </CardDescription>
              </div>
              <Dialog open={openNewElim} onOpenChange={setOpenNewElim}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1.5" />Add Elimination</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>New inter-company elimination</DialogTitle>
                    <DialogDescription>
                      Record an inter-group transaction that should net out in consolidation
                      (intra-group loan, sale, dividend, etc.).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Type</Label>
                        <Select value={elimType} onValueChange={(v) => setElimType(v as IntercompanyElimination['elim_type'])}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="intercompany_loan">Inter-company Loan</SelectItem>
                            <SelectItem value="intercompany_sale">Inter-company Sale</SelectItem>
                            <SelectItem value="intercompany_dividend">Inter-company Dividend</SelectItem>
                            <SelectItem value="unrealised_profit_in_stock">Unrealised Profit in Stock</SelectItem>
                            <SelectItem value="intercompany_other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Affects Statement</Label>
                        <Select value={elimAffects} onValueChange={(v) => setElimAffects(v as 'BS' | 'PL' | 'BOTH')}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BS">Balance Sheet</SelectItem>
                            <SelectItem value="PL">Profit & Loss</SelectItem>
                            <SelectItem value="BOTH">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Schedule III line *</Label>
                        <Select value={elimLineCode} onValueChange={setElimLineCode}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="BS.NCL.1">BS.NCL.1 — Long-term Borrowings</SelectItem>
                            <SelectItem value="BS.CL.1">BS.CL.1 — Short-term Borrowings</SelectItem>
                            <SelectItem value="BS.CL.2">BS.CL.2 — Trade Payables</SelectItem>
                            <SelectItem value="BS.CA.3">BS.CA.3 — Trade Receivables</SelectItem>
                            <SelectItem value="BS.NCA.4">BS.NCA.4 — Non-current Investments</SelectItem>
                            <SelectItem value="BS.NCA.6">BS.NCA.6 — Long-term Loans & Advances</SelectItem>
                            <SelectItem value="BS.CA.5">BS.CA.5 — Short-term Loans & Advances</SelectItem>
                            <SelectItem value="BS.E.2">BS.E.2 — Reserves & Surplus (dividend)</SelectItem>
                            <SelectItem value="PL.R.1">PL.R.1 — Revenue from Operations (intra sale)</SelectItem>
                            <SelectItem value="PL.E.1">PL.E.1 — Cost of Materials (intra purchase)</SelectItem>
                            <SelectItem value="PL.R.2">PL.R.2 — Other Income (dividend in P&L)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="elim-amt">Amount (₹) *</Label>
                        <Input id="elim-amt" type="number" min={0} step="0.01"
                               value={elimAmount}
                               onChange={(e) => setElimAmount(parseFloat(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="elim-desc">Description *</Label>
                      <Textarea id="elim-desc" rows={2}
                                placeholder="e.g. Loan from Parent Co to Subsidiary A — eliminate on consolidation"
                                value={elimDescription} onChange={(e) => setElimDescription(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>From (asset/revenue holder) *</Label>
                        <Select value={elimFromUid} onValueChange={setElimFromUid}>
                          <SelectTrigger><SelectValue placeholder="Choose entity" /></SelectTrigger>
                          <SelectContent>
                            {members.map(m => (
                              <SelectItem key={m.member_user_id} value={m.member_user_id}>{m.display_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>To (liability/expense holder) *</Label>
                        <Select value={elimToUid} onValueChange={setElimToUid}>
                          <SelectTrigger><SelectValue placeholder="Choose entity" /></SelectTrigger>
                          <SelectContent>
                            {members.map(m => (
                              <SelectItem key={m.member_user_id} value={m.member_user_id}>{m.display_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenNewElim(false)}>Cancel</Button>
                    <Button onClick={handleAddElim}>Add elimination</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {eliminations.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No eliminations recorded for FY {fy}.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-left font-medium">Line</th>
                        <th className="px-3 py-2 text-center font-medium">Affects</th>
                        <th className="px-3 py-2 text-right font-medium">Amount (₹)</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eliminations.map(e => {
                        const isEditing = editingElimId === e.id;
                        return (
                          <tr key={e.id} className="border-t">
                            <td className="px-3 py-1.5">
                              <Badge variant="outline" className="text-[10px]">{e.elim_type.replace(/_/g, ' ')}</Badge>
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {isEditing ? (
                                <Input value={editDescription} onChange={(ev) => setEditDescription(ev.target.value)} className="h-7 text-xs" />
                              ) : e.description}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px]">{e.line_code}</td>
                            <td className="px-3 py-1.5 text-center">
                              <Badge variant="secondary" className="text-[10px]">{e.affects_statement}</Badge>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {isEditing ? (
                                <Input type="number" min={0} step="0.01" value={editAmount}
                                       onChange={(ev) => setEditAmount(parseFloat(ev.target.value) || 0)}
                                       className="h-7 text-xs text-right" />
                              ) : formatINR(e.amount)}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                {isEditing ? (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-7" onClick={saveEditElim}>Save</Button>
                                    <Button size="sm" variant="ghost" className="h-7" onClick={cancelEditElim}>Cancel</Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-7" onClick={() => startEditElim(e)}>
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7" onClick={() => handleDeleteElim(e.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Consolidated statements */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Consolidated Statements
                </CardTitle>
                <CardDescription>
                  Line-by-line addition across {members.length} member{members.length === 1 ? '' : 's'} with NCI computation.
                  Inter-company eliminations applied per <code>intercompany_eliminations</code>.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadStatements} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
            </CardHeader>
            <CardContent>
              {loading && !bs && !pl ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Computing consolidated figures…
                </div>
              ) : !bs && !pl ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No data yet — add members and refresh.
                </div>
              ) : (
                <Tabs defaultValue="bs" className="w-full">
                  <TabsList>
                    <TabsTrigger value="bs">Consolidated BS</TabsTrigger>
                    <TabsTrigger value="pl">Consolidated P&amp;L</TabsTrigger>
                    <TabsTrigger value="socie">Consolidated SOCIE</TabsTrigger>
                  </TabsList>
                  <TabsContent value="bs" className="space-y-3 pt-3">
                    {bs && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Total Assets</div>
                            <div className="text-base font-semibold tabular-nums">
                              ₹ {formatINR(bs.sections.find(s => s.section === 'ASSETS')?.total ?? 0)}
                            </div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Total Equity &amp; Liab</div>
                            <div className="text-base font-semibold tabular-nums">
                              ₹ {formatINR(bs.sections.find(s => s.section === 'EQUITY_AND_LIABILITIES')?.total ?? 0)}
                            </div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Minority Interest</div>
                            <div className="text-base font-semibold tabular-nums text-amber-600">
                              ₹ {formatINR(bs.minority_interest_total)}
                            </div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Eliminations</div>
                            <div className="text-base font-semibold tabular-nums">
                              ₹ {formatINR(bs.eliminations_total)}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                <th className="px-3 py-2 text-center font-medium w-12">Note</th>
                                <th className="px-3 py-2 text-right font-medium">Gross Sum</th>
                                <th className="px-3 py-2 text-right font-medium">Eliminations</th>
                                <th className="px-3 py-2 text-right font-medium">Consol. (₹)</th>
                                <th className="px-3 py-2 text-right font-medium">NCI</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bs.sections.map((sec) => (
                                <React.Fragment key={sec.section}>
                                  <tr className="border-t bg-muted/30 font-semibold">
                                    <td colSpan={2} className="px-3 py-1.5">{sec.section.replace(/_/g, ' ')}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">—</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">—</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(sec.total)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(sec.nci_total)}</td>
                                  </tr>
                                  {sec.subsections.map((sub) => (
                                    <React.Fragment key={sub.subsection}>
                                      <tr className="border-t">
                                        <td colSpan={2} className="px-3 py-1.5 pl-6 font-medium text-xs uppercase text-muted-foreground">
                                          {sub.subsection}
                                        </td>
                                        <td colSpan={3} />
                                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                                          {formatINR(sub.nci_total)}
                                        </td>
                                      </tr>
                                      {sub.lines.map(l => (
                                        <tr key={l.line_code} className="border-t hover:bg-muted/20">
                                          <td className="px-3 py-1.5 pl-10">{l.label}</td>
                                          <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{l.note_no ?? ''}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(l.gross_sum)}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">
                                            {l.elimination ? `(${formatINR(l.elimination)})` : '-'}
                                          </td>
                                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatINR(l.amount)}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(l.nci)}</td>
                                        </tr>
                                      ))}
                                    </React.Fragment>
                                  ))}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </TabsContent>
                  <TabsContent value="socie" className="space-y-3 pt-3">
                    {!csocie ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">No SOCIE data yet.</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Parent — Opening</div>
                            <div className="text-base font-semibold tabular-nums">₹ {formatINR(csocie.totals_parent.opening)}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Parent — Profit</div>
                            <div className={cn('text-base font-semibold tabular-nums',
                              csocie.totals_parent.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                              ₹ {formatINR(csocie.totals_parent.profit)}
                            </div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Parent — Closing</div>
                            <div className="text-base font-semibold tabular-nums">₹ {formatINR(csocie.totals_parent.closing)}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">NCI — Closing</div>
                            <div className="text-base font-semibold tabular-nums text-amber-600">₹ {formatINR(csocie.totals_nci.closing)}</div>
                          </div>
                        </div>

                        <div className="rounded-lg border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Equity Component</th>
                                <th className="px-3 py-2 text-right font-medium">Opening (Parent)</th>
                                <th className="px-3 py-2 text-right font-medium">Profit (Parent)</th>
                                <th className="px-3 py-2 text-right font-medium">Movements (Parent)</th>
                                <th className="px-3 py-2 text-right font-medium">Closing (Parent)</th>
                                <th className="px-3 py-2 text-right font-medium">Closing (NCI)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {csocie.components.map(c => (
                                <tr key={c.line_code ?? c.line_label ?? Math.random()} className="border-t hover:bg-muted/20">
                                  <td className="px-3 py-1.5">
                                    {c.line_label ?? '—'}
                                    {c.line_code && <Badge variant="outline" className="ml-2 text-[10px] font-mono">{c.line_code}</Badge>}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(c.opening_parent)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(c.profit_parent)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(c.movements_parent)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatINR(c.closing_parent)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{formatINR(c.closing_nci)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-muted/40 font-semibold">
                              <tr className="border-t">
                                <td className="px-3 py-2 text-right">TOTAL</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatINR(csocie.totals_parent.opening)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatINR(csocie.totals_parent.profit)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatINR(csocie.totals_parent.movements)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatINR(csocie.totals_parent.closing)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-amber-600">{formatINR(csocie.totals_nci.closing)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="pl" className="space-y-3 pt-3">
                    {pl && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Total Revenue</div>
                            <div className="text-base font-semibold tabular-nums">₹ {formatINR(pl.total_revenue)}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Total Expenses</div>
                            <div className="text-base font-semibold tabular-nums">₹ {formatINR(pl.total_expenses)}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">Profit After Tax</div>
                            <div className={cn('text-base font-semibold tabular-nums',
                              pl.profit_after_tax >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                              ₹ {formatINR(pl.profit_after_tax)}
                            </div>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] uppercase text-muted-foreground">NCI Share</div>
                            <div className="text-base font-semibold tabular-nums text-amber-600">
                              ₹ {formatINR(pl.minority_interest_share)}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                <th className="px-3 py-2 text-center font-medium w-12">Note</th>
                                <th className="px-3 py-2 text-right font-medium">Gross Sum</th>
                                <th className="px-3 py-2 text-right font-medium">Eliminations</th>
                                <th className="px-3 py-2 text-right font-medium">Consol. (₹)</th>
                                <th className="px-3 py-2 text-right font-medium">NCI</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pl.lines.map(l => (
                                <tr key={l.line_code} className="border-t hover:bg-muted/20">
                                  <td className="px-3 py-1.5">{l.label}</td>
                                  <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{l.note_no ?? ''}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(l.gross_sum)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">
                                    {l.elimination ? `(${formatINR(l.elimination)})` : '-'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatINR(l.amount)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(l.nci)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ConsolidatedStatements;
