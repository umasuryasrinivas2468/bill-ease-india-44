// TDS Functionality Test
import { calculateTDS } from '@/hooks/useTDSRules';

describe('TDS Calculation Tests', () => {
  test('should calculate TDS correctly for 10% rate', () => {
    const result = calculateTDS(100000, 10);
    expect(result.tdsAmount).toBe(10000);
    expect(result.netPayable).toBe(90000);
  });

  test('should calculate TDS correctly for 2% rate', () => {
    const result = calculateTDS(50000, 2);
    expect(result.tdsAmount).toBe(1000);
    expect(result.netPayable).toBe(49000);
  });

  test('should handle decimal amounts correctly', () => {
    const result = calculateTDS(123456.78, 5);
    expect(result.tdsAmount).toBe(6172.84);
    expect(result.netPayable).toBe(117283.94);
  });

  test('should handle zero rate', () => {
    const result = calculateTDS(100000, 0);
    expect(result.tdsAmount).toBe(0);
    expect(result.netPayable).toBe(100000);
  });
});

// Mock data for testing components
export const mockTDSRules = [
  {
    id: '1',
    user_id: 'user1',
    category: 'Professional Fees',
    rate_percentage: 10.00,
    description: 'TDS on Professional Services - Section 194J',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    user_id: 'user1',
    category: 'Contractor Payments',
    rate_percentage: 2.00,
    description: 'TDS on Contractor Payments - Section 194C',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }
];

export const mockTDSTransactions = [
  {
    id: '1',
    user_id: 'user1',
    client_id: 'client1',
    tds_rule_id: '1',
    transaction_amount: 100000,
    tds_rate: 10,
    tds_amount: 10000,
    net_payable: 90000,
    transaction_date: '2024-01-15',
    vendor_name: 'ABC Consultants',
    vendor_pan: 'ABCDE1234F',
    description: 'Software development services',
    certificate_number: 'TDS001',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    clients: {
      name: 'ABC Consultants',
      gst_number: '29ABCDE1234F1Z5'
    },
    tds_rules: {
      category: 'Professional Fees'
    }
  }
];