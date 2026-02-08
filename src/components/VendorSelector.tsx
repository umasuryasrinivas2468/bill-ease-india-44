import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVendors, Vendor } from '@/hooks/useVendors';
import { Badge } from '@/components/ui/badge';

interface VendorSelectorProps {
  value: string;
  onValueChange: (vendorId: string, vendor: Vendor | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const VendorSelector: React.FC<VendorSelectorProps> = ({
  value,
  onValueChange,
  placeholder = 'Select vendor',
  disabled = false,
}) => {
  const { data: vendors, isLoading } = useVendors();

  const handleValueChange = (selectedValue: string) => {
    const vendor = vendors?.find((v) => v.id === selectedValue) || null;
    onValueChange(selectedValue, vendor);
  };

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={isLoading ? 'Loading vendors...' : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {vendors?.map((vendor) => (
          <SelectItem key={vendor.id} value={vendor.id}>
            <div className="flex items-center justify-between w-full gap-2">
              <span className="truncate">{vendor.name}</span>
              {vendor.tds_enabled && (
                <Badge variant="outline" className="text-xs">
                  TDS
                </Badge>
              )}
            </div>
          </SelectItem>
        ))}
        {(!vendors || vendors.length === 0) && !isLoading && (
          <SelectItem value="__empty__" disabled>
            No vendors found. Add vendors first.
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default VendorSelector;
