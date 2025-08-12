
// Comprehensive input validation and sanitization utilities

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedValue?: any;
}

// Email validation with sanitization
export const validateEmail = (email: string): ValidationResult => {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required' };
  }

  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(sanitized)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  if (sanitized.length > 254) {
    return { isValid: false, error: 'Email too long' };
  }

  return { isValid: true, sanitizedValue: sanitized };
};

// Phone number validation and sanitization
export const validatePhone = (phone: string): ValidationResult => {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required' };
  }

  // Remove all non-digit characters except +
  const sanitized = phone.replace(/[^\d+]/g, '');
  
  // Basic validation for Indian phone numbers
  const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
  
  if (!phoneRegex.test(sanitized)) {
    return { isValid: false, error: 'Invalid phone number format' };
  }

  return { isValid: true, sanitizedValue: sanitized };
};

// GST number validation
export const validateGSTNumber = (gst: string): ValidationResult => {
  if (!gst || typeof gst !== 'string') {
    return { isValid: false, error: 'GST number is required' };
  }

  const sanitized = gst.trim().toUpperCase();
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  if (!gstRegex.test(sanitized)) {
    return { isValid: false, error: 'Invalid GST number format' };
  }

  return { isValid: true, sanitizedValue: sanitized };
};

// Financial amount validation with limits
export const validateAmount = (amount: string | number, min = 0, max = 10000000): ValidationResult => {
  if (amount === null || amount === undefined || amount === '') {
    return { isValid: false, error: 'Amount is required' };
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return { isValid: false, error: 'Amount must be a valid number' };
  }

  if (numAmount < min) {
    return { isValid: false, error: `Amount must be at least ₹${min}` };
  }

  if (numAmount > max) {
    return { isValid: false, error: `Amount cannot exceed ₹${max.toLocaleString()}` };
  }

  // Round to 2 decimal places
  const sanitized = Math.round(numAmount * 100) / 100;
  
  return { isValid: true, sanitizedValue: sanitized };
};

// Text field sanitization to prevent XSS
export const sanitizeText = (text: string, maxLength = 1000): ValidationResult => {
  if (!text || typeof text !== 'string') {
    return { isValid: true, sanitizedValue: '' };
  }

  // Remove potentially dangerous characters
  let sanitized = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return { isValid: true, sanitizedValue: sanitized };
};

// Invoice number validation
export const validateInvoiceNumber = (invoiceNumber: string): ValidationResult => {
  if (!invoiceNumber || typeof invoiceNumber !== 'string') {
    return { isValid: false, error: 'Invoice number is required' };
  }

  const sanitized = invoiceNumber.trim().toUpperCase();
  
  if (sanitized.length < 3 || sanitized.length > 50) {
    return { isValid: false, error: 'Invoice number must be 3-50 characters' };
  }

  // Allow alphanumeric characters, hyphens, and underscores only
  const invoiceRegex = /^[A-Z0-9\-_]+$/;
  
  if (!invoiceRegex.test(sanitized)) {
    return { isValid: false, error: 'Invoice number can only contain letters, numbers, hyphens, and underscores' };
  }

  return { isValid: true, sanitizedValue: sanitized };
};

// Date validation
export const validateDate = (date: string | Date): ValidationResult => {
  if (!date) {
    return { isValid: false, error: 'Date is required' };
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return { isValid: false, error: 'Invalid date format' };
  }

  // Check if date is not too far in the past or future
  const now = new Date();
  const minDate = new Date(2020, 0, 1); // Jan 1, 2020
  const maxDate = new Date(now.getFullYear() + 10, 11, 31); // 10 years from now
  
  if (dateObj < minDate || dateObj > maxDate) {
    return { isValid: false, error: 'Date must be between 2020 and 10 years from now' };
  }

  return { isValid: true, sanitizedValue: dateObj.toISOString().split('T')[0] };
};

