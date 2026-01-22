import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

/**
 * Helper function to format a date string for email display
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
 * Helper function to format time string (HH:MM:SS) for email display (HH:MM)
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

export interface ShiftAssignmentEmailRequest {
  paEmail: string;
  paName: string;
  date: string;
  callTime: string | null;
  wrapTime: string | null;
  pcName?: string;
}

/**
 * POST /api/send-email
 * Sends a shift assignment email via Resend API (server-side)
 */
export async function POST(request: NextRequest) {
  try {
    const body: ShiftAssignmentEmailRequest = await request.json();

    // Validate required fields
    if (!body.paEmail || !body.paName || !body.date) {
      return NextResponse.json(
        { error: 'Missing required fields: paEmail, paName, date' },
        { status: 400 }
      );
    }

    // Get Resend API key (server-side only, no NEXT_PUBLIC_ prefix)
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Validate API key format (should start with re_)
    if (!resendApiKey.trim().startsWith('re_')) {
      // Invalid API key format - will be handled by Resend API
    }

    // Prepare email content
    const subject = `New Shift Assignment - ${formatDateForEmail(body.date)}`;

    const emailBody = `
Dear ${body.paName},

You have been assigned a new shift on ${formatDateForEmail(body.date)}.

Shift Details:
- Date: ${formatDateForEmail(body.date)}
- Call Time: ${formatTimeForEmail(body.callTime)}
- Wrap Time: ${formatTimeForEmail(body.wrapTime)}
${body.pcName ? `- Assigned by: ${body.pcName}` : ''}

Please log in to confirm or decline this shift assignment.

View your shifts: ${getAppUrl()}/pa

Best regards,
Ciphered Team
    `.trim();

    // Send email via Resend
    const resend = new Resend(resendApiKey);

    // Use verified domain or test email for "from" address
    // For testing, use 'onboarding@resend.dev' or your verified domain
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    
    const emailPayload = {
      from: fromEmail.includes('@') ? fromEmail : `Ciphered <${fromEmail}>`,
      to: body.paEmail,
      subject: subject,
      html: convertToHTML(emailBody),
    };

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('Failed to send email via Resend:', error.message || error);
      return NextResponse.json(
        { error: 'Failed to send email', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, messageId: data?.id },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in send-email API route:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

