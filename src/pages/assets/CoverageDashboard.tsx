import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, ShieldCheck, AlertTriangle, FileText } from 'lucide-react';
import {
  useWarrantyExpiryAlerts,
  usePolicyExpiryAlerts,
  useCoverageSummaries,
  useClaims,
} from '@/hooks/useAssetCoverage';
import { useFixedAssets } from '@/hooks/useFixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const CoverageDashboard: React.FC = () => {
  const { data: warrantyAlerts = [] } = useWarrantyExpiryAlerts(60);
  const { data: policyAlerts = [] } = usePolicyExpiryAlerts(45);
  const { data: summaries = [] } = useCoverageSummaries();
  const { data: claims = [] } = useClaims();
  const { data: assets = [] } = useFixedAssets();

  const expiredWarranties = warrantyAlerts.filter((a) => a.is_expired).length;
  const expiredPolicies = policyAlerts.filter((a) => a.is_expired).length;

  const totalCoverage = summaries.reduce((s, x) => s + Number(x.total_coverage || 0), 0);
  const totalPremium = summaries.reduce((s, x) => s + Number(x.total_premium || 0), 0);
  const openClaims = claims.filter(
    (c) => c.status === 'filed' || c.status === 'under_review' || c.status === 'approved',
  );
  const lifetimeRecovery = claims.reduce((s, c) => s + Number(c.settled_amount || 0), 0);

  const uninsured = assets.filter((a) => {
    const s = summaries.find((x) => x.asset_id === a.id);
    return a.status === 'active' && (!s || !s.has_active_policy);
  });

  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warranty & Insurance</h1>
          <p className="text-sm text-muted-foreground">
            Coverage, renewal reminders and claim tracking across all assets.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total coverage</div>
            <div className="text-xl font-bold">{inr(totalCoverage)}</div>
            <div className="text-xs text-muted-foreground">Premium paid {inr(totalPremium)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Warranties expiring (60d)</div>
            <div className="text-2xl font-bold text-amber-600">{warrantyAlerts.length}</div>
            {expiredWarranties > 0 && <div className="text-xs text-red-600">{expiredWarranties} expired</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Policies expiring (45d)</div>
            <div className="text-2xl font-bold text-amber-600">{policyAlerts.length}</div>
            {expiredPolicies > 0 && <div className="text-xs text-red-600">{expiredPolicies} expired</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Open claims</div>
            <div className="text-2xl font-bold">{openClaims.length}</div>
            <div className="text-xs text-muted-foreground">Recovered {inr(lifetimeRecovery)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Uninsured active assets */}
      {uninsured.length > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <span>
                <strong>{uninsured.length}</strong> active asset{uninsured.length > 1 ? 's' : ''} have no active insurance policy.{' '}
                <span className="text-muted-foreground">
                  ({uninsured.slice(0, 3).map((a) => a.asset_code).join(', ')}{uninsured.length > 3 ? '…' : ''})
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warranty alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Warranties expiring or expired
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>End date</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warrantyAlerts.map((a) => (
                <TableRow key={a.warranty.id}>
                  <TableCell>
                    <Link to={`/assets/${a.warranty.asset_id}`} className="text-primary hover:underline">
                      <div className="font-medium">{a.asset_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{a.asset_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{a.warranty.provider_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {a.warranty.warranty_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.warranty.end_date}</TableCell>
                  <TableCell className="text-right">
                    {a.is_expired ? (
                      <Badge variant="destructive" className="text-[10px]">{Math.abs(a.days_until_expiry)}d ago</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">in {a.days_until_expiry}d</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {warrantyAlerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                    No warranty expiry coming up.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Policy alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Insurance policies expiring or expired
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Insurer</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policyAlerts.map((a) => (
                <TableRow key={a.policy.id}>
                  <TableCell>
                    <Link to={`/assets/${a.policy.asset_id}`} className="text-primary hover:underline">
                      <div className="font-medium">{a.asset_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{a.asset_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{a.policy.insurer_name}</TableCell>
                  <TableCell className="text-xs font-mono">{a.policy.policy_number}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(a.policy.coverage_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(a.policy.premium_amount)}</TableCell>
                  <TableCell className="text-sm">{a.policy.end_date}</TableCell>
                  <TableCell className="text-right">
                    {a.is_expired ? (
                      <Badge variant="destructive" className="text-[10px]">expired {Math.abs(a.days_until_expiry)}d ago</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">in {a.days_until_expiry}d</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {policyAlerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No policies expiring in the next 45 days.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Open claims */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Open claims
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim #</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Incident</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead className="text-right">Claim amt</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openClaims.map((c) => {
                const a = assetById.get(c.asset_id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs font-mono">{c.claim_number}</TableCell>
                    <TableCell>
                      <Link to={`/assets/${c.asset_id}`} className="text-primary hover:underline">
                        <div className="font-medium text-sm">{a?.name || c.asset_id}</div>
                        <div className="text-xs font-mono text-muted-foreground">{a?.asset_code}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{c.incident_date}</TableCell>
                    <TableCell className="text-xs">{c.claim_filed_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.claim_amount)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {c.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {openClaims.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No open claims.
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

export default CoverageDashboard;
