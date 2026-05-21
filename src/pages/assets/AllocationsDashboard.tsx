import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserRound, AlertTriangle } from 'lucide-react';
import {
  useAllocations,
  useEmployeeAllocationSummaries,
  useOverdueAllocations,
} from '@/hooks/useAssetAllocation';
import { useFixedAssets } from '@/hooks/useFixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const AllocationsDashboard: React.FC = () => {
  const { data: allocations = [] } = useAllocations();
  const { data: employees = [] } = useEmployeeAllocationSummaries();
  const { data: overdue = [] } = useOverdueAllocations();
  const { data: assets = [] } = useFixedAssets();

  const activeCount = allocations.filter((a) => a.status === 'active' || a.status === 'overdue').length;
  const damagedLost = allocations.filter((a) => a.status === 'damaged' || a.status === 'lost').length;
  const totalEmployees = employees.length;
  const totalDamageValue = employees.reduce((s, e) => s + Number(e.lifetime_damage_value || 0), 0);

  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Allocations</h1>
          <p className="text-sm text-muted-foreground">
            Who has which asset — laptops, phones, equipment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" /> Active allocations
            </div>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Employees holding assets</div>
            <div className="text-2xl font-bold">{totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Overdue
            </div>
            <div className="text-2xl font-bold text-red-600">{overdue.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Damaged / lost</div>
            <div className="text-2xl font-bold text-amber-600">{damagedLost}</div>
            <div className="text-xs text-muted-foreground">Value {inr(totalDamageValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" /> Overdue allocations
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expected back</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdue.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link to={`/assets/${o.asset_id}`} className="text-primary hover:underline">
                      <div className="font-medium">{o.asset_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{o.asset_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{o.employee_name}</div>
                    {o.employee_email && <div className="text-xs text-muted-foreground">{o.employee_email}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{o.department || '—'}</TableCell>
                  <TableCell className="text-xs">{o.issued_on}</TableCell>
                  <TableCell className="text-xs">{o.expected_return_on}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive" className="text-[10px]">
                      {o.days_overdue}d
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {overdue.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No overdue allocations. ✨
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By employee */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By holder</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holder</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Lifetime</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Damage value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.employee_key}>
                  <TableCell>
                    <div className="font-medium">{e.employee_name}</div>
                    {e.employee_email && (
                      <div className="text-xs text-muted-foreground">{e.employee_email}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{e.department || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.active_allocations}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.lifetime_allocations}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.overdue_allocations > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">{e.overdue_allocations}</Badge>
                    ) : (
                      0
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr(e.lifetime_damage_value)}
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No allocations yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* All active */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All allocations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.slice(0, 50).map((a) => {
                const asset = assetById.get(a.asset_id);
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link to={`/assets/${a.asset_id}`} className="text-primary hover:underline">
                        <div className="font-medium text-sm">{asset?.name || a.asset_id}</div>
                        <div className="text-xs font-mono text-muted-foreground">{asset?.asset_code}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{a.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{a.department || ''}</div>
                    </TableCell>
                    <TableCell className="text-xs">{a.issued_on}</TableCell>
                    <TableCell className="text-xs">{a.returned_on || '—'}</TableCell>
                    <TableCell className="text-xs capitalize">
                      {a.condition_on_issue}
                      {a.condition_on_return && <span className="text-muted-foreground"> → {a.condition_on_return}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === 'lost' || a.status === 'damaged' || a.status === 'overdue' ? 'destructive' :
                          a.status === 'returned' ? 'secondary' :
                          'default'
                        }
                        className="text-[10px] capitalize"
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {allocations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No allocations yet.
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

export default AllocationsDashboard;
