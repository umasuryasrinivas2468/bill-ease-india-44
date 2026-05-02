import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
    postPaymentReceivedJournal,
    postCustomerAdvanceJournal,
    postVendorPaymentJournal,
    postVendorAdvanceJournal,
    postCustomerAdvanceAdjustmentJournal,
    postAdvanceAdjustmentJournal,
} from '@/utils/autoJournalEntry';

// ─── Types ───────────────────────────────────────────────────────────

export type PartyType = 'customer' | 'vendor';
export type PaymentType = 'invoice' | 'advance';
export type PaymentMode = 'bank_transfer' | 'cash' | 'cheque' | 'upi' | 'card' | 'other';

export type PaymentCategory =
    | 'sales_receipt'
    | 'advance_from_customer'
    | 'expense_payment'
    | 'vendor_advance'
    | 'advance_adjustment';

export interface PaymentHubEntry {
    id: string;
    user_id: string;
    party_type: PartyType;
    payment_type: PaymentType;
    party_id: string;
    party_name: string;
    amount: number;
    payment_date: string;
    payment_mode: PaymentMode;
    category: PaymentCategory;
    reference_number?: string;
    notes?: string;
    linked_document_ids?: string[];
    journal_id?: string;
    created_at: string;
}

export interface AdvanceBalance {
    id: string;
    party_type: 'customer' | 'vendor';
    party_name: string;
    total_amount: number;
    adjusted_amount: number;
    unadjusted_amount: number;
    status: string;
    advance_number?: string;
    advance_date?: string;
}

export const PAYMENT_CATEGORIES: { value: PaymentCategory; label: string; partyType: PartyType; paymentType: PaymentType }[] = [
    { value: 'sales_receipt', label: 'Sales Receipt (Invoice Payment)', partyType: 'customer', paymentType: 'invoice' },
    { value: 'advance_from_customer', label: 'Advance from Customer', partyType: 'customer', paymentType: 'advance' },
    { value: 'expense_payment', label: 'Expense / Bill Payment', partyType: 'vendor', paymentType: 'invoice' },
    { value: 'vendor_advance', label: 'Vendor Advance', partyType: 'vendor', paymentType: 'advance' },
];

export const PAYMENT_MODES_LIST: { value: PaymentMode; label: string }[] = [
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'cash', label: 'Cash' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' },
];

// ──────────────────────────────────────────────────────────────────────
// Auto-suggest a category from the party/payment type combination
// ──────────────────────────────────────────────────────────────────────
export const suggestCategory = (partyType: PartyType, paymentType: PaymentType): PaymentCategory => {
    if (partyType === 'customer' && paymentType === 'invoice') return 'sales_receipt';
    if (partyType === 'customer' && paymentType === 'advance') return 'advance_from_customer';
    if (partyType === 'vendor' && paymentType === 'invoice') return 'expense_payment';
    return 'vendor_advance';
};

// ─── Hooks ───────────────────────────────────────────────────────────

/** Fetch all customers (clients) */
export const useHubCustomers = () => {
    const { user } = useUser();
    return useQuery({
        queryKey: ['hub-customers', user?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('clients')
                .select('id, name, email, phone')
                .eq('user_id', user!.id)
                .order('name');
            return data || [];
        },
        enabled: !!user?.id,
    });
};

/** Fetch all vendors */
export const useHubVendors = () => {
    const { user } = useUser();
    return useQuery({
        queryKey: ['hub-vendors', user?.id],
        queryFn: async () => {
            if (!user || !isValidUserId(user.id)) throw new Error('Auth');
            const uid = normalizeUserId(user.id);
            const { data } = await supabase
                .from('vendors')
                .select('id, name, email, phone')
                .eq('user_id', uid)
                .order('name');
            return data || [];
        },
        enabled: !!user && isValidUserId(user?.id),
    });
};

/** Fetch unpaid invoices for a given customer name */
export const useUnpaidInvoices = (customerName: string) => {
    const { user } = useUser();
    return useQuery({
        queryKey: ['hub-unpaid-invoices', user?.id, customerName],
        queryFn: async () => {
            const { data } = await supabase
                .from('invoices')
                .select('id, invoice_number, invoice_date, total_amount, paid_amount, status')
                .eq('user_id', user!.id)
                .eq('client_name', customerName)
                .in('status', ['pending', 'sent', 'overdue', 'partial']);
            return (data || []).map(inv => ({
                ...inv,
                balance: Number(inv.total_amount || 0) - Number(inv.paid_amount || 0),
            }));
        },
        enabled: !!user?.id && !!customerName,
    });
};

