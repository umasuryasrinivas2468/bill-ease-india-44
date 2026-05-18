import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search } from 'lucide-react';
import { useLiabilities } from '@/hooks/useLiabilities';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const LiabilitiesList: React.FC = () => {
  const { data: liabilities = [], isLoading } = useLiabilities();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liabilities.filter((l) => {
      if (typeFilter !== 'all' && l.liability_type !== typeFilter) return false;
      if (!q) return true;
      return (
        l.liability_code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.lender_name || '').toLowerCase().includes(q)
      );
    });
  }, [liabilities, search, typeFilter]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Liabilities</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {liabilities.length}</p>
        </div>
        <Link to="/liabilities/create"><Button><Plus className="h-4 w-4 mr-2" />New liability</Button></Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
                <SelectItem value="credit_line">Credit line</SelectItem>
                <SelectItem value="vendor_advance">Vendor advance</SelectItem>
                <SelectItem value="tax">Tax</SelectItem>
                <SelectItem value="long_term">Long term</SelectItem>
                <SelectItem value="short_term">Short term</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs"><Link to={`/liabilities/${l.id}`} className="text-primary hover:underline">{l.liability_code}</Link></TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{l.liability_type.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-xs">{l.lender_name || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(l.principal_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{inr(l.outstanding_principal)}</TableCell>
                    <TableCell className="text-xs">{l.interest_rate ? `${l.interest_rate}%` : '—'}</TableCell>
                    <TableCell className="text-xs">{l.next_due_date || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === 'active' ? 'default' : l.status === 'closed' ? 'secondary' : 'destructive'} className="capitalize text-[10px]">{l.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">No matching liabilities.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LiabilitiesList;
