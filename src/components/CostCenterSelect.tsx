import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCostCenters } from '@/hooks/useCostCenters';

interface Props {
  value?: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowNone?: boolean;
}

const NONE = '__none__';

const CostCenterSelect: React.FC<Props> = ({
  value, onChange, placeholder = 'Select cost center', disabled, allowNone = true,
}) => {
  const { data: centers = [], isLoading } = useCostCenters({ activeOnly: true });

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>— None —</SelectItem>}
        {centers.map(cc => (
          <SelectItem key={cc.id} value={cc.id}>
            {cc.code} · {cc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CostCenterSelect;