// Batch validation for invoice creation
export const validateInvoiceData = (invoiceData: any): { isValid: boolean; errors: string[]; sanitizedData?: any } => {
  const errors: string[] = [];
  const sanitizedData: any = {};

  // Validate invoice number
  const invoiceNumberResult = validateInvoiceNumber(invoiceData.invoice_number);
  if (!invoiceNumberResult.isValid) {
    errors.push(invoiceNumberResult.error!);
  } else {
    sanitizedData.invoice_number = invoiceNumberResult.sanitizedValue;
  }

  // Validate client name
  const clientNameResult = sanitizeText(invoiceData.client_name, 200);
  if (!clientNameResult.sanitizedValue) {
    errors.push('Client name is required');
  } else {
    sanitizedData.client_name = clientNameResult.sanitizedValue;
  }

  // Validate amounts
  const amountResult = validateAmount(invoiceData.amount);
  if (!amountResult.isValid) {
    errors.push(amountResult.error!);
  } else {
    sanitizedData.amount = amountResult.sanitizedValue;
  }

  const gstAmountResult = validateAmount(invoiceData.gst_amount);
  if (!gstAmountResult.isValid) {
    errors.push(`GST ${gstAmountResult.error!}`);
  } else {
    sanitizedData.gst_amount = gstAmountResult.sanitizedValue;
  }

  const totalAmountResult = validateAmount(invoiceData.total_amount);
  if (!totalAmountResult.isValid) {
    errors.push(`Total ${totalAmountResult.error!}`);
  } else {
    sanitizedData.total_amount = totalAmountResult.sanitizedValue;
  }

  // Validate dates
  const invoiceDateResult = validateDate(invoiceData.invoice_date);
  if (!invoiceDateResult.isValid) {
    errors.push(`Invoice date: ${invoiceDateResult.error!}`);
  } else {
    sanitizedData.invoice_date = invoiceDateResult.sanitizedValue;
  }

  const dueDateResult = validateDate(invoiceData.due_date);
  if (!dueDateResult.isValid) {
    errors.push(`Due date: ${dueDateResult.error!}`);
  } else {
    sanitizedData.due_date = dueDateResult.sanitizedValue;
  }

  // Validate optional fields
  if (invoiceData.client_email) {
    const emailResult = validateEmail(invoiceData.client_email);
    if (!emailResult.isValid) {
      errors.push(`Client email: ${emailResult.error!}`);
    } else {
      sanitizedData.client_email = emailResult.sanitizedValue;
    }
  }

  if (invoiceData.client_gst_number) {
    const gstResult = validateGSTNumber(invoiceData.client_gst_number);
    if (!gstResult.isValid) {
      errors.push(`Client GST: ${gstResult.error!}`);
    } else {
      sanitizedData.client_gst_number = gstResult.sanitizedValue;
    }
  }

  // Sanitize text fields
  if (invoiceData.client_address) {
    const addressResult = sanitizeText(invoiceData.client_address, 500);
    sanitizedData.client_address = addressResult.sanitizedValue;
  }

  if (invoiceData.notes) {
    const notesResult = sanitizeText(invoiceData.notes, 1000);
    sanitizedData.notes = notesResult.sanitizedValue;
  }

  // Validate items array
  if (!Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    errors.push('At least one invoice item is required');
  } else {
    const sanitizedItems = invoiceData.items.map((item: any, index: number) => {
      const itemErrors: string[] = [];
      const sanitizedItem: any = {};

      const descResult = sanitizeText(item.description, 200);
      if (!descResult.sanitizedValue) {
        itemErrors.push(`Item ${index + 1}: Description is required`);
      } else {
        sanitizedItem.description = descResult.sanitizedValue;
      }

      const qtyResult = validateAmount(item.quantity, 0.01, 100000);
      if (!qtyResult.isValid) {
        itemErrors.push(`Item ${index + 1}: ${qtyResult.error!}`);
      } else {
        sanitizedItem.quantity = qtyResult.sanitizedValue;
      }

      const rateResult = validateAmount(item.rate, 0.01, 1000000);
      if (!rateResult.isValid) {
        itemErrors.push(`Item ${index + 1}: Rate ${rateResult.error!}`);
      } else {
        sanitizedItem.rate = rateResult.sanitizedValue;
      }

      const itemAmountResult = validateAmount(item.amount);
      if (!itemAmountResult.isValid) {
        itemErrors.push(`Item ${index + 1}: Amount ${itemAmountResult.error!}`);
      } else {
        sanitizedItem.amount = itemAmountResult.sanitizedValue;
      }

      errors.push(...itemErrors);
      return sanitizedItem;
    });

    if (errors.length === 0) {
      sanitizedData.items = sanitizedItems;
    }
  }

  // Copy other fields safely
  sanitizedData.status = ['paid', 'pending', 'overdue'].includes(invoiceData.status) 
    ? invoiceData.status : 'pending';

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: errors.length === 0 ? sanitizedData : undefined
  };
};
