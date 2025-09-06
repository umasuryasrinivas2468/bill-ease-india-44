import { render, screen, waitFor } from '@testing-library/react';
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

const mockUserWithoutAssets = {
  unsafeMetadata: {
    businessInfo: {
      businessName: 'Test Business Ltd',
      ownerName: 'John Doe',
    },
    // No logoUrl or signatureUrl
  },
};

vi.mock('@clerk/clerk-react', () => ({
  useUser: vi.fn(),
}));

const mockInvoice = {
  id: '1',
  invoice_number: 'INV-2024-001',
  client_name: 'Acme Corp',
  client_email: 'contact@acme.com',
  client_phone: '+1234567890',
  client_address: '456 Client Street, Client City',
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
  notes: 'Thank you for your business!',
  status: 'draft' as const,
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

      render(<InvoiceViewer invoice={mockInvoice} />);

      await waitFor(() => {
        // Check for logo from onboarding
        const logoImages = screen.getAllByRole('img');
        const logoImage = logoImages.find(img => 
          img.getAttribute('src') === 'https://example.com/business-logo.png'
        );
        expect(logoImage).toBeInTheDocument();
        
        // Check for signature from onboarding
        const signatureImage = logoImages.find(img => 
          img.getAttribute('src') === 'https://example.com/owner-signature.png'
        );
        expect(signatureImage).toBeInTheDocument();
      });
    });

    it('should display business information from onboarding', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      expect(screen.getByText('john@testbusiness.com')).toBeInTheDocument();
      expect(screen.getByText('+1234567890')).toBeInTheDocument();
      expect(screen.getByText('123 Business Street, Test City')).toBeInTheDocument();
      expect(screen.getByText('GST123456789')).toBeInTheDocument();
    });

    it('should display invoice details correctly', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('contact@acme.com')).toBeInTheDocument();
      expect(screen.getByText('456 Client Street, Client City')).toBeInTheDocument();
      expect(screen.getByText('Web Development Services')).toBeInTheDocument();
      expect(screen.getByText('₹1,180')).toBeInTheDocument();
    });

    it('should display invoice dates correctly', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      // Check for invoice date
      const invoiceDateRegex = /15.*Jan.*2024|2024.*01.*15|Jan.*15.*2024/i;
      expect(screen.getByText(invoiceDateRegex)).toBeInTheDocument();
      
      // Check for due date
      const dueDateRegex = /14.*Feb.*2024|2024.*02.*14|Feb.*14.*2024/i;
      expect(screen.getByText(dueDateRegex)).toBeInTheDocument();
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle missing onboarding assets gracefully', () => {
      mockUseUser.mockReturnValue({
        user: mockUserWithoutAssets,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      // Should render invoice content even without logo/signature
      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      
      // Should show business name even without assets
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
    });

    it('should handle null user gracefully', () => {
      mockUseUser.mockReturnValue({
        user: null,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      // Should still render invoice details
      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('should handle invalid signature URL gracefully', async () => {
      const userWithInvalidSignature = {
        unsafeMetadata: {
          businessInfo: mockUser.unsafeMetadata.businessInfo,
          logoUrl: 'https://example.com/business-logo.png',
          signatureUrl: 'invalid-signature-url',
        },
      };

      mockUseUser.mockReturnValue({
        user: userWithInvalidSignature,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      // Should render other content even with invalid signature URL
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
    });

    it('should handle missing invoice data gracefully', () => {
      const incompleteInvoice = {
        ...mockInvoice,
        client_name: '',
        client_email: '',
        items: [],
        subtotal: 0,
        total_amount: 0,
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={incompleteInvoice} />);

      // Should still render invoice number and business info
      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should handle zero amount invoice', () => {
      const zeroInvoice = {
        ...mockInvoice,
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        items: [{
          description: 'Free consultation',
          quantity: 1,
          rate: 0,
          amount: 0,
        }],
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={zeroInvoice} />);

      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
      expect(screen.getByText('₹0')).toBeInTheDocument();
      expect(screen.getByText('Free consultation')).toBeInTheDocument();
    });

    it('should handle large amount formatting', () => {
      const largeAmountInvoice = {
        ...mockInvoice,
        subtotal: 1000000,
        tax_amount: 180000,
        total_amount: 1180000,
        items: [{
          description: 'Enterprise Solution',
          quantity: 1,
          rate: 1000000,
          amount: 1000000,
        }],
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={largeAmountInvoice} />);

      // Should format large numbers correctly
      expect(screen.getByText('₹11,80,000')).toBeInTheDocument();
    });
  });

  describe('Branching Scenarios', () => {
    it('should show different layout for paid vs unpaid invoices', () => {
      const paidInvoice = {
        ...mockInvoice,
        status: 'paid' as const,
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={paidInvoice} />);

      // Should display paid status indicator
      expect(screen.getByText(/paid/i)).toBeInTheDocument();
    });

    it('should handle overdue invoices differently', () => {
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 10); // 10 days ago
      
      const overdueInvoice = {
        ...mockInvoice,
        due_date: overdueDate.toISOString().split('T')[0],
        status: 'sent' as const,
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={overdueInvoice} />);

      // Should still render invoice content
      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
    });

    it('should show logo placeholder when URL is missing', () => {
      const userWithoutLogo = {
        unsafeMetadata: {
          businessInfo: mockUser.unsafeMetadata.businessInfo,
          signatureUrl: 'https://example.com/owner-signature.png',
          // No logoUrl
        },
      };

      mockUseUser.mockReturnValue({
        user: userWithoutLogo,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      // Should show business name as fallback
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      
      // Should still show signature
      const images = screen.getAllByRole('img');
      const signatureImage = images.find(img => 
        img.getAttribute('src') === 'https://example.com/owner-signature.png'
      );
      expect(signatureImage).toBeInTheDocument();
    });
  });

  describe('Additional Functionality', () => {
    it('should display invoice notes', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      expect(screen.getByText('Thank you for your business!')).toBeInTheDocument();
    });

    it('should calculate tax amount correctly', () => {
      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={mockInvoice} />);

      expect(screen.getByText('₹1,000')).toBeInTheDocument(); // Subtotal
      expect(screen.getByText('₹180')).toBeInTheDocument();   // Tax (18%)
      expect(screen.getByText('₹1,180')).toBeInTheDocument(); // Total
    });

    it('should show multiple items correctly', () => {
      const multiItemInvoice = {
        ...mockInvoice,
        items: [
          {
            description: 'Web Development',
            quantity: 1,
            rate: 500,
            amount: 500,
          },
          {
            description: 'SEO Services',
            quantity: 1,
            rate: 500,
            amount: 500,
          },
        ],
        subtotal: 1000,
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={multiItemInvoice} />);

      expect(screen.getByText('Web Development')).toBeInTheDocument();
      expect(screen.getByText('SEO Services')).toBeInTheDocument();
      expect(screen.getAllByText('₹500')).toHaveLength(2);
    });

    it('should display discount when applicable', () => {
      const discountedInvoice = {
        ...mockInvoice,
        discount: 100,
        total_amount: 1080, // 1180 - 100
      };

      mockUseUser.mockReturnValue({
        user: mockUser,
      });

      render(<InvoiceViewer invoice={discountedInvoice} />);

      expect(screen.getByText('₹100')).toBeInTheDocument(); // Discount
      expect(screen.getByText('₹1,080')).toBeInTheDocument(); // Final total
    });
  });
});