/** Fetch unpaid purchase bills for a given vendor id */
export const useUnpaidBills = (vendorId: string) => {
    const { user } = useUser();
    return useQuery({
        queryKey: ['hub-unpaid-bills', user?.id, vendorId],
        queryFn: async () => {
            if (!user || !isValidUserId(user.id)) throw new Error('Auth');
            const uid = normalizeUserId(user.id);
            const { data } = await supabase
                .from('purchase_bills')
                .select('id, bill_number, bill_date, due_date, vendor_name, total_amount, paid_amount, status')
                .eq('user_id', uid)
                .eq('vendor_id', vendorId)
                .in('status', ['pending', 'partially_paid', 'overdue']);
            return (data || []).map(b => ({
                ...b,
                balance: Number(b.total_amount || 0) - Number(b.paid_amount || 0),
            }));
        },
        enabled: !!user && isValidUserId(user?.id) && !!vendorId,
    });
};

/** Fetch deposit accounts (bank/cash) */
export const useDepositAccounts = () => {
    const { user } = useUser();
    return useQuery({
        queryKey: ['hub-deposit-accounts', user?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('accounts')
                .select('id, account_name, account_type')
                .eq('user_id', user!.id)
                .eq('is_active', true)
                .order('account_code');
            return (data || []).filter(a =>
                /bank|cash|current|savings/i.test(a.account_name) || /bank|cash/i.test(a.account_type || '')
            );
        },
        enabled: !!user?.id,
    });
};

/** Fetch advance balances for customers & vendors */
export const useAdvanceBalances = (partyType: PartyType, partyId?: string) => {
    const { user } = useUser();
    return useQuery<AdvanceBalance[]>({
        queryKey: ['hub-advance-balances', user?.id, partyType, partyId],
        queryFn: async () => {
            if (!user) throw new Error('Auth');

            if (partyType === 'vendor') {
                const uid = normalizeUserId(user.id);
                let q = supabase
                    .from('vendor_advances')
                    .select('id, vendor_name, amount, adjusted_amount, unadjusted_amount, status, advance_number, advance_date')
                    .eq('user_id', uid)
                    .neq('status', 'fully_adjusted');
                if (partyId) q = q.eq('vendor_id', partyId);
                const { data } = await q;
                return (data || []).map(a => ({
                    id: a.id,
                    party_type: 'vendor' as const,
                    party_name: a.vendor_name,
                    total_amount: a.amount,
                    adjusted_amount: a.adjusted_amount,
                    unadjusted_amount: a.unadjusted_amount,
                    status: a.status,
                    advance_number: a.advance_number,
                    advance_date: a.advance_date,
                }));
            }

            // customer advances from payment_received
            let q = supabase
                .from('payment_received')
                .select('id, customer_name, amount, payment_date')
                .eq('user_id', user.id)
                .eq('payment_type', 'customer_advance');
            if (partyId) q = q.eq('customer_id', partyId);
            const { data } = await q;
            return (data || []).map(a => ({
                id: a.id,
                party_type: 'customer' as const,
                party_name: a.customer_name,
                total_amount: Number(a.amount || 0),
                adjusted_amount: 0,
                unadjusted_amount: Number(a.amount || 0),
                status: 'active',
                advance_date: a.payment_date,
            }));
        },
        enabled: !!user?.id,
    });
};

