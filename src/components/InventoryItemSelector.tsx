
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

  // Find the selected item first
  const selectedItem = inventoryItems.find(item => item.product_name === value);

  console.log('InventoryItemSelector - Items:', inventoryItems?.length, 'items');
  console.log('InventoryItemSelector - Loading:', isLoading);
  console.log('InventoryItemSelector - Error:', error);
  console.log('InventoryItemSelector - Current value:', JSON.stringify(value));
  console.log('InventoryItemSelector - Selected item found:', !!selectedItem);

  const handleValueChange = (selectedValue: string) => {
    try {
      console.log('InventoryItemSelector - Value changing to:', selectedValue);
      const selectedItem = inventoryItems.find(item => item.product_name === selectedValue);
      console.log('InventoryItemSelector - Selected item:', selectedItem);
      
      // Validate that we have required data
      if (!selectedValue || selectedValue.trim() === '') {
        console.warn('InventoryItemSelector - Empty value selected');
        return;
      }
      
      if (selectedValue === 'no-items') {
        console.warn('InventoryItemSelector - "no-items" placeholder selected');
        return;
      }
      
      onChange(selectedValue, selectedItem?.selling_price);
    } catch (error) {
      console.error('InventoryItemSelector - Error in handleValueChange:', error);
    }
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
    <Select value={value || undefined} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-white border border-gray-200 shadow-lg z-50 max-h-60 overflow-y-auto">
        {inventoryItems && inventoryItems.length > 0 ? (
          inventoryItems.map(item => (
            <SelectItem key={item.id} value={item.product_name} className="hover:bg-gray-100">
              <div className="flex justify-between items-center w-full">
                <span>{item.product_name}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  ₹{item.selling_price} (Stock: {item.stock_quantity})
                </span>
              </div>
            </SelectItem>
          ))
        ) : (
          <SelectItem value="no-items" disabled>
            No inventory items available. Please add items to inventory first.
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default InventoryItemSelector;
