import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import QuotationViewer from './QuotationViewer';

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

const mockQuotation = {
  id: '1',
  quotation_number: 'QT-2024-001',
  client_name: 'Acme Corp',
  client_email: 'contact@acme.com',
  client_phone: '+1234567890',
  client_address: '456 Client Street, Client City',
  subtotal: 1000,
  tax_amount: 180,
  total_amount: 1180,
  discount: 0,
  quotation_date: '2024-01-15',
  validity_period: 30,
  items: [
    {
      description: 'Web Development Services',
      quantity: 1,
      rate: 1000,
      amount: 1000,
    },
  ],
  terms_conditions: 'Payment due within 30 days',
  status: 'draft' as const,
  created_at: '2024-01-15T10:00:00Z',
};

describe('QuotationViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should use onboarding logo and signature', async () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

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
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      expect(screen.getByText('john@testbusiness.com')).toBeInTheDocument();
      expect(screen.getByText('+1234567890')).toBeInTheDocument();
      expect(screen.getByText('123 Business Street, Test City')).toBeInTheDocument();
      expect(screen.getByText('GST123456789')).toBeInTheDocument();
    });

    it('should display quotation details correctly', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      expect(screen.getByText('QT-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('contact@acme.com')).toBeInTheDocument();
      expect(screen.getByText('456 Client Street, Client City')).toBeInTheDocument();
      expect(screen.getByText('Web Development Services')).toBeInTheDocument();
      expect(screen.getByText('₹1,180')).toBeInTheDocument();
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle missing onboarding assets gracefully', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUserWithoutAssets,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Should render quotation content even without logo/signature
      expect(screen.getByText('QT-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      
      // Should show business name even without assets
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
    });

    it('should handle null user gracefully', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: null,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Should still render quotation details
      expect(screen.getByText('QT-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('should handle invalid logo URL gracefully', async () => {
      const userWithInvalidLogo = {
        unsafeMetadata: {
          businessInfo: mockUser.unsafeMetadata.businessInfo,
          logoUrl: 'invalid-url',
          signatureUrl: 'https://example.com/owner-signature.png',
        },
      };

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: userWithInvalidLogo,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Should render other content even with invalid logo URL
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      expect(screen.getByText('QT-2024-001')).toBeInTheDocument();
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should handle empty quotation items', () => {
      const quotationWithoutItems = {
        ...mockQuotation,
        items: [],
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
      };

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={quotationWithoutItems} />);

      expect(screen.getByText('QT-2024-001')).toBeInTheDocument();
      expect(screen.getByText('₹0')).toBeInTheDocument();
    });

    it('should handle missing client information', () => {
      const quotationWithMinimalClient = {
        ...mockQuotation,
        client_name: '',
        client_email: '',
        client_phone: '',
        client_address: '',
      };

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={quotationWithMinimalClient} />);

      // Should still render quotation number and business info
      expect(screen.getByText('QT-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
    });
  });

  describe('Branching Scenarios', () => {
    it('should show logo placeholder when URL is missing', () => {
      const userWithoutLogo = {
        unsafeMetadata: {
          businessInfo: mockUser.unsafeMetadata.businessInfo,
          signatureUrl: 'https://example.com/owner-signature.png',
          // No logoUrl
        },
      };

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: userWithoutLogo,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Should show business name as fallback
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      
      // Should still show signature
      const images = screen.getAllByRole('img');
      const signatureImage = images.find(img => 
        img.getAttribute('src') === 'https://example.com/owner-signature.png'
      );
      expect(signatureImage).toBeInTheDocument();
    });

    it('should show signature placeholder when URL is missing', () => {
      const userWithoutSignature = {
        unsafeMetadata: {
          businessInfo: mockUser.unsafeMetadata.businessInfo,
          logoUrl: 'https://example.com/business-logo.png',
          // No signatureUrl
        },
      };

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: userWithoutSignature,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Should show business name and logo
      expect(screen.getByText('Test Business Ltd')).toBeInTheDocument();
      
      const images = screen.getAllByRole('img');
      const logoImage = images.find(img => 
        img.getAttribute('src') === 'https://example.com/business-logo.png'
      );
      expect(logoImage).toBeInTheDocument();
    });
  });

  describe('Additional Functionality', () => {
    it('should format currency correctly', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Check for Indian rupee symbol formatting
      expect(screen.getByText('₹1,000')).toBeInTheDocument(); // Subtotal
      expect(screen.getByText('₹180')).toBeInTheDocument();   // Tax
      expect(screen.getByText('₹1,180')).toBeInTheDocument(); // Total
    });

    it('should display quotation date correctly', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Check for formatted date display
      const dateRegex = /15.*Jan.*2024|2024.*01.*15|Jan.*15.*2024/i;
      expect(screen.getByText(dateRegex)).toBeInTheDocument();
    });

    it('should show validity period information', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      // Check for validity period
      expect(screen.getByText(/30.*days?/i)).toBeInTheDocument();
    });

    it('should display terms and conditions', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<QuotationViewer quotation={mockQuotation} />);

      expect(screen.getByText('Payment due within 30 days')).toBeInTheDocument();
    });
  });
});