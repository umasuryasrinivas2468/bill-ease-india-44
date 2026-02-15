
export const validateGSTByCountry = (gstNumber: string, country: string): boolean => {
  if (!gstNumber) return false;
  
  if (country === 'singapore') {
    // Singapore GST format: 201234567A (10 digits followed by 1 letter)
    const singaporeGSTRegex = /^[0-9]{9}[A-Z]$/;
    return singaporeGSTRegex.test(gstNumber);
  } else if (country === 'india') {
    // India GST format: 22AAAAA0000A1Z5 (15 characters)
    const indiaGSTRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][Z][0-9]$/;
    return indiaGSTRegex.test(gstNumber);
  }
  
  return false;
};

export const getGSTPlaceholder = (country: string): string => {
  if (country === 'singapore') {
    return '201234567A';
  } else if (country === 'india') {
    return '22AAAAA0000A1Z5';
  }
  return '';
};

export const getGSTRateOptions = (country: string): string[] => {
  if (country === 'singapore') {
    return ['7', '8', '9'];
  } else if (country === 'india') {
    return ['0', '5', '12', '18', '28'];
  }
  return [];
};

export const getCurrencySymbol = (currency: string): string => {
  switch (currency) {
    case 'SGD':
      return 'S$';
    case 'INR':
      return '₹';
    default:
      return currency;
  }
};
