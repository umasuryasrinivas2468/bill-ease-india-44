
export const validateGSTNumber = (gstNumber: string): boolean => {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
};

export const validateIECNumber = (iecNumber: string): boolean => {
  return /^\d{10}$/.test(iecNumber);
};

export const validateAccountNumber = (accountNumber: string): boolean => {
  return /^\d{9,18}$/.test(accountNumber);
};

export const validateIFSCCode = (ifsc: string): boolean => {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
};
