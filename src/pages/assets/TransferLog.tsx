import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Move3d, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  useAssetTransfers,
  useApproveTransfer,
  useBranchAssetBreakdown,
} from '@/hooks/useAssetTransfer';
import type { TransferStatus } from '@/types/assetTransfer';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

interface ClerkBranch { id: string; name: string; code: string }

const TransferLog: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all');
  const { data: allTransfers = [] } = useAssetTransfers();
  const { data: branchBreakdown = [] } = useBranchAssetBreakdown();
  const approve = useApproveTransfer();

  const { organization } = useOrganization();
  const branches: ClerkBranch[] = useMemo(() => {
    const md = (organization?.publicMetadata || {}) as any;
    return (md.branches as ClerkBranch[]) || [];
  }, [organization]);
  const branchName = (id?: string | null) =>
    id ? branches.find((b) => b.id === id)?.name || id : '— unassigned —';

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return allTransfers;
    return allTransfers.filter((t) => t.status === statusFilter);
  }, [allTransfers, statusFilter]);

  const pendingCount = allTransfers.filter((t) => t.status === 'pending_approval').length;
  const completedThisMonth = useMemo(() => {
    const first = new Date();
    first.setDate(1);
    const iso = first.toISOString().slice(0, 10);
    return allTransfers.filter((t) => t.status === 'completed' && t.transfer_date >= iso).length;
  }, [allTransfers]);
  const reverted = allTransfers.filter((t) => t.status === 'reverted').length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Branch / department / location / custodian movements across all assets.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total transfers</div>
            <div className="text-2xl font-bold">{allTransfers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Awaiting approval
            </div>
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Completed this month</div>
            <div className="text-2xl font-bold text-emerald-600">{completedThisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Reverted</div>
            <div className="text-2xl font-bold">{reverted}</div>
          </CardContent>
        </Card>
      </div>

      {/* Branch breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Move3d className="h-4 w-4" /> Assets by branch
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Asset count</TableHead>
                <TableHead className="text-right">Book value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branchBreakdown.map((b) => (
                <TableRow key={b.branch_id || 'unassigned'}>
                  <TableCell>{branchName(b.branch_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.asset_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(b.total_book_value)}</TableCell>
                </TableRow>
              ))}
              {branchBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">
                    No active assets to break down.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Transfer log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Transfer log</CardTitle>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TransferStatus | 'all')}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_approval">Pending approval</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="reverted">Reverted</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead className="text-right">Book value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const fromLabel =
                  t.transfer_type === 'branch'      ? branchName(t.from_branch_id) :
                  t.transfer_type === 'department'  ? t.from_department || '—' :
                  t.transfer_type === 'employee'    ? t.from_custodian || '—' :
                  t.transfer_type === 'location'    ? t.from_location || '—' :
                  t.from_cost_center_id || '—';
                const toLabel =
                  t.transfer_type === 'branch'      ? branchName(t.to_branch_id) :
                  t.transfer_type === 'department'  ? t.to_department || '—' :
                  t.transfer_type === 'employee'    ? t.to_custodian || '—' :
                  t.transfer_type === 'location'    ? t.to_location || '—' :
                  t.to_cost_center_id || '—';

                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{t.transfer_date}</TableCell>
                    <TableCell>
                      <Link to={`/assets/${t.asset_id}`} className="text-primary hover:underline">
                        <div className="font-medium">{t.asset_name}</div>
                        <div className="text-xs font-mono text-muted-foreground">{t.asset_code}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {t.transfer_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-muted-foreground">{fromLabel}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{toLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(t.current_book_value)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === 'completed' ? 'default' :
                          t.status === 'rejected' || t.status === 'reverted' ? 'destructive' :
                          'secondary'
                        }
                        className="text-[10px] capitalize"
                      >
                        {t.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === 'pending_approval' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => approve.mutate({ id: t.id })}
                          title="Approve"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No transfers match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TransferLog;
