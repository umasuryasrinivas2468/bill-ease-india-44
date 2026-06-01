import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { fetchSubLedgerDirectory, setPartyPrimaryLedger, type SubLedgerParty } from '@/services/financialStatementsService';
import { BookOpen, Search } from 'lucide-react';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const SubLedgerManager: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: directory, isLoading } = useQuery({
    queryKey: ['subledger-directory', userId],
    queryFn: () => userId ? fetchSubLedgerDirectory(userId) : Promise.resolve(null),
    enabled: !!userId,
  });

  const remap = useMutation({
    mutationFn: async (input: { partyType: 'vendor' | 'customer'; partyId: string; accountId: string }) => {
      if (!userId) throw new Error('Not signed in');
      await setPartyPrimaryLedger(userId, input.partyType, input.partyId, input.accountId);
    },
    onSuccess: () => {
      toast.success('Primary ledger updated');
      queryClient.invalidateQueries({ queryKey: ['subledger-directory'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Update failed'),
  });

  const liabOpts  = directory?.control_options?.['Liability'] ?? [];
  const assetOpts = directory?.control_options?.['Asset'] ?? [];

  const filteredVendors = useMemo(
    () => (directory?.vendors ?? []).filter(v => !search || v.party_name.toLowerCase().includes(search.toLowerCase()) || (v.gstin ?? '').toLowerCase().includes(search.toLowerCase())),
    [directory, search],
  );
  const filteredCustomers = useMemo(
    () => (directory?.customers ?? []).filter(c => !search || c.party_name.toLowerCase().includes(search.toLowerCase()) || (c.gstin ?? '').toLowerCase().includes(search.toLowerCase())),
    [directory, search],
  );

  const renderRow = (party: SubLedgerParty, controlOpts: typeof liabOpts) => (
    <TableRow key={party.party_id}>
      <TableCell className="font-medium">{party.party_name}</TableCell>
      <TableCell className="font-mono text-xs">{party.gstin ?? '—'}</TableCell>
      <TableCell>
        <Select
          value={party.primary_ledger_id ?? ''}
          onValueChange={v => remap.mutate({ partyType: party.party_type, partyId: party.party_id, accountId: v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Assign control account">
              {party.primary_code ? `${party.primary_code} — ${party.primary_name}` : 'Assign…'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {controlOpts.length === 0 && (
              <SelectItem value="__none__" disabled>No control accounts configured. Seed Chart of Accounts first.</SelectItem>
            )}
            {controlOpts.map(o => (
              <SelectItem key={o.id} value={o.id}>{o.account_code} — {o.account_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {party.subledger_id
          ? <span className="font-mono text-xs">{party.subledger_code} — {party.subledger_name}</span>
          : <Badge variant="outline">Not provisioned</Badge>}
      </TableCell>
      <TableCell className={`text-right font-semibold ${party.balance < 0 ? 'text-red-600' : ''}`}>{fmtINR(party.balance)}</TableCell>
      <TableCell>
        <Button asChild variant="ghost" size="sm">
          <Link to={party.party_type === 'vendor' ? `/vendor-ledger?vendor=${party.party_id}` : `/customer-ledger/${party.party_id}`}>
            <BookOpen className="h-3 w-3 mr-1" /> Open
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sub-Ledger Manager</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every customer and vendor has its own sub-ledger leaf account under a primary control group (Trade Receivables / Payables / Advances).
          Postings flow to the leaf so each party appears on its own line in the trial balance while still rolling up.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-3 items-end">
          <div className="flex-1">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by name or GSTIN…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <Badge variant="secondary">{(directory?.vendors?.length ?? 0)} vendors</Badge>
          <Badge variant="secondary">{(directory?.customers?.length ?? 0)} customers</Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers ({filteredCustomers.length})</TabsTrigger>
          <TabsTrigger value="vendors">Vendors ({filteredVendors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Customer Sub-Ledgers</CardTitle>
              <p className="text-xs text-muted-foreground">Primary mapping: <b>Trade Receivables</b> for credit customers, <b>Customer Advances</b> for prepaid.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Primary Control</TableHead>
                    <TableHead>Sub-Ledger Leaf</TableHead>
                    <TableHead className="text-right">Balance (Receivable)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && filteredCustomers.map(c => renderRow(c, assetOpts))}
                  {!isLoading && !filteredCustomers.length && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No customers match.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendors">
          <Card>
            <CardHeader>
              <CardTitle>Vendor Sub-Ledgers</CardTitle>
              <p className="text-xs text-muted-foreground">Primary mapping: <b>Trade Payables</b> for credit purchases, <b>Vendor Advances</b> for prepayments.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Primary Control</TableHead>
                    <TableHead>Sub-Ledger Leaf</TableHead>
                    <TableHead className="text-right">Balance (Payable)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && filteredVendors.map(v => renderRow(v, liabOpts))}
                  {!isLoading && !filteredVendors.length && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No vendors match.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubLedgerManager;
