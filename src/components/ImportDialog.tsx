import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { downloadTemplateCSV, ModuleKey, getAllTemplateHeaders } from '@/utils/csvTemplates';
import { validateRows } from '@/utils/importValidator';
import ImportPreview from './ImportPreview';
import * as XLSX from 'xlsx';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleKey: ModuleKey;
  onConfirmImport: (validRows: any[]) => Promise<void>;
}

interface DialogState {
  step: 'select' | 'preview';
  validRows: any[];
  invalidRows: any[];
  isProcessing: boolean;
}

const ImportDialog: React.FC<Props> = ({ open, onOpenChange, moduleKey, onConfirmImport }) => {
  const { toast } = useToast();
  const [state, setState] = useState<DialogState>({
    step: 'select',
    validRows: [],
    invalidRows: [],
    isProcessing: false,
  });

  const handleDownloadTemplate = () => {
    try {
      downloadTemplateCSV(moduleKey);
      toast({
        title: 'Template Downloaded',
        description: `${moduleKey} template ready to fill.`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to download template',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setState((s) => ({ ...s, isProcessing: true }));

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        throw new Error('No worksheet found');
      }

      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', blankrows: false });

      if (rows.length === 0) {
        throw new Error('No data rows found');
      }

      const allHeaders = getAllTemplateHeaders(moduleKey);
      const normalized = rows.map((row) => {
        const out: any = {};
        allHeaders.forEach((h) => {
          const key = Object.keys(row).find((k) => k.toLowerCase() === h.toLowerCase());
          out[h] = key ? row[key] : '';
        });
        return out;
      });

      const { valid, invalid } = validateRows(moduleKey, normalized);

      setState((s) => ({
        ...s,
        step: 'preview',
        validRows: valid,
        invalidRows: invalid,
        isProcessing: false,
      }));

      toast({
        title: 'File Parsed',
        description: `${valid.length} valid, ${invalid.length} invalid rows`,
      });
    } catch (err) {
      console.error('Upload error:', err);
      toast({
        title: 'Parse Error',
        description: String(err),
        variant: 'destructive',
      });
      setState((s) => ({ ...s, isProcessing: false }));
    }
  };

  const downloadErrorCSV = () => {
    if (state.invalidRows.length === 0) return;

    const errorRow = state.invalidRows[0];
    const rowKeys = Object.keys(errorRow.row);
    const headers = [...rowKeys, 'errors'];

    const lines: string[] = [headers.map((h) => `"${h}"`).join(',')];

    state.invalidRows.forEach((item) => {
      const values = rowKeys.map((k) => `"${String(item.row[k] ?? '').replace(/"/g, '""')}"`);
      const errorMsg = item.errors.map((e: any) => `${e.field}: ${e.reason}`).join(' | ');
      values.push(`"${errorMsg}"`);
      lines.push(values.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleKey}_import_errors_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast({
      title: 'Error CSV Downloaded',
      description: `${state.invalidRows.length} rows with errors`,
    });
  };

  const handleConfirmImport = async () => {
    if (state.validRows.length === 0) {
      toast({
        title: 'No Valid Rows',
        description: 'Fix errors and try again',
        variant: 'destructive',
      });
      return;
    }

    setState((s) => ({ ...s, isProcessing: true }));

    try {
      await onConfirmImport(state.validRows);

      toast({
        title: 'Import Complete',
        description: `${state.validRows.length} records imported.`,
      });

      // Reset and close
      setState({
        step: 'select',
        validRows: [],
        invalidRows: [],
        isProcessing: false,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setState((s) => ({ ...s, isProcessing: false }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1)}</DialogTitle>
          <DialogDescription>
            Download template, fill with data, and upload to import records
          </DialogDescription>
        </DialogHeader>

        {state.step === 'select' ? (
          <div className="space-y-4 py-4">
            <div>
              <Button onClick={handleDownloadTemplate} variant="outline" className="w-full justify-start">
                <Download className="h-4 w-4 mr-2" />
                Download {moduleKey} Template
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                CSV file with required and optional fields
              </p>
            </div>

            <div>
              <label htmlFor="import-file" className="block text-sm font-medium mb-2">
                Upload CSV or XLSX:
              </label>
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={state.isProcessing}
                className="block w-full text-sm border rounded px-3 py-2 cursor-pointer"
              />
              <p className="text-xs text-muted-foreground mt-2">
                System will validate headers and data before preview
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
            <ImportPreview
              validCount={state.validRows.length}
              invalidCount={state.invalidRows.length}
              validRows={state.validRows}
              invalidRows={state.invalidRows}
            />
          </div>
        )}

        <DialogFooter>
          {state.step === 'select' ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  setState({
                    step: 'select',
                    validRows: [],
                    invalidRows: [],
                    isProcessing: false,
                  })
                }
              >
                Back
              </Button>
              {state.invalidRows.length > 0 && (
                <Button variant="outline" onClick={downloadErrorCSV}>
                  Download Errors
                </Button>
              )}
              <Button onClick={handleConfirmImport} disabled={state.isProcessing || state.validRows.length === 0}>
                <Upload className="h-4 w-4 mr-2" />
                Import {state.validRows.length} Rows
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportDialog;
