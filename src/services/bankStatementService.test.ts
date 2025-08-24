import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BankStatementService } from './bankStatementService';
import type { 
  BankStatementImportData, 
  CreateJournalFromBankStatementData,
  BankStatement,
  ReconciliationReport 
} from '@/types/bankStatement';

// Mock supabase
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockInsertedStatements, error: null }))
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: mockJournals, error: null }))
        })),
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: mockBankStatements, error: null }))
        }))
      })),
      order: vi.fn(() => Promise.resolve({ data: mockBankStatements, error: null }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    }))
  })),
  rpc: vi.fn(() => Promise.resolve({ data: [{ matched_count: 2, partially_matched_count: 1 }], error: null }))
};

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase
}));

// Mock data - minimal test data
const mockInsertedStatements = [
  {
    id: '1',
    user_id: 'test-user',
    transaction_id: 'TEST-001',
    transaction_date: '2024-01-01',
    description: 'Test transaction',
    debit: 0,
    credit: 100,
    balance: 100,
    status: 'unmatched'
  }
];

const mockBankStatements: BankStatement[] = [
  {
    id: '1',
    user_id: 'test-user',
    transaction_id: 'TEST-001',
    transaction_date: '2024-01-01',
    description: 'Test transaction',
    debit: 0,
    credit: 100,
    balance: 100,
    status: 'unmatched'
  }
];

const mockJournals = [
  {
    id: 'test-journal-1',
    journal_number: 'JE001',
    user_id: 'test-user'
  }
];

