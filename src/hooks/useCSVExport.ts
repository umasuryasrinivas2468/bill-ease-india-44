import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { 
  exportQuotationsToCSV,
  exportJournalsToCSV,
  exportLedgersToCSV,
  exportAccountSummaryToCSV,
  CSVExportOptions
} from '@/utils/csvExport';

export type ExportType = 'quotations' | 'journals' | 'ledgers' | 'accounts';

export interface UseCSVExportResult {
  isExporting: boolean;
  exportData: (type: ExportType, data: any, options?: CSVExportOptions) => Promise<boolean>;
  exportQuotations: (quotations: any[], options?: CSVExportOptions) => Promise<boolean>;
  exportJournals: (journals: any[], journalLines: any[], options?: CSVExportOptions) => Promise<boolean>;
  exportLedgers: (ledgerData: any[], options?: CSVExportOptions) => Promise<boolean>;
  exportAccounts: (accounts: any[], options?: CSVExportOptions) => Promise<boolean>;
}

export const useCSVExport = (): UseCSVExportResult => {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const showSuccessToast = (filename: string, recordCount: number) => {
    toast({
      title: "Export Successful",
      description: `${recordCount} records exported to ${filename}`,
    });
  };

  const showErrorToast = (error: string) => {
    toast({
      title: "Export Failed",
      description: error,
      variant: "destructive",
    });
  };

  const exportQuotations = async (quotations: any[], options?: CSVExportOptions): Promise<boolean> => {
    setIsExporting(true);
    try {
      if (!quotations || quotations.length === 0) {
        showErrorToast("No quotations available to export.");
        return false;
      }

      const result = exportQuotationsToCSV(quotations, options);
      showSuccessToast(result.filename, result.recordCount);
      return true;
    } catch (error) {
      console.error('Error exporting quotations:', error);
      showErrorToast("Failed to export quotations. Please try again.");
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  const exportJournals = async (
    journals: any[], 
    journalLines: any[], 
    options?: CSVExportOptions
  ): Promise<boolean> => {
    setIsExporting(true);
    try {
      if (!journals || journals.length === 0) {
        showErrorToast("No journals available to export.");
        return false;
      }

      const result = exportJournalsToCSV(journals, journalLines || [], options);
      showSuccessToast(result.filename, result.recordCount);
      return true;
    } catch (error) {
      console.error('Error exporting journals:', error);
      showErrorToast("Failed to export journals. Please try again.");
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  const exportLedgers = async (ledgerData: any[], options?: CSVExportOptions): Promise<boolean> => {
    setIsExporting(true);
    try {
      if (!ledgerData || ledgerData.length === 0) {
        showErrorToast("No ledger data available to export.");
        return false;
      }

      const result = exportLedgersToCSV(ledgerData, options);
      showSuccessToast(result.filename, result.recordCount);
      return true;
    } catch (error) {
      console.error('Error exporting ledgers:', error);
      showErrorToast("Failed to export ledgers. Please try again.");
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  const exportAccounts = async (accounts: any[], options?: CSVExportOptions): Promise<boolean> => {
    setIsExporting(true);
    try {
      if (!accounts || accounts.length === 0) {
        showErrorToast("No accounts available to export.");
        return false;
      }

      const result = exportAccountSummaryToCSV(accounts, options);
      showSuccessToast(result.filename, result.recordCount);
      return true;
    } catch (error) {
      console.error('Error exporting accounts:', error);
      showErrorToast("Failed to export accounts. Please try again.");
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  const exportData = async (
    type: ExportType, 
    data: any, 
    options?: CSVExportOptions
  ): Promise<boolean> => {
    switch (type) {
      case 'quotations':
        return await exportQuotations(data, options);
      case 'journals':
        return await exportJournals(data.journals, data.journalLines, options);
      case 'ledgers':
        return await exportLedgers(data, options);
      case 'accounts':
        return await exportAccounts(data, options);
      default:
        showErrorToast(`Unknown export type: ${type}`);
        return false;
    }
  };

  return {
    isExporting,
    exportData,
    exportQuotations,
    exportJournals,
    exportLedgers,
    exportAccounts,
  };
};