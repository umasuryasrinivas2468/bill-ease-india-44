
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Edit, Trash2, CreditCard, CheckCircle } from 'lucide-react';
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
    return `****-${accountNumber.slice(-4)}`;
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
                  onChange={(e) => setFormData({...formData, account_holder_name: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="account_number">Account Number *</Label>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                  placeholder="1234567890"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ifsc_code">IFSC Code *</Label>
                <Input
                  id="ifsc_code"
                  value={formData.ifsc_code}
                  onChange={(e) => setFormData({...formData, ifsc_code: e.target.value.toUpperCase()})}
                  placeholder="SBIN0001234"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bank_name">Bank Name *</Label>
                <Input
                  id="bank_name"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                  placeholder="State Bank of India"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="branch_name">Branch Name</Label>
                <Input
                  id="branch_name"
                  value={formData.branch_name}
                  onChange={(e) => setFormData({...formData, branch_name: e.target.value})}
                  placeholder="Main Branch"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="account_type">Account Type</Label>
                <Select value={formData.account_type} onValueChange={(value) => setFormData({...formData, account_type: value})}>
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

      {/* Bank Accounts List */}
      {isLoading ? (
        <div className="text-center py-8">Loading bank accounts...</div>
      ) : bankAccounts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No bank accounts yet</h3>
            <p className="text-muted-foreground mb-4">Add your first bank account to get started</p>
            <Button onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bankAccounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {account.bank_name}
                      {account.is_primary && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{account.account_holder_name}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(account)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(account.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Account Number:</span> {maskAccountNumber(account.account_number)}
                  </div>
                  <div>
                    <span className="font-medium">IFSC Code:</span> {account.ifsc_code}
                  </div>
                  <div>
                    <span className="font-medium">Account Type:</span> {account.account_type?.charAt(0).toUpperCase()}{account.account_type?.slice(1)}
                  </div>
                  {account.branch_name && (
                    <div className="md:col-span-3">
                      <span className="font-medium">Branch:</span> {account.branch_name}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Banking;
