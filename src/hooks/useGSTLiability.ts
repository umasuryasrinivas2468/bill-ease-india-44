import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { computeGSTBreakdown, round2 } from '@/lib/gst';
import { useBusinessData } from '@/hooks/useBusinessData';

// ═══════════════════════════════════════════════════════════════════
// useGSTLiability — aggregates a given month into the numbers shown on
// the Output Tax Liability + Net GST Payable dashboards.
//
// Sources:
//   - invoices            → output tax (read __tax_meta from items JSON
//                           if present, else compute from gst_amount +
//                           client place_of_supply vs seller state)
//   - credit_notes        → negative output tax (reversal)
//   - purchase_bills      → eligible ITC (gst_amount)
//   - expenses (is_rcm)   → RCM payable (also ITC-eligible in most cases)
//
// Period is a calendar month. `month` is YYYY-MM.
// ═══════════════════════════════════════════════════════════════════

export interface GSTLiabilitySummary {
  period: string;                 // YYYY-MM
  output: { cgst: number; sgst: number; igst: number; total: number };
  credit_notes: { cgst: number; sgst: number; igst: number; total: number };
  net_output: { cgst: number; sgst: number; igst: number; total: number };
  itc: { purchase_bills: number; rcm: number; total: number };
  rcm_liability: number;          // reverse-charge GST payable
  net_payable: {
    cgst: number;
    sgst: number;
    igst: number;
    total_cash: number;           // what you actually owe in cash this month
  };
}

function monthBounds(month: string) {
  // month = YYYY-MM → [firstDayISO, firstDayOfNextMonthISO)
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}

