import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, RefreshCw, Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  ShieldAlert, TrendingUp, FileWarning, Bot, Info, Wand2, Brain, Quote,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  runFinancialAnomalyDetection, listAIFindings, acknowledgeAIFinding,
  runLLMFinancialReview, fetchLatestLLMReview,
  AIFinding, AIRunResult, LLMReviewResult,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';

interface Props { financialYear: string; }

const severityMeta: Record<AIFinding['severity'], { label: string; tone: string; Icon: React.ComponentType<{ className?: string }> }> = {
  critical: { label: 'Critical', tone: 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100', Icon: ShieldAlert },
  high:     { label: 'High',     tone: 'border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950/30 dark:text-orange-100', Icon: AlertTriangle },
  medium:   { label: 'Medium',   tone: 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100', Icon: AlertCircle },
  low:      { label: 'Low',      tone: 'border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-100', Icon: Info },
  info:     { label: 'Info',     tone: 'border-muted bg-muted/30 text-foreground', Icon: Info },
};

const categoryIcon: Record<AIFinding['category'], React.ComponentType<{ className?: string }>> = {
  anomaly: AlertCircle, disclosure: FileWarning, ratio: TrendingUp, compliance: ShieldAlert, audit: CheckCircle2,
};

const formatMetric = (v: number | null, u: string | null) => {
  if (v === null || v === undefined) return null;
  const num = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  switch (u) {
    case '%':    return `${v.toFixed(2)}%`;
    case '₹':    return `₹ ${v < 0 ? `(${num})` : num}`;
    case 'days': return `${Math.round(v)} days`;
    case 'x':    return `${v.toFixed(2)}x`;
    default:     return num;
  }
};

const renderMD = (md: string): string => md
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1">$1</h3>')
  .replace(/^## (.+)$/gm,  '<h2 class="font-semibold text-base mt-4 mb-1.5">$1</h2>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  .replace(/\n\n+/g, '</p><p class="my-2">')
  .replace(/^/, '<p class="my-2">')
  .concat('</p>');

const AIFinancialReview: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const [findings, setFindings] = useState<AIFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<AIRunResult | null>(null);
  const [llmReview, setLlmReview] = useState<LLMReviewResult | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmRunning, setLlmRunning] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setFindings(await listAIFindings(user.id, { onlyUnacknowledged: false }));
    setLoading(false);
  };

  const loadLLM = async () => {
    if (!user?.id) return;
    setLlmLoading(true);
    const r = await fetchLatestLLMReview(user.id, financialYear);
    setLlmReview(r);
    setLlmLoading(false);
  };

  useEffect(() => { load(); loadLLM(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, financialYear]);

  const run = async () => {
    if (!user?.id) return;
    setRunning(true);
    try {
      const r = await runFinancialAnomalyDetection(user.id, financialYear);
      setLastRun(r);
      if (r) toast.success(`AI review complete — ${r.total_findings} finding(s)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'AI review failed');
    } finally { setRunning(false); }
  };

  const ack = async (id: string) => {
    if (!user?.id) return;
    try {
      await acknowledgeAIFinding(user.id, id);
      setFindings(prev => prev.map(f => f.id === id ? { ...f, acknowledged: true } : f));
    } catch {
      toast.error('Failed to acknowledge');
    }
  };

  const runLLM = async () => {
    if (!user?.id) return;
    setLlmRunning(true);
    try {
      const r = await runLLMFinancialReview(user.id, financialYear);
      if (r) {
        toast.success(`LLM review complete — ${r.findings?.length ?? 0} insight(s)`);
        await loadLLM();
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'LLM review failed');
    } finally { setLlmRunning(false); }
  };

  const summary = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0, unack: 0 };
    for (const f of findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
      counts.total++;
      if (!f.acknowledged) counts.unack++;
    }
    return counts;
  }, [findings]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Financial Review
          </CardTitle>
          <CardDescription>
            Two-layer review · deterministic rules engine + LLM commentary with audit-grade judgment.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="rules" className="w-full">
          <TabsList className="mb-3">
            <TabsTrigger value="rules" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Rules Engine</TabsTrigger>
            <TabsTrigger value="llm"   className="gap-1.5"><Brain className="h-3.5 w-3.5" /> LLM Commentary</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-muted-foreground">
                Rules engine v1 — pattern checks across Schedule III balances, ratios, aging.
              </div>
              <Button onClick={run} disabled={running} size="sm">
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                Run rules
              </Button>
            </div>
        {/* Summary chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> {summary.total} finding{summary.total === 1 ? '' : 's'}
          </Badge>
          {summary.critical > 0 && <Badge className="bg-red-600 hover:bg-red-600 gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> {summary.critical} critical</Badge>}
          {summary.high > 0     && <Badge className="bg-orange-600 hover:bg-orange-600 gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {summary.high} high</Badge>}
          {summary.medium > 0   && <Badge className="bg-amber-600 hover:bg-amber-600 gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {summary.medium} medium</Badge>}
          {summary.low > 0      && <Badge className="bg-sky-600 hover:bg-sky-600 gap-1.5"><Info className="h-3.5 w-3.5" /> {summary.low} low</Badge>}
          {summary.unack > 0    && <Badge variant="secondary">{summary.unack} pending review</Badge>}
        </div>

        {loading && findings.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading prior findings…
          </div>
        ) : findings.length === 0 ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/20 dark:border-emerald-800">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">No findings yet</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Click <strong>Run review</strong> to scan your books for anomalies, ratio outliers, and Schedule III compliance gaps.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {findings.map((f) => {
              const meta = severityMeta[f.severity];
              const CatIcon = categoryIcon[f.category];
              return (
                <div key={f.id} className={cn('rounded-lg border-l-4 border bg-card p-3', meta.tone, f.acknowledged && 'opacity-60')}>
                  <div className="flex items-start gap-2">
                    <meta.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-sm">{f.title}</span>
                        <Badge variant="outline" className="text-[10px] gap-1"><CatIcon className="h-3 w-3" />{f.category}</Badge>
                        {f.rule_code && <Badge variant="secondary" className="font-mono text-[10px]">{f.rule_code}</Badge>}
                        {f.related_line && <Badge variant="outline" className="font-mono text-[10px]">{f.related_line}</Badge>}
                        {f.metric_value !== null && (
                          <Badge variant="outline" className="text-[10px]">
                            {formatMetric(f.metric_value, f.metric_unit)}
                          </Badge>
                        )}
                      </div>
                      {f.body && <p className="mt-1 text-xs leading-relaxed">{f.body}</p>}
                      {f.suggested_action && (
                        <p className="mt-1.5 text-xs italic">
                          <span className="font-medium">Suggested: </span>{f.suggested_action}
                        </p>
                      )}
                    </div>
                    {!f.acknowledged && (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => ack(f.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        <span className="hidden sm:inline">Ack</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lastRun && (
          <div className="mt-4 text-[11px] text-muted-foreground">
            Last run · {new Date(lastRun.completed_at).toLocaleString('en-IN')} · {lastRun.total_findings} finding(s) for FY {lastRun.fiscal_year}
          </div>
        )}
          </TabsContent>

          <TabsContent value="llm" className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-muted-foreground">
                LLM commentary · narrative review augmenting the rules engine with trend &amp; audit-level judgment.
              </div>
              <Button onClick={runLLM} disabled={llmRunning} size="sm" variant="default">
                {llmRunning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Brain className="h-4 w-4 mr-1.5" />}
                {llmReview?.has_review ? 'Re-run LLM review' : 'Run LLM review'}
              </Button>
            </div>

            {llmLoading && !llmReview ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading existing LLM review…
              </div>
            ) : !llmReview?.has_review ? (
              <div className="rounded-md border border-dashed bg-muted/20 p-6 text-sm text-center">
                <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-60" />
                <div className="font-medium">No LLM review yet for FY {financialYear}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  An LLM review sends your BS, P&amp;L, Cash Flow, and Ratios to the AI gateway and returns an
                  executive summary, markdown commentary, and a set of CA-grade findings.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Executive summary */}
                {llmReview.executive_summary && (
                  <div className="rounded-md border-l-4 border-primary bg-primary/5 p-3">
                    <div className="flex items-start gap-2">
                      <Quote className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          Executive Summary
                        </div>
                        <p className="text-sm leading-relaxed">{llmReview.executive_summary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Narrative commentary */}
                {llmReview.narrative_commentary && (
                  <div className="rounded-md border bg-card p-4">
                    <div
                      className="text-sm prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: renderMD(llmReview.narrative_commentary) }}
                    />
                  </div>
                )}

                {/* LLM-generated findings */}
                {llmReview.findings && llmReview.findings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      LLM-generated findings ({llmReview.findings.length})
                    </div>
                    {llmReview.findings.map((f) => {
                      const meta = severityMeta[f.severity];
                      const CatIcon = categoryIcon[f.category];
                      return (
                        <div key={f.id} className={cn('rounded-lg border-l-4 border bg-card p-3', meta.tone)}>
                          <div className="flex items-start gap-2">
                            <meta.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-semibold text-sm">{f.title}</span>
                                <Badge variant="outline" className="text-[10px] gap-1"><CatIcon className="h-3 w-3" />{f.category}</Badge>
                                {f.rule_code && <Badge variant="secondary" className="font-mono text-[10px]">{f.rule_code}</Badge>}
                                {f.related_line && <Badge variant="outline" className="font-mono text-[10px]">{f.related_line}</Badge>}
                                {f.metric_value !== null && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {formatMetric(f.metric_value, f.metric_unit)}
                                  </Badge>
                                )}
                              </div>
                              {f.body && <p className="mt-1 text-xs leading-relaxed">{f.body}</p>}
                              {f.suggested_action && (
                                <p className="mt-1.5 text-xs italic">
                                  <span className="font-medium">Suggested: </span>{f.suggested_action}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Metadata footer */}
                {llmReview.completed_at && (
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Generated {new Date(llmReview.completed_at).toLocaleString('en-IN')}</span>
                    {llmReview.llm_model && <span>· Model <span className="font-mono">{llmReview.llm_model}</span></span>}
                    {llmReview.usage?.prompt_tokens && (
                      <span>· {llmReview.usage.prompt_tokens.toLocaleString()} in / {llmReview.usage.completion_tokens?.toLocaleString() ?? 0} out tokens</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AIFinancialReview;
