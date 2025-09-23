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