import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, Calculator, FileText, AlertCircle, CheckCircle, TrendingUp,
  Shield, RefreshCw, Calendar, Loader2, IndianRupee, Receipt, FileCheck
} from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { FinancialDataService } from '@/services/financialDataService';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { SidebarTrigger } from '@/components/ui/sidebar';

const AIBusinessTaxAdvisor = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedFY, setSelectedFY] = useState('2024-25');
  const [activeTab, setActiveTab] = useState('tax_saving');
  const [results, setResults] = useState<Record<string, any>>({});

  const userId = user ? normalizeUserId(user.id) : null;

  const { data: financialData, isLoading: loadingData } = useQuery({
    queryKey: ['financial-data', userId, selectedFY],
    queryFn: async () => {
      if (!userId || !isValidUserId(user!.id)) throw new Error('Not authenticated');
      return FinancialDataService.aggregateFinancialData(userId, selectedFY);
    },
    enabled: !!userId && isValidUserId(user?.id || ''),
    staleTime: 5 * 60 * 1000,
  });

  const analysisMutation = useMutation({
    mutationFn: async (type: string) => {
      const { data, error } = await supabase.functions.invoke('ai-tax-advisor', {
        body: { type, financialData, financialYear: selectedFY, language: 'en' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { type, result: data?.data || data };
    },
    onSuccess: ({ type, result }) => {
      setResults(prev => ({ ...prev, [type]: result }));
      toast({ title: 'Analysis complete', description: `${type.replace('_', ' ')} report generated.` });
    },
    onError: (e: any) => {
      toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' });
    },
  });

  const formatINR = (amt: number) => `₹${(amt || 0).toLocaleString('en-IN')}`;

  const fyOptions = ['2023-24', '2024-25', '2025-26'];

  const renderTaxSaving = () => {
    const data = results.tax_saving;
    if (!data) return <EmptyState type="tax_saving" onGenerate={() => analysisMutation.mutate('tax_saving')} loading={analysisMutation.isPending} />;

    return (
      <div className="space-y-4">
        {/* Tax Calculation Summary */}
        {data.tax_calculation && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Gross Income" value={formatINR(data.tax_calculation.gross_income)} icon={IndianRupee} />
            <StatCard label="Deductions" value={formatINR(data.tax_calculation.total_deductions)} icon={Calculator} />
            <StatCard label="Taxable Income" value={formatINR(data.tax_calculation.taxable_income)} icon={TrendingUp} />
            <StatCard label="Tax Liability" value={formatINR(data.tax_calculation.tax_liability)} icon={Receipt} variant="destructive" />
          </div>
        )}

        {/* Deductions */}
        {data.deductions?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Eligible Deductions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.deductions.map((d: any, i: number) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge variant="outline" className="mb-1">{d.section}</Badge>
                      <h4 className="font-medium">{d.title}</h4>
                      <p className="text-sm text-muted-foreground">{d.description}</p>
                    </div>
                    <span className="font-bold text-primary">{formatINR(d.eligible_amount)}</span>
                  </div>
                  {d.recommendation && <p className="text-xs text-muted-foreground mt-2">💡 {d.recommendation}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Suggestions */}
        {data.suggestions?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Optimization Suggestions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.suggestions.map((s: any, i: number) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={s.priority === 'high' ? 'destructive' : s.priority === 'medium' ? 'default' : 'secondary'}>
                      {s.priority}
                    </Badge>
                    <span className="font-medium text-sm">{s.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  {s.potential_savings > 0 && (
                    <p className="text-xs font-medium text-green-600 mt-1">Potential savings: {formatINR(s.potential_savings)}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.insights && (
          <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>{data.insights}</AlertDescription></Alert>
        )}
      </div>
    );
  };

  const renderGSTGuidance = () => {
    const data = results.gst_guidance;
    if (!data) return <EmptyState type="gst_guidance" onGenerate={() => analysisMutation.mutate('gst_guidance')} loading={analysisMutation.isPending} />;

    return (
      <div className="space-y-4">
        {data.gst_summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Output GST" value={formatINR(data.gst_summary.total_output_gst)} icon={TrendingUp} />
            <StatCard label="Input GST" value={formatINR(data.gst_summary.total_input_gst)} icon={Calculator} />
            <StatCard label="Net Payable" value={formatINR(data.gst_summary.net_gst_payable)} icon={IndianRupee} variant="destructive" />
            <StatCard label="ITC Available" value={formatINR(data.gst_summary.itc_available)} icon={CheckCircle} />
            <StatCard label="RCM Liability" value={formatINR(data.gst_summary.rcm_liability)} icon={Shield} />
          </div>
        )}

        {data.filing_checklist?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Filing Checklist</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.filing_checklist.map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.status === 'filed' ? 'default' : f.status === 'overdue' ? 'destructive' : 'secondary'}>
                        {f.return_type}
                      </Badge>
                      <span className="text-sm">{f.status}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">Due: {f.due_date}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data.compliance_risks?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Compliance Risks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.compliance_risks.map((r: any, i: number) => (
                <Alert key={i} variant={r.severity === 'high' ? 'destructive' : 'default'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{r.risk}</strong><br />
                    <span className="text-xs">{r.mitigation}</span>
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>
        )}

        {data.insights && (
          <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>{data.insights}</AlertDescription></Alert>
        )}
      </div>
    );
  };

  const renderTDSAlerts = () => {
    const data = results.tds_alerts;
    if (!data) return <EmptyState type="tds_alerts" onGenerate={() => analysisMutation.mutate('tds_alerts')} loading={analysisMutation.isPending} />;

    return (
      <div className="space-y-4">
        {data.tds_summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="TDS Deducted" value={formatINR(data.tds_summary.total_tds_deducted)} icon={Calculator} />
            <StatCard label="TDS Deposited" value={formatINR(data.tds_summary.total_tds_deposited)} icon={CheckCircle} />
            <StatCard label="Pending Deposit" value={formatINR(data.tds_summary.pending_deposit)} icon={AlertCircle} variant="destructive" />
            <StatCard label="Next Due" value={data.tds_summary.next_due_date || 'N/A'} icon={Calendar} />
          </div>
        )}

        {data.compliance_alerts?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Compliance Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.compliance_alerts.map((a: any, i: number) => (
                <Alert key={i} variant={a.severity === 'critical' ? 'destructive' : 'default'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'}>{a.section}</Badge>
                        <p className="text-sm mt-1">{a.description}</p>
                      </div>
                      {a.amount > 0 && <span className="font-bold">{formatINR(a.amount)}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{a.action_required}</p>
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>
        )}

        {data.missed_deductions?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Missed TDS Deductions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.missed_deductions.map((m: any, i: number) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium text-sm">{m.vendor || m.transaction_type}</p>
                      <p className="text-xs text-muted-foreground">{m.applicable_section} @ {m.tds_rate}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Amt: {formatINR(m.amount)}</p>
                      <p className="text-xs font-medium text-destructive">TDS: {formatINR(m.tds_amount)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.insights && (
          <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>{data.insights}</AlertDescription></Alert>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" /> AI Business Tax Advisor
            </h1>
            <p className="text-sm text-muted-foreground">AI-powered tax savings, GST guidance & TDS compliance</p>
          </div>
        </div>
        <Select value={selectedFY} onValueChange={setSelectedFY}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {fyOptions.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loadingData && (
        <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>Loading financial data...</AlertDescription></Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tax_saving" className="flex items-center gap-1">
            <Calculator className="h-3 w-3" /> Tax Savings
          </TabsTrigger>
          <TabsTrigger value="gst_guidance" className="flex items-center gap-1">
            <FileCheck className="h-3 w-3" /> GST Guidance
          </TabsTrigger>
          <TabsTrigger value="tds_alerts" className="flex items-center gap-1">
            <Shield className="h-3 w-3" /> TDS Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tax_saving">
          <ScrollArea className="h-[calc(100vh-280px)]">{renderTaxSaving()}</ScrollArea>
        </TabsContent>
        <TabsContent value="gst_guidance">
          <ScrollArea className="h-[calc(100vh-280px)]">{renderGSTGuidance()}</ScrollArea>
        </TabsContent>
        <TabsContent value="tds_alerts">
          <ScrollArea className="h-[calc(100vh-280px)]">{renderTDSAlerts()}</ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, variant }: { label: string; value: string; icon: any; variant?: string }) => (
  <Card>
    <CardContent className="pt-4 pb-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${variant === 'destructive' ? 'text-destructive' : 'text-primary'}`} />
        <div>
          <p className={`text-lg font-bold ${variant === 'destructive' ? 'text-destructive' : ''}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const EmptyState = ({ type, onGenerate, loading }: { type: string; onGenerate: () => void; loading: boolean }) => {
  const labels: Record<string, { title: string; desc: string }> = {
    tax_saving: { title: 'Tax Saving Analysis', desc: 'Get AI-powered recommendations for maximizing deductions under IT Act 1961' },
    gst_guidance: { title: 'GST Filing Guidance', desc: 'AI analysis of your GST obligations, ITC, and filing checklist' },
    tds_alerts: { title: 'TDS Compliance Alerts', desc: 'Check for missed TDS deductions and filing deadlines' },
  };
  const l = labels[type] || labels.tax_saving;
  
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Brain className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">{l.title}</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">{l.desc}</p>
        <Button onClick={onGenerate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
          {loading ? 'Analyzing...' : 'Generate Analysis'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AIBusinessTaxAdvisor;
