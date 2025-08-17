
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';

interface InventoryItemSelectorProps {
  value: string;
  onChange: (value: string, price?: number) => void;
  placeholder?: string;
}

const InventoryItemSelector: React.FC<InventoryItemSelectorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Select from inventory" 
}) => {
  const { data: inventoryItems = [], isLoading, error } = useInventory();

  console.log('InventoryItemSelector - Items:', inventoryItems);
  console.log('InventoryItemSelector - Loading:', isLoading);
  console.log('InventoryItemSelector - Error:', error);

  const handleValueChange = (selectedValue: string) => {
    const selectedItem = inventoryItems.find(item => item.product_name === selectedValue);
    console.log('Selected item:', selectedItem);
    onChange(selectedValue, selectedItem?.selling_price);
  };

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading inventory..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Error loading inventory" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-white border border-gray-200 shadow-lg z-50 max-h-60 overflow-y-auto">
        {inventoryItems && inventoryItems.length > 0 ? (
          inventoryItems.map(item => (
            <SelectItem key={item.id} value={item.product_name} className="hover:bg-gray-100">
              <div className="flex justify-between items-center w-full">
                <span className="font-medium">{item.product_name}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  ₹{item.selling_price} (Stock: {item.stock_quantity})
                </span>
              </div>
            </SelectItem>
          ))
        ) : (
          <SelectItem value="no-items" disabled className="text-gray-500">
            No inventory items available. Please add items to inventory first.
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default InventoryItemSelector;
