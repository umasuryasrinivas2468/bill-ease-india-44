import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { formatINR, round2 } from '@/lib/gst';

// ITC Mismatch Alert Center (Feature #23).
//
// Accepts a GSTR-2B JSON (as downloaded from the GST portal) and compares
// each B2B invoice the portal has against your purchase_bills. Flags:
//   - MISSING_IN_BOOKS   → portal shows it, you didn't record it
//   - MISSING_IN_PORTAL  → you recorded it, portal has no record
//   - GSTIN_MISMATCH     → bill found but vendor GSTIN differs
//   - AMOUNT_MISMATCH    → invoice number matches but taxable/GST differs > ₹1
//   - MATCHED            → everything lines up
//
// The JSON shape expected is the standard GSTR-2B download:
//   { data: { docdata: { b2b: [{ ctin, supname, inv: [{ inum, idt, val, txval, iamt, camt, samt }] }] } } }
// or a lenient shape with any nested `inv`/`invoice`/`inum` fields.

interface PortalInvoice {
  ctin: string;
  supplier: string;
  inum: string;          // invoice number
  idt: string;           // date
  val: number;           // invoice total
  txval: number;         // taxable value
  igst: number;
  cgst: number;
  sgst: number;
}

type Status =
  | 'MATCHED'
  | 'MISSING_IN_BOOKS'
  | 'MISSING_IN_PORTAL'
  | 'GSTIN_MISMATCH'
  | 'AMOUNT_MISMATCH';

interface DiffRow {
  status: Status;
  inum: string;
  portal?: PortalInvoice;
  book?: {
    bill_number: string;
    vendor_name: string;
    vendor_gst_number?: string;
    bill_date: string;
    amount: number;
    gst_amount: number;
    total_amount: number;
  };
  note?: string;
}

// Lenient GSTR-2B parser — walks known shapes, falling back to any array of
// supplier-like objects with inv arrays.
function parseGSTR2B(json: any): PortalInvoice[] {
  const out: PortalInvoice[] = [];
  const b2b =
    json?.data?.docdata?.b2b ??
    json?.docdata?.b2b ??
    json?.b2b ??
    [];

  const pushInv = (sup: any, inv: any) => {
    const inum = String(inv.inum ?? inv.invoice_number ?? '').trim();
    if (!inum) return;
    out.push({
      ctin: String(sup.ctin ?? sup.gstin ?? sup.vendor_gst_number ?? ''),
      supplier: String(sup.supname ?? sup.trdnm ?? sup.supplier ?? sup.vendor_name ?? ''),
      inum,
      idt: String(inv.idt ?? inv.invoice_date ?? ''),
      val: Number(inv.val) || 0,
      txval: Number(inv.txval ?? inv.taxable_value) || 0,
      igst: Number(inv.iamt ?? inv.igst) || 0,
      cgst: Number(inv.camt ?? inv.cgst) || 0,
      sgst: Number(inv.samt ?? inv.sgst) || 0,
    });
  };

  if (Array.isArray(b2b)) {
    for (const sup of b2b) {
      const invs = sup.inv ?? sup.invoices ?? sup.items ?? [];
      if (Array.isArray(invs)) for (const inv of invs) pushInv(sup, inv);
    }
  }
  return out;
}

function normalizeInum(s: string) {
  return String(s || '').trim().toUpperCase().replace(/[\s\-_/]/g, '');
}

const MISMATCH_TOLERANCE = 1; // rupees — anything above is flagged