/** Unified payment history */
export const usePaymentHistory = () => {
    const { user } = useUser();
    return useQuery({
        queryKey: ['hub-payment-history', user?.id],
        queryFn: async () => {
            if (!user) throw new Error('Auth');
            const uid = normalizeUserId(user.id);

            // Customer payments (payment_received)
            const { data: custData } = await supabase
                .from('payment_received')
                .select('id, customer_name, amount, payment_date, payment_mode, payment_type, reference_number, notes, created_at')
                .eq('user_id', user.id)
                .order('payment_date', { ascending: false })
                .limit(200);

            // Vendor payments
            const { data: vendorData } = await supabase
                .from('vendor_bill_payments')
                .select('id, vendor_name, amount, payment_date, payment_mode, payment_type, reference_number, bill_number, notes, created_at')
                .eq('user_id', uid)
                .order('payment_date', { ascending: false })
                .limit(200);

            // Vendor advances
            const { data: vendAdvances } = await supabase
                .from('vendor_advances')
                .select('id, vendor_name, amount, advance_date, payment_mode, advance_number, notes, created_at')
                .eq('user_id', uid)
                .order('advance_date', { ascending: false })
                .limit(100);

            const entries: PaymentHubEntry[] = [];

            (custData || []).forEach(p => {
                const ipt = p.payment_type === 'customer_advance' ? 'advance' : 'invoice';
                entries.push({
                    id: p.id,
                    user_id: user.id,
                    party_type: 'customer',
                    payment_type: ipt as PaymentType,
                    party_id: '',
                    party_name: p.customer_name,
                    amount: Number(p.amount || 0),
                    payment_date: p.payment_date,
                    payment_mode: (p.payment_mode || 'bank_transfer') as PaymentMode,
                    category: ipt === 'advance' ? 'advance_from_customer' : 'sales_receipt',
                    reference_number: p.reference_number || undefined,
                    notes: p.notes || undefined,
                    created_at: p.created_at,
                });
            });

            (vendorData || []).forEach(p => {
                entries.push({
                    id: p.id,
                    user_id: uid,
                    party_type: 'vendor',
                    payment_type: p.payment_type === 'advance_adjustment' ? 'invoice' : 'invoice',
                    party_id: '',
                    party_name: p.vendor_name,
                    amount: Number(p.amount || 0),
                    payment_date: p.payment_date,
                    payment_mode: (p.payment_mode || 'bank_transfer') as PaymentMode,
                    category: p.payment_type === 'advance_adjustment' ? 'advance_adjustment' : 'expense_payment',
                    reference_number: p.reference_number || p.bill_number || undefined,
                    notes: p.notes || undefined,
                    created_at: p.created_at,
                });
            });

            (vendAdvances || []).forEach(a => {
                entries.push({
                    id: a.id,
                    user_id: uid,
                    party_type: 'vendor',
                    payment_type: 'advance',
                    party_id: '',
                    party_name: a.vendor_name,
                    amount: Number(a.amount || 0),
                    payment_date: a.advance_date,
                    payment_mode: (a.payment_mode || 'bank_transfer') as PaymentMode,
                    category: 'vendor_advance',
                    reference_number: a.advance_number || undefined,
                    notes: a.notes || undefined,
                    created_at: a.created_at,
                });
            });

            entries.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            return entries;
        },
        enabled: !!user?.id,
    });
};

/** Category-wise summary */
export const useCategorySummary = () => {
    const { data: history } = usePaymentHistory();
    if (!history) return { categories: [], totalIn: 0, totalOut: 0 };

    const map: Record<string, { label: string; total: number; count: number }> = {};
    let totalIn = 0, totalOut = 0;

    history.forEach(h => {
        const cat = h.category || 'other';
        if (!map[cat]) {
            map[cat] = { label: PAYMENT_CATEGORIES.find(c => c.value === cat)?.label || cat, total: 0, count: 0 };
        }
        map[cat].total += h.amount;
        map[cat].count += 1;
        if (h.party_type === 'customer') totalIn += h.amount; else totalOut += h.amount;
    });

    return { categories: Object.entries(map).map(([k, v]) => ({ key: k, ...v })), totalIn, totalOut };
};

// ─── Mutation: Record a unified payment ──────────────────────────────

