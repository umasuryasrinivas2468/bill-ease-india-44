import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Download, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { downloadTemplateCSV, ModuleKey, getAllTemplateHeaders } from '@/utils/csvTemplates';
import { validateRows, ValidationError } from '@/utils/importValidator';
import ImportPreview from '@/components/ImportPreview';
import * as XLSX from 'xlsx';

const modules: { key: ModuleKey; label: string; description: string }[] = [
  { key: 'ledgers', label: 'Ledgers', description: 'Chart of accounts and opening balances' },
  { key: 'clients', label: 'Clients', description: 'Customer information and contacts' },
  { key: 'vendors', label: 'Vendors', description: 'Supplier details and payment info' },
  { key: 'invoices', label: 'Invoices', description: 'Sales invoices with line items' },
  { key: 'quotations', label: 'Quotations', description: 'Quotations and offers' },
];

interface ImportState {
  selectedModule: ModuleKey;
  validRows: any[];
  invalidRows: Array<{ row: any; errors: ValidationError[] }>;
  isProcessing: boolean;
  previewMode: boolean;
}

const ImportDataPage: React.FC = () => {
  const { toast } = useToast();
  const [state, setState] = useState<ImportState>({
    selectedModule: 'clients',
    validRows: [],
    invalidRows: [],
    isProcessing: false,
    previewMode: false,
  });

  const handleDownloadTemplate = (moduleKey: ModuleKey) => {
    try {
      downloadTemplateCSV(moduleKey);
      toast({
        title: 'Template Downloaded',
        description: `${moduleKey} template ready to fill.`,
      });
    } catch (err) {
      console.error('Download error:', err);
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

      // Parse with default values for empty cells
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', blankrows: false });

      if (rows.length === 0) {
        toast({
          title: 'Empty File',
          description: 'No data rows found in the file',
          variant: 'destructive',
        });
        setState((s) => ({ ...s, isProcessing: false }));
        return;
      }

      // Normalize column names to template headers (case-insensitive)
      const allHeaders = getAllTemplateHeaders(state.selectedModule);
      const normalized = rows.map((row) => {
        const normalized: any = {};
        allHeaders.forEach((header) => {
          const key = Object.keys(row).find((k) => k.toLowerCase() === header.toLowerCase());
          normalized[header] = key ? row[key] : '';
        });
        return normalized;
      });

      // Validate
      const { valid, invalid } = validateRows(state.selectedModule, normalized);

      setState((s) => ({
        ...s,
        validRows: valid,
        invalidRows: invalid,
        previewMode: true,
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

    // Build CSV: include original row columns + errors column
    const errorRow = state.invalidRows[0];
    const rowKeys = Object.keys(errorRow.row);
    const headers = [...rowKeys, 'errors'];

    const lines: string[] = [headers.map((h) => `"${h}"`).join(',')];

    state.invalidRows.forEach((item) => {
      const values = rowKeys.map((k) => `"${String(item.row[k] ?? '').replace(/"/g, '""')}"`);
      const errorMsg = item.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');
      values.push(`"${errorMsg}"`);
      lines.push(values.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.selectedModule}_import_errors_${new Date().toISOString().split('T')[0]}.csv`;
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
        description: 'Fix validation errors and try again',
        variant: 'destructive',
      });
      return;
    }

    setState((s) => ({ ...s, isProcessing: true }));

    try {
      // Mock import: in production, POST to your API endpoint
      console.log(`[ImportData] Importing ${state.validRows.length} rows for ${state.selectedModule}`, {
        rows: state.validRows.slice(0, 3),
      });

      // TODO: Call actual import endpoint
      // const response = await fetch(`/api/import/${state.selectedModule}`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ rows: state.validRows }),
      // });

      toast({
        title: 'Import Complete',
        description: `${state.validRows.length} records imported successfully.`,
      });

      // Reset
      setState({
        selectedModule: state.selectedModule,
        validRows: [],
        invalidRows: [],
        isProcessing: false,
        previewMode: false,
      });
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
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Import & Template Download</h1>
          <p className="text-muted-foreground">Bulk import data from CSV/XLSX files using templates</p>
        </div>
      </div>

      {!state.previewMode ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Download Template</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {modules.map((mod) => (
                  <Button
                    key={mod.key}
                    variant="outline"
                    className="flex-col h-auto py-3"
                    onClick={() => {
                      setState((s) => ({ ...s, selectedModule: mod.key }));
                      handleDownloadTemplate(mod.key);
                    }}
                  >
                    <Download className="h-4 w-4 mb-1" />
                    <span className="text-xs font-semibold">{mod.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2: Fill Template & Upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Select Module:</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {modules.map((mod) => (
                    <button
                      key={mod.key}
                      onClick={() => setState((s) => ({ ...s, selectedModule: mod.key }))}
                      className={`text-left p-3 rounded border ${
                        state.selectedModule === mod.key
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-semibold text-sm">{mod.label}</div>
                      <div className="text-xs text-muted-foreground">{mod.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="file-upload" className="block text-sm font-medium">
                  Upload CSV or XLSX:
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={state.isProcessing}
                  className="block w-full text-sm border rounded px-3 py-2 cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Use the downloaded template for best results. System will validate and show a preview.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Review & Confirm</CardTitle>
            </CardHeader>
            <CardContent>
              <ImportPreview
                validCount={state.validRows.length}
                invalidCount={state.invalidRows.length}
                validRows={state.validRows}
                invalidRows={state.invalidRows}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 4: Import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleConfirmImport}
                  disabled={state.isProcessing || state.validRows.length === 0}
                  size="lg"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import {state.validRows.length} Valid Rows
                </Button>

                {state.invalidRows.length > 0 && (
                  <Button onClick={downloadErrorCSV} variant="outline" size="lg">
                    <Download className="h-4 w-4 mr-2" />
                    Download Error CSV
                  </Button>
                )}

                <Button
                  onClick={() => {
                    setState({
                      selectedModule: state.selectedModule,
                      validRows: [],
                      invalidRows: [],
                      isProcessing: false,
                      previewMode: false,
                    });
                  }}
                  variant="ghost"
                  size="lg"
                >
                  Start Over
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ImportDataPage;
