
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Edit, Trash2, Package, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface InventoryItem {
  id: string;
  product_name: string;
  sku: string;
  category: string;
  type: 'goods' | 'services';
  purchase_price?: number;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  supplier_name?: string;
  supplier_contact?: string;
  supplier_email?: string;
  created_at: string;
}

const Inventory = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [formData, setFormData] = useState({
    product_name: '',
    sku: '',
    category: '',
    type: 'goods' as 'goods' | 'services',
    purchase_price: '',
    selling_price: '',
    stock_quantity: '',
    reorder_level: '',
    supplier_name: '',
    supplier_contact: '',
    supplier_email: '',
  });

  useEffect(() => {
    fetchInventory();
  }, [user]);

  const fetchInventory = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our interface
      const transformedData: InventoryItem[] = (data || []).map(item => ({
        ...item,
        type: item.type as 'goods' | 'services'
      }));
      
      setInventory(transformedData);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast({
        title: "Error",
        description: "Failed to fetch inventory items.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      product_name: '',
      sku: '',
      category: '',
      type: 'goods',
      purchase_price: '',
      selling_price: '',
      stock_quantity: '',
      reorder_level: '',
      supplier_name: '',
      supplier_contact: '',
      supplier_email: '',
    });
    setEditingItem(null);
  };

  const handleEdit = (item: InventoryItem) => {
    setFormData({
      product_name: item.product_name,
      sku: item.sku,
      category: item.category,
      type: item.type,
      purchase_price: item.purchase_price?.toString() || '',
      selling_price: item.selling_price.toString(),
      stock_quantity: item.stock_quantity.toString(),
      reorder_level: item.reorder_level.toString(),
      supplier_name: item.supplier_name || '',
      supplier_contact: item.supplier_contact || '',
      supplier_email: item.supplier_email || '',
    });
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    if (!formData.product_name || !formData.sku || !formData.category || !formData.selling_price) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const itemData = {
      user_id: user.id,
      product_name: formData.product_name,
      sku: formData.sku,
      category: formData.category,
      type: formData.type,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      selling_price: parseFloat(formData.selling_price),
      stock_quantity: formData.type === 'services' ? null : (parseInt(formData.stock_quantity) || 0),
      reorder_level: formData.type === 'services' ? null : (parseInt(formData.reorder_level) || 10),
      supplier_name: formData.supplier_name || null,
      supplier_contact: formData.supplier_contact || null,
      supplier_email: formData.supplier_email || null,
    };

    setIsLoading(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('inventory')
          .update(itemData)
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast({ title: "Success", description: "Item updated successfully!" });
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert([itemData]);
        
        if (error) throw error;
        toast({ title: "Success", description: "Item added successfully!" });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchInventory();
    } catch (error) {
      console.error('Error saving item:', error);
      toast({
        title: "Error",
        description: "Failed to save item.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: "Success", description: "Item deleted successfully!" });
      fetchInventory();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "Error",
        description: "Failed to delete item.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getLowStockItems = () => {
    return inventory.filter(item => 
      item.type === 'goods' && 
      item.stock_quantity !== null && 
      item.reorder_level !== null &&
      item.stock_quantity <= item.reorder_level
    );
  };

  const getTotalValue = () => {
    return inventory.reduce((sum, item) => {
      if (item.type === 'goods' && item.purchase_price && item.stock_quantity !== null) {
        return sum + (item.purchase_price * item.stock_quantity);
      }
      return sum;
    }, 0);
  };

  const lowStockItems = getLowStockItems();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory Management</h1>
            <p className="text-muted-foreground">Manage your products and services</p>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
              <DialogDescription>Fill in the details for the inventory item</DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                  placeholder="Product or service name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({...formData, sku: e.target.value})}
                  placeholder="SKU-001"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  placeholder="Electronics, Services, etc."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={(value: 'goods' | 'services') => setFormData({...formData, type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goods">Goods</SelectItem>
                    <SelectItem value="services">Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="purchase_price">Purchase Price (₹)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({...formData, purchase_price: e.target.value})}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="selling_price">Selling Price (₹) *</Label>
                <Input
                  id="selling_price"
                  type="number"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
              
              {formData.type === 'goods' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="stock_quantity">Stock Quantity</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level">Reorder Level</Label>
                    <Input
                      id="reorder_level"
                      type="number"
                      value={formData.reorder_level}
                      onChange={(e) => setFormData({...formData, reorder_level: e.target.value})}
                      placeholder="10"
                      min="0"
                    />
                  </div>
                </>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier Name</Label>
                <Input
                  id="supplier_name"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({...formData, supplier_name: e.target.value})}
                  placeholder="Supplier company name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="supplier_contact">Supplier Contact</Label>
                <Input
                  id="supplier_contact"
                  value={formData.supplier_contact}
                  onChange={(e) => setFormData({...formData, supplier_contact: e.target.value})}
                  placeholder="+91 9876543210"
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier_email">Supplier Email</Label>
                <Input
                  id="supplier_email"
                  type="email"
                  value={formData.supplier_email}
                  onChange={(e) => setFormData({...formData, supplier_email: e.target.value})}
                  placeholder="supplier@example.com"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Saving..." : editingItem ? "Update" : "Add"} Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventory.length}</div>
            <div className="text-sm text-muted-foreground">
              {inventory.filter(i => i.type === 'goods').length} goods, {inventory.filter(i => i.type === 'services').length} services
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{lowStockItems.length}</div>
            <div className="text-sm text-muted-foreground">Items need reordering</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Inventory Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{getTotalValue().toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Based on purchase price</div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-orange-200 last:border-b-0">
                  <div>
                    <span className="font-medium">{item.product_name}</span>
                    <span className="text-sm text-muted-foreground ml-2">({item.sku})</span>
                  </div>
                  <Badge variant="outline" className="text-orange-700 border-orange-300">
                    {item.type === 'services' ? 'N/A' : `${item.stock_quantity} left`}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory List */}
      {isLoading ? (
        <div className="text-center py-8">Loading inventory...</div>
      ) : inventory.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No inventory items yet</h3>
            <p className="text-muted-foreground mb-4">Add your first product or service to get started</p>
            <Button onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {inventory.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{item.product_name}</CardTitle>
                    <CardDescription>SKU: {item.sku} | Category: {item.category}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.type === 'goods' ? 'default' : 'secondary'}>
                      {item.type}
                    </Badge>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Stock:</span> {item.type === 'services' ? 'N/A' : item.stock_quantity}
                    {item.type === 'goods' && item.stock_quantity <= item.reorder_level && (
                      <Badge variant="outline" className="ml-2 text-orange-700 border-orange-300">
                        Low Stock
                      </Badge>
                    )}
                  </div>
                  {item.purchase_price && (
                    <div>
                      <span className="font-medium">Purchase:</span> ₹{item.purchase_price.toFixed(2)}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Selling:</span> ₹{item.selling_price.toFixed(2)}
                  </div>
                  {item.supplier_name && (
                    <div>
                      <span className="font-medium">Supplier:</span> {item.supplier_name}
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

export default Inventory;
