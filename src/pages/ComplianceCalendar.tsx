import React, { useEffect, useMemo, useState } from 'react';
import { occurrencesForMonth, occurrencesInRange, COMPLIANCE_RULES, ComplianceOccurrence } from '@/utils/complianceData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { startOfMonth, startOfWeek, addDays, format } from 'date-fns';
import { 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  FileText, 
  Download,
  Filter,
  BarChart3,
  TrendingUp,
  Users,
  Building
} from 'lucide-react';
import jsPDF from 'jspdf';

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
  const [view, setView] = useState<'month'|'list'|'blocks'|'dashboard'>('dashboard');
  const [filed, setFiled] = useState<Record<string, boolean>>(loadFiled());
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(()=>{ saveFiled(filed); }, [filed]);

  const monthOccurrences = useMemo(()=> occurrencesForMonth(current.getFullYear(), current.getMonth()+1), [current]);

  const next7 = useMemo(()=> occurrencesInRange(today, addDays(today,7)), [today]);

  // derived unfiled sets (recomputed when `filed` changes)
  const next7Unfiled = useMemo(()=> next7.filter(o => !filed[o.id]), [next7, filed]);
  const monthUnfiled = useMemo(()=> monthOccurrences.filter(o => !filed[o.id]), [monthOccurrences, filed]);

  const allThisMonth = monthOccurrences;

  const toggleFiled = (id: string) => {
    setFiled(prev => { const n = {...prev, [id]: !prev[id]}; saveFiled(n); return n; });
  };

  // Statistics
  const stats = useMemo(() => {
    const totalThisMonth = monthOccurrences.length;
    const filedThisMonth = monthOccurrences.filter(o => filed[o.id]).length;
    const overdueThisMonth = monthOccurrences.filter(o => !filed[o.id] && new Date(o.date) < new Date(today.toDateString())).length;
    const upcomingThisMonth = monthOccurrences.filter(o => !filed[o.id] && new Date(o.date) >= new Date(today.toDateString())).length;
    
    const categories = [...new Set(monthOccurrences.map(o => o.category))];
    const categoryStats = categories.map(cat => ({
      category: cat,
      total: monthOccurrences.filter(o => o.category === cat).length,
      filed: monthOccurrences.filter(o => o.category === cat && filed[o.id]).length
    }));

    return {
      totalThisMonth,
      filedThisMonth,
      overdueThisMonth,
      upcomingThisMonth,
      categoryStats,
      complianceRate: totalThisMonth > 0 ? Math.round((filedThisMonth / totalThisMonth) * 100) : 0
    };
  }, [monthOccurrences, filed, today]);

  const filteredOccurrences = useMemo(() => {
    if (filterCategory === 'all') return monthOccurrences;
    return monthOccurrences.filter(o => o.category === filterCategory);
  }, [monthOccurrences, filterCategory]);

  const categories = useMemo(() => {
    return [...new Set(monthOccurrences.map(o => o.category))];
  }, [monthOccurrences]);

  const daysGrid = useMemo(()=>{
    const start = startOfWeek(startOfMonth(current), { weekStartsOn: 0 });
    const cells: { date: Date; occurrences: ComplianceOccurrence[] }[] = [];
    for (let i=0;i<42;i++) {
      const d = addDays(start, i);
      const dateStr = d.toISOString().split('T')[0];
      const occ = allThisMonth.filter(o => o.date === dateStr);
      cells.push({ date: d, occurrences: occ });
    }
    return cells;
  }, [current, allThisMonth]);

  const statusFor = (dateStr: string, occ: ComplianceOccurrence[]) => {
    if (occ.length === 0) return '';
    const d = new Date(dateStr+'T00:00:00');
    const anyFiled = occ.some(o=> filed[o.id]);
    if (anyFiled) return 'filed';
    if (d < new Date(today.toDateString())) return 'overdue';
    return 'upcoming';
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Calendar className="h-8 w-8 text-blue-600" />
              Compliance Calendar
            </h1>
            <p className="text-muted-foreground">
              Track statutory due dates and maintain compliance effortlessly
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={()=>{ exportToCSV(next7); }} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Next 7
          </Button>
          <Button onClick={()=>{ exportToCSV(monthOccurrences); }} size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Month
          </Button>
        </div>
      </div>

      {/* Alert Banner for Next 7 Days */}
      {next7Unfiled.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <div className="flex-1">
                <h4 className="font-semibold text-orange-800">Urgent: {next7Unfiled.length} compliance items due in next 7 days</h4>
                <p className="text-sm text-orange-700">Take action now to avoid penalties</p>
              </div>
              <Button onClick={()=>setView('list')} variant="outline" size="sm">
                View All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Toggle Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button 
          variant={view === 'dashboard' ? 'default' : 'outline'} 
          onClick={() => setView('dashboard')}
          size="sm"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Dashboard
        </Button>
        <Button 
          variant={view === 'month' ? 'default' : 'outline'} 
          onClick={() => setView('month')}
          size="sm"
        >
          
          
        </Button>
        <Button 
          variant={view === 'list' ? 'default' : 'outline'} 
          onClick={() => setView('list')}
          size="sm"
        >
          <FileText className="h-4 w-4 mr-2" />
          List View
        </Button>
        <Button 
          variant={view === 'blocks' ? 'default' : 'outline'} 
          onClick={() => setView('blocks')}
          size="sm"
        >
          <Clock className="h-4 w-4 mr-2" />
          Due Items
        </Button>
      </div>

      {view === 'dashboard' ? (
        <div className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total This Month</p>
                    <h3 className="text-2xl font-bold">{stats.totalThisMonth}</h3>
                  </div>
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Filed</p>
                    <h3 className="text-2xl font-bold text-green-600">{stats.filedThisMonth}</h3>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                    <h3 className="text-2xl font-bold text-red-600">{stats.overdueThisMonth}</h3>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Compliance Rate</p>
                    <h3 className="text-2xl font-bold text-blue-600">{stats.complianceRate}%</h3>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category-wise Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Category-wise Compliance Status
              </CardTitle>
              <CardDescription>
                Track compliance across different statutory categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.categoryStats.map(cat => (
                  <div key={cat.category} className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">{cat.category}</h4>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Progress</span>
                      <span className="text-sm font-medium">{cat.filed}/{cat.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${cat.total > 0 ? (cat.filed / cat.total) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cat.total > 0 ? Math.round((cat.filed / cat.total) * 100) : 0}% completed
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Due Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Upcoming Due Items
              </CardTitle>
              <CardDescription>
                Items requiring immediate attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {next7Unfiled.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
                  <h4 className="font-semibold text-green-800">All Caught Up!</h4>
                  <p className="text-sm text-muted-foreground">No immediate compliance items due in the next 7 days</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {next7Unfiled.slice(0, 5).map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${new Date(item.date) < today ? 'bg-red-600' : 'bg-yellow-600'}`}></div>
                        <div>
                          <h5 className="font-medium">{item.title}</h5>
                          <p className="text-sm text-muted-foreground">
                            {item.category} • Due: {format(new Date(item.date), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggleFiled(item.id)}>
                          Mark Filed
                        </Button>
                        <Button size="sm" asChild>
                          <a href={item.link || '#'} target="_blank" rel="noopener noreferrer">
                            File Now
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {next7Unfiled.length > 5 && (
                    <Button variant="outline" onClick={() => setView('list')} className="w-full">
                      View All {next7Unfiled.length} Items
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common compliance management tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button 
                  variant="outline" 
                  className="h-auto flex-col p-4"
                  onClick={() => setView('month')}
                >
                  <Calendar className="h-8 w-8 mb-2 text-blue-600" />
                  <span className="font-medium">View Calendar</span>
                  <span className="text-xs text-muted-foreground">Month view</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto flex-col p-4"
                  onClick={() => exportToCSV(monthOccurrences)}
                >
                  <Download className="h-8 w-8 mb-2 text-green-600" />
                  <span className="font-medium">Export Data</span>
                  <span className="text-xs text-muted-foreground">CSV/PDF format</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto flex-col p-4"
                  onClick={() => setView('blocks')}
                >
                  <AlertTriangle className="h-8 w-8 mb-2 text-orange-600" />
                  <span className="font-medium">View Overdue</span>
                  <span className="text-xs text-muted-foreground">Pending items</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto flex-col p-4"
                  onClick={() => setFilterCategory('GST')}
                >
                  <Building className="h-8 w-8 mb-2 text-purple-600" />
                  <span className="font-medium">GST Filings</span>
                  <span className="text-xs text-muted-foreground">Filter by GST</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : view === 'month' ? (
        // calendar grid: responsive - collapse to single column on small screens
        <div role="grid" aria-label="Compliance calendar" className="grid grid-cols-7 gap-2 sm:grid-cols-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=> <div key={d} className="text-center font-medium">{d}</div>)}
          {daysGrid.map((cell, idx)=>{
            const date = cell.date;
            const dateStr = date.toISOString().split('T')[0];
            const occ = cell.occurrences;
            const status = statusFor(dateStr, occ);
            return (
              <div
                key={idx}
                role="gridcell"
                tabIndex={0}
                aria-label={`${date.toDateString()} ${occ.length} item(s)`}
                className={`p-2 border rounded min-h-[80px] ${isSameDay(date,today)?'ring-2 ring-indigo-300':''}`}>
                <div className="flex justify-between items-start">
                  <div className="text-xs font-medium">{date.getDate()}</div>
                  <div className="text-xs text-muted-foreground">{occ.length? `${occ.length}`:''}</div>
                </div>
                <div className="mt-2 space-y-1">
                  {occ.slice(0,3).map(o=>{
                    const st = filed[o.id] ? 'filed' : (new Date(o.date) < new Date(today.toDateString()) ? 'overdue' : 'upcoming');
                    return (
                      <div key={o.id} className={`text-xs p-1 rounded ${colors[st]}`}>
                        <div className="flex justify-between items-center">
                          <div>{o.title}</div>
                          <div className="flex gap-1 ml-2">
                            <button
                              aria-pressed={!!filed[o.id]}
                              aria-label={`${filed[o.id] ? 'Unmark' : 'Mark as filed'} for ${o.title}`}
                              className="text-xs underline"
                              onClick={()=>toggleFiled(o.id)}>{filed[o.id] ? 'Unmark' : 'Mark as Filed'}</button>
                            <a className="text-xs underline" href={o.link||'#'} target="_blank" rel="noopener noreferrer">File Now</a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {monthOccurrences.map(o=>{
            const st = filed[o.id] ? 'filed' : (new Date(o.date) < new Date(today.toDateString()) ? 'overdue' : 'upcoming');
            return (
              <div key={o.id} className={`p-3 rounded flex justify-between items-center ${colors[st]}`}>
                <div>
                  <div className="font-medium">{o.title}</div>
                  <div className="text-sm">{o.date} • {o.category} {o.note?`• ${o.note}`:''}</div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-white rounded" onClick={()=>toggleFiled(o.id)}>{filed[o.id] ? 'Unmark Filed' : 'Mark as Filed'}</button>
                  <a className="px-3 py-1 bg-white rounded" href={o.link||'#'}>File Now</a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // blocks view: show grouped unfiled due items for the month
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Due items (unfiled) — this month</h2>
          {monthUnfiled.length === 0 ? (
            <div className="text-sm text-muted-foreground">No due items. All caught up!</div>
          ) : (
            // group by date
            Object.entries(monthUnfiled.reduce((acc, cur) => {
              (acc[cur.date] = acc[cur.date] || []).push(cur);
              return acc;
            }, {} as Record<string, ComplianceOccurrence[]>)).map(([date, items]) => (
              <div key={date} className="p-3 border rounded">
                <div className="font-medium mb-2">{date}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map(i => (
                    <div key={i.id} className="p-3 bg-white rounded shadow-sm">
                      <div className="font-semibold">{i.title}</div>
                      <div className="text-sm text-muted-foreground">{i.category} {i.note?`• ${i.note}`:''}</div>
                      <div className="mt-2 flex gap-2">
                        <button className="px-3 py-1 bg-indigo-600 text-white rounded" onClick={()=>toggleFiled(i.id)}>Mark as Filed</button>
                        <a className="px-3 py-1 bg-gray-100 rounded" href={i.link||'#'} target="_blank" rel="noopener noreferrer">File Now</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ComplianceCalendar;
