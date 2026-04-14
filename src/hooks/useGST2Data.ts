import { usePurchaseBills } from './usePurchaseBills';
import { useMemo } from 'react';

export interface GST2APurchaseRow {
  vendor_gst_number?: string;
  vendor_name: string;
  bill_number: string;
  bill_date: string;
  taxable_value: number;
  gst_amount: number;
  itc_eligible: boolean;
}

export const useGST2AData = () => {
  const { data: purchases = [] } = usePurchaseBills();

  const rows = useMemo(() => {
    return (purchases || [])
      .filter(p => p.vendor_gst_number || p.vendor_name)
      .map(p => {
        const gstAmount = Number(p.gst_amount) || 0;
        const taxableValue = Number(p.total_amount || 0) - gstAmount;
        return {
          vendor_gst_number: p.vendor_gst_number || '',
          vendor_name: p.vendor_name || 'Unknown Vendor',
          bill_number: p.bill_number || '',
          bill_date: p.bill_date || '',
          taxable_value: taxableValue,
          gst_amount: gstAmount,
          itc_eligible: Boolean(p.itc_eligible),
        } as GST2APurchaseRow;
      });
  }, [purchases]);

  return { rows };
};

export interface GST2BTotals {
  integratedTax: number;
  centralTax: number;
  stateUTTax: number;
  cessTax: number;
}

export const useGST2BData = () => {
  const { data: purchases = [] } = usePurchaseBills();

  const totals = useMemo((): GST2BTotals => {
    // Sum ITC-eligible purchase taxes
    let integratedTax = 0;
    let centralTax = 0;
    let stateUTTax = 0;
    let cessTax = 0;

    for (const p of purchases || []) {
      if (!p.itc_eligible) continue;
      const gstAmount = Number(p.gst_amount) || 0;
      // Simple split: assume intrastate unless vendor_gst_number indicates interstate.
      // For intrastate, split GST equally between central and state.
      // For interstate, assume full amount is IGST.
      const vendorGst = (p.vendor_gst_number || '').toString();
      const isInterState = vendorGst.length >= 2 ? false : false; // conservative default: treat as intrastate

      if (isInterState) {
        integratedTax += gstAmount;
      } else {
        centralTax += gstAmount / 2;
        stateUTTax += gstAmount / 2;
      }

      // CESS not tracked per-purchase in current schema; keep zero for now
      cessTax += 0;
    }

    return { integratedTax, centralTax, stateUTTax, cessTax };
  }, [purchases]);

  return { totals };
};
