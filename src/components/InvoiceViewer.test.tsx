import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import InvoiceViewer from './InvoiceViewer';

// Mock Clerk user with onboarding data
const mockUser = {
  unsafeMetadata: {
    businessInfo: {
      businessName: 'Test Business Ltd',
      ownerName: 'John Doe',
      email: 'john@testbusiness.com',
      phone: '+1234567890',
      address: '123 Business Street, Test City',
      gstNumber: 'GST123456789',
    },
    logoUrl: 'https://example.com/business-logo.png',
    signatureUrl: 'https://example.com/owner-signature.png',
  },
};

const mockUseUser = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useUser: mockUseUser,
}));

const mockInvoice = {
  id: '1',
  invoice_number: 'INV-2024-001',
  client_name: 'Acme Corp',
  client_email: 'contact@acme.com',
  client_phone: '+1234567890',
  client_address: '456 Client Street, Client City',
  amount: 1000,
  gst_amount: 180,
  subtotal: 1000,
  tax_amount: 180,
  total_amount: 1180,
  discount: 0,
  invoice_date: '2024-01-15',
  due_date: '2024-02-14',
  items: [
    {
      description: 'Web Development Services',
      quantity: 1,
      rate: 1000,
      amount: 1000,
    },
  ],
  status: 'pending' as const,
  notes: 'Thank you for your business!',
  created_at: '2024-01-15T10:00:00Z',
};

describe('InvoiceViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should use onboarding logo and signature', async () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@testbusiness.com')).toBeInTheDocument();
    });

    it('should display business information from onboarding', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@testbusiness.com')).toBeInTheDocument();
      expect(screen.getByText('GST123456789')).toBeInTheDocument();
    });

    it('should display invoice details correctly', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('₹1,000')).toBeInTheDocument();
      expect(screen.getByText('₹180')).toBeInTheDocument();
      expect(screen.getByText('₹1,180')).toBeInTheDocument();
    });
  });
});