function splitFromTotal(gstTotal: number, intraState: boolean) {
  if (intraState) {
    const half = round2(gstTotal / 2);
    return { cgst: half, sgst: round2(gstTotal - half), igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: round2(gstTotal) };
}

function readTaxMeta(items: any): any | null {
  if (!Array.isArray(items)) return null;
  const meta = items.find(
    (x) => x && typeof x === 'object' && x.__tax_meta === true,
  );
  return meta || null;
}

export const useGSTLiability = (month: string) => {
  const { user } = useUser();
  const { getBusinessInfo } = useBusinessData();
  const sellerState = getBusinessInfo()?.state || '';

  return useQuery<GSTLiabilitySummary>({
    queryKey: ['gst-liability', user?.id, month, sellerState],
    enabled: !!user?.id && !!month,
    queryFn: async () => {
      const { start, end } = monthBounds(month);

      // ── OUTPUT TAX: invoices ──
      const { data: invoices = [] } = await supabase
        .from('invoices')
        .select('id, invoice_date, gst_amount, items, client_name')
        .eq('user_id', user!.id)
        .gte('invoice_date', start)
        .lt('invoice_date', end);

      // Pull clients to look up place_of_supply for legacy invoices without __tax_meta
      const { data: clients = [] } = await supabase
        .from('clients')
        .select('name, place_of_supply')
        .eq('user_id', user!.id);
      const clientPOS = new Map(
        (clients || []).map((c: any) => [c.name, c.place_of_supply]),
      );

      const output = { cgst: 0, sgst: 0, igst: 0, total: 0 };
      for (const inv of invoices || []) {
        const gstTotal = Number(inv.gst_amount) || 0;
        if (gstTotal === 0) continue;
        output.total += gstTotal;

        const meta = readTaxMeta(inv.items);
        if (meta) {
          output.cgst += Number(meta.cgst_amount) || 0;
          output.sgst += Number(meta.sgst_amount) || 0;
          output.igst += Number(meta.igst_amount) || 0;
        } else {
          // Legacy fallback: re-derive from seller state vs client's POS
          const buyerState = clientPOS.get(inv.client_name) || '';
          const bd = computeGSTBreakdown(0, 0, sellerState, buyerState);
          const split = splitFromTotal(gstTotal, bd.intraState);
          output.cgst += split.cgst;
          output.sgst += split.sgst;
          output.igst += split.igst;
        }
      }

      // ── CREDIT NOTES: reversals ──
      const { data: creditNotes = [] } = await supabase
        .from('credit_notes')
        .select('gst_amount, items, client_name, issue_date')
        .eq('user_id', user!.id)
        .gte('issue_date', start)
        .lt('issue_date', end);

      const credit = { cgst: 0, sgst: 0, igst: 0, total: 0 };
      for (const cn of creditNotes || []) {
        const gstTotal = Number(cn.gst_amount) || 0;
        if (gstTotal === 0) continue;
        credit.total += gstTotal;
        const meta = readTaxMeta(cn.items);
        if (meta) {
          credit.cgst += Number(meta.cgst_amount) || 0;
          credit.sgst += Number(meta.sgst_amount) || 0;
          credit.igst += Number(meta.igst_amount) || 0;
        } else {
          const buyerState = clientPOS.get(cn.client_name) || '';
          const bd = computeGSTBreakdown(0, 0, sellerState, buyerState);
          const split = splitFromTotal(gstTotal, bd.intraState);
          credit.cgst += split.cgst;
          credit.sgst += split.sgst;
          credit.igst += split.igst;
        }
      }

      // ── ITC from purchase_bills ──
      const { data: purchaseBills = [] } = await supabase
        .from('purchase_bills')
        .select('gst_amount, bill_date')
        .eq('user_id', user!.id)
        .gte('bill_date', start)
        .lt('bill_date', end);
      const itcFromBills = (purchaseBills || []).reduce(
        (sum: number, b: any) => sum + (Number(b.gst_amount) || 0),
        0,
      );

      // ── RCM liability + ITC from expenses ──
      const { data: rcmExpenses = [] } = await supabase
        .from('expenses')
        .select('rcm_amount, expense_date')
        .eq('user_id', user!.id)
        .eq('is_rcm', true)
        .gte('expense_date', start)
        .lt('expense_date', end);
      const rcmLiability = (rcmExpenses || []).reduce(
        (sum: number, e: any) => sum + (Number(e.rcm_amount) || 0),
        0,
      );

      // ── Assemble ──
      const netOutput = {
        cgst: round2(output.cgst - credit.cgst),
        sgst: round2(output.sgst - credit.sgst),
        igst: round2(output.igst - credit.igst),
        total: round2(output.total - credit.total),
      };

      // RCM counts as ITC since the buyer pays it AND can claim it back (in most cases)
      const totalITC = round2(itcFromBills + rcmLiability);

      // Net cash payable, per head. ITC offsets output on a best-effort split —
      // a full implementation needs per-bill breakdown; for now proportion by output mix.
      const netOutputTotal = Math.max(netOutput.total, 0);
      const shareCgst = netOutputTotal ? netOutput.cgst / netOutputTotal : 0;
      const shareSgst = netOutputTotal ? netOutput.sgst / netOutputTotal : 0;
      const shareIgst = netOutputTotal ? netOutput.igst / netOutputTotal : 0;

      const netCgst = Math.max(0, round2(netOutput.cgst - totalITC * shareCgst));
      const netSgst = Math.max(0, round2(netOutput.sgst - totalITC * shareSgst));
      const netIgst = Math.max(0, round2(netOutput.igst - totalITC * shareIgst));
      const netCash = round2(netCgst + netSgst + netIgst + rcmLiability);

      return {
        period: month,
        output,
        credit_notes: credit,
        net_output: netOutput,
        itc: {
          purchase_bills: round2(itcFromBills),
          rcm: round2(rcmLiability),
          total: totalITC,
        },
        rcm_liability: round2(rcmLiability),
        net_payable: {
          cgst: netCgst,
          sgst: netSgst,
          igst: netIgst,
          total_cash: netCash,
        },
      };
    },
  });
};
