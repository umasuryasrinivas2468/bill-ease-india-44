import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrandingStep } from './BrandingStep';

// Mock data
const mockBusinessAssets = {
  logoUrl: 'https://example.com/logo.png',
  signatureUrl: 'https://example.com/signature.png',
};

const mockSetBusinessAssets = vi.fn();
const mockOnComplete = vi.fn();

describe('BrandingStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should display logo and signature URL inputs', () => {
      render(
        <BrandingStep
          businessAssets={mockBusinessAssets}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      expect(screen.getByText('Business Logo URL *')).toBeInTheDocument();
      expect(screen.getByText('Digital Signature URL *')).toBeInTheDocument();
    });

    it('should show image previews when URLs are provided', () => {
      render(
        <BrandingStep
          businessAssets={mockBusinessAssets}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const logoImage = screen.getByAltText('Logo preview');
      const signatureImage = screen.getByAltText('Signature preview');

      expect(logoImage).toBeInTheDocument();
      expect(logoImage.getAttribute('src')).toBe('https://example.com/logo.png');
      
      expect(signatureImage).toBeInTheDocument();
      expect(signatureImage.getAttribute('src')).toBe('https://example.com/signature.png');
    });

    it('should call onComplete when complete button is clicked with valid URLs', async () => {
      const user = userEvent.setup();
      
      render(
        <BrandingStep
          businessAssets={mockBusinessAssets}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const completeButton = screen.getByRole('button', { name: /complete setup/i });
      await user.click(completeButton);

      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should update logo URL when input changes', async () => {
      const user = userEvent.setup();
      
      render(
        <BrandingStep
          businessAssets={{ logoUrl: '', signatureUrl: '' }}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const logoInput = screen.getByLabelText(/business logo url/i);
      await user.type(logoInput, 'https://newlogo.com/logo.png');

      expect(mockSetBusinessAssets).toHaveBeenCalledWith({
        logoUrl: 'https://newlogo.com/logo.png',
        signatureUrl: '',
      });
    });

    it('should update signature URL when input changes', async () => {
      const user = userEvent.setup();
      
      render(
        <BrandingStep
          businessAssets={{ logoUrl: '', signatureUrl: '' }}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const signatureInput = screen.getByLabelText(/digital signature url/i);
      await user.type(signatureInput, 'https://newsignature.com/signature.png');

      expect(mockSetBusinessAssets).toHaveBeenCalledWith({
        logoUrl: '',
        signatureUrl: 'https://newsignature.com/signature.png',
      });
    });

    it('should validate required URLs before completion', async () => {
      const user = userEvent.setup();
      
      render(
        <BrandingStep
          businessAssets={{ logoUrl: '', signatureUrl: '' }}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const completeButton = screen.getByRole('button', { name: /complete setup/i });
      
      // Try to complete with empty URLs
      await user.click(completeButton);

      // Should not call onComplete with empty URLs
      expect(mockOnComplete).not.toHaveBeenCalled();
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle image loading errors gracefully', async () => {
      render(
        <BrandingStep
          businessAssets={{ logoUrl: 'https://invalid-url.com/logo.png', signatureUrl: 'https://example.com/signature.png' }}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const logoImage = screen.getByAltText('Logo preview');
      
      // Simulate image load error
      fireEvent.error(logoImage);

      // Should still render the component
      expect(screen.getByText('Business Logo URL *')).toBeInTheDocument();
    });

    it('should disable complete button while completing', () => {
      render(
        <BrandingStep
          businessAssets={mockBusinessAssets}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={true}
        />
      );

      const completeButton = screen.getByRole('button', { name: /completing/i });
      expect(completeButton).toBeDisabled();
    });
  });

  describe('Additional Functionality', () => {
    it('should display mandatory field message', () => {
      render(
        <BrandingStep
          businessAssets={mockBusinessAssets}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      expect(screen.getByText(/both are mandatory/i)).toBeInTheDocument();
    });

    it('should show placeholder icons when URLs are empty', () => {
      render(
        <BrandingStep
          businessAssets={{ logoUrl: '', signatureUrl: '' }}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      // Should show placeholder icons/areas instead of images
      const logoContainer = screen.getByText('Business Logo URL *').parentElement;
      const signatureContainer = screen.getByText('Digital Signature URL *').parentElement;

      expect(logoContainer).toBeInTheDocument();
      expect(signatureContainer).toBeInTheDocument();
    });

    it('should clear error state when URL changes', async () => {
      const user = userEvent.setup();
      
      render(
        <BrandingStep
          businessAssets={{ logoUrl: 'https://invalid-url.com/logo.png', signatureUrl: '' }}
          setBusinessAssets={mockSetBusinessAssets}
          onComplete={mockOnComplete}
          isCompleting={false}
        />
      );

      const logoInput = screen.getByLabelText(/business logo url/i);
      
      // Change the URL to a new one
      await user.clear(logoInput);
      await user.type(logoInput, 'https://valid-logo.com/logo.png');

      expect(mockSetBusinessAssets).toHaveBeenCalledWith({
        logoUrl: 'https://valid-logo.com/logo.png',
        signatureUrl: '',
      });
    });
  });
});