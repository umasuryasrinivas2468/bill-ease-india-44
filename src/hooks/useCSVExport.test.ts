import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCSVExport } from './useCSVExport';
import * as csvExportUtils from '@/utils/csvExport';

// Mock the CSV export utilities
vi.mock('@/utils/csvExport', () => ({
  exportQuotationsToCSV: vi.fn(),
  exportJournalsToCSV: vi.fn(),
  exportLedgersToCSV: vi.fn(),
  exportAccountSummaryToCSV: vi.fn(),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('useCSVExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => useCSVExport());

    expect(result.current.isExporting).toBe(false);
    expect(typeof result.current.exportData).toBe('function');
    expect(typeof result.current.exportQuotations).toBe('function');
    expect(typeof result.current.exportJournals).toBe('function');
    expect(typeof result.current.exportLedgers).toBe('function');
    expect(typeof result.current.exportAccounts).toBe('function');
  });

  describe('exportQuotations', () => {
    it('should successfully export quotations', async () => {
      const mockResult = { filename: 'test.csv', recordCount: 1 };
      vi.mocked(csvExportUtils.exportQuotationsToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const mockQuotations = [{ id: '1', quotation_number: 'QUOT-001' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportQuotations(mockQuotations);
      });

      expect(exportResult!).toBe(true);
      expect(result.current.isExporting).toBe(false);
      expect(csvExportUtils.exportQuotationsToCSV).toHaveBeenCalledWith(mockQuotations, undefined);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Successful",
        description: "1 records exported to test.csv",
      });
    });

    it('should handle empty quotations array', async () => {
      const { result } = renderHook(() => useCSVExport());

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportQuotations([]);
      });

      expect(exportResult!).toBe(false);
      expect(result.current.isExporting).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Failed",
        description: "No quotations available to export.",
        variant: "destructive",
      });
    });

    it('should handle export errors', async () => {
      vi.mocked(csvExportUtils.exportQuotationsToCSV).mockImplementation(() => {
        throw new Error('Export failed');
      });

      const { result } = renderHook(() => useCSVExport());
      const mockQuotations = [{ id: '1', quotation_number: 'QUOT-001' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportQuotations(mockQuotations);
      });

      expect(exportResult!).toBe(false);
      expect(result.current.isExporting).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Failed",
        description: "Failed to export quotations. Please try again.",
        variant: "destructive",
      });
    });
  });

  describe('exportJournals', () => {
    it('should successfully export journals', async () => {
      const mockResult = { filename: 'journals.csv', recordCount: 2 };
      vi.mocked(csvExportUtils.exportJournalsToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const mockJournals = [{ id: '1', journal_number: 'JE001' }];
      const mockJournalLines = [{ id: '1', journal_id: '1' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportJournals(mockJournals, mockJournalLines);
      });

      expect(exportResult!).toBe(true);
      expect(result.current.isExporting).toBe(false);
      expect(csvExportUtils.exportJournalsToCSV).toHaveBeenCalledWith(
        mockJournals, 
        mockJournalLines, 
        undefined
      );
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Successful",
        description: "2 records exported to journals.csv",
      });
    });

    it('should handle empty journals array', async () => {
      const { result } = renderHook(() => useCSVExport());

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportJournals([], []);
      });

      expect(exportResult!).toBe(false);
      expect(result.current.isExporting).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Failed",
        description: "No journals available to export.",
        variant: "destructive",
      });
    });

    it('should handle missing journal lines', async () => {
      const mockResult = { filename: 'journals.csv', recordCount: 1 };
      vi.mocked(csvExportUtils.exportJournalsToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const mockJournals = [{ id: '1', journal_number: 'JE001' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportJournals(mockJournals, null as any);
      });

      expect(exportResult!).toBe(true);
      expect(csvExportUtils.exportJournalsToCSV).toHaveBeenCalledWith(
        mockJournals, 
        [], 
        undefined
      );
    });
  });

  describe('exportLedgers', () => {
    it('should successfully export ledgers', async () => {
      const mockResult = { filename: 'ledgers.csv', recordCount: 3 };
      vi.mocked(csvExportUtils.exportLedgersToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const mockLedgerData = [{ account_code: '1000', account_name: 'Cash' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportLedgers(mockLedgerData);
      });

      expect(exportResult!).toBe(true);
      expect(result.current.isExporting).toBe(false);
      expect(csvExportUtils.exportLedgersToCSV).toHaveBeenCalledWith(mockLedgerData, undefined);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Successful",
        description: "3 records exported to ledgers.csv",
      });
    });

    it('should handle empty ledger data', async () => {
      const { result } = renderHook(() => useCSVExport());

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportLedgers([]);
      });

      expect(exportResult!).toBe(false);
      expect(result.current.isExporting).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Failed",
        description: "No ledger data available to export.",
        variant: "destructive",
      });
    });
  });

  describe('exportAccounts', () => {
    it('should successfully export accounts', async () => {
      const mockResult = { filename: 'accounts.csv', recordCount: 5 };
      vi.mocked(csvExportUtils.exportAccountSummaryToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const mockAccounts = [{ account_code: '1000', account_name: 'Cash' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportAccounts(mockAccounts);
      });

      expect(exportResult!).toBe(true);
      expect(result.current.isExporting).toBe(false);
      expect(csvExportUtils.exportAccountSummaryToCSV).toHaveBeenCalledWith(mockAccounts, undefined);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Successful",
        description: "5 records exported to accounts.csv",
      });
    });

    it('should handle empty accounts array', async () => {
      const { result } = renderHook(() => useCSVExport());

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportAccounts([]);
      });

      expect(exportResult!).toBe(false);
      expect(result.current.isExporting).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Failed",
        description: "No accounts available to export.",
        variant: "destructive",
      });
    });
  });

  describe('exportData', () => {
    it('should export quotations using generic exportData method', async () => {
      const mockResult = { filename: 'test.csv', recordCount: 1 };
      vi.mocked(csvExportUtils.exportQuotationsToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const mockQuotations = [{ id: '1', quotation_number: 'QUOT-001' }];

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportData('quotations', mockQuotations);
      });

      expect(exportResult!).toBe(true);
      expect(csvExportUtils.exportQuotationsToCSV).toHaveBeenCalledWith(mockQuotations, undefined);
    });

    it('should export journals using generic exportData method', async () => {
      const mockResult = { filename: 'journals.csv', recordCount: 2 };
      vi.mocked(csvExportUtils.exportJournalsToCSV).mockReturnValue(mockResult);

      const { result } = renderHook(() => useCSVExport());
      const data = {
        journals: [{ id: '1', journal_number: 'JE001' }],
        journalLines: [{ id: '1', journal_id: '1' }],
      };

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportData('journals', data);
      });

      expect(exportResult!).toBe(true);
      expect(csvExportUtils.exportJournalsToCSV).toHaveBeenCalledWith(
        data.journals,
        data.journalLines,
        undefined
      );
    });

    it('should handle unknown export type', async () => {
      const { result } = renderHook(() => useCSVExport());

      let exportResult: boolean;
      await act(async () => {
        exportResult = await result.current.exportData('unknown' as any, {});
      });

      expect(exportResult!).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Export Failed",
        description: "Unknown export type: unknown",
        variant: "destructive",
      });
    });
  });

  it('should handle isExporting state correctly during export', async () => {
    const mockResult = { filename: 'test.csv', recordCount: 1 };
    vi.mocked(csvExportUtils.exportQuotationsToCSV).mockImplementation(() => {
      // Simulate async operation
      return new Promise((resolve) => {
        setTimeout(() => resolve(mockResult), 100);
      });
    });

    const { result } = renderHook(() => useCSVExport());
    const mockQuotations = [{ id: '1', quotation_number: 'QUOT-001' }];

    expect(result.current.isExporting).toBe(false);

    act(() => {
      result.current.exportQuotations(mockQuotations);
    });

    expect(result.current.isExporting).toBe(true);

    // Wait for export to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(result.current.isExporting).toBe(false);
  });
});