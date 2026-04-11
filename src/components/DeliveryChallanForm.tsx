import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { DeliveryChallanItem } from '@/hooks/useDeliveryChallans';
import { useInventory } from '@/hooks/useInventory';
import { useClients } from '@/hooks/useClients';

interface DeliveryChallanFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isSubmitting?: boolean;
}

export const DeliveryChallanForm: React.FC<DeliveryChallanFormProps> = ({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}) => {
  const { data: inventoryItems = [] } = useInventory();
  const { data: clients = [] } = useClients();
  const [challanDate, setChallanDate] = useState<Date>(new Date());
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [formData, setFormData] = useState({
    challan_number: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    customer_gst_number: '',
    delivery_status: 'pending' as const,
    notes: '',
  });

  // Auto-generate challan number on mount
  useEffect(() => {
    if (open && !formData.challan_number) {
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      setFormData(prev => ({ ...prev, challan_number: `DC-${dateStr}-${randomNum}` }));
    }
  }, [open]);

  // Auto-fill customer details when client is selected
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setFormData(prev => ({
        ...prev,
        customer_name: client.name,
        customer_email: client.email || '',
        customer_phone: client.phone || '',
        customer_address: client.address || '',
        customer_gst_number: client.gst_number || '',
      }));
    }
  };

  const [items, setItems] = useState<DeliveryChallanItem[]>([
    { product_name: '', quantity: 0, unit: 'pcs', description: '' }
  ]);

  const handleAddItem = () => {
    setItems([...items, { product_name: '', quantity: 0, unit: 'pcs', description: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof DeliveryChallanItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = () => {
    const data = {
      ...formData,
      challan_date: challanDate.toISOString().split('T')[0],
      items: items.filter(item => item.product_name && item.quantity > 0),
    };
    onSubmit(data);
    // Reset form
    setSelectedClientId('');
    setFormData({
      challan_number: '',
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      customer_address: '',
      customer_gst_number: '',
      delivery_status: 'pending',
      notes: '',
    });
    setItems([{ product_name: '', quantity: 0, unit: 'pcs', description: '' }]);
    setChallanDate(new Date());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Delivery Challan</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Basic Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="challan_number">Challan Number *</Label>
              <Input
                id="challan_number"
                value={formData.challan_number}
                disabled
                placeholder="Auto-generated"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Challan Date *</Label>
              <DatePicker date={challanDate} setDate={setChallanDate} />
            </div>
          </div>

          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Select Client (Optional)</Label>
            <Select value={selectedClientId} onValueChange={handleClientSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client to auto-fill details" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Customer name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_email">Customer Email</Label>
              <Input
                id="customer_email"
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_phone">Customer Phone</Label>
              <Input
                id="customer_phone"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="+91 9876543210"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_gst_number">Customer GST Number</Label>
              <Input
                id="customer_gst_number"
                value={formData.customer_gst_number}
                onChange={(e) => setFormData({ ...formData, customer_gst_number: e.target.value })}
                placeholder="29XXXXXXXXXXXXX"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="customer_address">Customer Address</Label>
              <Textarea
                id="customer_address"
                value={formData.customer_address}
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                placeholder="Customer full address"
                rows={2}
              />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg">Items</Label>
              <Button type="button" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end p-4 border rounded-lg">
                <div className="col-span-4 space-y-2">
                  <Label>Product *</Label>
                  <Select
                    value={item.product_name}
                    onValueChange={(value) => handleItemChange(index, 'product_name', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map((inv) => (
                        <SelectItem key={inv.id} value={inv.product_name}>
                          {inv.product_name} (Stock: {inv.stock_quantity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    value={item.quantity || ''}
                    onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={item.unit || ''}
                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                    placeholder="pcs"
                  />
                </div>

                <div className="col-span-3 space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={item.description || ''}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    placeholder="Item details"
                  />
                </div>

                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(index)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Status and Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="delivery_status">Delivery Status</Label>
              <Select
                value={formData.delivery_status}
                onValueChange={(value: any) => setFormData({ ...formData, delivery_status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes"
                rows={2}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Challan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
