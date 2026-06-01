import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { round2 } from '@/lib/gst';

// ═══════════════════════════════════════════════════════════════════
// useGSTLiability — Output Tax Liability + Net GST Payable dashboard.
//
// SSOT: all numbers come from `get_gst_liability_from_journals(user, period)`
// which aggregates `journal_lines.tax_type` (cgst/sgst/igst/cess/itc/
// output_gst/rcm_input/rcm_output). The previous implementation summed
// invoices.gst_amount + credit_notes.gst_amount + bills.gst_amount +
// expenses.rcm_amount directly — that double-counted anything posted to
// the GL via post_journal.
//
// Period is a calendar month (YYYY-MM).
// ═══════════════════════════════════════════════════════════════════

export interface GSTLiabilitySummary {
  period: string;                 // YYYY-MM
  output: { cgst: number; sgst: number; igst: number; cess?: number; total: number };
  credit_notes: { cgst: number; sgst: number; igst: number; total: number };
  net_output: { cgst: number; sgst: number; igst: number; total: number };
  itc: { purchase_bills: number; rcm: number; total: number };
  rcm_liability: number;
  net_payable: {
    cgst: number;
    sgst: number;
    igst: number;
    total_cash: number;
  };
}

interface JournalGstResult {
  period: string;
  source: 'journals_only';
  output: { cgst: number; sgst: number; igst: number; cess: number; total: number };
  itc:    { cgst: number; sgst: number; igst: number; cess: number; total: number };
  rcm:    { input: number; output: number };
  computed_at: string;
}

export const useGSTLiability = (month: string) => {
  const { user } = useUser();

  return useQuery<GSTLiabilitySummary>({
    queryKey: ['gst-liability-journal', user?.id, month],
    enabled: !!user?.id && !!month,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_gst_liability_from_journals', {
        p_user_id: user!.id,
        p_period: month,
      });
      if (error) throw error;
      const r = data as JournalGstResult;

      // The journal-derived "output" already nets credit notes (they post Dr
      // CGST/SGST/IGST on a credit_note journal which reduces the credit side
      // of the running output total). For UI parity with the prior summary
      // we surface zeros in `credit_notes` and use the same `output` value
      // as `net_output`.
      const output = {
        cgst:  round2(r.output.cgst),
        sgst:  round2(r.output.sgst),
        igst:  round2(r.output.igst),
        cess:  round2(r.output.cess),
        total: round2(r.output.total),
      };
      const zeros = { cgst: 0, sgst: 0, igst: 0, total: 0 };
      const netOutput = {
        cgst:  output.cgst,
        sgst:  output.sgst,
        igst:  output.igst,
        total: output.total,
      };

      const itcBills = round2(r.itc.total);    // includes RCM input
      const rcmIn    = round2(r.rcm.input);
      const totalItc = itcBills;
      const rcmLiability = round2(r.rcm.output);

      const netOutputTotal = Math.max(netOutput.total, 0);
      const shareCgst = netOutputTotal ? netOutput.cgst / netOutputTotal : 0;
      const shareSgst = netOutputTotal ? netOutput.sgst / netOutputTotal : 0;
      const shareIgst = netOutputTotal ? netOutput.igst / netOutputTotal : 0;

      const netCgst = Math.max(0, round2(netOutput.cgst - totalItc * shareCgst));
      const netSgst = Math.max(0, round2(netOutput.sgst - totalItc * shareSgst));
      const netIgst = Math.max(0, round2(netOutput.igst - totalItc * shareIgst));
      const netCash = round2(netCgst + netSgst + netIgst + rcmLiability);

      return {
        period: month,
        output,
        credit_notes: zeros,           // already netted into `output` from journals
        net_output: netOutput,
        itc: {
          purchase_bills: round2(itcBills - rcmIn),
          rcm: rcmIn,
          total: totalItc,
        },
        rcm_liability: rcmLiability,
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
