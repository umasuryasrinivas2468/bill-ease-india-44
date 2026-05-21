import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Brain, AlertTriangle, TrendingDown, Activity, Zap, Sparkles, RefreshCw,
} from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';
import type { InsightCategory, InsightSeverity } from '@/types/aiInsights';
import { useQueryClient } from '@tanstack/react-query';

const sevColor = (s: InsightSeverity) =>
  s === 'critical' ? 'destructive' : s === 'warning' ? 'secondary' : 'outline';

const categoryIcon = (c: InsightCategory) => {
  switch (c) {
    case 'idle_asset': return <Activity className="h-3.5 w-3.5" />;
    case 'replacement_candidate': return <RefreshCw className="h-3.5 w-3.5" />;
    case 'maintenance_overspend': return <TrendingDown className="h-3.5 w-3.5" />;
    case 'liability_stress': return <Zap className="h-3.5 w-3.5" />;
    case 'covenant_risk': return <AlertTriangle className="h-3.5 w-3.5" />;
    case 'depreciation_anomaly': return <Sparkles className="h-3.5 w-3.5" />;
    default: return <Sparkles className="h-3.5 w-3.5" />;
  }
};

const AssetInsights: React.FC = () => {
  const { data, isLoading, refetch } = useAiInsights();
  const qc = useQueryClient();
  const [filterSev, setFilterSev] = useState<InsightSeverity | 'all'>('all');
  const [filterCat, setFilterCat] = useState<InsightCategory | 'all'>('all');

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.insights.filter((i) => {
      if (filterSev !== 'all' && i.severity !== filterSev) return false;
      if (filterCat !== 'all' && i.category !== filterCat) return false;
      return true;
    });
  }, [data, filterSev, filterCat]);

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Computing insights…</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6" /> AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            Heuristic detectors across asset utilisation, depreciation, maintenance, and liability stress.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { qc.invalidateQueries({ queryKey: ['ai-insights'] }); refetch(); }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Re-run
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Total signals</div><div className="text-2xl font-bold">{data.total}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Critical</div><div className="text-2xl font-bold text-red-600">{data.by_severity.critical}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Warning</div><div className="text-2xl font-bold text-amber-600">{data.by_severity.warning}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Info</div><div className="text-2xl font-bold">{data.by_severity.info}</div></CardContent></Card>
      </div>

      <div className="flex gap-2 items-end">
        <div className="w-[200px]">
          <Select value={filterSev} onValueChange={(v) => setFilterSev(v as InsightSeverity | 'all')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical only</SelectItem>
              <SelectItem value="warning">Warning only</SelectItem>
              <SelectItem value="info">Info only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-[220px]">
          <Select value={filterCat} onValueChange={(v) => setFilterCat(v as InsightCategory | 'all')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="idle_asset">Idle assets</SelectItem>
              <SelectItem value="replacement_candidate">Replacement candidates</SelectItem>
              <SelectItem value="maintenance_overspend">Maintenance overspend</SelectItem>
              <SelectItem value="depreciation_anomaly">Depreciation anomaly</SelectItem>
              <SelectItem value="covenant_risk">Covenant risk</SelectItem>
              <SelectItem value="liability_stress">Liability stress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((ins) => {
          const link =
            ins.entity_type === 'fixed_asset' ? `/assets/${ins.entity_id}` :
            ins.entity_type === 'covenant' ? `/liabilities/covenants` :
            ins.entity_type === 'liability' ? `/liabilities/health` :
            '#';

          return (
            <Card key={ins.id} className={
              ins.severity === 'critical' ? 'border-red-500/40' :
              ins.severity === 'warning' ? 'border-amber-500/40' :
              ''
            }>
              <CardContent className="pt-4 flex flex-wrap gap-3 items-start justify-between">
                <div className="flex-1 min-w-[300px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={sevColor(ins.severity)} className="text-[10px] uppercase">{ins.severity}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize flex items-center gap-1">
                      {categoryIcon(ins.category)} {ins.category.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">score {ins.score}</span>
                  </div>
                  <h3 className="text-base font-semibold mt-1.5">{ins.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{ins.detail}</p>
                  {ins.recommended_action && (
                    <p className="text-xs mt-2"><span className="font-semibold">Suggested:</span> {ins.recommended_action}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                    {Object.entries(ins.evidence).map(([k, v]) => (
                      <span key={k}>
                        <span className="opacity-70">{k}:</span> {v == null ? '—' : String(v)}
                      </span>
                    ))}
                  </div>
                </div>
                <Link to={link}>
                  <Button size="sm" variant="outline">Open →</Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              ✨ No insights flagged for the current filter. Everything looks healthy.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AssetInsights;
