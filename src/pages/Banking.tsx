
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Edit, Trash2, CreditCard, CheckCircle, Copy, Building2, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface BankAccount {
  id: string;
  user_id: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name?: string;
  account_holder_name?: string;
  account_type?: string;
  is_primary: boolean;
  created_at: string;
}

const Banking = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  const [formData, setFormData] = useState({
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
    branch_name: '',
    account_type: 'savings',
    is_primary: false,
  });

  useEffect(() => {
    fetchBankAccounts();
  }, [user]);

  const fetchBankAccounts = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bank_details')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      toast({
        title: "Error",
        description: "Failed to fetch bank accounts.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      account_holder_name: '',
      account_number: '',
      ifsc_code: '',
      bank_name: '',
      branch_name: '',
      account_type: 'savings',
      is_primary: false,
    });
    setEditingAccount(null);
  };

  const handleEdit = (account: BankAccount) => {
    setFormData({
      account_holder_name: account.account_holder_name || '',
      account_number: account.account_number,
      ifsc_code: account.ifsc_code,
      bank_name: account.bank_name,
      branch_name: account.branch_name || '',
      account_type: account.account_type || 'savings',
      is_primary: account.is_primary,
    });
    setEditingAccount(account);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    if (!formData.account_holder_name || !formData.account_number || !formData.ifsc_code || !formData.bank_name) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const accountData = {
      user_id: user.id,
      account_holder_name: formData.account_holder_name,
      account_number: formData.account_number,
      ifsc_code: formData.ifsc_code.toUpperCase(),
      bank_name: formData.bank_name,
      branch_name: formData.branch_name || null,
      account_type: formData.account_type,
      is_primary: formData.is_primary,
    };

    setIsLoading(true);
    try {
      if (editingAccount) {
        const { error } = await supabase
          .from('bank_details')
          .update(accountData)
          .eq('id', editingAccount.id);

        if (error) throw error;
        toast({ title: "Success", description: "Bank account updated successfully!" });
      } else {
        const { error } = await supabase
          .from('bank_details')
          .insert([accountData]);

        if (error) throw error;
        toast({ title: "Success", description: "Bank account added successfully!" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchBankAccounts();
    } catch (error) {
      console.error('Error saving bank account:', error);
      toast({
        title: "Error",
        description: "Failed to save bank account.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bank account?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('bank_details')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: "Success", description: "Bank account deleted successfully!" });
      fetchBankAccounts();
    } catch (error) {
      console.error('Error deleting bank account:', error);
      toast({
        title: "Error",
        description: "Failed to delete bank account.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (accountNumber.length <= 4) return accountNumber;
    return `**** **** **** ${accountNumber.slice(-4)}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Banking</h1>
            <p className="text-muted-foreground">Manage your bank accounts securely</p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Bank Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAccount ? 'Edit' : 'Add'} Bank Account</DialogTitle>
              <DialogDescription>Enter your bank account details securely</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account_holder_name">Account Holder Name *</Label>
                <Input
                  id="account_holder_name"
                  value={formData.account_holder_name}
                  onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_number">Account Number *</Label>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  placeholder="1234567890"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ifsc_code">IFSC Code *</Label>
                <Input
                  id="ifsc_code"
                  value={formData.ifsc_code}
                  onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
                  placeholder="SBIN0001234"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bank_name">Bank Name *</Label>
                <Input
                  id="bank_name"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="State Bank of India"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch_name">Branch Name</Label>
                <Input
                  id="branch_name"
                  value={formData.branch_name}
                  onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                  placeholder="Main Branch"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_type">Account Type</Label>
                <Select value={formData.account_type} onValueChange={(value) => setFormData({ ...formData, account_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="savings">Savings</SelectItem>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="overdraft">Overdraft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Saving..." : editingAccount ? "Update" : "Add"} Account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3 text-blue-700">
        <div className="bg-blue-100 p-2 rounded-full">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Coming Soon</h4>
          <p className="text-sm">We are updating connected banking services soon!</p>
        </div>
      </div>

      {/* Bank Accounts List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground">Loading your secure banking details...</p>
        </div>
      ) : bankAccounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <CreditCard className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No bank accounts added</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Add your bank account details to receive payments and manage your finances securely.
            </p>
            <Button onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Bank Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {bankAccounts.map((account) => (
            <div key={account.id} className="relative group perspective-1000">
              <div className={`
                relative overflow-hidden rounded-xl p-6 h-56 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl
                ${account.is_primary
                  ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg'
                  : 'bg-white border text-card-foreground hover:border-primary/50 shadow-sm'}
              `}>

                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/5 rounded-full blur-2xl"></div>
                <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-primary/5 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${account.is_primary ? 'bg-white/10' : 'bg-primary/10'}`}>
                        <Building2 className={`h-5 w-5 ${account.is_primary ? 'text-white' : 'text-primary'}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg tracking-tight line-clamp-1">{account.bank_name}</h3>
                        <p className={`text-xs ${account.is_primary ? 'text-slate-300' : 'text-muted-foreground'}`}>
                          {account.account_type?.toUpperCase()} ACCOUNT
                        </p>
                      </div>
                    </div>
                    {account.is_primary && (
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-0">
                        Primary
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-4 my-2">
                    <div className="flex items-center justify-between group/number">
                      <p className="font-mono text-xl tracking-wider pt-2">
                        {maskAccountNumber(account.account_number)}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 opacity-0 group-hover/number:opacity-100 transition-opacity ${account.is_primary ? 'text-white hover:bg-white/20' : ''}`}
                        onClick={() => copyToClipboard(account.account_number, "Account number")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="flex justify-between items-end text-sm">
                      <div>
                        <p className={`text-xs mb-0.5 ${account.is_primary ? 'text-slate-400' : 'text-muted-foreground'}`}>Account Holder</p>
                        <p className="font-medium truncate max-w-[140px]">{account.account_holder_name}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs mb-0.5 ${account.is_primary ? 'text-slate-400' : 'text-muted-foreground'}`}>IFSC</p>
                        <div className="flex items-center gap-1">
                          <p className="font-mono font-medium">{account.ifsc_code}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-4 w-4 ${account.is_primary ? 'text-slate-300 hover:text-white hover:bg-white/10' : 'text-muted-foreground'}`}
                            onClick={() => copyToClipboard(account.ifsc_code, "IFSC code")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`
                    absolute top-4 right-4 flex gap-1 transition-opacity duration-200 
                    ${account.is_primary ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}
                `}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm" onClick={() => handleEdit(account)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-red-500/20 hover:bg-red-500/40 text-red-100 backdrop-blur-sm" onClick={() => handleDelete(account.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Banking;
