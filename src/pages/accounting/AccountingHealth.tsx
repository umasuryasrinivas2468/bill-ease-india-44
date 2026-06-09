import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HealthCheck = {
  check: string;
  label: string;
  passed: boolean | null;
  details: Record<string, unknown>;
};

type AccountingHealthResponse = {
  from_date: string;
  to_date: string;
  all_passed: boolean;
  checks: HealthCheck[];
  gst_reconciliation?: Record<string, unknown>;
  inventory_reconciliation?: Record<string, unknown>;
  computed_at: string;
};

const formatCurrency = (value: unknown) => {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export default function AccountingHealth() {
  const { user } = useUser();
  const userId = user?.id;

  const today = new Date().toISOString().slice(0, 10);
  const fyStart = useMemo(() => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
  }, []);

  const [fromDate, setFromDate] = useState(fyStart);
  const [toDate, setToDate] = useState(today);

  const { data, isFetching, refetch } = useQuery<AccountingHealthResponse | null>({
    queryKey: ["accounting-health", userId, fromDate, toDate],
    queryFn: async () => {
      if (!userId) return null;
      const { data: rpcData, error } = await supabase.rpc("get_accounting_health_dashboard", {
        p_user_id: userId,
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (error) throw error;
      return rpcData as AccountingHealthResponse;
    },
    enabled: !!userId,
  });

  const checks = data?.checks ?? [];
  const subledgerDetails = asObject(checks.find((c) => c.check === "subledger_reconciliation")?.details);
  const controls = Array.isArray(subledgerDetails.controls) ? subledgerDetails.controls : [];
  const failedCount = checks.filter((c) => c.passed === false).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounting Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Journal integrity, trial balance, sub-ledger reconciliation, GST, and inventory checks from the accounting engine.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div>
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            {data?.all_passed ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            )}
            <div>
              <div className="text-xl font-semibold">{data?.all_passed ? "Healthy" : "Needs Review"}</div>
              <div className="text-xs text-muted-foreground">{failedCount} failed check(s)</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Trial Balance</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const tb = asObject(checks.find((c) => c.check === "trial_balance")?.details);
              return (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Debits</span><span>{formatCurrency(tb.debits)}</span></div>
                  <div className="flex justify-between"><span>Credits</span><span>{formatCurrency(tb.credits)}</span></div>
                  <div className="flex justify-between font-medium"><span>Variance</span><span>{formatCurrency(tb.variance)}</span></div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Audit Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xl font-semibold">{checks.length}</div>
              <div className="text-xs text-muted-foreground">continuous integrity checks</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrity Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => (
                  <TableRow key={check.check}>
                    <TableCell className="font-medium">{check.label}</TableCell>
                    <TableCell>
                      <Badge variant={check.passed ? "default" : "destructive"}>
                        {check.passed ? "Passed" : "Failed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {Object.entries(asObject(check.details))
                        .filter(([key]) => key !== "controls")
                        .map(([key, value]) => `${key}: ${typeof value === "number" ? value.toFixed(2) : String(value)}`)
                        .join(" | ") || "No details"}
                    </TableCell>
                  </TableRow>
                ))}
                {!checks.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No health data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sub-Ledger Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control Account</TableHead>
                  <TableHead className="text-right">Control Balance</TableHead>
                  <TableHead className="text-right">Sub-Ledger Total</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controls.map((row: any) => (
                  <TableRow key={row.control_account_id}>
                    <TableCell>{row.control_code} - {row.control_name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.control_balance)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.subledger_total)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.variance)}</TableCell>
                    <TableCell>
                      <Badge variant={row.reconciled ? "default" : "destructive"}>
                        {row.reconciled ? "Reconciled" : "Mismatch"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!controls.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No registered sub-ledger controls yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
