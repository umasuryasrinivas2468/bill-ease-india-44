import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { TaxAnalysisExportService } from '@/services/taxAnalysisExportService';
import { useToast } from '@/hooks/use-toast';
import type { AITaxAnalysisResult, ExportOptions } from '@/types/aiTaxAdvisor';

interface ExportAnalysisDialogProps {
  analysis: AITaxAnalysisResult;
  trigger?: React.ReactNode;
}

export const ExportAnalysisDialog: React.FC<ExportAnalysisDialogProps> = ({
  analysis,
  trigger
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [exportSections, setExportSections] = useState<ExportOptions['sections']>({
    summary: true,
    deductions: true,
    suggestions: true,
    tax_calculation: true,
    compliance_notes: true,
  });

  const handleSectionChange = (section: keyof ExportOptions['sections']) => {
    setExportSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleExport = async () => {
    if (!analysis) return;

    setIsExporting(true);

    try {
      const exportOptions: ExportOptions = {
        format: exportFormat,
        sections: exportSections
      };

      if (exportFormat === 'pdf') {
        await TaxAnalysisExportService.exportToPDF(analysis, exportOptions);
      } else {
        await TaxAnalysisExportService.exportToExcel(analysis, exportOptions);
      }

      toast({
        title: "Export Successful",
        description: `Tax analysis has been exported as ${exportFormat.toUpperCase()}.`,
      });

      setIsOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export the tax analysis. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const allSectionsSelected = Object.values(exportSections).every(Boolean);
  const noSectionsSelected = Object.values(exportSections).every(value => !value);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Analysis
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Tax Analysis
          </DialogTitle>
          <DialogDescription>
            Choose the format and sections to include in your tax analysis export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Format */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Export Format</Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(value: 'pdf' | 'excel') => setExportFormat(value)}
              className="grid grid-cols-2 gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label
                  htmlFor="pdf"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  PDF Document
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="excel" id="excel" />
                <Label
                  htmlFor="excel"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel Spreadsheet
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Sections to Include */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Sections to Include</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportSections({
                  summary: !allSectionsSelected,
                  deductions: !allSectionsSelected,
                  suggestions: !allSectionsSelected,
                  tax_calculation: !allSectionsSelected,
                  compliance_notes: !allSectionsSelected,
                })}
              >
                {allSectionsSelected ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="summary"
                  checked={exportSections.summary}
                  onCheckedChange={() => handleSectionChange('summary')}
                />
                <Label htmlFor="summary" className="text-sm cursor-pointer">
                  Financial Summary
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="deductions"
                  checked={exportSections.deductions}
                  onCheckedChange={() => handleSectionChange('deductions')}
                />
                <Label htmlFor="deductions" className="text-sm cursor-pointer">
                  Eligible Tax Deductions
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="suggestions"
                  checked={exportSections.suggestions}
                  onCheckedChange={() => handleSectionChange('suggestions')}
                />
                <Label htmlFor="suggestions" className="text-sm cursor-pointer">
                  Tax Optimization Suggestions
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="tax_calculation"
                  checked={exportSections.tax_calculation}
                  onCheckedChange={() => handleSectionChange('tax_calculation')}
                />
                <Label htmlFor="tax_calculation" className="text-sm cursor-pointer">
                  Tax Calculation Details
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="compliance_notes"
                  checked={exportSections.compliance_notes}
                  onCheckedChange={() => handleSectionChange('compliance_notes')}
                />
                <Label htmlFor="compliance_notes" className="text-sm cursor-pointer">
                  Compliance Notes & Disclaimer
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Export Actions */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || noSectionsSelected}
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {exportFormat.toUpperCase()}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};