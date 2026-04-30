import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/ClerkAuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { usePerformanceData } from '@/hooks/usePerformanceData';
import VoiceInput from '@/components/ai-command/VoiceInput';
import ExampleCommands from '@/components/ai-command/ExampleCommands';
import ChatMessage, { type ChatMessageData } from '@/components/ai-command/ChatMessage';
import { postInvoiceJournal, postPurchaseBillJournal } from '@/utils/autoJournalEntry';

// ── Regex patterns for intent detection ──

const INTENTS: { intent: string; re: RegExp }[] = [
  { intent: 'create_invoice', re: /\b(create|make|add|generate|raise)\b.*\binvoice\b/i },
  { intent: 'create_sales_order', re: /\b(create|make|add|generate)\b.*\b(sales?\s*order)\b/i },
  { intent: 'create_purchase_order', re: /\b(create|make|add|generate)\b.*\b(purchase\s*order|po)\b/i },
  { intent: 'create_bill', re: /\b(create|make|add|generate)\b.*\b(purchase\s*bill|vendor\s*bill|bill)\b/i },
  { intent: 'create_expense', re: /\b(create|make|add|record|log)\b.*\b(expense|spending)\b/i },
  { intent: 'create_client', re: /\b(create|make|add)\b.*\b(client|customer)\b/i },
  { intent: 'create_vendor', re: /\b(create|make|add)\b.*\b(vendor|supplier)\b/i },
  { intent: 'create_inventory', re: /\b(create|make|add)\b.*\b(inventory|product|item|stock)\b/i },
  { intent: 'record_payment', re: /\b(record|mark|receive|collect)\b.*\b(payment|paid)\b/i },
  { intent: 'check_stock', re: /\b(check|show|what|how\s*much)\b.*\b(stock|inventory|quantity)\b/i },
  { intent: 'create_quotation', re: /\b(create|make|add|generate|send)\b.*\b(quotation|quote|estimate)\b/i },
  { intent: 'create_payment_link', re: /\b(create|generate|make|send|share)\b.*\b(payment\s*link|pay\s*link)\b/i },
];

// ── Navigation ──

const NAVIGATION_TARGETS = [
  { route: '/dashboard', label: 'Dashboard', keywords: ['dashboard', 'home', 'overview'] },
  { route: '/clients', label: 'Clients', keywords: ['client', 'clients', 'customer', 'customers'] },
  { route: '/vendors', label: 'Vendors', keywords: ['vendor', 'vendors', 'supplier', 'suppliers'] },
  { route: '/invoices', label: 'Invoices', keywords: ['invoice', 'invoices', 'billing', 'bills sent'] },
  { route: '/create-invoice', label: 'Create Invoice', keywords: ['create invoice', 'new invoice', 'make invoice'] },
  { route: '/expenses', label: 'Expenses', keywords: ['expense', 'expenses', 'spend', 'spending'] },
  { route: '/inventory', label: 'Inventory', keywords: ['inventory', 'stock', 'products', 'product', 'items'] },
  { route: '/banking', label: 'Banking', keywords: ['banking', 'bank'] },
  { route: '/banking/reconciliation', label: 'Bank Reconciliation', keywords: ['reconciliation', 'reconcile'] },
  { route: '/reports', label: 'Reports', keywords: ['report', 'reports', 'analytics', 'analysis'] },
  { route: '/reports/cash-flow-forecasting', label: 'Cash Flow', keywords: ['cashflow', 'cash flow', 'forecast'] },
  { route: '/accounting/financial-statements', label: 'Financial Statements', keywords: ['financial statements', 'balance sheet'] },
  { route: '/accounting/profit-loss', label: 'Profit & Loss', keywords: ['profit and loss', 'p&l', 'profit loss', 'pnl'] },
  { route: '/accounting/trial-balance', label: 'Trial Balance', keywords: ['trial balance'] },
  { route: '/accounting/chart-of-accounts', label: 'Chart of Accounts', keywords: ['chart of accounts', 'coa'] },
  { route: '/accounting/ledgers', label: 'Ledgers', keywords: ['ledger', 'ledgers'] },
  { route: '/accounting/manual-journals', label: 'Journals', keywords: ['journal', 'journals', 'journal entry'] },
  { route: '/settings', label: 'Settings', keywords: ['settings', 'preferences', 'configuration'] },
  { route: '/payroll', label: 'Payroll', keywords: ['payroll', 'salary', 'salaries'] },
  { route: '/receivables', label: 'Receivables', keywords: ['receivable', 'receivables', 'money owed', 'due from'] },
  { route: '/payables', label: 'Payables', keywords: ['payable', 'payables', 'money to pay', 'due to'] },
  { route: '/inventory/sales-orders', label: 'Sales Orders', keywords: ['sales order', 'sales orders'] },
  { route: '/inventory/purchase-orders', label: 'Purchase Orders', keywords: ['purchase order', 'purchase orders'] },
  { route: '/purchase-bills', label: 'Purchase Bills', keywords: ['purchase bill', 'purchase bills', 'vendor bill'] },
  { route: '/vendor-advances', label: 'Vendor Advances', keywords: ['vendor advance', 'vendor advances'] },
  { route: '/compliance', label: 'Compliance', keywords: ['compliance', 'gst filing', 'mca'] },
  { route: '/compliance/gst', label: 'GST Compliance', keywords: ['gst compliance', 'gst return', 'gstr'] },
  { route: '/reports/tds', label: 'TDS', keywords: ['tds', 'tax deducted'] },
  { route: '/marketplace', label: 'Marketplace', keywords: ['marketplace', 'apps'] },
  { route: '/quotations', label: 'Quotations', keywords: ['quotation', 'quotations', 'quote', 'quotes'] },
];

