/**
 * Notifications Module - Evaluates expiration statuses and triggers alerts
 */
const Notifications = {
  // Constants for status levels
  STATUS_HEALTHY: 'healthy',
  STATUS_WARNING: 'warning',
  STATUS_DANGER: 'danger',
  STATUS_EMPTY: 'empty',

  // Evaluate single date against current date and warning thresholds
  evaluateDate: function(dateStr, warningDays) {
    if (!dateStr) return { status: this.STATUS_EMPTY, daysRemaining: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0); // compare date only
    
    const expiry = new Date(dateStr);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      return { status: this.STATUS_DANGER, daysRemaining };
    } else if (daysRemaining <= warningDays) {
      return { status: this.STATUS_WARNING, daysRemaining };
    } else {
      return { status: this.STATUS_HEALTHY, daysRemaining };
    }
  },

  // Evaluate all documents for a single employee record
  evaluateEmployee: function(emp, warningDays) {
    const docFields = [
      { key: 'ql', label: 'QL' },
      { key: 'passportExpiry', label: 'Passport' },
      { key: 'medicalExpiry', label: 'Medical' },
      { key: 'insuranceExpiry', label: 'Insurance' },
      { key: 'employmentPassExpiry', label: 'Employment Pass' },
      { key: 'tanaExpiry', label: 'TANA' },
      { key: 'greenIcExpiry', label: 'Green IC' }
    ];

    const results = {};
    let worstStatus = this.STATUS_HEALTHY;
    let alertCount = 0;

    docFields.forEach(doc => {
      const evaluation = this.evaluateDate(emp[doc.key], warningDays);
      results[doc.key] = evaluation;

      if (evaluation.status === this.STATUS_DANGER) {
        worstStatus = this.STATUS_DANGER;
        alertCount++;
      } else if (evaluation.status === this.STATUS_WARNING && worstStatus !== this.STATUS_DANGER) {
        worstStatus = this.STATUS_WARNING;
        alertCount++;
      }
    });

    return {
      documents: results,
      status: worstStatus,
      alertCount: alertCount
    };
  },

  // Gather target emails for an employee (overrides or global defaults)
  getEmailsForEmployee: function(emp, settings) {
    if (emp.contacts && emp.contacts.emails && emp.contacts.emails.length > 0) {
      // Clean and return employee custom emails
      return emp.contacts.emails.map(e => e.trim()).filter(Boolean);
    }
    
    // Fallback to global defaults
    if (settings && settings.defaultEmails) {
      return settings.defaultEmails.split(',').map(e => e.trim()).filter(Boolean);
    }
    
    return [];
  },

  // Gather target WhatsApp numbers for an employee (overrides or global defaults)
  getWhatsappForEmployee: function(emp, settings) {
    if (emp.contacts && emp.contacts.whatsappNumbers && emp.contacts.whatsappNumbers.length > 0) {
      // Clean and return employee custom numbers
      return emp.contacts.whatsappNumbers.map(n => n.trim().replace(/[^+\d]/g, '')).filter(Boolean);
    }
    
    // Fallback to global defaults
    if (settings && settings.defaultWhatsapp) {
      return settings.defaultWhatsapp.split(',').map(n => n.trim().replace(/[^+\d]/g, '')).filter(Boolean);
    }
    
    return [];
  },

  // Generate a formatted Markdown message text for notifications
  generateMessageText: function(emp, evaluation) {
    let msg = `*⚠️ EXPIRATION ALERT: DOCUMENT RENEWAL REQUIRED* \n\n`;
    msg += `*Employee Name:* ${emp.name}\n`;
    msg += `*Passport No:* ${emp.passportNo}\n\n`;
    msg += `Please review the following expiring/expired documents:\n`;

    const docLabels = {
      ql: 'QL',
      passportExpiry: 'Passport',
      medicalExpiry: 'Medical Check',
      insuranceExpiry: 'Insurance',
      employmentPassExpiry: 'Employment Pass',
      tanaExpiry: 'TANA Pass',
      greenIcExpiry: 'Green IC'
    };

    let hasAlerts = false;
    for (const [key, evalResult] of Object.entries(evaluation.documents)) {
      if (evalResult.status === this.STATUS_DANGER) {
        msg += `❌ *${docLabels[key]}*: EXPIRED on ${emp[key]} (${Math.abs(evalResult.daysRemaining)} days ago)\n`;
        hasAlerts = true;
      } else if (evalResult.status === this.STATUS_WARNING) {
        msg += `⚠️ *${docLabels[key]}*: Expiring on ${emp[key]} (${evalResult.daysRemaining} days left)\n`;
        hasAlerts = true;
      }
    }

    if (!hasAlerts) {
      msg += `All documents are currently valid and healthy. ✅\n`;
    }

    if (emp.remarks) {
      msg += `\n*Remarks:* ${emp.remarks}\n`;
    }

    msg += `\n_Please process the renewals immediately. System notification._`;
    return msg;
  },

  // Generate WhatsApp sending URL
  generateWhatsappUrl: function(phone, text) {
    // Format number to omit + sign just in case WhatsApp API prefers it
    const cleanPhone = phone.replace('+', '');
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
  },

  // Send Browser Native Notification
  sendBrowserNotification: function(title, body) {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: 'favicon.ico' });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  },

  // Trigger simulated Email Send and Log It
  sendEmailSimulated: function(emp, evaluation, targetEmails, senderName) {
    const subject = `[Expiration Alert] Action Required: ${emp.name} Expirations`;
    
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px;">
        <h2 style="color: #e11d48; margin-top: 0;">⚠️ Expiration Renewal Notice</h2>
        <p>This is an automated notification regarding document expirations for the following employee:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 120px;">Employee Name:</td>
            <td style="padding: 6px 0;">${emp.name}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold;">Passport No:</td>
            <td style="padding: 6px 0;">${emp.passportNo}</td>
          </tr>
        </table>
        
        <h3 style="border-bottom: 2px solid #cbd5e1; padding-bottom: 6px; color: #1e293b;">Document Statuses</h3>
        <ul style="padding-left: 20px;">
    `;

    const docLabels = {
      ql: 'QL',
      passportExpiry: 'Passport',
      medicalExpiry: 'Medical Check',
      insuranceExpiry: 'Insurance',
      employmentPassExpiry: 'Employment Pass',
      tanaExpiry: 'TANA Pass',
      greenIcExpiry: 'Green IC'
    };

    for (const [key, evalResult] of Object.entries(evaluation.documents)) {
      if (evalResult.status === this.STATUS_DANGER) {
        htmlContent += `<li style="margin-bottom: 8px;"><strong style="color: #ef4444;">${docLabels[key]} (EXPIRED)</strong>: Expiry Date was ${emp[key]} (${Math.abs(evalResult.daysRemaining)} days ago)</li>`;
      } else if (evalResult.status === this.STATUS_WARNING) {
        htmlContent += `<li style="margin-bottom: 8px;"><strong style="color: #f59e0b;">${docLabels[key]} (Expiring Soon)</strong>: Expiry Date is ${emp[key]} (${evalResult.daysRemaining} days left)</li>`;
      }
    }

    htmlContent += `
        </ul>
        ${emp.remarks ? `<p><strong>Remarks:</strong> ${emp.remarks}</p>` : ''}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">This email is a simulated notification sent via the Alam Mesra Project Expiration Date Monitoring system.</p>
      </div>
    `;

    // Log to Database for Outbox View
    targetEmails.forEach(email => {
      DB.logNotification({
        employeeId: emp.id,
        employeeName: emp.name,
        type: 'Email',
        recipient: email,
        subject: subject,
        body: htmlContent.trim(),
        sentBy: senderName
      });
    });

    // Also fire local browser alert
    this.sendBrowserNotification(subject, `Emails sent to: ${targetEmails.join(', ')}`);
    return { success: true, count: targetEmails.length };
  },

  // Log WhatsApp notification simulation
  logWhatsappSimulated: function(emp, evaluation, targetPhone, messageText, senderName) {
    DB.logNotification({
      employeeId: emp.id,
      employeeName: emp.name,
      type: 'WhatsApp',
      recipient: targetPhone,
      subject: `WhatsApp Alert: ${emp.name}`,
      body: messageText,
      sentBy: senderName
    });

    this.sendBrowserNotification(`WhatsApp link opened`, `Message details logged for: ${targetPhone}`);
  }
};

window.Notifications = Notifications;
