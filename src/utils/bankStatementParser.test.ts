import { describe, it, expect } from 'vitest';
import { BankStatementService } from '@/services/bankStatementService';

describe('Bank Statement CSV Parser', () => {
  describe('parseBankStatementCSV', () => {
    it('should parse standard CSV format correctly', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,Payment from ABC Corp,0,1000.50,5000.50
2024-01-16,Office rent payment,2000.00,0,3000.50
2024-01-17,Utility bill payment,500.25,0,2500.25`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(3);
      expect(statements[0]).toEqual({
        date: '2024-01-15',
        description: 'Payment from ABC Corp',
        debit: '0',
        credit: '1000.50',
        balance: '5000.50'
      });
      expect(statements[1]).toEqual({
        date: '2024-01-16',
        description: 'Office rent payment',
        debit: '2000.00',
        credit: '0',
        balance: '3000.50'
      });
    });

    it('should handle different column name variations', () => {
      const csvContent = `Transaction Date,Particular,Withdrawal,Deposit,Running Balance,Reference No
2024-01-15,Salary credit,0,50000,50000,REF001
2024-01-16,ATM withdrawal,5000,0,45000,REF002`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0]).toEqual({
        date: '2024-01-15',
        description: 'Salary credit',
        debit: '0',
        credit: '50000',
        balance: '50000',
        transactionId: 'REF001'
      });
    });

    it('should handle bank-specific CSV formats', () => {
      // SBI format
      const sbiCsv = `Txn Date,Description,Debit,Credit,Balance
15/01/2024,NEFT CR-HDFC-123456,0,25000,75000
16/01/2024,UPI-PHONEPE-987654,1500,0,73500`;

      const sbiStatements = BankStatementService.parseBankStatementCSV(sbiCsv);
      expect(sbiStatements).toHaveLength(2);

      // ICICI format
      const iciciCsv = `Date,Narration,Withdrawal Amount,Deposit Amount,Balance
2024-01-15,Salary Deposit,0,50000,125000
2024-01-16,EMI Deduction,15000,0,110000`;

      const iciciStatements = BankStatementService.parseBankStatementCSV(iciciCsv);
      expect(iciciStatements).toHaveLength(2);
    });

    it('should handle CSV with missing balance column', () => {
      const csvContent = `Date,Description,Debit,Credit
2024-01-15,Payment received,0,1000
2024-01-16,Office expenses,500,0`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].balance).toBeUndefined();
      expect(statements[1].balance).toBeUndefined();
    });

    it('should handle CSV with quoted descriptions containing commas', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,"Payment from ABC Corp, Mumbai Office",0,1000,5000
2024-01-16,"Rent payment, January 2024",2000,0,3000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].description).toBe('Payment from ABC Corp, Mumbai Office');
      expect(statements[1].description).toBe('Rent payment, January 2024');
    });

    it('should handle CSV with empty cells', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,Payment received,,1000,5000
2024-01-16,Office rent,2000,,3000
2024-01-17,Utility payment,500,0,`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(3);
      expect(statements[0].debit).toBe('');
      expect(statements[1].credit).toBe('');
      expect(statements[2].balance).toBe('');
    });

    it('should skip incomplete rows', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,Complete payment,0,1000,5000
2024-01-16,Incomplete
2024-01-17,Another payment,500,0,4500
Incomplete row`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].description).toBe('Complete payment');
      expect(statements[1].description).toBe('Another payment');
    });

    it('should handle CSV with BOM (Byte Order Mark)', () => {
      const csvWithBOM = '\uFEFFDate,Description,Debit,Credit,Balance\n2024-01-15,Test payment,0,1000,5000';

      const statements = BankStatementService.parseBankStatementCSV(csvWithBOM);

      expect(statements).toHaveLength(1);
      expect(statements[0].description).toBe('Test payment');
    });

    it('should handle large amounts with formatting', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,Large deposit,"0","1,50,000.75","5,00,000.75"
2024-01-16,Big payment,"75,000.25",0,"4,25,000.50"`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].credit).toBe('1,50,000.75');
      expect(statements[1].debit).toBe('75,000.25');
    });

    it('should handle different date formats', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
15-Jan-2024,Payment 1,0,1000,5000
16/01/2024,Payment 2,500,0,4500
2024-01-17,Payment 3,0,2000,6500`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(3);
      expect(statements[0].date).toBe('15-Jan-2024');
      expect(statements[1].date).toBe('16/01/2024');
      expect(statements[2].date).toBe('2024-01-17');
    });

    it('should throw error for empty CSV', () => {
      expect(() => {
        BankStatementService.parseBankStatementCSV('');
      }).toThrow('CSV file must contain at least a header and one data row');

      expect(() => {
        BankStatementService.parseBankStatementCSV('   ');
      }).toThrow('CSV file must contain at least a header and one data row');
    });

    it('should throw error for CSV with only headers', () => {
      expect(() => {
        BankStatementService.parseBankStatementCSV('Date,Description,Debit,Credit');
      }).toThrow('CSV file must contain at least a header and one data row');
    });

    it('should throw error for missing required columns', () => {
      expect(() => {
        BankStatementService.parseBankStatementCSV('Amount,Type\n1000,Credit');
      }).toThrow('CSV must contain Date and Description columns');

      expect(() => {
        BankStatementService.parseBankStatementCSV('Date,Amount\n2024-01-15,1000');
      }).toThrow('CSV must contain Date and Description columns');
    });

    it('should throw error when neither Debit nor Credit columns exist', () => {
      expect(() => {
        BankStatementService.parseBankStatementCSV('Date,Description,Amount\n2024-01-15,Payment,1000');
      }).toThrow('CSV must contain at least one of Debit or Credit columns');
    });

    it('should handle case-insensitive column headers', () => {
      const csvContent = `DATE,DESCRIPTION,DEBIT,CREDIT,BALANCE
2024-01-15,Test payment,0,1000,5000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(1);
      expect(statements[0].description).toBe('Test payment');
    });

    it('should handle column headers with spaces', () => {
      const csvContent = `Transaction Date, Description , Debit Amount , Credit Amount , Running Balance
2024-01-15, Payment received , 0 , 1000 , 5000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(1);
      expect(statements[0].description).toBe('Payment received');
    });

    it('should handle alternative column names for common banks', () => {
      // HDFC format
      const hdfcCsv = `Date,Narration,Chq/Ref No.,Debit,Credit,Balance
15/01/2024,NEFT-INP-123456,123456,0,25000,50000`;

      const hdfcStatements = BankStatementService.parseBankStatementCSV(hdfcCsv);
      expect(hdfcStatements).toHaveLength(1);
      expect(hdfcStatements[0].transactionId).toBe('123456');

      // Axis Bank format
      const axisCsv = `Tran Date,Particulars,Withdrawals,Deposits,Balance
16-01-2024,UPI Payment,5000,,45000`;

      const axisStatements = BankStatementService.parseBankStatementCSV(axisCsv);
      expect(axisStatements).toHaveLength(1);
      expect(axisStatements[0].debit).toBe('5000');
    });

    it('should handle CSV with mixed content and special characters', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance
2024-01-15,"Payment from M/s ABC & Co. @50% discount",0,1000.50,5000
2024-01-16,EMI#123 - Car loan (2.5% interest),15000,0,-10000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].description).toBe('Payment from M/s ABC & Co. @50% discount');
      expect(statements[1].description).toBe('EMI#123 - Car loan (2.5% interest)');
      expect(statements[1].balance).toBe('-10000');
    });

    it('should handle only Credit column (no Debit column)', () => {
      const csvContent = `Date,Description,Credit,Balance
2024-01-15,Salary deposit,50000,50000
2024-01-16,Interest credit,250,50250`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].debit).toBe('0');
      expect(statements[0].credit).toBe('50000');
    });

    it('should handle only Debit column (no Credit column)', () => {
      const csvContent = `Date,Description,Debit,Balance
2024-01-15,ATM withdrawal,5000,45000
2024-01-16,Bill payment,2000,43000`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].debit).toBe('5000');
      expect(statements[0].credit).toBe('0');
    });

    it('should handle CSV with trailing commas', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance,
2024-01-15,Payment received,0,1000,5000,
2024-01-16,Office rent,2000,0,3000,`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements).toHaveLength(2);
      expect(statements[0].description).toBe('Payment received');
    });

    it('should preserve transaction ID when provided', () => {
      const csvContent = `Date,Description,Debit,Credit,Balance,Transaction ID
2024-01-15,Payment,0,1000,5000,TXN12345
2024-01-16,Rent,2000,0,3000,TXN12346`;

      const statements = BankStatementService.parseBankStatementCSV(csvContent);

      expect(statements[0].transactionId).toBe('TXN12345');
      expect(statements[1].transactionId).toBe('TXN12346');
    });

    it('should handle CSV with different line endings', () => {
      // Test with Windows line endings (\r\n)
      const csvWithCRLF = 'Date,Description,Debit,Credit\r\n2024-01-15,Test payment,0,1000\r\n';
      
      const statements1 = BankStatementService.parseBankStatementCSV(csvWithCRLF);
      expect(statements1).toHaveLength(1);

      // Test with Mac line endings (\r)
      const csvWithCR = 'Date,Description,Debit,Credit\r2024-01-15,Test payment,0,1000\r';
      
      // This might not work with current implementation, but it's good to test
      expect(() => {
        BankStatementService.parseBankStatementCSV(csvWithCR);
      }).not.toThrow();
    });
  });
});