export const useRecordUnifiedPayment = () => {
    const { user } = useUser();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (input: {
            partyType: PartyType;
            paymentType: PaymentType;
            partyId: string;
            partyName: string;
            amount: number;
            paymentDate: string;
            paymentMode: PaymentMode;
            category: PaymentCategory;
            referenceNumber?: string;
            notes?: string;
            linkedDocumentIds?: string[];
            depositAccount?: string;
            bankCharges?: number;
            taxDeducted?: number;
        }) => {
            if (!user?.id) throw new Error('User not authenticated');
            const uid = normalizeUserId(user.id);

            // 1. Customer Invoice Payment (Sales Receipt)
            if (input.partyType === 'customer' && input.paymentType === 'invoice') {
                // Insert into payment_received
                const allocations = (input.linkedDocumentIds || []).map(id => ({ invoice_id: id }));
                const { error } = await supabase.from('payment_received').insert({
                    user_id: user.id,
                    payment_type: 'invoice_payment',
                    customer_id: input.partyId || null,
                    customer_name: input.partyName,
                    amount: input.amount,
                    bank_charges: input.bankCharges || 0,
                    payment_date: input.paymentDate,
                    reference_number: input.referenceNumber || null,
                    payment_mode: input.paymentMode,
                    deposit_account: input.depositAccount || null,
                    tax_deducted: input.taxDeducted || 0,
                    invoice_allocations: allocations,
                    notes: input.notes || null,
                });
                if (error) throw error;

                // Update invoice paid amounts
                if (input.linkedDocumentIds?.length) {
                    const { data: invoices } = await supabase
                        .from('invoices')
                        .select('id, total_amount, paid_amount')
                        .in('id', input.linkedDocumentIds);

                    if (invoices) {
                        let remaining = input.amount;
                        for (const inv of invoices) {
                            const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
                            const alloc = Math.min(remaining, balance);
                            if (alloc > 0) {
                                const newPaid = Number(inv.paid_amount || 0) + alloc;
                                const newStatus = newPaid >= Number(inv.total_amount) ? 'paid' : 'partial';
                                await supabase.from('invoices').update({ paid_amount: newPaid, status: newStatus }).eq('id', inv.id);
                                remaining -= alloc;
                            }
                        }
                    }
                }

                // Post journal entry: Bank Dr, Accounts Receivable Cr
                await postPaymentReceivedJournal(user.id, {
                    invoice_number: input.linkedDocumentIds?.[0] || 'Payment',
                    date: input.paymentDate,
                    client_name: input.partyName,
                    amount: input.amount,
                    payment_mode: input.paymentMode === 'cash' ? 'cash' : undefined,
                });

                return { type: 'customer_invoice' };
            }

            // 2. Customer Advance
            if (input.partyType === 'customer' && input.paymentType === 'advance') {
                const { error } = await supabase.from('payment_received').insert({
                    user_id: user.id,
                    payment_type: 'customer_advance',
                    customer_id: input.partyId || null,
                    customer_name: input.partyName,
                    amount: input.amount,
                    bank_charges: input.bankCharges || 0,
                    payment_date: input.paymentDate,
                    reference_number: input.referenceNumber || null,
                    payment_mode: input.paymentMode,
                    deposit_account: input.depositAccount || null,
                    notes: input.notes || null,
                });
                if (error) throw error;

                // Post journal: Bank Dr → Customer Advance (Liability) Cr
                await postCustomerAdvanceJournal(user.id, {
                    customer_name: input.partyName,
                    date: input.paymentDate,
                    amount: input.amount,
                    payment_mode: input.paymentMode === 'cash' ? 'cash' : undefined,
                    reference_number: input.referenceNumber,
                });

                return { type: 'customer_advance' };
            }

            // 3. Vendor Bill Payment
            if (input.partyType === 'vendor' && input.paymentType === 'invoice') {
                for (const billId of (input.linkedDocumentIds || [])) {
                    const { data: bill } = await supabase
                        .from('purchase_bills')
                        .select('id, bill_number, total_amount, paid_amount, vendor_name')
                        .eq('id', billId)
                        .single();

                    if (!bill) continue;

                    const balance = Number(bill.total_amount || 0) - Number(bill.paid_amount || 0);
                    const payAmt = Math.min(input.amount, balance);

                    const { error } = await supabase.from('vendor_bill_payments').insert({
                        user_id: uid,
                        bill_id: billId,
                        bill_number: bill.bill_number,
                        vendor_id: input.partyId,
                        vendor_name: input.partyName,
                        payment_date: input.paymentDate,
                        amount: payAmt,
                        payment_mode: input.paymentMode === 'bank_transfer' ? 'bank' : input.paymentMode,
                        reference_number: input.referenceNumber || null,
                        payment_type: 'direct',
                        notes: input.notes || null,
                    });
                    if (error) throw error;

                    // Update bill paid amount
                    const newPaid = Number(bill.paid_amount || 0) + payAmt;
                    const newStatus = newPaid >= Number(bill.total_amount) ? 'paid' : 'partially_paid';
                    await supabase.from('purchase_bills').update({ paid_amount: newPaid, status: newStatus }).eq('id', billId);

                    // Post journal: Accounts Payable Dr → Bank Cr
                    await postVendorPaymentJournal(uid, {
                        bill_number: bill.bill_number,
                        date: input.paymentDate,
                        vendor_name: input.partyName,
                        amount: payAmt,
                        payment_mode: input.paymentMode === 'cash' ? 'cash' : undefined,
                    });
                }

                // If no specific bills linked, still record as a general vendor payment
                if (!input.linkedDocumentIds?.length) {
                    await postVendorPaymentJournal(uid, {
                        bill_number: 'General',
                        date: input.paymentDate,
                        vendor_name: input.partyName,
                        amount: input.amount,
                        payment_mode: input.paymentMode === 'cash' ? 'cash' : undefined,
                    });
                }

                return { type: 'vendor_bill' };
            }

            // 4. Vendor Advance
            if (input.partyType === 'vendor' && input.paymentType === 'advance') {
                const year = new Date().getFullYear();
                const { data: lastAdv } = await supabase
                    .from('vendor_advances')
                    .select('advance_number')
                    .eq('user_id', uid)
                    .like('advance_number', `ADV/${year}/%`)
                    .order('advance_number', { ascending: false })
                    .limit(1);

                let seq = 1;
                if (lastAdv && lastAdv.length > 0) {
                    const m = lastAdv[0].advance_number.match(/ADV\/\d+\/(\d+)/);
                    if (m) seq = parseInt(m[1]) + 1;
                }
                const advanceNumber = `ADV/${year}/${String(seq).padStart(4, '0')}`;

                // Post journal first
                const journal = await postVendorAdvanceJournal(uid, {
                    advance_number: advanceNumber,
                    advance_date: input.paymentDate,
                    vendor_name: input.partyName,
                    amount: input.amount,
                    payment_mode: input.paymentMode === 'cash' ? 'cash' : undefined,
                });

                const { error } = await supabase.from('vendor_advances').insert({
                    user_id: uid,
                    vendor_id: input.partyId,
                    vendor_name: input.partyName,
                    advance_number: advanceNumber,
                    advance_date: input.paymentDate,
                    amount: input.amount,
                    payment_mode: input.paymentMode === 'bank_transfer' ? 'bank' : input.paymentMode,
                    reference_number: input.referenceNumber || null,
                    notes: input.notes || null,
                    adjusted_amount: 0,
                    unadjusted_amount: input.amount,
                    status: 'active',
                    journal_id: journal?.id || null,
                });
                if (error) throw error;

                return { type: 'vendor_advance' };
            }

            throw new Error('Invalid payment configuration');
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['hub-payment-history'] });
            queryClient.invalidateQueries({ queryKey: ['hub-unpaid-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['hub-unpaid-bills'] });
            queryClient.invalidateQueries({ queryKey: ['hub-advance-balances'] });
            queryClient.invalidateQueries({ queryKey: ['payments-received'] });
            queryClient.invalidateQueries({ queryKey: ['vendor-bill-payments'] });
            queryClient.invalidateQueries({ queryKey: ['vendor-advances'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            queryClient.invalidateQueries({ queryKey: ['unpaid-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-bills'] });

            const typeLabels: Record<string, string> = {
                customer_invoice: 'Customer payment recorded',
                customer_advance: 'Customer advance recorded',
                vendor_bill: 'Vendor bill payment recorded',
                vendor_advance: 'Vendor advance recorded',
            };
            toast({
                title: '✅ Payment Recorded',
                description: `${typeLabels[result.type] || 'Payment recorded'} with auto journal entry.`,
            });
        },
        onError: (error: any) => {
            toast({
                title: 'Payment Failed',
                description: error.message || 'Could not process payment.',
                variant: 'destructive',
            });
        },
    });
};
