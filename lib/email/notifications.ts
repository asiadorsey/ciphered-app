/**
 * Email notification functions for shift assignments and confirmations
 * 
 * TODO: Integrate with an email service like Resend or SendGrid
 * For now, these functions log the email content that would be sent
 */

import type { Database } from '@/lib/supabase/types';
import { Resend } from 'resend';

type Shift = Database['public']['Tables']['shifts']['Row'];
type User = Database['public']['Tables']['users']['Row'];

export interface ShiftAssignmentEmailData {
  paEmail: string;
  paName: string;
  date: string;
  callTime: string | null;
  wrapTime: string | null;
  pcName?: string;
}

export interface ShiftConfirmationEmailData {
  pcEmail: string;
  paName: string;
  date: string;
  confirmationStatus: 'confirmed' | 'declined';
  callTime: string | null;
  wrapTime: string | null;
}

/**
 * Formats a date string for email display
 */
function formatDateForEmail(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats time string (HH:MM:SS) for email display (HH:MM)
 */
function formatTimeForEmail(timeStr: string | null): string {
  if (!timeStr) return 'Not specified';
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return timeStr;
}

/**
 * Gets the app URL for email links
 * TODO: Replace with actual app URL from environment variable
 */
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com';
}

/**
 * Converts plain text email body to HTML format
 */
function convertToHTML(text: string): string {
  const lines = text.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isListItem = line.startsWith('- ');

    if (isListItem) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${line.substring(2)}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      if (line === '') {
        html += '<br>';
      } else {
        html += `<p>${line}</p>`;
      }
    }
  }

  if (inList) {
    html += '</ul>';
  }

  return html;
}

/**
 * Sends an email to a PA when a new shift is assigned
 */
export async function sendShiftAssignmentEmail(
  data: ShiftAssignmentEmailData
): Promise<void> {
  const subject = `New Shift Assignment - ${formatDateForEmail(data.date)}`;

  const emailBody = `
Dear ${data.paName},

You have been assigned a new shift on ${formatDateForEmail(data.date)}.

Shift Details:
- Date: ${formatDateForEmail(data.date)}
- Call Time: ${formatTimeForEmail(data.callTime)}
- Wrap Time: ${formatTimeForEmail(data.wrapTime)}
${data.pcName ? `- Assigned by: ${data.pcName}` : ''}

Please log in to confirm or decline this shift assignment.

View your shifts: ${getAppUrl()}/pa

Best regards,
ProdFlow Team
  `.trim();

  // Log email for development
  console.log('📧 EMAIL NOTIFICATION: New Shift Assignment');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`To: ${data.paEmail}`);
  console.log(`Subject: ${subject}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(emailBody);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Send email via Resend
  // Check for NEXT_PUBLIC_RESEND_API_KEY first (for client-side access), fall back to RESEND_API_KEY (server-side)
  const resendApiKey = process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    // Validate API key format (should start with re_)
    if (!resendApiKey.trim().startsWith('re_')) {
      console.warn('⚠️  RESEND_API_KEY detected but format appears invalid (should start with "re_")');
      console.warn(`   Key starts with: "${resendApiKey.trim().substring(0, 5)}..."`);
    } else {
      console.log('✅ Resend API key detected - Email will be sent via Resend');
    }

    const resend = new Resend(resendApiKey);

    try {
      await resend.emails.send({
        from: 'ProdFlow <noreply@yourdomain.com>',
        to: data.paEmail,
        subject: subject,
        html: convertToHTML(emailBody),
      });
      console.log('✅ Email sent successfully via Resend');
    } catch (error) {
      console.error('❌ Failed to send email via Resend:', error);
    }
  } else {
    console.warn('⚠️  RESEND_API_KEY not found - Email will NOT be sent (only logged to console)');
    console.warn('   Please add NEXT_PUBLIC_RESEND_API_KEY to .env.local to enable email sending (for client-side)');
    console.warn('   Or add RESEND_API_KEY for server-side usage');
  }
}

/**
 * Sends an email to a PC when a PA confirms a shift
 */
export async function sendShiftConfirmationEmail(
  data: ShiftConfirmationEmailData
): Promise<void> {
  const statusText = data.confirmationStatus === 'confirmed' ? 'confirmed' : 'declined';
  const subject = `PA ${statusText.charAt(0).toUpperCase() + statusText.slice(1)} Shift - ${formatDateForEmail(data.date)}`;

  const emailBody = `
Dear Production Coordinator,

${data.paName} has ${statusText} the shift assignment for ${formatDateForEmail(data.date)}.

Shift Details:
- Date: ${formatDateForEmail(data.date)}
- PA: ${data.paName}
- Status: ${data.confirmationStatus.charAt(0).toUpperCase() + data.confirmationStatus.slice(1)}
- Call Time: ${formatTimeForEmail(data.callTime)}
- Wrap Time: ${formatTimeForEmail(data.wrapTime)}

${data.confirmationStatus === 'declined' ? '\nPlease assign this shift to another PA if needed.' : ''}

View schedule: ${getAppUrl()}/pc

Best regards,
ProdFlow Team
  `.trim();

  // Log email for development
  console.log(`📧 EMAIL NOTIFICATION: PA ${statusText.charAt(0).toUpperCase() + statusText.slice(1)} Shift`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`To: ${data.pcEmail}`);
  console.log(`Subject: ${subject}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(emailBody);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Send email via Resend
  // Check for NEXT_PUBLIC_RESEND_API_KEY first (for client-side access), fall back to RESEND_API_KEY (server-side)
  const resendApiKey = process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    // Validate API key format (should start with re_)
    if (!resendApiKey.trim().startsWith('re_')) {
      console.warn('⚠️  RESEND_API_KEY detected but format appears invalid (should start with "re_")');
      console.warn(`   Key starts with: "${resendApiKey.trim().substring(0, 5)}..."`);
    } else {
      console.log('✅ Resend API key detected - Email will be sent via Resend');
    }

    const resend = new Resend(resendApiKey);

    try {
      await resend.emails.send({
        from: 'ProdFlow <onboarding@resend.dev>', // Resend's test domain
        to: data.pcEmail,
        subject: subject,
        html: convertToHTML(emailBody),
      });
      console.log('✅ Email sent successfully via Resend');
    } catch (error) {
      console.error('❌ Failed to send email via Resend:', error);
    }
  } else {
    console.warn('⚠️  RESEND_API_KEY not found - Email will NOT be sent (only logged to console)');
    console.warn('   Please add NEXT_PUBLIC_RESEND_API_KEY to .env.local to enable email sending (for client-side)');
    console.warn('   Or add RESEND_API_KEY for server-side usage');
  }
}

/**
 * Helper function to fetch user email by ID from Supabase
 * This can be used when we have shift data but need email addresses
 */
export async function getUserEmail(
  userId: string,
  supabaseClient: any
): Promise<string | null> {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error(`Failed to fetch email for user ${userId}:`, error);
      return null;
    }

    return data.email;
  } catch (error) {
    console.error(`Error fetching user email for ${userId}:`, error);
    return null;
  }
}

/**
 * Helper function to fetch user details (name and email) by ID
 */
export async function getUserDetails(
  userId: string,
  supabaseClient: any
): Promise<{ email: string; name: string } | null> {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error(`Failed to fetch user details for ${userId}:`, error);
      return null;
    }

    return {
      email: data.email,
      name: data.name,
    };
  } catch (error) {
    console.error(`Error fetching user details for ${userId}:`, error);
    return null;
  }
}

