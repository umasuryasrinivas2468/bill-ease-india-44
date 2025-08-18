
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';

interface QuotationItemSelectorProps {
  value: string;
  onChange: (value: string, price?: number) => void;
  placeholder?: string;
  disabled?: boolean;
}

const QuotationItemSelector: React.FC<QuotationItemSelectorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Select from inventory",
  disabled = false
}) => {
  const { data: inventoryItems = [], isLoading, error } = useInventory();

  const handleValueChange = (selectedValue: string) => {
    try {
      // Don't allow selection of placeholder items
      if (selectedValue === 'no-items' || selectedValue === 'loading') {
        return;
      }
      
      const selectedItem = inventoryItems.find(item => item.product_name === selectedValue);
      
      if (selectedItem) {
        onChange(selectedValue, selectedItem.selling_price);
      } else {
        // Handle manual entry case
        onChange(selectedValue);
      }
    } catch (error) {
      console.error('QuotationItemSelector - Error in handleValueChange:', error);
    }
  };

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Loading inventory..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error) {
    return (
      <Select disabled>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Error loading inventory" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select 
      value={value || undefined} 
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-white border border-gray-200 shadow-lg z-50 max-h-60 overflow-y-auto">
        {inventoryItems && inventoryItems.length > 0 ? (
          inventoryItems.map(item => (
            <SelectItem 
              key={item.id} 
              value={item.product_name} 
              className="hover:bg-gray-100 cursor-pointer"
            >
              {`${item.product_name} — ₹${item.selling_price} (Stock: ${item.stock_quantity})`}
            </SelectItem>
          ))
        ) : (
          <SelectItem value="no-items" disabled className="text-muted-foreground">
            No inventory items available. Please add items to inventory first.
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default QuotationItemSelector;
