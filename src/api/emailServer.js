#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

const resend = new Resend('re_EapcU328_C9ZT39spPGKz5FATg2Xs9cud');

app.post('/send-license-email', async (req, res) => {
  try {
    const { email, licenseKey, planType, expiryDate } = req.body;

    if (!email || !licenseKey || !planType || !expiryDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`Sending license email to: ${email}`);

    // Generate welcome letter content
    const welcomeLetterContent = generateWelcomeLetter();
    
    // Generate PDF with license details
    const pdfBuffer = await generateLicensePDF({ email, licenseKey, planType, expiryDate });
    
    const emailResult = await resend.emails.send({
      from: 'Aczen <onboarding@resend.dev>',
      to: [email],
      subject: `Welcome to Aczen - Your ${planType} License Key`,
      html: getEmailTemplate({ email, licenseKey, planType, expiryDate }),
      attachments: [
        {
          filename: 'Welcome_to_Aczen.txt',
          content: welcomeLetterContent,
        },
        {
          filename: `Aczen_License_${planType}_${licenseKey}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    console.log('Email sent successfully:', emailResult.id);
    res.json({ success: true, data: emailResult });
  } catch (error) {
    console.error('Error sending license email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const generateWelcomeLetter = () => {
  return `
Dear Valued Customer,

Welcome to Aczen!

We are delighted to welcome you to Aczen, your one-stop accounting software solution. 

With Aczen, you now have access to a comprehensive suite of accounting tools designed to streamline your business operations and help you manage your finances with ease.

Your license key has been generated and is included in the attached PDF document. Please keep this information safe and secure as you will need it to access your Aczen account.

What you can expect from Aczen:
• Complete accounting management
• Invoice and billing solutions
• Financial reporting and analytics
• Tax compliance tools
• Multi-user collaboration
• Secure cloud-based platform
• 24/7 customer support

If you have any questions or need assistance getting started, our support team is here to help. You can reach us at support@aczen.com or through our help center.

Thank you for choosing Aczen. We look forward to helping you achieve your business goals!

Best Regards,
Team Aczen

---
Aczen - One Stop Accounting Software
www.aczen.com
support@aczen.com
`;
};

const getEmailTemplate = (data) => {
  return `
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
        .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 10px 0; }
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
            
            <h3>📎 Attachments Included:</h3>
            <ul>
                <li><strong>Welcome Letter</strong> - Complete welcome message and getting started guide</li>
                <li><strong>License Certificate PDF</strong> - Official license document with QR code</li>
            </ul>
            
            <h3>🚀 What's Next?</h3>
            <p>1. Download and save your license documents</p>
            <p>2. Log in to your Aczen dashboard</p>
            <p>3. Complete your account setup</p>
            <p>4. Start managing your business finances!</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="#" class="btn">Get Started with Aczen</a>
            </div>
            
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
`;
};

const generateLicensePDF = async (data) => {
  const doc = new jsPDF();
  
  // Header with Aczen branding
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('ACZEN', 105, 30, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('One Stop Accounting Software', 105, 40, { align: 'center' });
  
  // Draw header line
  doc.setDrawColor(102, 126, 234);
  doc.setLineWidth(2);
  doc.line(20, 50, 190, 50);
  
  // License Certificate Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LICENSE CERTIFICATE', 105, 70, { align: 'center' });
  
  // License details table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  
  const startY = 90;
  const rowHeight = 12;
  const leftCol = 30;
  const rightCol = 100;
  
  // Table header
  doc.setFont('helvetica', 'bold');
  doc.text('License Information', leftCol, startY);
  
  // Table content
  doc.setFont('helvetica', 'normal');
  let currentY = startY + 15;
  
  // Draw table border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(leftCol - 5, startY + 5, 150, 60);
  
  // Email
  doc.setFont('helvetica', 'bold');
  doc.text('Email:', leftCol, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.email, rightCol, currentY);
  currentY += rowHeight;
  
  // License Key
  doc.setFont('helvetica', 'bold');
  doc.text('License Key:', leftCol, currentY);
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text(data.licenseKey, rightCol, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  currentY += rowHeight;
  
  // Plan Type
  doc.setFont('helvetica', 'bold');
  doc.text('Plan Type:', leftCol, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.planType.charAt(0).toUpperCase() + data.planType.slice(1), rightCol, currentY);
  currentY += rowHeight;
  
  // Expiry Date
  doc.setFont('helvetica', 'bold');
  doc.text('Expiry Date:', leftCol, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.expiryDate, rightCol, currentY);
  currentY += rowHeight + 20;
  
  // Generate QR Code for license key
  try {
    const qrDataUrl = await QRCode.toDataURL(data.licenseKey, {
      width: 100,
      margin: 1,
    });
    
    // Add QR code to PDF
    doc.addImage(qrDataUrl, 'PNG', 150, currentY, 30, 30);
    doc.setFontSize(10);
    doc.text('Scan QR Code for License Key', 135, currentY + 35);
  } catch (qrError) {
    console.error('Error generating QR code:', qrError);
  }
  
  // Add certificate content
  currentY += 50;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  const certificateText = [
    'This certificate confirms that the above email address has been granted',
    'a valid license to use Aczen accounting software under the specified plan.',
    '',
    'This license is valid until the expiry date mentioned above.',
    'For support and assistance, contact: support@aczen.com',
    '',
    'Thank you for choosing Aczen!',
  ];
  
  certificateText.forEach((line, index) => {
    doc.text(line, 105, currentY + (index * 8), { align: 'center' });
  });
  
  // Footer
  doc.setFontSize(8);
  doc.text('Generated on: ' + new Date().toLocaleDateString(), 20, 280);
  doc.text('Aczen - One Stop Accounting Software', 105, 280, { align: 'center' });
  doc.text('www.aczen.com', 190, 280, { align: 'right' });
  
  // Convert to buffer
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  return pdfBuffer;
};

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📧 Email API server running on port ${PORT}`);
  console.log(`Ready to send Aczen license emails!`);
});

module.exports = app;