// ── Helpers ──

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeResponseText = (content: string) =>
  (content || '').replace(/^\s*\*\s+/gm, '- ').replace(/\r\n/g, '\n').trim();

const tryExtractAmount = (text: string): number => {
  const crore = text.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/i);
  if (crore) return Math.round(Number(crore[1]) * 10000000);
  const lakh = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)\b/i);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);
  const k = text.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (k) return Math.round(Number(k[1]) * 1000);
  const money = text.match(/(?:inr|rs\.?|rupees?|₹)\s*([\d,]+(?:\.\d+)?)/i) || text.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);
  if (!money) return 0;
  return Number(money[1].replace(/,/g, '')) || 0;
};

const tryExtractGSTRate = (text: string): number => {
  const match = text.match(/(\d{1,2})\s*%?\s*gst/i);
  if (!match) return 18;
  const value = Number(match[1]);
  return [0, 3, 5, 12, 18, 28].includes(value) ? value : 18;
};

const tryExtractName = (text: string, fallback: string, entityType: 'client' | 'vendor' | 'any' = 'any'): string => {
  const patterns: RegExp[] = [];
  if (entityType === 'client' || entityType === 'any') {
    patterns.push(
      /(?:for|to|client|customer)\s+([A-Z][a-zA-Z0-9&.,'\-\s]{1,40}?)(?:\s+(?:for|with|worth|amount|inr|rs\.?|₹|gst|at|@|of)\b|$)/i,
    );
  }
  if (entityType === 'vendor' || entityType === 'any') {
    patterns.push(
      /(?:from|vendor|supplier)\s+([A-Z][a-zA-Z0-9&.,'\-\s]{1,40}?)(?:\s+(?:for|with|worth|amount|inr|rs\.?|₹|gst|at|@|of)\b|$)/i,
    );
  }
  patterns.push(
    /named\s+([A-Z][a-zA-Z0-9&.,'\-\s]{1,40}?)(?:\s+(?:from|with|at|email|phone)\b|$)/i,
  );

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = (match[1] || '').trim().replace(/\s{2,}/g, ' ');
    if (raw && raw.length > 1) return raw;
  }
  return fallback;
};

const tryExtractEmail = (text: string): string | null => {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
};

const tryExtractPhone = (text: string): string | null => {
  const match = text.match(/(\+91[\s-]?)?[6-9]\d{9}/);
  return match ? match[0].replace(/\s+/g, '') : null;
};

const tryExtractGSTNumber = (text: string): string | null => {
  const match = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Zz][A-Z0-9]\b/);
  return match ? match[0].toUpperCase() : null;
};

const tryExtractAddress = (text: string): string | null => {
  const match = text.match(/(?:from|address|at|located)\s+([A-Za-z0-9\s,.\-#/]+?)(?:\s+(?:email|phone|gst|with|for|amount)\b|$)/i);
  return match ? match[1].trim() : null;
};

const tryExtractDescription = (text: string): string => {
  const match = text.match(/(?:for|description|desc|about|regarding)\s+([a-zA-Z0-9\s,.\-]+?)(?:\s+(?:amount|inr|rs\.?|₹|worth|of|at)\b|$)/i);
  return match ? match[1].trim() : '';
};

const tryExtractCategory = (text: string): string => {
  const categories = [
    'travel', 'food', 'office', 'rent', 'salary', 'utilities', 'internet',
    'phone', 'marketing', 'advertising', 'software', 'hardware', 'transport',
    'fuel', 'insurance', 'legal', 'consulting', 'maintenance', 'repair',
    'stationery', 'subscription', 'miscellaneous',
  ];
  const lower = text.toLowerCase();
  for (const cat of categories) {
    if (lower.includes(cat)) return cat.charAt(0).toUpperCase() + cat.slice(1);
  }
  return 'General';
};

const tryExtractDate = (text: string): string => {
  // Explicit date formats
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const slashMatch = text.match(/\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b/);
  if (slashMatch) {
    const y = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${y}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
  }
  // Relative dates
  const lower = text.toLowerCase();
  const today = new Date();
  if (lower.includes('yesterday')) return new Date(today.getTime() - 86400000).toISOString().split('T')[0];
  if (lower.includes('tomorrow')) return new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  if (lower.includes('next week')) return new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];
  if (lower.includes('next month')) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  }
  return today.toISOString().split('T')[0];
};

const tryExtractQuantity = (text: string): number => {
  const match = text.match(/(\d+)\s*(?:qty|quantity|units?|pcs|pieces?|nos?|numbers?)\b/i);
  if (match) return Number(match[1]) || 1;
  return 1;
};

const tryExtractPaymentMode = (text: string): string => {
  const lower = text.toLowerCase();
  if (lower.includes('upi') || lower.includes('gpay') || lower.includes('phonepe')) return 'upi';
  if (lower.includes('cash')) return 'cash';
  if (lower.includes('cheque') || lower.includes('check')) return 'cheque';
  if (lower.includes('card') || lower.includes('credit')) return 'credit_card';
  return 'bank';
};

const resolveNavigationTarget = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  return (
    NAVIGATION_TARGETS.find((t) =>
      t.keywords.some(
        (kw) =>
          normalized === kw || normalized.includes(kw) ||
          normalized === `open ${kw}` || normalized === `go to ${kw}` ||
          normalized === `show ${kw}` || normalized === `navigate to ${kw}` ||
          normalized === `take me to ${kw}`
      )
    ) || null
  );
};

const detectIntent = (text: string): string | null => {
  for (const { intent, re } of INTENTS) {
    if (re.test(text)) return intent;
  }
  return null;
};

// ── Entity lookup helpers ──

const findClient = async (userId: string, name: string) => {
  const { data } = await supabase
    .from('clients')
    .select('id, name, email, phone, gst_number, address')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .limit(5);
  return data || [];
};

const findVendor = async (userId: string, name: string) => {
  const { data } = await supabase
    .from('vendors')
    .select('id, name, email, phone, gst_number, address')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .limit(5);
  return data || [];
};

const findInventoryItem = async (userId: string, name: string) => {
  const { data } = await supabase
    .from('inventory')
    .select('id, product_name, sku, selling_price, purchase_price, stock_quantity, uom')
    .eq('user_id', userId)
    .ilike('product_name', `%${name}%`)
    .limit(5);
  return data || [];
};

// ── Types ──

interface PendingAction {
  intent: string;
  prompt: string;
  entityType: 'client' | 'vendor';
  entityName: string;
}

// ── Main Component ──

const AICommandBar: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const performanceData = usePerformanceData();

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const addUserMessage = (content: string) => {
    setMessages((prev) => [...prev, { id: createId(), role: 'user', content, timestamp: new Date() }]);
  };

  const addAssistantMessage = (payload: {
    content: string;
    recordType?: string | null;
    recordId?: string | null;
    success?: boolean;
    imageUrl?: string | null;
  }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'assistant',
        content: normalizeResponseText(payload.content),
        timestamp: new Date(),
        recordType: payload.recordType || undefined,
        recordId: payload.recordId || undefined,
        success: payload.success,
        imageUrl: payload.imageUrl || null,
      },
    ]);
  };

  const invalidateAll = () => {
    ['invoices', 'clients', 'vendors', 'inventory', 'expenses', 'purchase-bills',
      'sales-orders', 'purchase-orders', 'quotations', 'dashboard-stats', 'payables', 'receivables'].forEach(key =>
      queryClient.invalidateQueries({ queryKey: [key] })
    );
  };

  // ── Entity Resolution ──

  const resolveClient = async (prompt: string, name: string): Promise<{ id: string; name: string } | 'ask_create' | null> => {
    if (!user?.id || !name || name === 'Unknown Client') return null;
    const matches = await findClient(user.id, name);
    if (matches.length === 1) return { id: matches[0].id, name: matches[0].name };
    if (matches.length > 1) {
      // Pick exact match or closest
      const exact = matches.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (exact) return { id: exact.id, name: exact.name };
      return { id: matches[0].id, name: matches[0].name };
    }
    return 'ask_create';
  };

  const resolveVendor = async (prompt: string, name: string): Promise<{ id: string; name: string } | 'ask_create' | null> => {
    if (!user?.id || !name || name === 'Unknown Vendor') return null;
    const matches = await findVendor(user.id, name);
    if (matches.length === 1) return { id: matches[0].id, name: matches[0].name };
    if (matches.length > 1) {
      const exact = matches.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (exact) return { id: exact.id, name: exact.name };
      return { id: matches[0].id, name: matches[0].name };
    }
    return 'ask_create';
  };

  // ── Create entity helpers ──

  const createClient = async (name: string, prompt: string) => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('clients')
      .insert({
        user_id: user.id, name,
        email: tryExtractEmail(prompt),
        phone: tryExtractPhone(prompt),
        gst_number: tryExtractGSTNumber(prompt),
        address: tryExtractAddress(prompt),
      })
      .select().single();
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    return data;
  };

  const createVendor = async (name: string, prompt: string) => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        user_id: user.id, name,
        email: tryExtractEmail(prompt),
        phone: tryExtractPhone(prompt),
        gst_number: tryExtractGSTNumber(prompt),
        address: tryExtractAddress(prompt),
      })
      .select().single();
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
    return data;
  };

  // ── Core action handlers ──

  const handleCreateInvoice = async (prompt: string) => {
    if (!user?.id) return null;
    const clientName = tryExtractName(prompt, 'Unknown Client', 'client');
    const clientResult = await resolveClient(prompt, clientName);

    if (clientResult === 'ask_create') {
      setPendingAction({ intent: 'create_invoice', prompt, entityType: 'client', entityName: clientName });
      addAssistantMessage({
        content: `**Client "${clientName}" not found.**\nWould you like me to create this client first and then proceed with the invoice?\n\nType **yes** to create, or **no** to cancel.`,
        success: true,
      });
      return 'pending';
    }

    const resolvedName = clientResult ? clientResult.name : clientName;

    // Fetch inventory for product matching
    const { data: inventoryItems } = await supabase.from('inventory').select('*').eq('user_id', user.id);

    const today = new Date();
    const due = new Date(today.getTime() + 30 * 86400000);
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    const invoiceNumber = `INV-${today.getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
    const gstRate = tryExtractGSTRate(prompt);

    // Match inventory items
    const matchedItems: Array<{ description: string; product_id: string; hsn_sac: string; quantity: number; rate: number; amount: number; uom: string }> = [];
    if (inventoryItems?.length) {
      const lowerPrompt = prompt.toLowerCase();
      for (const inv of inventoryItems) {
        if (lowerPrompt.includes(inv.product_name.toLowerCase())) {
          const qtyBefore = prompt.match(new RegExp(`(\\d+)\\s+${inv.product_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
          const qtyAfter = prompt.match(new RegExp(`${inv.product_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[x×]\\s*(\\d+)`, 'i'));
          const qty = Number(qtyBefore?.[1] || qtyAfter?.[1]) || 1;
          const rate = inv.selling_price || 0;
          matchedItems.push({ description: inv.product_name, product_id: inv.id, hsn_sac: inv.category || '', quantity: qty, rate, amount: qty * rate, uom: inv.uom || 'pcs' });
          await supabase.from('inventory').update({ stock_quantity: Math.max(0, (inv.stock_quantity || 0) - qty) }).eq('id', inv.id);
        }
      }
    }

    const manualAmount = tryExtractAmount(prompt);
    const itemsTotal = matchedItems.reduce((s, i) => s + i.amount, 0);
    const amount = matchedItems.length > 0 ? itemsTotal : manualAmount;
    const gstAmount = Math.round((amount * gstRate) / 100);
    const totalAmount = amount + gstAmount;

    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      invoice_number: invoiceNumber,
      client_name: resolvedName,
      client_email: tryExtractEmail(prompt) || (clientResult && typeof clientResult === 'object' ? null : null),
      client_gst_number: tryExtractGSTNumber(prompt),
      client_address: tryExtractAddress(prompt),
      amount, gst_rate: gstRate, gst_amount: gstAmount, total_amount: totalAmount,
      invoice_date: today.toISOString().split('T')[0],
      due_date: due.toISOString().split('T')[0],
      status: 'pending',
      items: matchedItems.map(({ product_id, ...rest }) => rest),
      items_with_product_id: matchedItems.length > 0 ? matchedItems : undefined,
    }).select().single();
    if (error) throw error;

    // Auto journal
    try { await postInvoiceJournal(user.id, { invoice_number: invoiceNumber, invoice_date: today.toISOString().split('T')[0], client_name: resolvedName, amount, gst_amount: gstAmount, total_amount: totalAmount }); } catch (e) { /* non-fatal */ }

    invalidateAll();
    const itemLines = matchedItems.length > 0 ? matchedItems.map(i => `  - ${i.description} x ${i.quantity} @ ₹${i.rate.toLocaleString('en-IN')}`).join('\n') : '';
    return {
      recordType: 'invoice', recordId: data.id,
      message: `**Invoice created**\n- No: ${data.invoice_number}\n- Client: ${resolvedName}${clientResult && typeof clientResult === 'object' ? ' (existing)' : ''}\n${itemLines ? `- Items:\n${itemLines}\n` : ''}- Amount: ₹${amount.toLocaleString('en-IN')}\n- GST (${gstRate}%): ₹${gstAmount.toLocaleString('en-IN')}\n- **Total: ₹${totalAmount.toLocaleString('en-IN')}**\n- Due: ${due.toLocaleDateString('en-IN')}`,
    };
  };

  const handleCreateSalesOrder = async (prompt: string) => {
    if (!user?.id) return null;
    const clientName = tryExtractName(prompt, 'Unknown Client', 'client');
    const clientResult = await resolveClient(prompt, clientName);

    if (clientResult === 'ask_create') {
      setPendingAction({ intent: 'create_sales_order', prompt, entityType: 'client', entityName: clientName });
      addAssistantMessage({ content: `**Client "${clientName}" not found.**\nType **yes** to create this client first, or **no** to cancel.`, success: true });
      return 'pending';
    }

    const resolvedName = clientResult ? clientResult.name : clientName;
    const amount = tryExtractAmount(prompt);
    const gstRate = tryExtractGSTRate(prompt);
    const gstAmount = Math.round((amount * gstRate) / 100);
    const total = amount + gstAmount;
    const ts = Date.now().toString().slice(-6);

    const { data, error } = await supabase.from('sales_orders' as any).insert({
      user_id: user.id, order_number: `SO-${ts}`, client_name: resolvedName,
      client_email: tryExtractEmail(prompt), client_address: tryExtractAddress(prompt),
      order_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: [], subtotal: amount, tax_amount: gstAmount, total_amount: total,
      status: 'pending', payment_status: 'unpaid', notes: '',
    }).select().single();
    if (error) throw error;
    invalidateAll();
    return { recordType: 'sales_order', recordId: (data as any).id, message: `**Sales Order created**\n- No: SO-${ts}\n- Client: ${resolvedName}\n- Total: ₹${total.toLocaleString('en-IN')}` };
  };

  const handleCreatePurchaseOrder = async (prompt: string) => {
    if (!user?.id) return null;
    const vendorName = tryExtractName(prompt, 'Unknown Vendor', 'vendor');
    const vendorResult = await resolveVendor(prompt, vendorName);

    if (vendorResult === 'ask_create') {
      setPendingAction({ intent: 'create_purchase_order', prompt, entityType: 'vendor', entityName: vendorName });
      addAssistantMessage({ content: `**Vendor "${vendorName}" not found.**\nType **yes** to create this vendor first, or **no** to cancel.`, success: true });
      return 'pending';
    }

    const resolvedName = vendorResult ? vendorResult.name : vendorName;
    const amount = tryExtractAmount(prompt);
    const gstRate = tryExtractGSTRate(prompt);
    const gstAmount = Math.round((amount * gstRate) / 100);
    const total = amount + gstAmount;
    const ts = Date.now().toString().slice(-6);

    const { data, error } = await supabase.from('purchase_orders' as any).insert({
      user_id: user.id, order_number: `PO-${ts}`,
      vendor_name: resolvedName, vendor_email: tryExtractEmail(prompt),
      vendor_address: tryExtractAddress(prompt),
      order_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: [], subtotal: amount, tax_amount: gstAmount, total_amount: total,
      status: 'pending', payment_status: 'unpaid', notes: '',
    }).select().single();
    if (error) throw error;
    invalidateAll();
    return { recordType: 'purchase_order', recordId: (data as any).id, message: `**Purchase Order created**\n- No: PO-${ts}\n- Vendor: ${resolvedName}\n- Total: ₹${total.toLocaleString('en-IN')}` };
  };

  const handleCreateBill = async (prompt: string) => {
    if (!user?.id) return null;
    const vendorName = tryExtractName(prompt, 'Unknown Vendor', 'vendor');
    const vendorResult = await resolveVendor(prompt, vendorName);

    if (vendorResult === 'ask_create') {
      setPendingAction({ intent: 'create_bill', prompt, entityType: 'vendor', entityName: vendorName });
      addAssistantMessage({ content: `**Vendor "${vendorName}" not found.**\nType **yes** to create this vendor first, or **no** to cancel.`, success: true });
      return 'pending';
    }

    const resolvedName = vendorResult ? vendorResult.name : vendorName;
    const vendorId = vendorResult && typeof vendorResult === 'object' ? vendorResult.id : null;
    const amount = tryExtractAmount(prompt);
    const gstRate = tryExtractGSTRate(prompt);
    const gstAmount = Math.round((amount * gstRate) / 100);
    const total = amount + gstAmount;
    const ts = Date.now().toString().slice(-6);
    const billNumber = `BILL-${ts}`;

    const { data, error } = await supabase.from('purchase_bills').insert({
      user_id: user.id, vendor_id: vendorId, vendor_name: resolvedName,
      bill_number: billNumber,
      bill_date: tryExtractDate(prompt),
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: [{ item_details: tryExtractDescription(prompt) || 'As per order', account: 'Purchase Account', quantity: 1, rate: amount, tax: gstRate, customer_details: '', amount }],
      amount, gst_amount: gstAmount, total_amount: total,
      status: 'pending', notes: '',
    }).select().single();
    if (error) throw error;

    try { await postPurchaseBillJournal(user.id, { bill_number: billNumber, bill_date: tryExtractDate(prompt), vendor_name: resolvedName, amount, gst_amount: gstAmount, total_amount: total }); } catch (e) { /* non-fatal */ }

    invalidateAll();
    return { recordType: 'purchase_order', recordId: data.id, message: `**Purchase Bill created**\n- No: ${billNumber}\n- Vendor: ${resolvedName}\n- Total: ₹${total.toLocaleString('en-IN')}` };
  };

  const handleCreateExpense = async (prompt: string) => {
    if (!user?.id) return null;
    const vendorName = tryExtractName(prompt, '', 'vendor');
    let vendorId: string | null = null;
    let resolvedVendorName = vendorName;

    if (vendorName) {
      const vendorResult = await resolveVendor(prompt, vendorName);
      if (vendorResult === 'ask_create') {
        setPendingAction({ intent: 'create_expense', prompt, entityType: 'vendor', entityName: vendorName });
        addAssistantMessage({ content: `**Vendor "${vendorName}" not found.**\nType **yes** to create this vendor, or **no** to skip vendor and create expense anyway.`, success: true });
        return 'pending';
      }
      if (vendorResult && typeof vendorResult === 'object') {
        vendorId = vendorResult.id;
        resolvedVendorName = vendorResult.name;
      }
    }

    const amount = tryExtractAmount(prompt);
    const category = tryExtractCategory(prompt);
    const description = tryExtractDescription(prompt) || prompt.slice(0, 100);
    const ts = Date.now().toString().slice(-6);
    const paymentMode = tryExtractPaymentMode(prompt);

    const { data, error } = await supabase.from('expenses').insert({
      user_id: user.id,
      vendor_id: vendorId,
      vendor_name: resolvedVendorName || 'Unknown',
      expense_number: `EXP-${ts}`,
      expense_date: tryExtractDate(prompt),
      category_name: category,
      description,
      amount, tax_amount: 0, total_amount: amount,
      payment_mode: paymentMode,
      status: 'pending',
      posted_to_ledger: false,
    }).select().single();
    if (error) throw error;

    invalidateAll();
    return { recordType: 'invoice', recordId: data.id, message: `**Expense recorded**\n- No: EXP-${ts}\n- Amount: ₹${amount.toLocaleString('en-IN')}\n- Category: ${category}\n- Vendor: ${resolvedVendorName || 'N/A'}\n- Payment: ${paymentMode}` };
  };

  const handleCreateClient = async (prompt: string) => {
    if (!user?.id) return null;
    const name = tryExtractName(prompt, 'New Client', 'client');

    // Check duplicate
    const existing = await findClient(user.id, name);
    const exact = existing.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      return { recordType: 'client', recordId: exact.id, message: `**Client "${exact.name}" already exists.**\n- Email: ${exact.email || 'N/A'}\n- Phone: ${exact.phone || 'N/A'}` };
    }

    const data = await createClient(name, prompt);
    return { recordType: 'client', recordId: data?.id, message: `**Client created**\n- Name: ${data?.name}\n- Email: ${data?.email || 'Not provided'}\n- Phone: ${data?.phone || 'Not provided'}` };
  };

  const handleCreateVendor = async (prompt: string) => {
    if (!user?.id) return null;
    const name = tryExtractName(prompt, 'New Vendor', 'vendor');

    const existing = await findVendor(user.id, name);
    const exact = existing.find(v => v.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      return { recordType: 'vendor', recordId: exact.id, message: `**Vendor "${exact.name}" already exists.**\n- Email: ${exact.email || 'N/A'}\n- Phone: ${exact.phone || 'N/A'}` };
    }

    const data = await createVendor(name, prompt);
    return { recordType: 'vendor', recordId: data?.id, message: `**Vendor created**\n- Name: ${data?.name}\n- Email: ${data?.email || 'Not provided'}\n- Phone: ${data?.phone || 'Not provided'}` };
  };

  const handleCreateInventory = async (prompt: string) => {
    if (!user?.id) return null;
    const nameMatch = prompt.match(/(?:item|product|inventory)\s+([A-Za-z0-9\s\-]+?)(?:\s+(?:at|for|price|@|₹|rs|inr|with|qty|quantity)\b|$)/i);
    const productName = nameMatch ? nameMatch[1].trim() : tryExtractName(prompt, 'New Item', 'any');
    const amount = tryExtractAmount(prompt);
    const qty = tryExtractQuantity(prompt);
    const ts = Date.now().toString().slice(-6);

    const { data, error } = await supabase.from('inventory').insert({
      user_id: user.id,
      product_name: productName,
      sku: `SKU-${ts}`,
      category: tryExtractCategory(prompt),
      type: 'goods',
      selling_price: amount,
      purchase_price: 0,
      stock_quantity: qty,
      reorder_level: 5,
      uom: 'pcs',
    }).select().single();
    if (error) throw error;

    invalidateAll();
    return { recordType: 'inventory', recordId: data.id, message: `**Inventory item added**\n- Product: ${productName}\n- SKU: SKU-${ts}\n- Price: ₹${amount.toLocaleString('en-IN')}\n- Stock: ${qty} pcs` };
  };

  const handleCheckStock = async (prompt: string) => {
    if (!user?.id) return null;
    const nameMatch = prompt.match(/(?:stock|inventory|quantity)\s+(?:of|for)?\s*([A-Za-z0-9\s\-]+?)(?:\?|$)/i);
    const productName = nameMatch ? nameMatch[1].trim() : '';

    if (!productName) {
      const { data } = await supabase.from('inventory').select('product_name, stock_quantity, selling_price').eq('user_id', user.id).order('stock_quantity', { ascending: true }).limit(10);
      if (!data?.length) return { recordType: 'answer', message: '**No inventory items found.** Add items first.' };
      const lines = data.map(i => `- ${i.product_name}: ${i.stock_quantity} units (₹${Number(i.selling_price).toLocaleString('en-IN')})`).join('\n');
      return { recordType: 'answer', message: `**Inventory Stock Levels (lowest first)**\n${lines}` };
    }

    const items = await findInventoryItem(user.id, productName);
    if (!items.length) return { recordType: 'answer', message: `**No inventory item matching "${productName}" found.**` };
    const lines = items.map(i => `- ${i.product_name} (${i.sku}): **${i.stock_quantity} ${i.uom || 'pcs'}** in stock @ ₹${Number(i.selling_price).toLocaleString('en-IN')}`).join('\n');
    return { recordType: 'answer', message: `**Stock for "${productName}"**\n${lines}` };
  };

  const handleRecordPayment = async (prompt: string) => {
    if (!user?.id) return null;
    const amount = tryExtractAmount(prompt);
    const clientName = tryExtractName(prompt, '', 'client');

    if (!clientName) return { recordType: 'answer', message: '**Please specify the client or invoice.** E.g.: "Record payment of ₹5000 from ABC Corp"' };

    // Find most recent unpaid invoice for this client
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, total_amount, paid_amount, status')
      .eq('user_id', user.id)
      .ilike('client_name', `%${clientName}%`)
      .in('status', ['pending', 'overdue', 'partial'])
      .order('due_date', { ascending: true })
      .limit(1);

    if (!invoices?.length) return { recordType: 'answer', message: `**No unpaid invoices found for "${clientName}".**` };

    const inv = invoices[0];
    const balance = Number(inv.total_amount) - Number(inv.paid_amount || 0);
    const payAmt = amount > 0 ? Math.min(amount, balance) : balance;
    const newPaid = Number(inv.paid_amount || 0) + payAmt;
    const newStatus = newPaid >= Number(inv.total_amount) ? 'paid' : 'partial';

    const { error } = await supabase.from('invoices')
      .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', inv.id).eq('user_id', user.id);
    if (error) throw error;

    invalidateAll();
    return { recordType: 'invoice', recordId: inv.id, message: `**Payment recorded**\n- Invoice: ${inv.invoice_number}\n- Client: ${inv.client_name}\n- Paid: ₹${payAmt.toLocaleString('en-IN')}\n- Status: ${newStatus === 'paid' ? 'Fully Paid' : 'Partial'}` };
  };

  const handleCreateQuotation = async (prompt: string) => {
    if (!user?.id) return null;
    const clientName = tryExtractName(prompt, 'Unknown Client', 'client');
    const clientResult = await resolveClient(prompt, clientName);

    if (clientResult === 'ask_create') {
      setPendingAction({ intent: 'create_quotation', prompt, entityType: 'client', entityName: clientName });
      addAssistantMessage({ content: `**Client "${clientName}" not found.**\nType **yes** to create this client first, or **no** to cancel.`, success: true });
      return 'pending';
    }

    const resolvedName = clientResult ? clientResult.name : clientName;
    const amount = tryExtractAmount(prompt);
    const gstRate = tryExtractGSTRate(prompt);
    const gstAmount = Math.round((amount * gstRate) / 100);
    const total = amount + gstAmount;
    const { count } = await supabase.from('quotations').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    const qNum = `QT-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase.from('quotations').insert({
      user_id: user.id, quotation_number: qNum, client_name: resolvedName,
      client_email: tryExtractEmail(prompt),
      subtotal: amount, tax_amount: gstAmount, discount: 0, total_amount: total,
      quotation_date: new Date().toISOString().split('T')[0],
      validity_period: 30, status: 'draft', items: [],
    }).select().single();
    if (error) throw error;
    invalidateAll();
    return { recordType: 'quotation', recordId: data.id, message: `**Quotation created**\n- No: ${qNum}\n- Client: ${resolvedName}\n- Total: ₹${total.toLocaleString('en-IN')}\n- Valid for 30 days` };
  };

  const handleCreatePaymentLink = async (prompt: string) => {
    if (!user?.id) return null;

    // Try to extract invoice number from prompt
    const invoiceMatch = prompt.match(/\b(INV-\d{4}-\d{4})\b/i);
    let invoiceNumber = invoiceMatch ? invoiceMatch[1] : null;

    // If no invoice number, check for "latest" or "last" invoice
    if (!invoiceNumber && /\b(latest|last|recent|newest)\b.*\binvoice\b/i.test(prompt)) {
      const { data: latestInvoice } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_name, client_email, client_phone, total_amount, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestInvoice) {
        invoiceNumber = latestInvoice.invoice_number;
      }
    }

    if (!invoiceNumber) {
      return {
        recordType: 'answer',
        message: '**Please specify an invoice.**\nExamples:\n- "Create payment link for INV-2024-0001"\n- "Send payment link for latest invoice"\n- "Generate payment link for last invoice"',
      };
    }

    // Fetch the invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, client_email, client_phone, total_amount, status')
      .eq('user_id', user.id)
      .eq('invoice_number', invoiceNumber)
      .single();

    if (invError || !invoice) {
      return {
        recordType: 'answer',
        message: `**Invoice ${invoiceNumber} not found.**\nPlease check the invoice number and try again.`,
      };
    }

    if (invoice.status === 'paid') {
      return {
        recordType: 'answer',
        message: `**Invoice ${invoiceNumber} is already paid.**\nNo payment link needed.`,
      };
    }

    // Create payment link via edge function
    try {
      const { data: linkData, error: linkError } = await supabase.functions.invoke('create-payment-link', {
        body: {
          invoiceId: invoice.id,
          userId: user.id,
          customerName: invoice.client_name,
          customerEmail: invoice.client_email,
          customerPhone: invoice.client_phone,
        },
      });

      if (linkError) throw linkError;

      if (linkData?.success) {
        invalidateAll();
        return {
          recordType: 'payment_link',
          recordId: invoice.id,
          message: `**Payment link created**\n- Invoice: ${linkData.invoiceNumber}\n- Client: ${invoice.client_name}\n- Amount: ₹${Number(linkData.amount).toLocaleString('en-IN')}\n- Link: ${linkData.paymentLink}\n\n✅ Share this link with your customer to collect payment.`,
        };
      } else {
        throw new Error(linkData?.error || 'Payment link creation failed');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create payment link';
      if (errorMsg.includes('not activated') || errorMsg.includes('reconnect')) {
        return {
          recordType: 'answer',
          message: `**Payment link creation failed**\n${errorMsg}\n\nGo to Settings → Payments to connect Razorpay.`,
        };
      }
      throw err;
    }
  };

  // ── Pending action handler (yes/no) ──

  const handlePendingResponse = async (response: string) => {
    if (!pendingAction) return false;
    const lower = response.trim().toLowerCase();

    if (['yes', 'y', 'ok', 'sure', 'go ahead', 'create', 'proceed'].includes(lower)) {
      addUserMessage(response);
      setIsLoading(true);

      try {
        // Create the missing entity
        if (pendingAction.entityType === 'client') {
          const client = await createClient(pendingAction.entityName, pendingAction.prompt);
          addAssistantMessage({ content: `**Client "${client?.name}" created.** Now proceeding...`, recordType: 'client', recordId: client?.id, success: true });
        } else {
          const vendor = await createVendor(pendingAction.entityName, pendingAction.prompt);
          addAssistantMessage({ content: `**Vendor "${vendor?.name}" created.** Now proceeding...`, recordType: 'vendor', recordId: vendor?.id, success: true });
        }

        // Retry the original action
        const saved = { ...pendingAction };
        setPendingAction(null);
        const result = await executeIntent(saved.intent, saved.prompt);
        if (result && result !== 'pending') {
          addAssistantMessage({ content: result.message, recordType: result.recordType, recordId: result.recordId, success: true });
        }
      } catch (err: any) {
        addAssistantMessage({ content: `Error: ${err.message}`, success: false });
      } finally {
        setIsLoading(false);
      }
      return true;
    }

    if (['no', 'n', 'cancel', 'skip', 'nevermind'].includes(lower)) {
      addUserMessage(response);
      setPendingAction(null);

      // For expenses, allow skipping vendor creation
      if (pendingAction.intent === 'create_expense') {
        setIsLoading(true);
        try {
          // Create expense without vendor
          const saved = { ...pendingAction };
          setPendingAction(null);
          const result = await handleCreateExpenseWithoutVendor(saved.prompt);
          if (result) addAssistantMessage({ content: result.message, recordType: result.recordType, recordId: result.recordId, success: true });
        } catch (err: any) {
          addAssistantMessage({ content: `Error: ${err.message}`, success: false });
        } finally {
          setIsLoading(false);
        }
      } else {
        addAssistantMessage({ content: 'Action cancelled.', success: true });
      }
      return true;
    }

    return false;
  };

  const handleCreateExpenseWithoutVendor = async (prompt: string) => {
    if (!user?.id) return null;
    const amount = tryExtractAmount(prompt);
    const category = tryExtractCategory(prompt);
    const description = tryExtractDescription(prompt) || prompt.slice(0, 100);
    const ts = Date.now().toString().slice(-6);

    const { data, error } = await supabase.from('expenses').insert({
      user_id: user.id, vendor_name: 'Unknown', expense_number: `EXP-${ts}`,
      expense_date: tryExtractDate(prompt), category_name: category,
      description, amount, tax_amount: 0, total_amount: amount,
      payment_mode: tryExtractPaymentMode(prompt), status: 'pending', posted_to_ledger: false,
    }).select().single();
    if (error) throw error;
    invalidateAll();
    return { recordType: 'invoice', recordId: data.id, message: `**Expense recorded (no vendor)**\n- No: EXP-${ts}\n- Amount: ₹${amount.toLocaleString('en-IN')}\n- Category: ${category}` };
  };

  // ── Intent executor ──

  const executeIntent = async (intent: string, prompt: string): Promise<any> => {
    switch (intent) {
      case 'create_invoice': return handleCreateInvoice(prompt);
      case 'create_sales_order': return handleCreateSalesOrder(prompt);
      case 'create_purchase_order': return handleCreatePurchaseOrder(prompt);
      case 'create_bill': return handleCreateBill(prompt);
      case 'create_expense': return handleCreateExpense(prompt);
      case 'create_client': return handleCreateClient(prompt);
      case 'create_vendor': return handleCreateVendor(prompt);
      case 'create_inventory': return handleCreateInventory(prompt);
      case 'record_payment': return handleRecordPayment(prompt);
      case 'check_stock': return handleCheckStock(prompt);
      case 'create_quotation': return handleCreateQuotation(prompt);
      case 'create_payment_link': return handleCreatePaymentLink(prompt);
      default: return null;
    }
  };

  // ── Main command runner ──

  const runCommand = async (promptText: string) => {
    const prompt = promptText.trim();
    if (!prompt || isLoading) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', description: 'Please sign in to use AI command.', variant: 'destructive' });
      return;
    }

    // Handle pending action yes/no
    if (pendingAction) {
      const handled = await handlePendingResponse(prompt);
      if (handled) { setInput(''); return; }
    }

    addUserMessage(prompt);
    setInput('');
    setIsOpen(true);
    setIsLoading(true);

    try {
      // 1. Navigation check (only for non-create commands)
      const navigationTarget = resolveNavigationTarget(prompt);
      if (navigationTarget && !/(create|make|add|generate|record|raise|log)\b/i.test(prompt)) {
        navigate(navigationTarget.route);
        addAssistantMessage({ content: `Opening **${navigationTarget.label}**.`, recordType: 'navigation', success: true });
        return;
      }

      // 2. Detect intent
      const intent = detectIntent(prompt);

      if (intent) {
        // 3. Execute local intent
        const result = await executeIntent(intent, prompt);
        if (result === 'pending') return; // waiting for user confirmation
        if (result) {
          addAssistantMessage({ content: result.message, recordType: result.recordType, recordId: result.recordId, success: true });
          return;
        }
      }

      // 4. Try server-side AI
      try {
        const { data, error } = await supabase.functions.invoke('ai-command', {
          body: {
            prompt,
            userId: user.id,
            voiceLanguage: 'english',
            conversationHistory: messages
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
            dataContext: {
              clientCount: performanceData?.clientCount,
              vendorCount: performanceData?.vendorCount,
              totalRevenue: performanceData?.totalRevenue,
              totalExpenses: performanceData?.totalExpenses,
              pendingInvoices: performanceData?.pendingInvoices,
            },
          },
        });
        if (error) throw error;
        if (data?.success !== false) {
          addAssistantMessage({
            content: data?.message || 'Command processed.',
            recordType: data?.recordType, recordId: data?.recordId,
            success: true, imageUrl: data?.imageUrl || null,
          });
          invalidateAll();
          return;
        }
      } catch { /* fall through to advisor */ }

      // 5. Financial advisor fallback
      const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('financial-advisor', {
        body: { question: prompt, dataContext: performanceData },
      });
      if (fallbackError) throw fallbackError;

      addAssistantMessage({
        content: fallbackData?.response || 'I can help you with invoices, expenses, bills, inventory, payments, and more. Try: "Create invoice for ABC Corp for ₹25000 with GST"',
        recordType: 'answer', success: true,
      });
    } catch (err: any) {
      addAssistantMessage({ content: err?.message || 'Failed to process command.', success: false });
      toast({ title: 'AI command failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCommand(input);
  };

  const handleExpand = () => setIsExpanded(true);

  useEffect(() => {
    const handleOpen = () => { setIsExpanded(true); setIsOpen(true); };
    window.addEventListener('open-ai-command-bar', handleOpen);
    return () => window.removeEventListener('open-ai-command-bar', handleOpen);
  }, []);

  return (
    <div className="fixed left-0 right-0 bottom-16 md:bottom-3 z-[90] pointer-events-none">
      <div className={cn("mx-auto px-2 md:px-4 pointer-events-auto transition-all duration-300", isExpanded ? "max-w-5xl" : "max-w-fit")}>
        {/* Chat panel */}
        {isExpanded && (
          <div className={cn('mb-2 overflow-hidden rounded-2xl border bg-background/95 backdrop-blur shadow-2xl transition-all', isOpen ? 'max-h-[60vh]' : 'max-h-0 border-transparent shadow-none')}>
            <div className="border-b px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>AI Command</span>
              {pendingAction && <span className="text-amber-600 font-medium">Waiting for confirmation...</span>}
            </div>
            <ScrollArea className="h-[42vh] p-3" ref={scrollRef as any}>
              <div className="space-y-3">
                {!hasMessages && <ExampleCommands onSelect={(text) => void runCommand(text)} disabled={isLoading} />}
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} onNavigate={navigate} />
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-muted/80 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Collapsed pill */}
        {!isExpanded ? (
          <div className="flex justify-center">
            <button onClick={handleExpand} className="flex h-12 w-24 items-center justify-center rounded-full bg-muted/80 border backdrop-blur shadow-lg hover:shadow-xl hover:bg-muted transition-all cursor-pointer" title="Open AI Command Bar">
              <Sparkles className="h-5 w-5 text-foreground" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-2xl border bg-background/95 px-2 py-2 shadow-xl backdrop-blur">
            <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0"
              onClick={() => {
                if (isOpen) setIsOpen(false);
                else if (!hasMessages && !input.trim()) setIsExpanded(false);
                else setIsOpen(prev => !prev);
              }}
              title={isOpen ? 'Collapse' : hasMessages ? 'Expand' : 'Minimize'}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={pendingAction ? "Type yes or no..." : "Create invoice, add expense, check stock, record payment..."} disabled={isLoading} className="border-0 bg-transparent focus-visible:ring-0" />
            <VoiceInput onTranscript={(text) => setInput(text)} disabled={isLoading} />
            <Button type="submit" size="sm" disabled={isLoading || !input.trim()} className="shrink-0">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AICommandBar;
