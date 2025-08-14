
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
  const { data: inventoryItems = [] } = useInventory();

  const handleValueChange = (selectedValue: string) => {
    const selectedItem = inventoryItems.find(item => item.product_name === selectedValue);
    onChange(selectedValue, selectedItem?.selling_price);
  };

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {inventoryItems.map(item => (
          <SelectItem key={item.id} value={item.product_name}>
            <div className="flex justify-between items-center w-full">
              <span>{item.product_name}</span>
              <span className="text-sm text-muted-foreground ml-2">
                ₹{item.selling_price} (Stock: {item.stock_quantity})
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default InventoryItemSelector;
