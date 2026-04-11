// License key generation utilities

export function generateLicenseKey(planType: 'starter' | 'growth' | 'scale'): string {
  const keyLengths = {
    starter: 12,
    growth: 16,
    scale: 14
  };
  
  const totalLength = keyLengths[planType];
  const alphabetCount = 5; // 5 alphabets as specified
  const numberCount = totalLength - 3 - alphabetCount; // -3 for "ACZ" prefix
  
  // Generate random alphabets (excluding ACZ prefix)
  const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomAlphabets = '';
  for (let i = 0; i < alphabetCount; i++) {
    randomAlphabets += alphabets.charAt(Math.floor(Math.random() * alphabets.length));
  }
  
  // Generate random numbers
  let randomNumbers = '';
  for (let i = 0; i < numberCount; i++) {
    randomNumbers += Math.floor(Math.random() * 10).toString();
  }
  
  // Combine ACZ prefix + alphabets + numbers and shuffle (except ACZ prefix)
  const keyParts = (randomAlphabets + randomNumbers).split('');
  
  // Fisher-Yates shuffle algorithm for the parts after ACZ
  for (let i = keyParts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keyParts[i], keyParts[j]] = [keyParts[j], keyParts[i]];
  }
  
  return 'ACZ' + keyParts.join('');
}

export function calculateDueDate(): Date {
  const currentDate = new Date();
  const dueDate = new Date(currentDate);
  dueDate.setMonth(currentDate.getMonth() + 1);
  return dueDate;
}

export function formatPlanName(planType: string): string {
  return planType.charAt(0).toUpperCase() + planType.slice(1);
}