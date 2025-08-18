
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';

interface InvoiceItemSelectorProps {
  value: string;
  onChange: (value: string, price?: number) => void;
  placeholder?: string;
}

const InvoiceItemSelector: React.FC<InvoiceItemSelectorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Select from inventory" 
}) => {
  const { data: inventoryItems = [] } = useInventory();

  const handleValueChange = (selectedValue: string) => {
    const selectedItem = inventoryItems.find(item => item.product_name === selectedValue);
    onChange(selectedValue, selectedItem?.selling_price);
  };

  return (
    <Select value={value || undefined} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
        {inventoryItems.map(item => (
          <SelectItem 
            key={item.id} 
            value={item.product_name} 
            className="hover:bg-gray-100 cursor-pointer"
          >
            {`${item.product_name} — ₹${item.selling_price} (Stock: ${item.stock_quantity})`}
          </SelectItem>
        ))}
        {inventoryItems.length === 0 && (
          <SelectItem value="no-items" disabled>
            No inventory items available
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default InvoiceItemSelector;
