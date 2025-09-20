import React, { useEffect, useMemo, useState } from 'react';
import { occurrencesForMonth, occurrencesInRange, COMPLIANCE_RULES, ComplianceOccurrence } from '@/utils/complianceData';
import { Button } from '@/components/ui/button';
import { startOfMonth, startOfWeek, addDays } from 'date-fns';
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
  const [filed, setFiled] = useState<Record<string, boolean>>(loadFiled());

  useEffect(()=>{ saveFiled(filed); }, [filed]);

  const monthOccurrences = useMemo(()=> occurrencesForMonth(current.getFullYear(), current.getMonth()+1), [current]);

  const next7 = useMemo(()=> occurrencesInRange(today, addDays(today,7)), [today]);

  // derived unfiled sets (recomputed when `filed` changes)
  const next7Unfiled = useMemo(()=> next7.filter(o => !filed[o.id]), [next7, filed]);
  const monthUnfiled = useMemo(()=> monthOccurrences.filter(o => !filed[o.id]), [monthOccurrences, filed]);

  const toggleFiled = (id: string) => {
    setFiled(prev => { const n = {...prev, [id]: !prev[id]}; saveFiled(n); return n; });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Compliance Calendar</h1>
          <p className="text-sm text-muted-foreground">Track statutory due dates. Generated from Aczen Dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={()=>{ exportToCSV(next7); }}>Export Next 7 (CSV)</Button>
          <Button onClick={()=>{ exportToPDF(next7); }}>Export Next 7 (PDF)</Button>
          <Button onClick={()=>{ exportToCSV(monthOccurrences); }}>Export Month (Excel)</Button>
        </div>
      </div>

      {/* Next 7 days banner */}
      <div className="mb-4 p-3 rounded-lg bg-blue-50">
        <div className="flex items-center justify-between">
          <div>
            <strong>Next 7 days:</strong>
            <div className="text-sm" aria-live="polite">{next7Unfiled.length} unfiled compliance item(s) due</div>
          </div>
          <div className="flex gap-2">
            <button className="text-sm underline" onClick={()=>exportToCSV(next7)}>Export</button>
          </div>
        </div>
      </div>

      {/* Blocks view: show grouped unfiled due items for the month */}
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
    </div>
  );
};

export default ComplianceCalendar;
