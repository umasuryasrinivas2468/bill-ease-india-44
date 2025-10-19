import React, { useEffect, useMemo, useState } from 'react';
import { occurrencesForMonth, occurrencesInRange, COMPLIANCE_RULES, ComplianceOccurrence } from '@/utils/complianceData';
import { Button } from '@/components/ui/button';
import { startOfMonth, startOfWeek, addDays, isBefore, isAfter, parseISO, endOfMonth, eachDayOfInterval, format, endOfWeek } from 'date-fns';
import jsPDF from 'jspdf';
import MetricCard from '@/components/ComplianceDashboard/MetricCard';
import Sparkline from '@/components/ComplianceDashboard/Sparkline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  // show circulars by default
  const [showCirculars, setShowCirculars] = useState<boolean>(true);

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

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Compliance Calendar</h1>
          <p className="text-sm text-muted-foreground">Track statutory due dates and issued circulars</p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showCirculars} onChange={(e)=>setShowCirculars(e.target.checked)} />
            Show Circulars
          </label>
          <Button onClick={()=>{ exportToCSV(next7); }}>Export Next 7 (CSV)</Button>
          <Button onClick={()=>{ exportToPDF(next7); }}>Export Next 7 (PDF)</Button>
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
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Calendar</CardTitle>
                <div className="text-sm text-muted-foreground">{current.toLocaleString('default',{month:'long', year:'numeric'})}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-2 py-1 text-sm rounded bg-gray-100" onClick={() => setCurrent(addDays(current, -30))}>Prev</button>
                <button className="px-2 py-1 text-sm rounded bg-gray-100" onClick={() => setCurrent(startOfMonth(new Date()))}>Today</button>
                <button className="px-2 py-1 text-sm rounded bg-gray-100" onClick={() => setCurrent(addDays(current, 30))}>Next</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2 text-xs text-center mb-2">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                  <div key={d} className="text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day) => {
                  const iso = format(day, 'yyyy-MM-dd');
                  // occurrences only shown when user enables circulars
                  const hasOcc = showCirculars && monthOccurrences.some(o => o.date === iso);
                  const isCurrentMonth = day.getMonth() === current.getMonth();
                  return (
                    <div key={iso} className={`min-h-[64px] p-2 rounded border ${isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-muted-foreground'}`}>
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-medium">{day.getDate()}</div>
                        {hasOcc && <div className="h-2 w-2 rounded-full bg-indigo-600 mt-1" />}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {!showCirculars ? (
                          <div className="italic">No circulars visible</div>
                        ) : (
                          monthOccurrences.filter(o => o.date === iso).slice(0,2).map(o => (
                            <div key={o.id} className="truncate">{o.title}</div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

  {/* Center: Issued Circulars list and filters */}
  <div className="lg:col-span-5">
          {!showCirculars ? (
            <div className="p-6 bg-white rounded-lg shadow-sm text-center">
              <h3 className="text-lg font-medium mb-2">Circulars removed from UI</h3>
              <p className="text-sm text-muted-foreground mb-4">Pre-seeded compliance rules are retained in the application for reporting and exports, but circulars are not displayed in the UI. Toggle "Show Circulars" to view them temporarily.</p>
              <Button onClick={() => setShowCirculars(true)}>Restore Circulars</Button>
            </div>
          ) : (
            <div className="p-4 bg-white rounded-lg shadow-sm mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">Issued Circulars</h3>
                <div className="flex items-center gap-2">
                  <button className={`px-3 py-1 rounded ${viewMode==='issued'?'bg-indigo-600 text-white':'bg-gray-100'}`} onClick={()=>setViewMode('issued')}>Issued</button>
                  <button className={`px-3 py-1 rounded ${viewMode==='due'?'bg-indigo-600 text-white':'bg-gray-100'}`} onClick={()=>setViewMode('due')}>Due</button>
                  <select className="ml-2 p-1 border rounded" value={timeframe} onChange={(e)=>setTimeframe(e.target.value as any)}>
                    <option value="all">All</option>
                    <option value="7">Due in 7 days</option>
                    <option value="30">Due in 30 days</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No circulars found for selected filters</div>
                ) : (
                  filtered.map(o => {
                    const pctPending = Math.floor(Math.random()*100); // placeholder for pending %
                    const isOverdue = !filed[o.id] && isBefore(parseISO(o.date), new Date());
                    return (
                      <div key={o.id} className="p-3 border rounded flex items-center justify-between">
                        <div>
                          <div className="font-medium">{o.title}</div>
                          <div className="text-xs text-muted-foreground">{o.category} • {o.date}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground">Pending: <strong>{pctPending}%</strong></div>
                          <div className="flex items-center gap-2">
                            <div className={`text-xs px-2 py-1 rounded-full ${filed[o.id] ? 'bg-green-100 text-green-800' : isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {filed[o.id] ? 'Compliant' : isOverdue ? 'Overdue' : 'Pending'}
                            </div>
                            <button className="text-sm underline" onClick={()=>toggleFiled(o.id)}>{filed[o.id] ? 'Unmark' : 'Mark Filed'}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-4 text-center">
                <Button variant="outline" asChild>
                  <a href="#">View All Circulars</a>
                </Button>
              </div>
            </div>
          )}

          {/* Compact list of trending/summary */}
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <h4 className="font-medium mb-2">Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className="text-lg font-bold text-red-600">{overdueCount}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Unfiled (month)</div>
                <div className="text-lg font-bold">{pendingActions}</div>
              </div>
            </div>
          </div>
        </div>

        {/* quick actions removed per request */}
      </div>
    </div>
  );
};

export default ComplianceCalendar;
