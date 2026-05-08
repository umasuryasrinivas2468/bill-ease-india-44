import { postPurchaseBill } from './journalEngine';

/**
 * Posts a purchase bill (with RCM / ITC handling) to the ledger.
 *
 * Previously this file credited the Bank account directly for the gross
 * bill amount, treating every bill as a cash purchase and bypassing
 * Accounts Payable entirely — which left the AP balance permanently
 * understated. Now it routes through the central engine so:
 *
 *   • Non-RCM bill → Dr Purchase + Dr ITC, Cr Accounts Payable
 *   • RCM bill, ITC eligible → Dr Purchase + Dr ITC, Cr RCM Liability + Cr AP (taxable only)
 *   • RCM bill, ITC ineligible → Dr Purchase (incl. capitalized GST), Cr RCM Liability + Cr AP (taxable only)
 *   • Non-RCM, ITC ineligible → Dr Purchase (incl. capitalized GST), Cr AP (gross)
 *
 * Payment is a separate journal (Dr AP, Cr Bank) recorded when the
 * vendor is paid — never bundled into bill posting.
 */
export const postPurchaseBillToLedger = async (
  userId: string,
  bill: {
    id: string;
    bill_date: string;
    vendor_name: string;
    vendor_id?: string;
    bill_number?: string;
    amount: number;
    gst_amount: number;
    total_amount: number;
    is_rcm: boolean;
    itc_eligible: boolean;
    payment_mode?: string;          // accepted for backwards compat; ignored — see note above
    cost_center_id?: string;
    project_id?: string;
    branch_id?: string;
    inventory_amount?: number;
  }
) => {
  return postPurchaseBill(userId, {
    bill_id: bill.id,
    bill_number: bill.bill_number || bill.id,
    bill_date: bill.bill_date,
    vendor_name: bill.vendor_name,
    vendor_id: bill.vendor_id,
    amount: Number(bill.amount || 0),
    gst_amount: Number(bill.gst_amount || 0),
    total_amount: Number(bill.total_amount || 0),
    inventory_amount: bill.inventory_amount,
    is_rcm: bill.is_rcm,
    itc_eligible: bill.itc_eligible,
    cost_center_id: bill.cost_center_id,
    project_id: bill.project_id,
    branch_id: bill.branch_id,
  });
};
