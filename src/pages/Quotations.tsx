import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Edit, Trash2, Send, FileText, Eye, Download, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useInventory } from '@/hooks/useInventory';
import QuotationViewer from '@/components/QuotationViewer';
import InventoryItemSelector from '@/components/InventoryItemSelector';
import type { Tables } from '@/integrations/supabase/types';

interface QuotationItem {
  name: string;
  quantity: number;
  unit_price: number;
  tax_percentage: number;
  amount: number;
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
  const { data: inventoryItems = [] } = useInventory();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
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
    { name: '', quantity: 1, unit_price: 0, tax_percentage: 18, amount: 0 }
  ]);

  useEffect(() => {
    if (user?.id) {
      fetchQuotations();
    }
  }, [user]);

  const fetchQuotations = async () => {
    if (!user?.id) {
      console.log('No user ID available for fetching quotations');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Fetching quotations for user:', user.id);
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching quotations:', error);
        throw error;
      }
      
      console.log('Fetched quotations:', data);
      // Transform the data to match our interface with proper type casting
      const transformedData: Quotation[] = (data || []).map(item => ({
        ...item,
        items: Array.isArray(item.items) ? (item.items as unknown as QuotationItem[]) : [],
        status: (item.status as 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired') || 'draft'
      }));
      
      setQuotations(transformedData);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch quotations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateItemAmount = (item: QuotationItem) => {
    const baseAmount = item.quantity * item.unit_price;
    const taxAmount = (baseAmount * item.tax_percentage) / 100;
    return baseAmount + taxAmount;
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const taxAmount = items.reduce((sum, item) => {
      const baseAmount = item.quantity * item.unit_price;
      return sum + ((baseAmount * item.tax_percentage) / 100);
    }, 0);
    const totalBeforeDiscount = subtotal + taxAmount;
    const discountAmount = (totalBeforeDiscount * formData.discount) / 100;
    const total = totalBeforeDiscount - discountAmount;

    return { subtotal, taxAmount, total };
  };

  const generateQuotationNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `QUO-${year}${month}${day}-${random}`;
  };

  const resetForm = () => {
    setFormData({
      quotation_number: generateQuotationNumber(),
      client_name: '',
      client_email: '',
      client_phone: '',
      client_address: '',
      quotation_date: new Date().toISOString().split('T')[0],
      validity_period: 30,
      discount: 0,
      terms_conditions: '',
    });
    setItems([{ name: '', quantity: 1, unit_price: 0, tax_percentage: 18, amount: 0 }]);
    setEditingQuotation(null);
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        title: "Authentication Error",
        description: "Please sign in to create quotations.",
        variant: "destructive",
      });
      return;
    }

    // Validation
    if (!formData.client_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.quotation_number.trim()) {
      toast({
        title: "Validation Error",
        description: "Quotation number is required.",
        variant: "destructive",
      });
      return;
    }

    if (items.some(item => !item.name.trim())) {
      toast({
        title: "Validation Error",
        description: "Please provide names for all items.",
        variant: "destructive",
      });
      return;
    }

    const { subtotal, taxAmount, total } = calculateTotals();
    
    const updatedItems = items.map(item => ({
      ...item,
      amount: calculateItemAmount(item)
    }));

    const quotationData = {
      user_id: user.id,
      quotation_number: formData.quotation_number.trim(),
      client_name: formData.client_name.trim(),
      client_email: formData.client_email.trim() || null,
      client_phone: formData.client_phone.trim() || null,
      client_address: formData.client_address.trim() || null,
      quotation_date: formData.quotation_date,
      validity_period: formData.validity_period,
      items: updatedItems,
      discount: formData.discount,
      subtotal,
      tax_amount: taxAmount,
      total_amount: total,
      terms_conditions: formData.terms_conditions.trim() || null,
    };

    setIsLoading(true);
    try {
      console.log('Submitting quotation data:', quotationData);
      
      if (editingQuotation) {
        const { error } = await supabase
          .from('quotations')
          .update(quotationData)
          .eq('id', editingQuotation.id);
        
        if (error) {
          console.error('Error updating quotation:', error);
          throw error;
        }
        toast({ title: "Success", description: "Quotation updated successfully!" });
      } else {
        const { error } = await supabase
          .from('quotations')
          .insert([quotationData]);
        
        if (error) {
          console.error('Error creating quotation:', error);
          throw error;
        }
        toast({ title: "Success", description: "Quotation created successfully!" });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchQuotations();
    } catch (error: any) {
      console.error('Error saving quotation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save quotation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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

  const handleViewQuotation = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setIsViewerOpen(true);
  };

  const handleDownloadQuotation = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setIsViewerOpen(true);
  };

  const handleSendEmail = async (quotation: Quotation) => {
    if (!quotation.client_email) {
      toast({
        title: "No Email Address",
        description: "This quotation doesn't have a client email address.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Email Functionality",
      description: "Email sending feature will be implemented with a backend service.",
    });
  };

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, unit_price: 0, tax_percentage: 18, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: string | number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    updatedItems[index].amount = calculateItemAmount(updatedItems[index]);
    setItems(updatedItems);
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

  const { subtotal, taxAmount, total } = calculateTotals();

  if (!user) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div className="text-left">
            <h1 className="text-2xl md:text-3xl font-bold text-left">Quotations</h1>
            <p className="text-muted-foreground text-left">Please sign in to manage quotations</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div className="text-left">
            <h1 className="text-2xl md:text-3xl font-bold text-left">Quotations</h1>
            <p className="text-muted-foreground text-left">Create and manage quotations for your clients</p>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              resetForm();
              setFormData(prev => ({ ...prev, quotation_number: generateQuotationNumber() }));
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingQuotation ? 'Edit' : 'Create'} Quotation</DialogTitle>
              <DialogDescription>Fill in the details to create a new quotation</DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quotation_number">Quotation Number *</Label>
                <Input
                  id="quotation_number"
                  value={formData.quotation_number}
                  onChange={(e) => setFormData({...formData, quotation_number: e.target.value})}
                  placeholder="QUO-2024-001"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quotation_date">Quotation Date *</Label>
                <Input
                  id="quotation_date"
                  type="date"
                  value={formData.quotation_date}
                  onChange={(e) => setFormData({...formData, quotation_date: e.target.value})}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="client_name">Client Name *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                  placeholder="Client or company name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="validity_period">Validity Period (Days)</Label>
                <Input
                  id="validity_period"
                  type="number"
                  value={formData.validity_period}
                  onChange={(e) => setFormData({...formData, validity_period: parseInt(e.target.value) || 30})}
                  placeholder="30"
                  min="1"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="client_email">Client Email</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({...formData, client_email: e.target.value})}
                  placeholder="client@example.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="client_phone">Client Phone</Label>
                <Input
                  id="client_phone"
                  value={formData.client_phone}
                  onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                  placeholder="+91 9876543210"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="client_address">Client Address</Label>
              <Textarea
                id="client_address"
                value={formData.client_address}
                onChange={(e) => setFormData({...formData, client_address: e.target.value})}
                placeholder="Complete address"
                rows={2}
              />
            </div>

            {/* Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Items *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              
              {items.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Item {index + 1}</h4>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <Label>Item Name *</Label>
                      <InventoryItemSelector
                        value={item.name}
                        onChange={(value, price) => {
                          updateItem(index, 'name', value);
                          if (price) {
                            updateItem(index, 'unit_price', price);
                          }
                        }}
                        placeholder="Select from inventory"
                      />
                    </div>
                    
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                        placeholder="1"
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    
                    <div>
                      <Label>Unit Price (₹)</Label>
                      <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    
                    <div>
                      <Label>Tax (%)</Label>
                      <Input
                        type="number"
                        value={item.tax_percentage}
                        onChange={(e) => updateItem(index, 'tax_percentage', parseFloat(e.target.value) || 0)}
                        placeholder="18"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    
                    <div>
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        value={item.amount.toFixed(2)}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount">Discount (%)</Label>
                  <Input
                    id="discount"
                    type="number"
                    value={formData.discount}
                    onChange={(e) => setFormData({...formData, discount: parseFloat(e.target.value) || 0})}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>₹{taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-₹{((subtotal + taxAmount) * formData.discount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total:</span>
                    <span>₹{total.toFixed(2)}</span>
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
                placeholder="Payment terms, delivery conditions, etc."
                rows={3}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Saving..." : editingQuotation ? "Update" : "Create"} Quotation
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quotations List */}
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
              Create First Quotation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {quotations.map((quotation) => (
            <Card key={quotation.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <CardTitle className="text-lg text-left">{quotation.quotation_number}</CardTitle>
                    <CardDescription className="text-left">{quotation.client_name}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(quotation.status)}>
                      {quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)}
                    </Badge>
                    <div className="flex gap-1">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewQuotation(quotation)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDownloadQuotation(quotation)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleSendEmail(quotation)}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(quotation.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Date:</span> {new Date(quotation.quotation_date).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Valid Until:</span> {new Date(new Date(quotation.quotation_date).getTime() + quotation.validity_period * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Items:</span> {quotation.items.length}
                  </div>
                  <div>
                    <span className="font-medium">Total:</span> ₹{quotation.total_amount.toFixed(2)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <QuotationViewer
        quotation={selectedQuotation}
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setSelectedQuotation(null);
        }}
      />
    </div>
  );
};

export default Quotations;
