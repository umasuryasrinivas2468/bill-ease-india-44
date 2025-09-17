export type Frequency =
  | { kind: 'monthly'; day: number }
  | { kind: 'quarterly'; day: number; months?: number[] }
  | { kind: 'annual'; month: number; day: number }
  | { kind: 'specific'; date: string }
  | { kind: 'monthly_state'; day: number; note?: string };

export interface ComplianceRule {
  id: string;
  title: string;
  category: string; // GST, TDS, Payroll, MCA, Income Tax
  frequency: Frequency;
  link?: string;
  note?: string;
}

// Hardcoded compliance rules per requirements
export const COMPLIANCE_RULES: ComplianceRule[] = [
  // GST
  { id: 'gstr1', title: 'GSTR-1 (Monthly)', category: 'GST', frequency: { kind: 'monthly', day: 11 }, link: '#' },
  { id: 'gstr3b', title: 'GSTR-3B (Monthly)', category: 'GST', frequency: { kind: 'monthly', day: 20 }, link: '#' },
  { id: 'cmp08', title: 'CMP-08 (Quarterly)', category: 'GST', frequency: { kind: 'quarterly', day: 18, months: [3, 6, 9, 12] }, link: '#' },
  { id: 'gstr9', title: 'GSTR-9 (Annual)', category: 'GST', frequency: { kind: 'annual', month: 12, day: 31 }, link: '#' },

  // Income Tax / TDS
  { id: 'tds_payment', title: 'TDS Payment (Monthly)', category: 'Income Tax', frequency: { kind: 'monthly', day: 7 }, link: '#' },
  { id: 'tds_qtr', title: 'TDS Quarterly Return', category: 'Income Tax', frequency: { kind: 'specific', date: '07-31' }, note: 'Quarterly returns: 31 Jul, 31 Oct, 31 Jan, 31 May', link: '#' },
  { id: 'advance_tax_q1', title: 'Advance Tax (Jun)', category: 'Income Tax', frequency: { kind: 'annual', month: 6, day: 15 }, link: '#' },
  { id: 'advance_tax_q2', title: 'Advance Tax (Sep)', category: 'Income Tax', frequency: { kind: 'annual', month: 9, day: 15 }, link: '#' },
  { id: 'advance_tax_q3', title: 'Advance Tax (Dec)', category: 'Income Tax', frequency: { kind: 'annual', month: 12, day: 15 }, link: '#' },
  { id: 'advance_tax_q4', title: 'Advance Tax (Mar)', category: 'Income Tax', frequency: { kind: 'annual', month: 3, day: 15 }, link: '#' },
  { id: 'itr_ind', title: 'ITR (Individuals/Firms)', category: 'Income Tax', frequency: { kind: 'annual', month: 7, day: 31 }, link: '#' },
  { id: 'itr_companies', title: 'ITR (Companies)', category: 'Income Tax', frequency: { kind: 'annual', month: 10, day: 31 }, link: '#' },

  // MCA / ROC
  { id: 'aoc4', title: 'AOC-4', category: 'MCA', frequency: { kind: 'annual', month: 10, day: 30 }, link: '#' },
  { id: 'mgt7', title: 'MGT-7', category: 'MCA', frequency: { kind: 'annual', month: 11, day: 29 }, link: '#' },

  // Payroll
  { id: 'pf_return', title: 'PF Return', category: 'Payroll', frequency: { kind: 'monthly', day: 15 }, link: '#' },
  { id: 'esi_return', title: 'ESI Return', category: 'Payroll', frequency: { kind: 'monthly', day: 15 }, link: '#' },
  { id: 'pt_return', title: 'Professional Tax (State)', category: 'Payroll', frequency: { kind: 'monthly_state', day: 20, note: 'State-wise due dates' }, link: '#' },
];

export interface ComplianceOccurrence {
  id: string; // unique instance id e.g., `${rule.id}_${yyyy_mm_dd}`
  ruleId: string;
  title: string;
  category: string;
  date: string; // ISO date
  link?: string;
  note?: string;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function occurrencesForMonth(year: number, month: number): ComplianceOccurrence[] {
  // month: 1-12
  const occurrences: ComplianceOccurrence[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  COMPLIANCE_RULES.forEach(rule => {
    const f = rule.frequency;
    if (f.kind === 'monthly') {
      const day = Math.min(f.day, daysInMonth);
      const date = `${year}-${pad(month)}-${pad(day)}`;
      occurrences.push({ id: `${rule.id}_${date}`, ruleId: rule.id, title: rule.title, category: rule.category, date, link: rule.link });
    } else if (f.kind === 'monthly_state') {
      const day = Math.min(f.day, daysInMonth);
      const date = `${year}-${pad(month)}-${pad(day)}`;
      occurrences.push({ id: `${rule.id}_${date}`, ruleId: rule.id, title: rule.title, category: rule.category, date, link: rule.link, note: rule.note });
    } else if (f.kind === 'quarterly') {
      const months = f.months || [3, 6, 9, 12];
      if (months.includes(month)) {
        const day = Math.min(f.day, daysInMonth);
        const date = `${year}-${pad(month)}-${pad(day)}`;
        occurrences.push({ id: `${rule.id}_${date}`, ruleId: rule.id, title: rule.title, category: rule.category, date, link: rule.link });
      }
    } else if (f.kind === 'annual') {
      if (f.month === month) {
        const day = Math.min(f.day, daysInMonth);
        const date = `${year}-${pad(month)}-${pad(day)}`;
        occurrences.push({ id: `${rule.id}_${date}`, ruleId: rule.id, title: rule.title, category: rule.category, date, link: rule.link });
      }
    } else if (f.kind === 'specific') {
      // support specific pattern mm-dd in note
      try {
        const [mStr, dStr] = f.date.split('-');
        const m = Number(mStr);
        const d = Number(dStr);
        if (m === month) {
          const day = Math.min(d, daysInMonth);
          const date = `${year}-${pad(month)}-${pad(day)}`;
          occurrences.push({ id: `${rule.id}_${date}`, ruleId: rule.id, title: rule.title, category: rule.category, date, link: rule.link, note: rule.note });
        }
      } catch (e) {
        // ignore
      }
    }
  });

  return occurrences;
}

export function occurrencesInRange(start: Date, end: Date): ComplianceOccurrence[] {
  const occ: ComplianceOccurrence[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const year = cur.getFullYear();
    const month = cur.getMonth() + 1;
    occ.push(...occurrencesForMonth(year, month));
    cur.setMonth(cur.getMonth() + 1);
  }
  // filter between start and end
  return occ.filter(o => {
    const d = new Date(o.date + 'T00:00:00');
    return d >= start && d <= end;
  }).sort((a,b)=> new Date(a.date).getTime()-new Date(b.date).getTime());
}
