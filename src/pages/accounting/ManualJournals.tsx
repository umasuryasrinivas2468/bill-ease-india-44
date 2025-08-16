
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface JournalLine {
  id: string;
  account_id: string;
  account_name?: string;
  debit: number;
  credit: number;
  line_narration: string;
}

interface Journal {
  id: string;
  journal_number: string;
  journal_date: string;
  narration: string;
  total_debit: number;
  total_credit: number;
  status: string;
  journal_lines: JournalLine[];
}

const ManualJournals = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [journalLines, setJournalLines] = useState<JournalLine[]>([
    { id: '1', account_id: '', debit: 0, credit: 0, line_narration: '' },
    { id: '2', account_id: '', debit: 0, credit: 0, line_narration: '' }
  ]);

  // Generate journal number
  const generateJournalNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now();
    return `JV-${year}${month}-${timestamp.toString().slice(-6)}`;
  };

  // Fetch accounts for dropdown
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('account_code');
      
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!user?.id,
  });

  // Fetch journals
  const { data: journals = [] } = useQuery({
    queryKey: ['journals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('journals')
        .select(`
          *,
          journal_lines (
            *,
            accounts (account_name)
          )
        `)
        .eq('user_id', user.id)
        .order('journal_date', { ascending: false });
      
      if (error) throw error;
      return data as Journal[];
    },
    enabled: !!user?.id,
  });

  // Create journal mutation
  const createJournalMutation = useMutation({
    mutationFn: async (journalData: any) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      // Create journal entry
      const { data: journal, error: journalError } = await supabase
        .from('journals')
        .insert({
          user_id: user.id,
          journal_number: generateJournalNumber(),
          journal_date: journalData.journal_date,
          narration: journalData.narration,
          status: 'posted'
        })
        .select()
        .single();
      
      if (journalError) throw journalError;
      
      // Create journal lines
      const journalLinesData = journalData.journal_lines.map((line: JournalLine) => ({
        journal_id: journal.id,
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
        line_narration: line.line_narration
      }));
      
      const { error: linesError } = await supabase
        .from('journal_lines')
        .insert(journalLinesData);
      
      if (linesError) throw linesError;
      
      return journal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      toast.success('Journal entry created successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create journal entry: ' + error.message);
    },
  });

  const addJournalLine = () => {
    const newId = String(journalLines.length + 1);
    setJournalLines([...journalLines, {
      id: newId,
      account_id: '',
      debit: 0,
      credit: 0,
      line_narration: ''
    }]);
  };

  const removeJournalLine = (id: string) => {
    if (journalLines.length > 2) {
      setJournalLines(journalLines.filter(line => line.id !== id));
    }
  };

  const updateJournalLine = (id: string, field: keyof JournalLine, value: any) => {
    setJournalLines(journalLines.map(line => 
      line.id === id ? { ...line, [field]: value } : line
    ));
  };

  const calculateTotals = () => {
    const totalDebit = journalLines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredit = journalLines.reduce((sum, line) => sum + (line.credit || 0), 0);
    return { totalDebit, totalCredit };
  };

  const validateAndSubmit = () => {
    const { totalDebit, totalCredit } = calculateTotals();
    
    // Validation
    if (!narration.trim()) {
      toast.error('Please enter a narration');
      return;
    }
    
    if (totalDebit !== totalCredit) {
      toast.error('Total debits must equal total credits');
      return;
    }
    
    if (totalDebit === 0) {
      toast.error('Journal entry must have at least one debit and one credit');
      return;
    }
    
    const validLines = journalLines.filter(line => 
      line.account_id && (line.debit > 0 || line.credit > 0)
    );
    
    if (validLines.length < 2) {
      toast.error('Journal entry must have at least 2 lines with accounts and amounts');
      return;
    }
    
    // Submit
    createJournalMutation.mutate({
      journal_date: journalDate,
      narration,
      journal_lines: validLines
    });
  };

  const resetForm = () => {
    setJournalDate(new Date().toISOString().split('T')[0]);
    setNarration('');
    setJournalLines([
      { id: '1', account_id: '', debit: 0, credit: 0, line_narration: '' },
      { id: '2', account_id: '', debit: 0, credit: 0, line_narration: '' }
    ]);
  };

  const { totalDebit, totalCredit } = calculateTotals();
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manual Journals</h1>
      </div>

      {/* Journal Entry Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create Journal Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="journal-date">Date</Label>
              <Input
                id="journal-date"
                type="date"
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="narration">Narration</Label>
              <Textarea
                id="narration"
                placeholder="Enter journal narration..."
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
              />
            </div>
          </div>

          {/* Journal Lines */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Journal Lines</h3>
              <Button onClick={addJournalLine} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Select
                          value={line.account_id}
                          onValueChange={(value) => updateJournalLine(line.id, 'account_id', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.account_code} - {account.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Line description"
                          value={line.line_narration}
                          onChange={(e) => updateJournalLine(line.id, 'line_narration', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debit || ''}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            updateJournalLine(line.id, 'debit', value);
                            if (value > 0) updateJournalLine(line.id, 'credit', 0);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.credit || ''}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            updateJournalLine(line.id, 'credit', value);
                            if (value > 0) updateJournalLine(line.id, 'debit', 0);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {journalLines.length > 2 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeJournalLine(line.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end space-x-4 p-4 bg-muted rounded">
              <div>Total Debit: ₹{totalDebit.toFixed(2)}</div>
              <div>Total Credit: ₹{totalCredit.toFixed(2)}</div>
              <div className={`font-semibold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {isBalanced ? 'Balanced ✓' : 'Not Balanced ✗'}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={resetForm}>Reset</Button>
              <Button 
                onClick={validateAndSubmit}
                disabled={!isBalanced || createJournalMutation.isPending}
              >
                {createJournalMutation.isPending ? 'Creating...' : 'Create Journal Entry'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Journal Entries List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Journal #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.map((journal) => (
                  <TableRow key={journal.id}>
                    <TableCell className="font-medium">{journal.journal_number}</TableCell>
                    <TableCell>{new Date(journal.journal_date).toLocaleDateString()}</TableCell>
                    <TableCell>{journal.narration}</TableCell>
                    <TableCell>₹{journal.total_debit.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-sm ${
                        journal.status === 'posted' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {journal.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManualJournals;
