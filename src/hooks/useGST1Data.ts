import { useInvoices } from './useInvoices';
import { useMemo } from 'react';

export interface GST1Row {
  invoice_number: string;
  invoice_date: string;
  client_gst_number?: string;
  client_name: string;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

export const useGST1Data = () => {
  const { data: invoices = [] } = useInvoices();

  const rows = useMemo(() => {
    return (invoices || []).map(inv => {
      const gstAmount = Number(inv.gst_amount) || 0;
      const taxableValue = Number(inv.total_amount || 0) - gstAmount;

      // Simple split: assume intrastate (CGST/SGST) unless explicit interstate flag exists
      const isInterState = false; // conservative default; improve later with company GST
      let igst = 0, cgst = 0, sgst = 0;
      if (isInterState) igst = gstAmount;
      else {
        cgst = gstAmount / 2;
        sgst = gstAmount / 2;
      }

      return {
        invoice_number: inv.invoice_number || '',
        invoice_date: inv.invoice_date || '',
        client_gst_number: inv.client_gst_number || '',
        client_name: inv.client_name || '',
        taxable_value: taxableValue,
        igst,
        cgst,
        sgst,
        cess: 0,
      } as GST1Row;
    });
  }, [invoices]);

  return { rows };
};
