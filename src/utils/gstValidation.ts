
export const validateGSTNumber = (gstNumber: string, country: string = 'india'): boolean => {
  if (!gstNumber) return false;
  
  if (country === 'singapore') {
    // Singapore GST format: 201234567A (9 digits followed by 1 letter)
    const singaporeGSTRegex = /^[0-9]{9}[A-Z]$/;
    return singaporeGSTRegex.test(gstNumber);
  } else if (country === 'india') {
    // India GST format: 22AAAAA0000A1Z5 (15 characters)
    const indiaGSTRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][Z][0-9]$/;
    return indiaGSTRegex.test(gstNumber);
  }
  
  return false;
};

export const getGSTPlaceholder = (country: string = 'india'): string => {
  if (country === 'singapore') {
    return '201234567A';
  } else if (country === 'india') {
    return '22AAAAA0000A1Z5';
  }
  return '';
};

export const formatGSTNumber = (value: string, country: string = 'india'): string => {
  // Remove all non-alphanumeric characters
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  
  if (country === 'india') {
    // Format as: 22AAAAA0000A1Z5
    return cleaned.slice(0, 15);
  } else if (country === 'singapore') {
    // Format as: 201234567A
    return cleaned.slice(0, 10);
  }
  
  return cleaned;
};
