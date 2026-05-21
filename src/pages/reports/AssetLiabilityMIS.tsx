import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Boxes, Briefcase, PieChart, TrendingUp } from 'lucide-react';
import {
  useAssetByBranch,
  useAssetByDepartment,
  useAssetByCostCenter,
  useLiabilityByLender,
  useAssetRoi,
} from '@/hooks/useMis';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

interface ClerkBranch { id: string; name: string; code: string }

const AssetLiabilityMIS: React.FC = () => {
  const { organization } = useOrganization();
  const branches: ClerkBranch[] = useMemo(() => {
    const md = (organization?.publicMetadata || {}) as any;
    return (md.branches as ClerkBranch[]) || [];
  }, [organization]);
  const branchName = (id: string) =>
    id === '__unassigned__' ? '— Unassigned —' : branches.find((b) => b.id === id)?.name || id;

  const { data: byBranch = [] } = useAssetByBranch();
  const { data: byDept = [] } = useAssetByDepartment();
  const { data: byCc = [] } = useAssetByCostCenter();
  const { data: byLender = [] } = useLiabilityByLender();
  const { data: roi = [] } = useAssetRoi();

  const totalBookValue = roi.reduce((s, r) => s + Number(r.book_value || 0), 0);
  const totalMaintenance = roi.reduce((s, r) => s + Number(r.maintenance_spend || 0), 0);
  const totalInsurance = roi.reduce((s, r) => s + Number(r.insurance_spend || 0), 0);
  const totalOutstanding = byLender.reduce((s, r) => s + Number(r.outstanding_total || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asset & Liability MIS</h1>
        <p className="text-sm text-muted-foreground">
          Branch / department / cost-centre rollups and per-asset cost-of-ownership analysis.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total book value</div>
            <div className="text-xl font-bold">{inr(totalBookValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Lifetime maintenance</div>
            <div className="text-xl font-bold text-amber-600">{inr(totalMaintenance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Lifetime insurance</div>
            <div className="text-xl font-bold">{inr(totalInsurance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Outstanding to lenders</div>
            <div className="text-xl font-bold text-red-600">{inr(totalOutstanding)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="branch">
        <TabsList>
          <TabsTrigger value="branch"><Building2 className="h-3.5 w-3.5 mr-1" /> By Branch</TabsTrigger>
          <TabsTrigger value="department"><Boxes className="h-3.5 w-3.5 mr-1" /> By Department</TabsTrigger>
          <TabsTrigger value="cc"><PieChart className="h-3.5 w-3.5 mr-1" /> By Cost Centre</TabsTrigger>
          <TabsTrigger value="lender"><Briefcase className="h-3.5 w-3.5 mr-1" /> Lenders</TabsTrigger>
          <TabsTrigger value="roi"><TrendingUp className="h-3.5 w-3.5 mr-1" /> Asset ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="branch" className="pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Assets by branch</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Accum dep</TableHead>
                    <TableHead className="text-right">Book value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byBranch.map((b) => (
                    <TableRow key={b.branch_id}>
                      <TableCell>{branchName(b.branch_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.asset_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(b.gross_value)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">{inr(b.accumulated_dep)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600">{inr(b.book_value)}</TableCell>
                    </TableRow>
                  ))}
                  {byBranch.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">No active assets.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="department" className="pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Assets by department</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Accum dep</TableHead>
                    <TableHead className="text-right">Book value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byDept.map((d) => (
                    <TableRow key={d.department}>
                      <TableCell>{d.department === '__unassigned__' ? '— Unassigned —' : d.department}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.asset_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(d.gross_value)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">{inr(d.accumulated_dep)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600">{inr(d.book_value)}</TableCell>
                    </TableRow>
                  ))}
                  {byDept.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">No data.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cc" className="pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Assets by cost centre</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cost centre</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Accum dep</TableHead>
                    <TableHead className="text-right">Book value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCc.map((c) => (
                    <TableRow key={c.cost_center_id}>
                      <TableCell>
                        {c.cost_center_id === '__unassigned__' ? (
                          <span className="text-muted-foreground">— Unassigned —</span>
                        ) : (
                          <>
                            {c.cost_center_code && <span className="font-mono text-xs">{c.cost_center_code} </span>}
                            {c.cost_center_name || c.cost_center_id}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.asset_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(c.gross_value)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">{inr(c.accumulated_dep)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600">{inr(c.book_value)}</TableCell>
                    </TableRow>
                  ))}
                  {byCc.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">No data.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lender" className="pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Liabilities by lender</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lender</TableHead>
                    <TableHead className="text-right">Loans</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Interest accrued</TableHead>
                    <TableHead className="text-right">Interest paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byLender.map((l) => (
                    <TableRow key={l.lender_name}>
                      <TableCell>{l.lender_name === '__unassigned__' ? '— Unassigned —' : l.lender_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.liability_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(l.principal_total)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-red-600">{inr(l.outstanding_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(l.interest_accrued_total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{inr(l.interest_paid_total)}</TableCell>
                    </TableRow>
                  ))}
                  {byLender.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">No outstanding liabilities.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roi" className="pt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-asset cost of ownership</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Book value</TableHead>
                    <TableHead className="text-right">Maintenance</TableHead>
                    <TableHead className="text-right">Insurance</TableHead>
                    <TableHead className="text-right">Claims recovered</TableHead>
                    <TableHead className="text-right">Net running cost</TableHead>
                    <TableHead className="text-right">Cost/Book</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roi.slice(0, 100).map((r) => (
                    <TableRow key={r.asset_id}>
                      <TableCell>
                        <Link to={`/assets/${r.asset_id}`} className="text-primary hover:underline">
                          <div className="font-medium text-sm">{r.asset_name}</div>
                          <div className="text-xs font-mono text-muted-foreground">{r.asset_code}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.book_value)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {inr(r.maintenance_spend)}
                        {r.maintenance_events > 0 && (
                          <div className="text-xs text-muted-foreground">{r.maintenance_events} events</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.insurance_spend)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{inr(r.claims_recovered)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${r.net_running_cost > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {inr(r.net_running_cost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.cost_to_book_ratio != null ? (
                          <Badge
                            variant={r.cost_to_book_ratio > 0.25 ? 'destructive' : r.cost_to_book_ratio > 0.1 ? 'secondary' : 'outline'}
                            className="text-[10px]"
                          >
                            {(r.cost_to_book_ratio * 100).toFixed(1)}%
                          </Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {roi.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">No assets yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {roi.length > 100 && (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  Showing first 100 of {roi.length} assets.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AssetLiabilityMIS;
