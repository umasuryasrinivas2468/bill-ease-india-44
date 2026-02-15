import React, { useEffect, useMemo, useState } from 'react';
import { occurrencesForMonth, occurrencesInRange, COMPLIANCE_RULES, ComplianceOccurrence } from '@/utils/complianceData';
import { Button } from '@/components/ui/button';
import { startOfMonth, startOfWeek, addDays, isBefore, isAfter, parseISO, endOfMonth, eachDayOfInterval, format, endOfWeek } from 'date-fns';
import jsPDF from 'jspdf';
import MetricCard from '@/components/ComplianceDashboard/MetricCard';
import Sparkline from '@/components/ComplianceDashboard/Sparkline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertCircle, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Download, FileText } from 'lucide-react';

const STORAGE_KEY = 'complianceFiled:v1';

const colors = {
  filed: 'bg-green-100 text-green-800',
  upcoming: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
};

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function loadFiled(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveFiled(state: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

const exportToCSV = (items: ComplianceOccurrence[]) => {
  const rows = [['Title','Category','Date','Link']];
  items.forEach(i => rows.push([i.title,i.category,i.date,i.link||'']));
  const csv = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `compliance_${new Date().toISOString().split('T')[0]}.csv`; a.click();
}

const exportToPDF = (items: ComplianceOccurrence[]) => {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Compliance Report', 14, 20);
  let y = 30;
  items.forEach(i => {
    doc.setFontSize(11);
    doc.text(`${i.date} - ${i.title} (${i.category})`, 14, y);
    y += 8;
  });
  doc.save(`compliance_${new Date().toISOString().split('T')[0]}.pdf`);
}

const ComplianceCalendar: React.FC = () => {
  const today = new Date();
  const [current, setCurrent] = useState(startOfMonth(today));
  const [filed, setFiled] = useState<Record<string, boolean>>(loadFiled());
  const [showCirculars, setShowCirculars] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(()=>{ saveFiled(filed); }, [filed]);

  const monthOccurrences = useMemo(()=> occurrencesForMonth(current.getFullYear(), current.getMonth()+1), [current]);

  const next7 = useMemo(()=> occurrencesInRange(today, addDays(today,7)), [today]);

  // derived unfiled sets (recomputed when `filed` changes)
  const next7Unfiled = useMemo(()=> next7.filter(o => !filed[o.id]), [next7, filed]);
  const monthUnfiled = useMemo(()=> monthOccurrences.filter(o => !filed[o.id]), [monthOccurrences, filed]);

  const toggleFiled = (id: string) => {
    setFiled(prev => { const n = {...prev, [id]: !prev[id]}; saveFiled(n); return n; });
  };

  // --- Dashboard derived metrics ---
  const totalCirculars = showCirculars ? COMPLIANCE_RULES.length : 0;
  const pendingActions = showCirculars ? monthUnfiled.length : 0;
  const complianceRate = showCirculars ? Math.round(((COMPLIANCE_RULES.length - monthUnfiled.length) / Math.max(1, COMPLIANCE_RULES.length)) * 100) : 100;
  // risk score: simple heuristic: overdue count * 10 (capped)
  const overdueCount = monthOccurrences.filter(o => !filed[o.id] && isBefore(parseISO(o.date), new Date())).length;
  const riskScore = Math.min(100, overdueCount * 12 + Math.max(0, 50 - complianceRate));

  // filters: Issued (all), Due (unfiled), timeframe
  const [viewMode, setViewMode] = useState<'issued'|'due'>('issued');
  const [timeframe, setTimeframe] = useState<'all'|'7'|'30'>('30');

  const filtered = useMemo(() => {
    const base = viewMode === 'issued' ? monthOccurrences : monthUnfiled;
    const todayDate = new Date();
    if (timeframe === '7') return base.filter(b => { const d = parseISO(b.date); return d >= todayDate && d <= addDays(todayDate, 7); });
    if (timeframe === '30') return base.filter(b => { const d = parseISO(b.date); return d >= todayDate && d <= addDays(todayDate, 30); });
    return base;
  }, [viewMode, timeframe, monthOccurrences, monthUnfiled]);

  // build calendar days for current month
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getDateOccurrences = (iso: string) => monthOccurrences.filter(o => o.date === iso);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 bg-gradient-to-br from-background via-background to-muted/20 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Compliance Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">Track statutory due dates and issued circulars</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border bg-card hover:bg-accent transition-colors cursor-pointer">
              <input type="checkbox" checked={showCirculars} onChange={(e)=>setShowCirculars(e.target.checked)} className="rounded" />
              Show Circulars
            </label>
            <Button onClick={()=>{ exportToCSV(next7); }} variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button onClick={()=>{ exportToPDF(next7); }} variant="outline" size="sm" className="gap-2">
              <FileText className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard title="Total Circulars" value={totalCirculars} change={2} trendData={[5,6,7,9,10,12]} description="All tracked rules" />
          <MetricCard title="Compliance Rate" value={`${complianceRate}%`} change={-1} trendData={[90,88,87,86,85,83]} description="This month" />
          <MetricCard title="Pending Actions" value={pendingActions} change={5} trendData={[4,5,6,7,6,8]} description="Unfiled this month" />
          <MetricCard title="Risk Score" value={riskScore} change={-3} trendData={[40,45,48,50,47,44]} description="Higher means riskier" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: enhanced month grid calendar */}
          <div className="lg:col-span-7">
            <Card className="shadow-lg border-muted/50">
              <CardHeader className="border-b bg-gradient-to-r from-card to-muted/10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-primary" />
                      {current.toLocaleString('default',{month:'long', year:'numeric'})}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">Click on a date to view filings</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setCurrent(addDays(current, -30))} className="h-8 w-8 p-0">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrent(startOfMonth(new Date()))} className="h-8 px-3">
                      Today
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCurrent(addDays(current, 30))} className="h-8 w-8 p-0">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-7 gap-1 text-xs font-medium text-center mb-3">
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                    <div key={d} className="text-muted-foreground py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((day) => {
                    const iso = format(day, 'yyyy-MM-dd');
                    const dateOccs = getDateOccurrences(iso);
                    const hasOcc = showCirculars && dateOccs.length > 0;
                    const isCurrentMonth = day.getMonth() === current.getMonth();
                    const isToday = format(today, 'yyyy-MM-dd') === iso;
                    const overdueOccs = dateOccs.filter(o => !filed[o.id] && isBefore(parseISO(o.date), new Date()));
                    const hasOverdue = overdueOccs.length > 0;
                    const allFiled = dateOccs.length > 0 && dateOccs.every(o => filed[o.id]);
                    
                    return (
                      <Popover key={iso}>
                        <PopoverTrigger asChild>
                          <button 
                            className={`min-h-[70px] p-2 rounded-lg border transition-all hover:shadow-md hover:scale-105 text-left relative group ${
                              !isCurrentMonth 
                                ? 'bg-muted/30 text-muted-foreground border-transparent' 
                                : isToday 
                                  ? 'bg-primary/10 border-primary/50 ring-2 ring-primary/20' 
                                  : 'bg-card border-border hover:border-primary/30'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>
                                {day.getDate()}
                              </div>
                              {hasOcc && (
                                <div className="flex gap-1">
                                  {hasOverdue && <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />}
                                  {allFiled && <div className="h-2 w-2 rounded-full bg-green-500" />}
                                  {!allFiled && !hasOverdue && <div className="h-2 w-2 rounded-full bg-yellow-500" />}
                                </div>
                              )}
                            </div>
                            {showCirculars && hasOcc && (
                              <div className="space-y-1">
                                {dateOccs.slice(0, 2).map(o => (
                                  <div key={o.id} className="text-[10px] leading-tight truncate opacity-70 group-hover:opacity-100">
                                    {o.title}
                                  </div>
                                ))}
                                {dateOccs.length > 2 && (
                                  <div className="text-[10px] text-primary font-medium">+{dateOccs.length - 2} more</div>
                                )}
                              </div>
                            )}
                          </button>
                        </PopoverTrigger>
                        {hasOcc && (
                          <PopoverContent className="w-80 p-0" align="start">
                            <div className="p-4 border-b bg-muted/50">
                              <h4 className="font-semibold text-sm">Filings for {format(day, 'MMM dd, yyyy')}</h4>
                              <p className="text-xs text-muted-foreground mt-1">{dateOccs.length} filing{dateOccs.length !== 1 ? 's' : ''} due</p>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                              {dateOccs.map(o => {
                                const isOverdue = !filed[o.id] && isBefore(parseISO(o.date), new Date());
                                const isFiled = filed[o.id];
                                
                                return (
                                  <div key={o.id} className="p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="flex-1">
                                        <h5 className="font-medium text-sm">{o.title}</h5>
                                        <p className="text-xs text-muted-foreground mt-0.5">{o.category}</p>
                                      </div>
                                      <Badge variant={isFiled ? "default" : isOverdue ? "destructive" : "secondary"} className="text-xs">
                                        {isFiled ? (
                                          <><CheckCircle2 className="h-3 w-3 mr-1" /> Filed</>
                                        ) : isOverdue ? (
                                          <><AlertCircle className="h-3 w-3 mr-1" /> Overdue</>
                                        ) : (
                                          <><Clock className="h-3 w-3 mr-1" /> Pending</>
                                        )}
                                      </Badge>
                                    </div>
                                    {o.note && <p className="text-xs text-muted-foreground mb-2">{o.note}</p>}
                                    <Button 
                                      size="sm" 
                                      variant={isFiled ? "outline" : "default"}
                                      className="w-full text-xs h-7"
                                      onClick={() => toggleFiled(o.id)}
                                    >
                                      {isFiled ? 'Mark as Unfiled' : 'Mark as Filed'}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        )}
                      </Popover>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center: Issued Circulars list and filters */}
          <div className="lg:col-span-5 space-y-4">
            {!showCirculars ? (
              <Card className="shadow-lg border-muted/50">
                <CardContent className="p-6 text-center">
                  <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Circulars Hidden</h3>
                  <p className="text-sm text-muted-foreground mb-4">Pre-seeded compliance rules are retained for reporting, but not displayed. Toggle to view them.</p>
                  <Button onClick={() => setShowCirculars(true)}>Show Circulars</Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-lg border-muted/50">
                <CardHeader className="border-b bg-gradient-to-r from-card to-muted/10">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-lg">Issued Circulars</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button 
                        variant={viewMode === 'issued' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setViewMode('issued')}
                      >
                        Issued
                      </Button>
                      <Button 
                        variant={viewMode === 'due' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setViewMode('due')}
                      >
                        Due
                      </Button>
                      <select 
                        className="text-sm p-2 border rounded-lg bg-background" 
                        value={timeframe} 
                        onChange={(e) => setTimeframe(e.target.value as any)}
                      >
                        <option value="all">All</option>
                        <option value="7">Due in 7 days</option>
                        <option value="30">Due in 30 days</option>
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">

                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-8">No circulars found for selected filters</div>
                    ) : (
                      filtered.map(o => {
                        const isOverdue = !filed[o.id] && isBefore(parseISO(o.date), new Date());
                        const isFiled = filed[o.id];
                        return (
                          <div key={o.id} className="p-3 border rounded-lg hover:shadow-md transition-all bg-card">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex-1">
                                <div className="font-semibold text-sm mb-1">{o.title}</div>
                                <div className="text-xs text-muted-foreground">{o.category} • {format(parseISO(o.date), 'MMM dd, yyyy')}</div>
                              </div>
                              <Badge variant={isFiled ? "default" : isOverdue ? "destructive" : "secondary"} className="text-xs shrink-0">
                                {isFiled ? (
                                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Filed</>
                                ) : isOverdue ? (
                                  <><AlertCircle className="h-3 w-3 mr-1" /> Overdue</>
                                ) : (
                                  <><Clock className="h-3 w-3 mr-1" /> Pending</>
                                )}
                              </Badge>
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="w-full text-xs h-7"
                              onClick={() => toggleFiled(o.id)}
                            >
                              {isFiled ? 'Mark as Unfiled' : 'Mark as Filed'}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary card */}
            <Card className="shadow-lg border-muted/50">
              <CardHeader className="border-b bg-gradient-to-r from-card to-muted/10">
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 border rounded-lg bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <div className="text-xs font-medium text-muted-foreground">Overdue</div>
                    </div>
                    <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
                  </div>
                  <div className="p-4 border rounded-lg bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <div className="text-xs font-medium text-muted-foreground">Unfiled</div>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">{pendingActions}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ComplianceCalendar;
