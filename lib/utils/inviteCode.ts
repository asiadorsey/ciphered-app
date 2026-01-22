/**
 * Generates a production invite code in the format XXX-XXX
 * Uses only non-confusing characters: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
 * (Excludes: I, O, 0, 1 to avoid confusion)
 * 
 * @returns A 6-character invite code with hyphen in the middle (e.g., "K7P-M3R")
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 2) code += '-';
  }
  return code;
}

/**
 * Validates if an invite code exists in the database (client-side).
 * Uses the API route to validate the invite code.
 * 
 * @param code - The invite code to validate (e.g., "K7P-M3R")
 * @returns Promise<{ valid: boolean; productionId?: string }> - Object with validation result and production ID if valid
 */
export async function validateInviteCodeClient(code: string): Promise<{ valid: boolean; productionId?: string }> {
  try {
    const response = await fetch('/api/validate-invite-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error validating invite code:', error);
    return { valid: false };
  }
}

