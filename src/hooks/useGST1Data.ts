import { useMemo } from 'react';
import { useInvoices } from './useInvoices';
import { useCreditNotes } from './useCreditNotes';
import { useClients } from './useClients';
import { useBusinessData } from './useBusinessData';
import { computeGSTBreakdown, isSameState, round2 } from '@/lib/gst';

// ═══════════════════════════════════════════════════════════════════
// GSTR-1 data builder (Feature #21)
//
// Pulls from:
//   - invoices      → B2B (buyer has GSTIN) and B2C (buyer has no GSTIN)
//   - credit_notes  → CDNR (credit/debit notes to registered persons) and CDNUR
//   - line items    → HSN summary
//
// Prefers `__tax_meta` on items when present (exact mix as priced at invoice
// time). Falls back to re-deriving intra/inter from client's place_of_supply.
// ═══════════════════════════════════════════════════════════════════

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
  place_of_supply?: string;
}

export interface HSNSummaryRow {
  hsn_sac: string;
  description: string;
  uqc: string;
  quantity: number;
  taxable_value: number;
  rate: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

export interface GST1Data {
  b2b: GST1Row[];       // invoices where buyer has GSTIN
  b2c: GST1Row[];       // invoices where buyer has no GSTIN
  cdnr: GST1Row[];      // credit notes to registered (with GSTIN)
  cdnur: GST1Row[];     // credit notes to unregistered
  hsn_summary: HSNSummaryRow[];
  totals: {
    b2b_taxable: number;
    b2b_tax: number;
    b2c_taxable: number;
    b2c_tax: number;
    cdnr_taxable: number;
    cdnr_tax: number;
    cdnur_taxable: number;
    cdnur_tax: number;
  };
}

type TaxMeta = {
  __tax_meta: true;
  seller_state?: string;
  buyer_state?: string;
  intra_state?: boolean;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  rate_buckets?: Array<{
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total_tax: number;
  }>;
};

function readTaxMeta(items: unknown): TaxMeta | null {
  if (!Array.isArray(items)) return null;
  const meta = items.find(
    (x) => x && typeof x === 'object' && (x as any).__tax_meta === true,
  );
  return (meta as TaxMeta) || null;
}

function splitFromTotal(gstTotal: number, intraState: boolean) {
  if (intraState) {
    const half = round2(gstTotal / 2);
    return { cgst: half, sgst: round2(gstTotal - half), igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: round2(gstTotal) };
}

export const useGST1Data = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: creditNotes = [] } = useCreditNotes();
  const { data: clients = [] } = useClients();
  const { getBusinessInfo } = useBusinessData();
  const sellerState = getBusinessInfo()?.state || '';

