import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useInventory, InventoryItem } from '@/hooks/useInventory';

interface OrderItemSelectorProps {
  value: string;
  onSelect: (item: InventoryItem | null, productName: string) => void;
  showStock?: boolean;
  placeholder?: string;
}

const OrderItemSelector: React.FC<OrderItemSelectorProps> = ({
  value,
  onSelect,
  showStock = false,
  placeholder = 'Select product',
}) => {
  const { data: inventory, isLoading } = useInventory();

  const handleValueChange = (selectedValue: string) => {
    if (selectedValue === '__custom__') {
      onSelect(null, '');
      return;
    }

    const item = inventory?.find((i) => i.id === selectedValue);
    if (item) {
      onSelect(item, item.product_name);
    }
  };

  const selectedItem = inventory?.find((i) => i.product_name === value || i.id === value);

  return (
    <div className="space-y-1">
      <Select
        value={selectedItem?.id || ''}
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {inventory?.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <div className="flex items-center justify-between w-full gap-2">
                <span className="truncate">{item.product_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    ₹{item.selling_price}
                  </span>
                  {showStock && item.stock_quantity !== null && (
                    <Badge
                      variant={
                        item.stock_quantity <= (item.reorder_level || 0)
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      Stock: {item.stock_quantity}
                    </Badge>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
          {(!inventory || inventory.length === 0) && !isLoading && (
            <SelectItem value="__empty__" disabled>
              No inventory items found
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {!selectedItem && value && (
        <Input
          value={value}
          onChange={(e) => onSelect(null, e.target.value)}
          placeholder="Or type custom product name"
          className="mt-1"
        />
      )}
    </div>
  );
};

export default OrderItemSelector;
