import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import SettingsPromptDialog from './SettingsPromptDialog';

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('SettingsPromptDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onGoToSettings: vi.fn(),
    missingFields: ['Business Information', 'Bank Details', 'Business Logo'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders dialog when open is true', () => {
    render(<SettingsPromptDialog {...defaultProps} />);
    
    expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
    expect(screen.getByText(/Please complete your business profile/)).toBeInTheDocument();
  });

  test('does not render dialog when open is false', () => {
    render(<SettingsPromptDialog {...defaultProps} open={false} />);
    
    expect(screen.queryByText('Complete Your Profile')).not.toBeInTheDocument();
  });

  test('displays missing fields correctly', () => {
    render(<SettingsPromptDialog {...defaultProps} />);
    
    expect(screen.getByText('Business Information')).toBeInTheDocument();
    expect(screen.getByText('Bank Details')).toBeInTheDocument();
    expect(screen.getByText('Business Logo')).toBeInTheDocument();
  });

  test('calls onGoToSettings when Go to Settings button is clicked', () => {
    render(<SettingsPromptDialog {...defaultProps} />);
    
    const goToSettingsButton = screen.getByRole('button', { name: /Go to Settings/i });
    fireEvent.click(goToSettingsButton);
    
    expect(defaultProps.onGoToSettings).toHaveBeenCalledTimes(1);
  });

  test('calls onOpenChange when Cancel button is clicked', () => {
    render(<SettingsPromptDialog {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);
    
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  test('shows warning icon and appropriate styling', () => {
    render(<SettingsPromptDialog {...defaultProps} />);
    
    // Check if the title contains the warning context
    expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
    expect(screen.getByText('Missing information:')).toBeInTheDocument();
  });
});