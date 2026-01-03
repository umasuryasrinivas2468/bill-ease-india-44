import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export type InvoiceTemplate = 'standard' | 'professional' | 'detailed';

interface InvoiceTemplateSelectorProps {
  value: InvoiceTemplate;
  onChange: (value: InvoiceTemplate) => void;
}

const InvoiceTemplateSelector: React.FC<InvoiceTemplateSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="template-select" className="text-sm font-medium">Template:</Label>
      <Select value={value} onValueChange={(val) => onChange(val as InvoiceTemplate)}>
        <SelectTrigger id="template-select" className="w-[180px]">
          <SelectValue placeholder="Select template" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="standard">Standard</SelectItem>
          <SelectItem value="professional">Professional (GST)</SelectItem>
          <SelectItem value="detailed">Detailed (HSN/SAC)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default InvoiceTemplateSelector;
