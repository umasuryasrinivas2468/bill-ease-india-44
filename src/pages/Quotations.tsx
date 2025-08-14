
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Send, Eye, Edit, Trash2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface QuotationItem {
  name: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  total: number;
}

interface Quotation {
  id: string;
  quotation_number: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  quotation_date: string;
  validity_period: number;
  items: QuotationItem[];
  discount: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  terms_conditions?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
}

const Quotations = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);

  const [formData, setFormData] = useState({
    quotation_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_address: '',
    quotation_date: new Date().toISOString().split('T')[0],
    validity_period: 30,
    discount: 0,
    terms_conditions: '',
  });

  const [items, setItems] = useState<QuotationItem[]>([
    { name: '', quantity: 1, unitPrice: 0, taxPercent: 18, total: 0 }
  ]);

  useEffect(() => {
    fetchQuotations();
  }, [user]);

  const fetchQuotations = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotations(data || []);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch quotations.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateQuotationNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `QUO-${year}${month}-${random}`;
  };

  const calculateItemTotal = (item: QuotationItem) => {
    const subtotal = item.quantity * item.unitPrice;
    const taxAmount = (subtotal * item.taxPercent) / 100;
    return subtotal + taxAmount;
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = items.reduce((sum, item) => sum + ((item.quantity * item.unitPrice * item.taxPercent) / 100), 0);
    const discountAmount = (subtotal * formData.discount) / 100;
    const total = subtotal + taxAmount - discountAmount;
    
    return { subtotal, taxAmount, total: Math.max(0, total) };
  };

  const handleItemChange = (index: number, field: keyof QuotationItem, value: string | number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    updatedItems[index].total = calculateItemTotal(updatedItems[index]);
    setItems(updatedItems);
  };

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, unitPrice: 0, taxPercent: 18, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setFormData({
      quotation_number: '',
      client_name: '',
      client_email: '',
      client_phone: '',
      client_address: '',
      quotation_date: new Date().toISOString().split('T')[0],
      validity_period: 30,
      discount: 0,
      terms_conditions: '',
    });
    setItems([{ name: '', quantity: 1, unitPrice: 0, taxPercent: 18, total: 0 }]);
    setEditingQuotation(null);
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    if (!formData.client_name || !formData.quotation_number) {
      toast({
        title: "Validation Error",
        description: "Client name and quotation number are required.",
        variant: "destructive",
      });
      return;
    }

    const validItems = items.filter(item => item.name && item.quantity > 0 && item.unitPrice > 0);
    if (validItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one valid item is required.",
        variant: "destructive",
      });
      return;
    }

    const { subtotal, taxAmount, total } = calculateTotals();

    const quotationData = {
      ...formData,
      user_id: user.id,
      items: validItems,
      subtotal,
      tax_amount: taxAmount,
      total_amount: total,
    };

    setIsLoading(true);
    try {
      if (editingQuotation) {
        const { error } = await supabase
          .from('quotations')
          .update(quotationData)
          .eq('id', editingQuotation.id);
        
        if (error) throw error;
        toast({ title: "Success", description: "Quotation updated successfully!" });
      } else {
        const { error } = await supabase
          .from('quotations')
          .insert([quotationData]);
        
        if (error) throw error;
        toast({ title: "Success", description: "Quotation created successfully!" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchQuotations();
    } catch (error) {
      console.error('Error saving quotation:', error);
      toast({
        title: "Error",
        description: "Failed to save quotation.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (quotation: Quotation) => {
    setEditingQuotation(quotation);
    setFormData({
      quotation_number: quotation.quotation_number,
      client_name: quotation.client_name,
      client_email: quotation.client_email || '',
      client_phone: quotation.client_phone || '',
      client_address: quotation.client_address || '',
      quotation_date: quotation.quotation_date,
      validity_period: quotation.validity_period,
      discount: quotation.discount,
      terms_conditions: quotation.terms_conditions || '',
    });
    setItems(quotation.items);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this quotation?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quotations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: "Success", description: "Quotation deleted successfully!" });
      fetchQuotations();
    } catch (error) {
      console.error('Error deleting quotation:', error);
      toast({
        title: "Error",
        description: "Failed to delete quotation.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quotations</h1>
            <p className="text-muted-foreground">Create and manage quotations for your clients</p>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              resetForm();
              setFormData(prev => ({ ...prev, quotation_number: generateQuotationNumber() }));
            }}>
              <Plus className="h-4 w-4 mr-2" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingQuotation ? 'Edit Quotation' : 'Create New Quotation'}</DialogTitle>
              <DialogDescription>Fill in the details to create a new quotation</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Client Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quotation_number">Quotation Number *</Label>
                  <Input
                    id="quotation_number"
                    value={formData.quotation_number}
                    onChange={(e) => setFormData({...formData, quotation_number: e.target.value})}
                    placeholder="QUO-2024-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quotation_date">Quotation Date *</Label>
                  <Input
                    id="quotation_date"
                    type="date"
                    value={formData.quotation_date}
                    onChange={(e) => setFormData({...formData, quotation_date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_name">Client Name *</Label>
                  <Input
                    id="client_name"
                    value={formData.client_name}
                    onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                    placeholder="Client company name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validity_period">Validity Period (days)</Label>
                  <Input
                    id="validity_period"
                    type="number"
                    value={formData.validity_period}
                    onChange={(e) => setFormData({...formData, validity_period: parseInt(e.target.value) || 30})}
                    placeholder="30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_email">Client Email</Label>
                  <Input
                    id="client_email"
                    type="email"
                    value={formData.client_email}
                    onChange={(e) => setFormData({...formData, client_email: e.target.value})}
                    placeholder="client@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_phone">Client Phone</Label>
                  <Input
                    id="client_phone"
                    value={formData.client_phone}
                    onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_address">Client Address</Label>
                <Textarea
                  id="client_address"
                  value={formData.client_address}
                  onChange={(e) => setFormData({...formData, client_address: e.target.value})}
                  placeholder="Client address"
                  rows={2}
                />
              </div>

              {/* Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
                
                {items.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-4 border rounded-lg">
                    <div className="md:col-span-2">
                      <Label>Item Name</Label>
                      <Input
                        value={item.name}
                        onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                        placeholder="Product/Service name"
                      />
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                        min="1"
                      />
                    </div>
                    <div>
                      <Label>Unit Price</Label>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label>Tax %</Label>
                      <Input
                        type="number"
                        value={item.taxPercent}
                        onChange={(e) => handleItemChange(index, 'taxPercent', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label>Total</Label>
                        <div className="text-sm font-medium p-2 bg-gray-50 rounded">
                          ₹{calculateItemTotal(item).toFixed(2)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals and Terms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount">Discount %</Label>
                  <Input
                    id="discount"
                    type="number"
                    value={formData.discount}
                    onChange={(e) => setFormData({...formData, discount: parseFloat(e.target.value) || 0})}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Summary</Label>
                  <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₹{calculateTotals().subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax:</span>
                      <span>₹{calculateTotals().taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span>-₹{((calculateTotals().subtotal * formData.discount) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Total:</span>
                      <span>₹{calculateTotals().total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terms_conditions">Terms & Conditions</Label>
                <Textarea
                  id="terms_conditions"
                  value={formData.terms_conditions}
                  onChange={(e) => setFormData({...formData, terms_conditions: e.target.value})}
                  placeholder="Enter terms and conditions"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isLoading}>
                  {isLoading ? "Saving..." : editingQuotation ? "Update Quotation" : "Create Quotation"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quotations List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8">Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No quotations yet</h3>
              <p className="text-muted-foreground mb-4">Create your first quotation to get started</p>
              <Button onClick={() => {
                resetForm();
                setFormData(prev => ({ ...prev, quotation_number: generateQuotationNumber() }));
                setIsDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Create Quotation
              </Button>
            </CardContent>
          </Card>
        ) : (
          quotations.map((quotation) => (
            <Card key={quotation.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{quotation.quotation_number}</CardTitle>
                    <CardDescription>
                      {quotation.client_name} • {new Date(quotation.quotation_date).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(quotation.status)}>
                      {quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)}
                    </Badge>
                    <div className="text-lg font-semibold">
                      ₹{quotation.total_amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Valid until: {new Date(new Date(quotation.quotation_date).getTime() + quotation.validity_period * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(quotation)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(quotation.id)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Quotations;
