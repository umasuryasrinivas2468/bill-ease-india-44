import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  objectsToCSV,
  escapeCSVField,
  downloadCSV,
  generateFilename,
  exportQuotationsToCSV,
  exportJournalsToCSV,
  exportLedgersToCSV,
  exportAccountSummaryToCSV
} from './csvExport';

// Mock DOM methods
global.URL = {
  createObjectURL: vi.fn(() => 'blob:test-url'),
  revokeObjectURL: vi.fn(),
} as any;

describe('CSV Export Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any created DOM elements
    document.querySelectorAll('a[download]').forEach(link => link.remove());
  });

  describe('escapeCSVField', () => {
    it('should not escape simple fields', () => {
      expect(escapeCSVField('simple')).toBe('simple');
      expect(escapeCSVField('123')).toBe('123');
    });

    it('should escape fields with commas', () => {
      expect(escapeCSVField('value,with,commas')).toBe('"value,with,commas"');
    });

    it('should escape fields with quotes', () => {
      expect(escapeCSVField('value"with"quotes')).toBe('"value""with""quotes"');
    });

    it('should escape fields with newlines', () => {
      expect(escapeCSVField('value\nwith\nnewlines')).toBe('"value\nwith\nnewlines"');
    });

    it('should escape complex fields', () => {
      expect(escapeCSVField('complex,"field\nwith"everything')).toBe('"complex,""field\nwith""everything"');
    });
  });

  describe('objectsToCSV', () => {
    it('should convert array of objects to CSV', () => {
      const data = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'Los Angeles' }
      ];
      const csv = objectsToCSV(data);
      const expected = 'name,age,city\nJohn,30,New York\nJane,25,Los Angeles';
      expect(csv).toBe(expected);
    });

    it('should use custom headers', () => {
      const data = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'Los Angeles' }
      ];
      const headers = ['name', 'age'];
      const csv = objectsToCSV(data, headers);
      const expected = 'name,age\nJohn,30\nJane,25';
      expect(csv).toBe(expected);
    });

    it('should handle empty array', () => {
      expect(objectsToCSV([])).toBe('');
    });

    it('should handle missing properties', () => {
      const data = [
        { name: 'John', age: 30 },
        { name: 'Jane', city: 'Los Angeles' }
      ];
      const csv = objectsToCSV(data);
      const expected = 'name,age,city\nJohn,30,\nJane,,Los Angeles';
      expect(csv).toBe(expected);
    });

    it('should escape fields properly', () => {
      const data = [
        { name: 'John,Doe', description: 'Value with "quotes"' },
      ];
      const csv = objectsToCSV(data);
      const expected = 'name,description\n"John,Doe","Value with ""quotes"""';
      expect(csv).toBe(expected);
    });
  });

  describe('generateFilename', () => {
    it('should generate filename with timestamp by default', () => {
      const filename = generateFilename('test');
      expect(filename).toMatch(/^test_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should generate filename without timestamp when disabled', () => {
      const filename = generateFilename('test', false);
      expect(filename).toBe('test.csv');
    });
  });

  describe('downloadCSV', () => {
    it('should create and click download link', () => {
      const csvData = 'header1,header2\nvalue1,value2';
      const filename = 'test.csv';
      
      // Mock link click
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      downloadCSV(csvData, filename);

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();

      // Restore original createElement
      document.createElement = originalCreateElement;
    });
  });

  describe('exportQuotationsToCSV', () => {
    const mockQuotations = [
      {
        id: '1',
        quotation_number: 'QUOT-001',
        client_name: 'Test Client',
        client_email: 'test@example.com',
        client_phone: '+1234567890',
        client_address: '123 Test St',
        quotation_date: '2024-01-01',
        validity_period: 30,
        subtotal: 1000,
        discount: 50,
        tax_amount: 171,
        total_amount: 1121,
        status: 'draft',
        terms_conditions: 'Standard terms',
        created_at: '2024-01-01T10:00:00Z',
        items: [
          { name: 'Product 1', quantity: 2, price: 500 },
          { name: 'Product 2', quantity: 1, price: 100 }
        ]
      }
    ];

    it('should export quotations to CSV', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportQuotationsToCSV(mockQuotations);

      expect(result.recordCount).toBe(1);
      expect(result.filename).toMatch(/^quotations_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(mockClick).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });

    it('should handle empty quotations array', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportQuotationsToCSV([]);

      expect(result.recordCount).toBe(0);
      expect(mockClick).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });

    it('should use custom filename and options', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportQuotationsToCSV(mockQuotations, {
        filename: 'custom_quotes',
        includeTimestamp: false
      });

      expect(result.filename).toBe('custom_quotes.csv');

      document.createElement = originalCreateElement;
    });
  });

  describe('exportJournalsToCSV', () => {
    const mockJournals = [
      {
        id: '1',
        journal_date: '2024-01-01',
        journal_number: 'JE001',
        narration: 'Opening balance',
        status: 'posted',
        total_debit: 1000,
        total_credit: 1000,
        created_at: '2024-01-01T10:00:00Z'
      }
    ];

    const mockJournalLines = [
      {
        id: '1',
        journal_id: '1',
        account_code: '1000',
        account_name: 'Cash',
        debit: 1000,
        credit: 0,
        line_narration: 'Cash received'
      },
      {
        id: '2',
        journal_id: '1',
        account_code: '3000',
        account_name: 'Revenue',
        debit: 0,
        credit: 1000,
        line_narration: 'Revenue earned'
      }
    ];

    it('should export journals with lines to CSV', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportJournalsToCSV(mockJournals, mockJournalLines);

      expect(result.recordCount).toBe(2); // Two journal lines
      expect(result.filename).toMatch(/^journals_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(mockClick).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });

    it('should handle journal without lines', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportJournalsToCSV(mockJournals, []);

      expect(result.recordCount).toBe(1);
      expect(mockClick).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });
  });

  describe('exportLedgersToCSV', () => {
    const mockLedgerData = [
      {
        account_code: '1000',
        account_name: 'Cash',
        account_type: 'asset',
        transaction_date: '2024-01-01',
        transaction_type: 'debit',
        reference: 'JE001',
        debit: 1000,
        credit: 0,
        balance: 1000,
        narration: 'Opening balance'
      }
    ];

    it('should export ledger data to CSV', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportLedgersToCSV(mockLedgerData);

      expect(result.recordCount).toBe(1);
      expect(result.filename).toMatch(/^ledgers_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(mockClick).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });
  });

  describe('exportAccountSummaryToCSV', () => {
    const mockAccounts = [
      {
        account_code: '1000',
        account_name: 'Cash',
        account_type: 'asset',
        opening_balance: 0,
        current_balance: 1000,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T12:00:00Z'
      }
    ];

    it('should export account summary to CSV', () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          const link = originalCreateElement.call(document, tagName) as HTMLAnchorElement;
          link.click = mockClick;
          return link;
        }
        return originalCreateElement.call(document, tagName);
      });

      const result = exportAccountSummaryToCSV(mockAccounts);

      expect(result.recordCount).toBe(1);
      expect(result.filename).toMatch(/^accounts_summary_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(mockClick).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });
  });
});