const ITCMismatchCenter: React.FC = () => {
  const { data: bills = [] } = usePurchaseBills();
  const [portal, setPortal] = useState<PortalInvoice[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleFile = async (file: File) => {
    setError('');
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseGSTR2B(JSON.parse(text));
      if (parsed.length === 0) {
        setError('No B2B invoices found in that JSON. Is it a GSTR-2B download?');
      }
      setPortal(parsed);
    } catch (e: any) {
      setError(e?.message || 'Could not parse file as JSON.');
      setPortal([]);
    }
  };

  const rows: DiffRow[] = useMemo(() => {
    const portalByInum = new Map<string, PortalInvoice>();
    for (const p of portal) portalByInum.set(normalizeInum(p.inum), p);

    const bookByInum = new Map<string, (typeof bills)[number]>();
    for (const b of bills) bookByInum.set(normalizeInum(b.bill_number), b);

    const out: DiffRow[] = [];

    // Walk the portal list first.
    for (const p of portal) {
      const key = normalizeInum(p.inum);
      const book = bookByInum.get(key);
      if (!book) {
        out.push({ status: 'MISSING_IN_BOOKS', inum: p.inum, portal: p });
        continue;
      }
      // GSTIN check
      const bookGstin = (book.vendor_gst_number || '').toUpperCase().trim();
      const portalGstin = (p.ctin || '').toUpperCase().trim();
      if (bookGstin && portalGstin && bookGstin !== portalGstin) {
        out.push({
          status: 'GSTIN_MISMATCH',
          inum: p.inum,
          portal: p,
          book: {
            bill_number: book.bill_number,
            vendor_name: book.vendor_name,
            vendor_gst_number: book.vendor_gst_number,
            bill_date: book.bill_date,
            amount: Number(book.amount),
            gst_amount: Number(book.gst_amount),
            total_amount: Number(book.total_amount),
          },
          note: `Portal GSTIN ${portalGstin} vs books ${bookGstin}`,
        });
        continue;
      }
      // Amount check
      const bookGst = Number(book.gst_amount) || 0;
      const portalGst = p.igst + p.cgst + p.sgst;
      const diff = Math.abs(bookGst - portalGst);
      if (diff > MISMATCH_TOLERANCE) {
        out.push({
          status: 'AMOUNT_MISMATCH',
          inum: p.inum,
          portal: p,
          book: {
            bill_number: book.bill_number,
            vendor_name: book.vendor_name,
            vendor_gst_number: book.vendor_gst_number,
            bill_date: book.bill_date,
            amount: Number(book.amount),
            gst_amount: bookGst,
            total_amount: Number(book.total_amount),
          },
          note: `GST diff ₹${diff.toFixed(2)} (portal ₹${portalGst.toFixed(2)} vs books ₹${bookGst.toFixed(2)})`,
        });
        continue;
      }
      out.push({
        status: 'MATCHED',
        inum: p.inum,
        portal: p,
        book: {
          bill_number: book.bill_number,
          vendor_name: book.vendor_name,
          vendor_gst_number: book.vendor_gst_number,
          bill_date: book.bill_date,
          amount: Number(book.amount),
          gst_amount: bookGst,
          total_amount: Number(book.total_amount),
        },
      });
    }

    // Anything in books but not in portal.
    for (const b of bills) {
      const key = normalizeInum(b.bill_number);
      if (!portalByInum.has(key)) {
        out.push({
          status: 'MISSING_IN_PORTAL',
          inum: b.bill_number,
          book: {
            bill_number: b.bill_number,
            vendor_name: b.vendor_name,
            vendor_gst_number: b.vendor_gst_number,
            bill_date: b.bill_date,
            amount: Number(b.amount),
            gst_amount: Number(b.gst_amount),
            total_amount: Number(b.total_amount),
          },
        });
      }
    }

    return out;
  }, [portal, bills]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      MATCHED: 0,
      MISSING_IN_BOOKS: 0,
      MISSING_IN_PORTAL: 0,
      GSTIN_MISMATCH: 0,
      AMOUNT_MISMATCH: 0,
    };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const totalPortalITC = round2(
    portal.reduce((s, p) => s + p.igst + p.cgst + p.sgst, 0),
  );
  const totalBookITC = round2(bills.reduce((s, b) => s + Number(b.gst_amount), 0));
  const gap = round2(totalPortalITC - totalBookITC);

  const exportDiffCSV = () => {
    const headers = ['status', 'inum', 'portal_supplier', 'portal_gstin', 'portal_gst', 'book_vendor', 'book_gstin', 'book_gst', 'note'];
    const csvRows = rows.map((r) => [
      r.status,
      r.inum,
      r.portal?.supplier || '',
      r.portal?.ctin || '',
      r.portal ? (r.portal.igst + r.portal.cgst + r.portal.sgst).toFixed(2) : '',
      r.book?.vendor_name || '',
      r.book?.vendor_gst_number || '',
      r.book ? r.book.gst_amount.toFixed(2) : '',
      r.note || '',
    ]);
    const csv = [
      headers.join(','),
      ...csvRows.map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `itc_mismatch_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-amber-600" />
          ITC Mismatch Alert Center
        </CardTitle>
        <CardDescription>
          Upload GSTR-2B JSON from the GST portal — we'll diff it against your
          purchase bills and flag missing invoices, GSTIN errors, and amount
          mismatches.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">GSTR-2B JSON file</Label>
            <Input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                <Upload className="h-3 w-3 inline mr-1" />
                {fileName} — {portal.length} invoice(s) parsed
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <Button variant="outline" onClick={exportDiffCSV} disabled={rows.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export diff
          </Button>
        </div>

        {/* Summary tiles */}
        {(portal.length > 0 || bills.length > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile tone="green" label="Matched" value={counts.MATCHED} icon={<CheckCircle2 className="h-4 w-4" />} />
            <Tile tone="red" label="Missing in books" value={counts.MISSING_IN_BOOKS} icon={<AlertTriangle className="h-4 w-4" />} />
            <Tile tone="amber" label="Missing in portal" value={counts.MISSING_IN_PORTAL} icon={<AlertTriangle className="h-4 w-4" />} />
            <Tile tone="red" label="GSTIN errors" value={counts.GSTIN_MISMATCH} icon={<AlertTriangle className="h-4 w-4" />} />
            <Tile tone="amber" label="Amount diffs" value={counts.AMOUNT_MISMATCH} icon={<AlertTriangle className="h-4 w-4" />} />
          </div>
        )}

        {portal.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Portal ITC (2B)</div>
              <div className="font-medium">{formatINR(totalPortalITC)}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Books ITC</div>
              <div className="font-medium">{formatINR(totalBookITC)}</div>
            </div>
            <div className={`border rounded p-3 ${Math.abs(gap) > MISMATCH_TOLERANCE ? 'border-amber-300 bg-amber-50' : ''}`}>
              <div className="text-xs text-muted-foreground">Gap (Portal − Books)</div>
              <div className="font-medium">{formatINR(gap)}</div>
            </div>
          </div>
        )}

        {/* Detail table */}
        {rows.length > 0 && (
          <div className="w-full overflow-auto max-h-[28rem] border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Supplier / Vendor</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Portal GST</TableHead>
                  <TableHead className="text-right">Books GST</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const portalGst = r.portal ? r.portal.igst + r.portal.cgst + r.portal.sgst : null;
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="font-medium">{r.inum}</TableCell>
                      <TableCell>{r.portal?.supplier || r.book?.vendor_name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {r.portal?.ctin || r.book?.vendor_gst_number || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {portalGst !== null ? `₹${portalGst.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.book ? `₹${r.book.gst_amount.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.note || ''}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {portal.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8 border rounded border-dashed">
            Upload your GSTR-2B JSON to start reconciling against {bills.length} purchase bill(s).
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Tile: React.FC<{
  tone: 'green' | 'red' | 'amber';
  label: string;
  value: number;
  icon: React.ReactNode;
}> = ({ tone, label, value, icon }) => {
  const toneCls = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  }[tone];
  return (
    <div className={`border rounded p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-xs uppercase">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
  const label = status.replace(/_/g, ' ').toLowerCase();
  const variants: Record<Status, string> = {
    MATCHED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    MISSING_IN_BOOKS: 'bg-red-100 text-red-800 border-red-200',
    MISSING_IN_PORTAL: 'bg-amber-100 text-amber-800 border-amber-200',
    GSTIN_MISMATCH: 'bg-red-100 text-red-800 border-red-200',
    AMOUNT_MISMATCH: 'bg-amber-100 text-amber-800 border-amber-200',
  };
  return (
    <Badge variant="outline" className={`capitalize ${variants[status]}`}>
      {label}
    </Badge>
  );
};

export default ITCMismatchCenter;
