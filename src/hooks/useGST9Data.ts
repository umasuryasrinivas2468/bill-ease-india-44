import { useInvoices } from './useInvoices';
import { usePurchaseBills } from './usePurchaseBills';
import { useMemo } from 'react';

export interface GST9Monthly {
  month: number; // 1-12
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateUTTax: number;
  cessTax: number;
}

export const useGST9Data = (year = new Date().getFullYear()) => {
  const { data: invoices = [] } = useInvoices();
  const { data: purchases = [] } = usePurchaseBills();

  const months = useMemo(() => {
    const arr: GST9Monthly[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, taxableValue: 0, integratedTax: 0, centralTax: 0, stateUTTax: 0, cessTax: 0 }));

    const addInvoice = (inv: any) => {
      const d = new Date(inv.invoice_date || inv.created_at || null);
      if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
      const m = d.getMonth();
      const gstAmount = Number(inv.gst_amount) || 0;
      const taxable = Number(inv.total_amount || 0) - gstAmount;
      // assume intrastate split
      arr[m].taxableValue += taxable;
      arr[m].centralTax += gstAmount / 2;
      arr[m].stateUTTax += gstAmount / 2;
    };

    const addPurchase = (p: any) => {
      const d = new Date(p.bill_date || p.created_at || null);
      if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
      const m = d.getMonth();
      const gstAmount = Number(p.gst_amount) || 0;
      // treat as ITC (reduce liability)
      arr[m].centralTax -= gstAmount / 2;
      arr[m].stateUTTax -= gstAmount / 2;
    };

    (invoices || []).forEach(addInvoice);
    (purchases || []).forEach(addPurchase);

    // compute integratedTax and cess as zero for now
    for (const a of arr) {
      a.integratedTax = 0;
      a.cessTax = 0;
    }

    return arr;
  }, [invoices, purchases, year]);

  return { months };
};
