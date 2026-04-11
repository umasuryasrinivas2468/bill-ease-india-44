export interface LicenseEmailData {
  email: string;
  licenseKey: string;
  planType: string;
  expiryDate: string;
}

export const sendLicenseEmail = async (data: LicenseEmailData) => {
  try {
    console.log('Sending email to:', data.email);
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer re_EapcU328_C9ZT39spPGKz5FATg2Xs9cud`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Aczen <onboarding@resend.dev>',
        to: [data.email],
        subject: `Welcome to Aczen - Your ${data.planType} License Key`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Aczen</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .license-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
        .license-key { font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #667eea; background: #f0f2ff; padding: 10px; border-radius: 5px; letter-spacing: 2px; }
        .plan-badge { display: inline-block; background: #28a745; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to Aczen!</h1>
            <p>Your One-Stop Accounting Software</p>
        </div>
        
        <div class="content">
            <h2>Hello there! 👋</h2>
            
            <p>We're excited to welcome you to <strong>Aczen</strong> - your comprehensive accounting software solution!</p>
            
            <div class="license-box">
                <h3>Your License Details</h3>
                <span class="plan-badge">${data.planType} Plan</span>
                <div style="margin: 15px 0;">
                    <strong>License Key:</strong><br>
                    <div class="license-key">${data.licenseKey}</div>
                </div>
                <p><strong>Valid Until:</strong> ${data.expiryDate}</p>
                <p><strong>Registered Email:</strong> ${data.email}</p>
            </div>
            
            <h3>🚀 What's Next?</h3>
            <p>1. Save your license key securely</p>
            <p>2. Log in to your Aczen dashboard</p>
            <p>3. Complete your account setup</p>
            <p>4. Start managing your business finances!</p>
            
            <p>If you have any questions or need assistance, our support team is here to help at <a href="mailto:support@aczen.com">support@aczen.com</a>.</p>
        </div>
        
        <div class="footer">
            <p><strong>Best Regards,<br>Team Aczen</strong></p>
            <p>Aczen - One Stop Accounting Software<br>
            <a href="mailto:support@aczen.com">support@aczen.com</a> | www.aczen.com</p>
        </div>
    </div>
</body>
</html>
        `
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to send email');
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);
    
    return { 
      success: true, 
      message: 'Email sent successfully!',
      data: result 
    };

  } catch (error) {
    console.error('Error sending license email:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send email',
      message: 'Email sending failed'
    };
  }
};

/**
 * Send user invitation email
 */
export interface InvitationEmailData {
  recipientEmail: string;
  organizationName: string;
  inviterName: string;
  role: string;
  signupLink: string;
}

export const sendInvitationEmail = async (data: InvitationEmailData) => {
  try {
    const { recipientEmail, organizationName, inviterName, role, signupLink } = data;
    const apiKey = import.meta.env.VITE_RESEND_API_KEY || 're_EapcU328_C9ZT39spPGKz5FATg2Xs9cud';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to Bill Ease India! 🎉</h2>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Hi there,
          </p>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName}</strong> has invited you to join 
            <strong>${organizationName}</strong> on Bill Ease India as a <strong>${role}</strong>.
          </p>

          <div style="margin: 30px 0;">
            <a href="${signupLink}" style="
              display: inline-block;
              background-color: #4f46e5;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
              font-size: 16px;
            ">
              Accept Invitation & Sign Up
            </a>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            Or copy this link: <br/>
            <code style="background: #e5e7eb; padding: 8px; border-radius: 4px; word-break: break-all;">
              ${signupLink}
            </code>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

          <h3 style="color: #333; font-size: 16px; margin-bottom: 10px;">
            Your Access Includes:
          </h3>
          <ul style="color: #666; font-size: 14px; padding-left: 20px;">
            <li>✅ Organization: ${organizationName}</li>
            <li>✅ Role: ${role}</li>
            <li>✅ Access to invoices, expenses, and reports</li>
            <li>✅ Real-time collaboration with team members</li>
          </ul>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

          <p style="color: #999; font-size: 12px;">
            This invitation will expire in 7 days. If you have any questions, 
            please contact the organization administrator.
          </p>

          <p style="color: #999; font-size: 12px;">
            © 2026 Bill Ease India. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bill Ease <invitations@billeaseindia.com>',
        to: [recipientEmail],
        subject: `You're invited to join ${organizationName} on Bill Ease India`,
        html: htmlContent,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Failed to send email');
    }

    console.log('[emailService] Invitation email sent successfully:', result);
    
    return { 
      success: true, 
      message: 'Invitation email sent successfully!',
      data: result 
    };

  } catch (error) {
    console.error('[emailService] Error sending invitation email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send invitation email',
      message: 'Failed to send invitation email'
    };
  }
};