  const data: GST1Data = useMemo(() => {
    const clientPOS = new Map<string, string>();
    for (const c of clients || []) {
      clientPOS.set(c.name, c.place_of_supply || '');
    }

    // Resolve CGST/SGST/IGST for a record.
    const resolveTax = (doc: {
      gst_amount: number;
      total_amount?: number;
      amount?: number;
      client_name: string;
      items?: unknown;
    }) => {
      const total_tax = Number(doc.gst_amount) || 0;
      const taxable =
        Number(doc.amount) ||
        Math.max(0, Number(doc.total_amount) - total_tax);
      const meta = readTaxMeta(doc.items);
      const buyerState = meta?.buyer_state || clientPOS.get(doc.client_name) || '';
      const intra =
        meta?.intra_state ?? isSameState(sellerState, buyerState);

      if (meta) {
        return {
          taxable: round2(taxable),
          cgst: Number(meta.cgst_amount) || 0,
          sgst: Number(meta.sgst_amount) || 0,
          igst: Number(meta.igst_amount) || 0,
          buyerState,
        };
      }
      const split = splitFromTotal(total_tax, intra);
      return {
        taxable: round2(taxable),
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        buyerState,
      };
    };

    const b2b: GST1Row[] = [];
    const b2c: GST1Row[] = [];
    for (const inv of invoices || []) {
      const { taxable, cgst, sgst, igst, buyerState } = resolveTax(inv);
      const row: GST1Row = {
        invoice_number: inv.invoice_number || '',
        invoice_date: inv.invoice_date || '',
        client_gst_number: inv.client_gst_number || '',
        client_name: inv.client_name || '',
        taxable_value: taxable,
        igst,
        cgst,
        sgst,
        cess: 0,
        place_of_supply: buyerState,
      };
      if (inv.client_gst_number) b2b.push(row);
      else b2c.push(row);
    }

    const cdnr: GST1Row[] = [];
    const cdnur: GST1Row[] = [];
    for (const cn of creditNotes || []) {
      if (cn.status === 'cancelled') continue;
      const { taxable, cgst, sgst, igst, buyerState } = resolveTax({
        gst_amount: cn.gst_amount,
        total_amount: cn.total_amount,
        amount: cn.amount,
        client_name: cn.client_name,
        items: cn.items,
      });
      const row: GST1Row = {
        invoice_number: cn.credit_note_number || '',
        invoice_date: cn.credit_note_date || '',
        client_gst_number: cn.client_gst_number || '',
        client_name: cn.client_name || '',
        taxable_value: -taxable, // reversal
        igst: -igst,
        cgst: -cgst,
        sgst: -sgst,
        cess: 0,
        place_of_supply: buyerState,
      };
      if (cn.client_gst_number) cdnr.push(row);
      else cdnur.push(row);
    }

    // HSN Summary — sum across invoice line items, grouped by (hsn_sac, rate).
    // Credit notes are netted off because they reduce the HSN-wise supply.
    type HSNKey = string;
    const hsnMap = new Map<HSNKey, HSNSummaryRow>();

    const addHSN = (
      item: any,
      docBuyerState: string,
      sign: 1 | -1,
      fallbackRate: number,
    ) => {
      if (!item || typeof item !== 'object') return;
      if (item.__tax_meta) return;
      const hsn = String(item.hsn_sac || '').trim() || 'UNCLASSIFIED';
      const rate = Number(item.gst_rate ?? fallbackRate) || 0;
      const qty = Number(item.quantity) || 0;
      const lineAmount = Number(item.amount) || 0;
      // lineAmount is gross in inclusive mode; the math still lands on taxable
      // via the breakdown because inclusive mode persists the gross as `amount`.
      // Use computeGSTBreakdown on the line to split cleanly.
      const bd = computeGSTBreakdown(
        // For inclusive-mode invoices, we don't know taxable from line alone.
        // Prefer splitting via persisted __tax_meta rate_buckets when available.
        lineAmount,
        rate,
        sellerState,
        docBuyerState,
      );
      const key: HSNKey = `${hsn}__${rate}`;
      const existing = hsnMap.get(key);
      const row: HSNSummaryRow = existing || {
        hsn_sac: hsn,
        description: item.description || '',
        uqc: (item.uom || 'NOS').toUpperCase(),
        quantity: 0,
        taxable_value: 0,
        rate,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      };
      row.quantity += sign * qty;
      row.taxable_value = round2(row.taxable_value + sign * bd.taxable);
      row.cgst = round2(row.cgst + sign * bd.cgst);
      row.sgst = round2(row.sgst + sign * bd.sgst);
      row.igst = round2(row.igst + sign * bd.igst);
      hsnMap.set(key, row);
    };

    for (const inv of invoices || []) {
      const pos = clientPOS.get(inv.client_name) || '';
      const meta = readTaxMeta(inv.items);
      const buyerState = meta?.buyer_state || pos;
      const fallback = Number(inv.gst_rate) || 0;
      if (Array.isArray(inv.items)) {
        for (const item of inv.items) addHSN(item, buyerState, 1, fallback);
      }
    }
    for (const cn of creditNotes || []) {
      if (cn.status === 'cancelled') continue;
      const pos = clientPOS.get(cn.client_name) || '';
      const meta = readTaxMeta(cn.items);
      const buyerState = meta?.buyer_state || pos;
      if (Array.isArray(cn.items)) {
        for (const item of cn.items) addHSN(item, buyerState, -1, 0);
      }
    }

    const hsn_summary = Array.from(hsnMap.values()).sort((a, b) =>
      a.hsn_sac.localeCompare(b.hsn_sac),
    );

    const totals = {
      b2b_taxable: round2(b2b.reduce((s, r) => s + r.taxable_value, 0)),
      b2b_tax: round2(b2b.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
      b2c_taxable: round2(b2c.reduce((s, r) => s + r.taxable_value, 0)),
      b2c_tax: round2(b2c.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
      cdnr_taxable: round2(cdnr.reduce((s, r) => s + r.taxable_value, 0)),
      cdnr_tax: round2(cdnr.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
      cdnur_taxable: round2(cdnur.reduce((s, r) => s + r.taxable_value, 0)),
      cdnur_tax: round2(cdnur.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
    };

    return { b2b, b2c, cdnr, cdnur, hsn_summary, totals };
  }, [invoices, creditNotes, clients, sellerState]);

  // Back-compat: old consumers expect `{ rows }`. Flatten b2b+b2c for that.
  const rows: GST1Row[] = useMemo(
    () => [...data.b2b, ...data.b2c],
    [data.b2b, data.b2c],
  );

  return { rows, ...data };
};