describe('BankStatementService', () => {
  const mockUserId = 'user-123';
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('importBankStatements', () => {
    const mockFileName = 'test-statements.csv';

    it('should import valid bank statements successfully', async () => {
      const statements: BankStatementImportData[] = [
        {
          date: '2024-01-15',
          description: 'Payment received from client',
          debit: '0',
          credit: '1000',
          balance: '5000',
          transactionId: 'TXN-001'
        },
        {
          date: '2024-01-16',
          description: 'Office rent payment',
          debit: '2000',
          credit: '0',
          balance: '3000',
          transactionId: 'TXN-002'
        }
      ];

      const result = await BankStatementService.importBankStatements(
        mockUserId,
        statements,
        mockFileName
      );

      expect(result.success).toBe(true);
      expect(result.imported_count).toBe(1);
      expect(result.error_count).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockSupabase.from).toHaveBeenCalledWith('bank_statements');
    });

    it('should handle missing required fields', async () => {
      const statements: BankStatementImportData[] = [
        {
          date: '',
          description: 'Payment received',
          debit: '1000',
          credit: '0'
        },
        {
          date: '2024-01-16',
          description: '',
          debit: '2000',
          credit: '0'
        }
      ];

      const result = await BankStatementService.importBankStatements(
        mockUserId,
        statements,
        mockFileName
      );

      expect(result.success).toBe(false);
      expect(result.error_count).toBe(2);
      expect(result.errors).toContain('Row 1: Missing required fields (date or description)');
      expect(result.errors).toContain('Row 2: Missing required fields (date or description)');
    });

    it('should handle duplicate transactions gracefully', async () => {
      // Mock unique constraint violation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ 
            data: null, 
            error: { code: '23505', message: 'duplicate key value violates unique constraint' }
          }))
        }))
      });

      const statements: BankStatementImportData[] = [
        {
          date: '2024-01-15',
          description: 'Duplicate transaction',
          debit: '1000',
          credit: '0'
        }
      ];

      const result = await BankStatementService.importBankStatements(
        mockUserId,
        statements,
        mockFileName
      );

      expect(result.success).toBe(true);
      expect(result.skipped_count).toBe(1);
      expect(result.errors).toContain('Some transactions already exist and were skipped');
    });

    it('should handle empty import data', async () => {
      const statements: BankStatementImportData[] = [];

      const result = await BankStatementService.importBankStatements(
        mockUserId,
        statements,
        mockFileName
      );

      expect(result.success).toBe(false);
      expect(result.imported_count).toBe(0);
      expect(result.errors).toContain('No valid bank statements to import');
    });

    it('should generate transaction IDs when not provided', async () => {
      const statements: BankStatementImportData[] = [
        {
          date: '2024-01-15',
          description: 'Payment without ID',
          debit: '0',
          credit: '1000'
        }
      ];

      await BankStatementService.importBankStatements(
        mockUserId,
        statements,
        mockFileName
      );

      const insertCall = mockSupabase.from().insert.mock.calls[0][0];
      expect(insertCall[0].transaction_id).toBe('2024-01-15-1-1000');
    });
  });

  describe('getBankStatements', () => {
    it('should fetch all bank statements for a user', async () => {
      const statements = await BankStatementService.getBankStatements(mockUserId);

      expect(statements).toEqual(mockBankStatements);
      expect(mockSupabase.from).toHaveBeenCalledWith('bank_statements');
    });

    it('should filter by status when provided', async () => {
      const mockFilteredQuery = {
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [mockBankStatements[0]], error: null }))
        }))
      };

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => mockFilteredQuery),
            eq: vi.fn(() => mockFilteredQuery)
          }))
        }))
      });

      const statements = await BankStatementService.getBankStatements(mockUserId, 'unmatched');

      expect(statements).toHaveLength(1);
      expect(statements[0].status).toBe('unmatched');
    });

    it('should throw error when database query fails', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ 
              data: null, 
              error: { message: 'Database connection failed' }
            }))
          }))
        }))
      });

      await expect(
        BankStatementService.getBankStatements(mockUserId)
      ).rejects.toThrow('Failed to fetch bank statements: Database connection failed');
    });
  });

  describe('autoMatchBankStatements', () => {
    it('should perform auto-matching and return results', async () => {
      const result = await BankStatementService.autoMatchBankStatements(mockUserId);

      expect(result.matched_count).toBe(2);
      expect(result.partially_matched_count).toBe(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('auto_match_bank_statements', {
        p_user_id: mockUserId
      });
    });

    it('should handle RPC function errors', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC function failed' }
      });

      await expect(
        BankStatementService.autoMatchBankStatements(mockUserId)
      ).rejects.toThrow('Auto-matching failed: RPC function failed');
    });

    it('should return default values when no data returned', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: null
      });

      const result = await BankStatementService.autoMatchBankStatements(mockUserId);

      expect(result.matched_count).toBe(0);
      expect(result.partially_matched_count).toBe(0);
    });
  });

  describe('manualMatchBankStatement', () => {
    const bankStatementId = 'stmt-1';
    const journalId = 'journal-1';

    it('should create manual match successfully', async () => {
      await expect(
        BankStatementService.manualMatchBankStatement(mockUserId, bankStatementId, journalId)
      ).resolves.not.toThrow();

      expect(mockSupabase.from).toHaveBeenCalledWith('bank_statement_reconciliation');
      expect(mockSupabase.from).toHaveBeenCalledWith('bank_statements');
    });

    it('should handle reconciliation creation errors', async () => {
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => Promise.resolve({ 
          error: { message: 'Reconciliation creation failed' }
        }))
      });

      await expect(
        BankStatementService.manualMatchBankStatement(mockUserId, bankStatementId, journalId)
      ).rejects.toThrow('Failed to create reconciliation: Reconciliation creation failed');
    });
  });

  describe('createJournalFromBankStatement', () => {
    const mockJournalData: CreateJournalFromBankStatementData = {
      bank_statement_id: 'stmt-1',
      journal_date: '2024-01-15',
      narration: 'Payment received from client',
      account_id: 'acc-1',
      amount: 1000,
      is_debit: false,
      contra_account_id: 'acc-2'
    };

    beforeEach(() => {
      // Reset mocks for journal creation tests
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'journals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [{ journal_number: 'JE005' }], error: null }))
                }))
              }))
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ 
                  data: { id: 'new-journal-id' }, 
                  error: null 
                }))
              }))
            }))
          };
        }
        if (table === 'journal_lines') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null }))
          };
        }
        if (table === 'journal_approval_workflow') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null }))
          };
        }
        return {
          insert: vi.fn(() => Promise.resolve({ error: null }))
        };
      });
    });

    it('should create journal from bank statement successfully', async () => {
      const journalId = await BankStatementService.createJournalFromBankStatement(
        mockUserId,
        mockJournalData
      );

      expect(journalId).toBe('new-journal-id');
      expect(mockSupabase.from).toHaveBeenCalledWith('journals');
      expect(mockSupabase.from).toHaveBeenCalledWith('journal_lines');
      expect(mockSupabase.from).toHaveBeenCalledWith('journal_approval_workflow');
    });

    it('should generate correct journal number sequence', async () => {
      await BankStatementService.createJournalFromBankStatement(
        mockUserId,
        mockJournalData
      );

      const insertCall = mockSupabase.from().insert.mock.calls.find(
        call => call[0].journal_number
      );
      expect(insertCall[0].journal_number).toBe('JE006');
    });

    it('should handle first journal creation (no existing journals)', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'journals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
              }))
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ 
                  data: { id: 'first-journal-id' }, 
                  error: null 
                }))
              }))
            }))
          };
        }
        return {
          insert: vi.fn(() => Promise.resolve({ error: null }))
        };
      });

      await BankStatementService.createJournalFromBankStatement(
        mockUserId,
        mockJournalData
      );

      const insertCall = mockSupabase.from().insert.mock.calls.find(
        call => call[0].journal_number
      );
      expect(insertCall[0].journal_number).toBe('JE001');
    });

    it('should rollback journal creation on journal lines error', async () => {
      const mockDelete = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }));

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'journals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [{ journal_number: 'JE005' }], error: null }))
                }))
              }))
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ 
                  data: { id: 'new-journal-id' }, 
                  error: null 
                }))
              }))
            })),
            delete: mockDelete
          };
        }
        if (table === 'journal_lines') {
          return {
            insert: vi.fn(() => Promise.resolve({ 
              error: { message: 'Journal lines creation failed' }
            }))
          };
        }
        return {
          insert: vi.fn(() => Promise.resolve({ error: null }))
        };
      });

      await expect(
        BankStatementService.createJournalFromBankStatement(mockUserId, mockJournalData)
      ).rejects.toThrow('Failed to create journal lines: Journal lines creation failed');

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('getReconciliationReport', () => {
    beforeEach(() => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'bank_statements') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [
                  { status: 'matched' },
                  { status: 'matched' },
                  { status: 'unmatched' },
                  { status: 'partially_matched' }
                ],
                error: null
              }))
            }))
          };
        }
        if (table === 'journals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: new Array(10).fill({ id: 'journal' }),
                error: null
              }))
            }))
          };
        }
        return {};
      });
    });

    it('should generate reconciliation report correctly', async () => {
      const report = await BankStatementService.getReconciliationReport(mockUserId);

      expect(report.total_bank_statements).toBe(4);
      expect(report.total_journals).toBe(10);
      expect(report.matched_count).toBe(2);
      expect(report.unmatched_count).toBe(1);
      expect(report.partially_matched_count).toBe(1);
      expect(report.reconciliation_percentage).toBe(75); // (2 + 1) / 4 * 100 = 75%
    });

    it('should handle empty data gracefully', async () => {
      mockSupabase.from.mockImplementation((table) => {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [],
              error: null
            }))
          }))
        };
      });

      const report = await BankStatementService.getReconciliationReport(mockUserId);

      expect(report.total_bank_statements).toBe(0);
      expect(report.total_journals).toBe(0);
      expect(report.matched_count).toBe(0);
      expect(report.unmatched_count).toBe(0);
      expect(report.partially_matched_count).toBe(0);
      expect(report.reconciliation_percentage).toBe(0);
    });
  });

  describe('parseBankStatementCSV', () => {
    it('should parse CSV with different formats successfully', async () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,Payment from client,0,1000,5000
2024-01-16,Office rent,2000,0,3000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0]).toEqual({
        date: '2024-01-15',
        description: 'Payment from client',
        debit: '0',
        credit: '1000',
        balance: '5000'
      });
      expect(statements[1]).toEqual({
        date: '2024-01-16',
        description: 'Office rent',
        debit: '2000',
        credit: '0',
        balance: '3000'
      });
    });

    it('should handle CSV with alternative column names', async () => {
      const csvContent = `Transaction Date,Narration,Withdrawal,Deposit,Running Balance
2024-01-15,Payment received,0,1000,5000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(1);
      expect(statements[0]).toEqual({
        date: '2024-01-15',
        description: 'Payment received',
        debit: '0',
        credit: '1000',
        balance: '5000'
      });
    });

    it('should handle CSV with transaction IDs', async () => {
      const csvContent = `Date,Description,Debit,Credit,Transaction ID
2024-01-15,Payment from client,0,1000,TXN001`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements[0].transactionId).toBe('TXN001');
    });

    it('should handle invalid CSV format', async () => {
      expect(() => {
        BankStatementService.parseBankStatementCSV('');
      }).toThrow('CSV file must contain at least a header and one data row');

      expect(() => {
        BankStatementService.parseBankStatementCSV('Invalid,Header\n');
      }).toThrow('CSV must contain Date and Description columns');
    });

    it('should skip incomplete rows gracefully', async () => {
      const csvContent = `Date,Description,Debit,Credit
2024-01-15,Complete row,0,1000
2024-01-16,Incomplete
2024-01-17,Another complete row,500,0`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].description).toBe('Complete row');
      expect(statements[1].description).toBe('Another complete row');
    });
  });
});