export const MAX_PLATE_LENGTH = 8;

export function normalizePlate(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 @]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePlateDraft(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 @,]/g, '');
}

export function validatePlate(value: string): string | null {
  if (value.length < 2 || value.length > MAX_PLATE_LENGTH) {
    return 'Passenger plates must use 2 to 8 characters.';
  }
  if (value.startsWith('@') || value.endsWith('@')) {
    return 'The state symbol cannot be first or last.';
  }
  if ((value.match(/@/g) ?? []).length > 1) {
    return 'The state symbol can only be used once.';
  }
  return null;
}
