import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Search, CheckCircle2, AlertTriangle, X, Camera, Trash2 } from 'lucide-react';
import {
  useAuditSession,
  useAuditFindings,
  useRecordFinding,
  useCloseAuditSession,
  useCancelAuditSession,
  useWriteOffMissingFinding,
  useWriteOffAllMissingInSession,
} from '@/hooks/useAssetAudit';
import type {
  AssetAuditFindingEnriched,
  AuditCondition,
  AuditFindingStatus,
  AuditVerificationMethod,
  RecordFindingInput,
} from '@/types/assetAudit';

const AuditSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading } = useAuditSession(id);
  const { data: findings = [] } = useAuditFindings(id);
  const recordFinding = useRecordFinding();
  const closeSession = useCloseAuditSession();
  const cancelSession = useCancelAuditSession();
  const writeOffOne = useWriteOffMissingFinding();
  const writeOffAll = useWriteOffAllMissingInSession();
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const [filter, setFilter] = useState<AuditFindingStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [recordOpen, setRecordOpen] = useState<AssetAuditFindingEnriched | null>(null);
  const [draft, setDraft] = useState<RecordFindingInput>({
    finding_id: '',
    status: 'verified',
    verification_method: 'physical',
  });

  const filtered = useMemo(() => {
    let list = findings;
    if (filter !== 'all') list = list.filter((f) => f.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.asset_code.toLowerCase().includes(q) ||
          f.asset_name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [findings, filter, search]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!session) return <div className="p-6 text-sm text-red-600">Session not found.</div>;

  const progress = session.assets_in_scope > 0
    ? Math.round(((session.assets_verified + session.assets_missing + session.assets_mismatched) / session.assets_in_scope) * 100)
    : 0;
  const pendingCount = findings.filter((f) => f.status === 'pending').length;
  const issueCount = session.assets_missing + session.assets_mismatched;
  const isLive = session.status === 'in_progress';

  // Missing findings that haven't been written off yet — the ones that
  // still need an accounting resolution.
  const unresolvedMissing = findings.filter(
    (f) => f.status === 'missing' && f.resolution_action !== 'written_off',
  );
  const unresolvedNbv = unresolvedMissing.reduce((s, f) => s + Number(f.book_value || 0), 0);
  const inr = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

  const openRecord = (f: AssetAuditFindingEnriched, defaultStatus: AuditFindingStatus = 'verified') => {
    setRecordOpen(f);
    setDraft({
      finding_id: f.id,
      status: defaultStatus,
      verification_method: f.verification_method || 'physical',
      found_location: f.found_location ?? f.expected_location ?? '',
      found_branch_id: f.found_branch_id ?? f.expected_branch_id ?? '',
      found_custodian: f.found_custodian ?? f.expected_custodian ?? '',
      condition_observed: f.condition_observed || 'good',
      remarks: f.remarks || '',
      photo_url: f.photo_url || '',
    });
  };

  const submit = () => {
    recordFinding.mutate(draft, {
      onSuccess: () => setRecordOpen(null),
    });
  };

  // QR / asset-code quick lookup: jump to that finding's dialog
  const lookup = () => {
    const q = search.trim();
    if (!q) return;
    const hit = findings.find(
      (f) => f.asset_code.toLowerCase() === q.toLowerCase(),
    );
    if (hit) openRecord(hit, 'verified');
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/assets/audit"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{session.title}</h1>
              <Badge variant={isLive ? 'default' : 'secondary'} className="capitalize text-[10px]">
                {session.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground font-mono">{session.session_code}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {isLive && (
            <>
              <Button variant="outline" onClick={() => cancelSession.mutate(session.id)}>Cancel session</Button>
              <Button onClick={() => closeSession.mutate(session.id)}>Close session</Button>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">In scope</div><div className="text-xl font-bold">{session.assets_in_scope}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Verified</div><div className="text-xl font-bold text-emerald-600">{session.assets_verified}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Mismatch</div><div className="text-xl font-bold text-amber-600">{session.assets_mismatched}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Missing</div><div className="text-xl font-bold text-red-600">{session.assets_missing}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Pending</div><div className="text-xl font-bold">{pendingCount}</div><div className="text-xs text-muted-foreground">{progress}% complete</div></CardContent></Card>
      </div>

      {issueCount > 0 && (
        <Card className="border-red-500/40">
          <CardContent className="pt-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span>
              <strong>{issueCount}</strong> issue{issueCount > 1 ? 's' : ''} found —{' '}
              {session.assets_missing} missing, {session.assets_mismatched} mismatched.
            </span>
          </CardContent>
        </Card>
      )}

      {unresolvedMissing.length > 0 && (
        <Card className="border-red-500/40 bg-red-50/60 dark:bg-red-950/20">
          <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Trash2 className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <div className="text-sm font-medium">
                  {unresolvedMissing.length} missing asset{unresolvedMissing.length === 1 ? '' : 's'} pending write-off
                </div>
                <div className="text-xs text-muted-foreground">
                  Net book value still on the books: <strong>{inr(unresolvedNbv)}</strong>. Writing off posts
                  Dr Accumulated Depreciation + Dr Loss / Cr Fixed Asset per asset.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkConfirmOpen(true)}
              disabled={writeOffAll.isPending}
            >
              {writeOffAll.isPending ? 'Posting…' : 'Write off all'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Scan / lookup */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Verify by scan / search</CardTitle>
          <Select value={filter} onValueChange={(v) => setFilter(v as AuditFindingStatus | 'all')}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({findings.length})</SelectItem>
              <SelectItem value="pending">Pending ({pendingCount})</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="mismatch">Mismatch</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
              <SelectItem value="damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Scan QR or type asset code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
            />
            <Button onClick={lookup} disabled={!search.trim()}>
              <Search className="h-4 w-4 mr-1" /> Find
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter (or scan a QR with the field focused) to open the verification form for that asset.
          </p>
        </CardContent>
      </Card>

      {/* Findings table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Findings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Expected location</TableHead>
                <TableHead>Expected custodian</TableHead>
                <TableHead>Found</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link to={`/assets/${f.asset_id}`} className="text-primary hover:underline">
                      <div className="font-medium text-sm">{f.asset_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{f.asset_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{f.expected_location || '—'}</TableCell>
                  <TableCell className="text-xs">{f.expected_custodian || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {f.status === 'pending' ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <div>{f.found_location || '—'}</div>
                        <div className="text-muted-foreground">{f.found_custodian || '—'}</div>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        f.status === 'verified' ? 'default' :
                        f.status === 'missing' ? 'destructive' :
                        f.status === 'mismatch' || f.status === 'damaged' ? 'destructive' :
                        'secondary'
                      }
                      className="text-[10px] capitalize"
                    >
                      {f.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {isLive && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openRecord(f, 'verified')}
                          title="Verify"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openRecord(f, 'missing')}
                          title="Mark missing"
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </>
                    )}
                    {f.status === 'missing' && f.resolution_action !== 'written_off' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => writeOffOne.mutate({ findingId: f.id })}
                        disabled={writeOffOne.isPending}
                        title={`Write off ${inr(Number(f.book_value || 0))} NBV`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                    {f.resolution_action === 'written_off' && (
                      <Badge variant="outline" className="text-[10px]">written off</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No findings match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Record finding dialog */}
      <Dialog open={!!recordOpen} onOpenChange={(o) => !o && setRecordOpen(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Verify {recordOpen?.asset_code} — {recordOpen?.asset_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v as AuditFindingStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verified">Verified (as expected)</SelectItem>
                    <SelectItem value="mismatch">Mismatch (found elsewhere)</SelectItem>
                    <SelectItem value="missing">Missing (not found)</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="disposed_offsite">Already disposed off-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Method</Label>
                <Select
                  value={draft.verification_method || 'physical'}
                  onValueChange={(v) =>
                    setDraft({ ...draft, verification_method: v as AuditVerificationMethod })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">Physical inspection</SelectItem>
                    <SelectItem value="qr_scan">QR / barcode scan</SelectItem>
                    <SelectItem value="photo">Photo confirmation</SelectItem>
                    <SelectItem value="remote">Remote attestation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md bg-muted p-3 space-y-1 text-xs">
              <div className="font-semibold uppercase text-[10px] text-muted-foreground">Register says</div>
              <div>Location: {recordOpen?.expected_location || '—'}</div>
              <div>Custodian: {recordOpen?.expected_custodian || '—'}</div>
            </div>

            {(draft.status === 'verified' || draft.status === 'mismatch') && (
              <>
                <div>
                  <Label>Found location</Label>
                  <Input
                    value={draft.found_location || ''}
                    onChange={(e) => setDraft({ ...draft, found_location: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Found custodian</Label>
                  <Input
                    value={draft.found_custodian || ''}
                    onChange={(e) => setDraft({ ...draft, found_custodian: e.target.value })}
                  />
                </div>
              </>
            )}

            <div>
              <Label>Condition observed</Label>
              <Select
                value={draft.condition_observed || 'good'}
                onValueChange={(v) => setDraft({ ...draft, condition_observed: v as AuditCondition })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="non_functional">Non-functional</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                value={draft.remarks || ''}
                onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
              />
            </div>

            <div>
              <Label className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Photo URL</Label>
              <Input
                value={draft.photo_url || ''}
                onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs">
              If you mark "verified" but found values differ from expected, this auto-promotes to "mismatch".
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(null)}>Cancel</Button>
            <Button onClick={submit} disabled={recordFinding.isPending}>
              {recordFinding.isPending ? 'Saving…' : 'Record finding'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk write-off confirmation */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write off {unresolvedMissing.length} missing asset{unresolvedMissing.length === 1 ? '' : 's'}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              A write-off journal will be posted for each missing asset:
            </p>
            <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">
{`Dr  Accumulated Depreciation     ← release accumulated dep
Dr  Loss on Asset Sale            ← remaining NBV
       Cr  Fixed Asset             ← gross block`}
            </pre>
            <div className="rounded-md border border-red-500/40 bg-red-50 dark:bg-red-950/20 p-3 text-xs">
              Total NBV to be expensed: <strong>{inr(unresolvedNbv)}</strong>. This cannot be undone
              automatically — reversal must be posted manually if assets are later found.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={writeOffAll.isPending}
              onClick={() => {
                writeOffAll.mutate(
                  { sessionId: session.id },
                  { onSuccess: () => setBulkConfirmOpen(false) },
                );
              }}
            >
              {writeOffAll.isPending ? 'Posting…' : 'Post write-offs'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditSession;
