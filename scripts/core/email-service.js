// Email notification service using EmailJS
// This service sends email notifications to barangay officials when their request status changes

// EmailJS Configuration
// To use this service:
// 1. Create a free account at https://www.emailjs.com/
// 2. Create an email service (Gmail, Outlook, etc.)
// 3. Create email templates for approved and rejected statuses
// 4. Replace the placeholders below with your actual IDs

const EMAILJS_CONFIG = {
  serviceId: 'service_ruqlxib',      // EmailJS Service ID
  templateIdApproved: 'template_s1f5maq',  // Template for approved requests
  templateIdRejected: 'template_mtwfc9i',  // Template for rejected requests
  publicKey: 'FjJFPA9zEyuupBSrL'       // EmailJS Public Key
};

/**
 * Initialize EmailJS with your public key
 * Call this once when the page loads
 */
export function initEmailService() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init({
      publicKey: EMAILJS_CONFIG.publicKey,
      blockHeadless: true,
      limitRate: {
        id: 'app',
        throttle: 10000,
      }
    });
    console.log('Email service initialized');
  } else {
    console.warn('EmailJS library not loaded. Email notifications will not work.');
  }
}

/**
 * Send approval notification email
 * @param {string} recipientEmail - Email address of the barangay official
 * @param {object} requestData - Request details (title, category, location, etc.)
 * @returns {Promise<void>}
 */
export async function sendApprovalEmail(recipientEmail, requestData) {
  if (!recipientEmail) {
    console.error('Cannot send email: No recipient email provided');
    return;
  }

  if (typeof emailjs === 'undefined') {
    console.error('EmailJS is not loaded');
    return;
  }

  console.log('Sending approval email to:', recipientEmail);
  console.log('Request data:', requestData);

  try {
    const templateParams = {
      to_name: requestData.createdBy?.displayName || 'Barangay Official',
      from_name: 'Infrastructure Monitoring System',
      reply_to: 'noreply@projectmonitoring.local',  // Optional: Set a reply-to address
      request_title: requestData.title || 'Untitled Request',
      request_category: requestData.category || 'N/A',
      request_location: requestData.location || 'N/A',
      request_budget: requestData.budget ? `₱${Number(requestData.budget).toLocaleString()}` : 'Not specified',
      status: 'APPROVED',
      message: `Your request "${requestData.title}" has been approved and will proceed to the engineering phase.`,
      to_email: recipientEmail  // Add this back for template usage
    };

    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateIdApproved,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );

    console.log('Approval email sent successfully:', response.status, response.text);
  } catch (error) {
    console.error('Failed to send approval email:', error);
    // Don't throw error - we don't want to block the approval process if email fails
  }
}

/**
 * Send rejection notification email
 * @param {string} recipientEmail - Email address of the barangay official
 * @param {object} requestData - Request details (title, category, location, etc.)
 * @param {string} reason - Reason for rejection
 * @returns {Promise<void>}
 */
export async function sendRejectionEmail(recipientEmail, requestData, reason) {
  if (!recipientEmail) {
    console.error('Cannot send email: No recipient email provided');
    return;
  }

  if (typeof emailjs === 'undefined') {
    console.error('EmailJS is not loaded');
    return;
  }

  console.log('Sending rejection email to:', recipientEmail);
  console.log('Request data:', requestData);

  try {
    const templateParams = {
      to_name: requestData.createdBy?.displayName || 'Barangay Official',
      from_name: 'Infrastructure Monitoring System',
      reply_to: 'noreply@projectmonitoring.local',  // Optional: Set a reply-to address
      request_title: requestData.title || 'Untitled Request',
      request_category: requestData.category || 'N/A',
      request_location: requestData.location || 'N/A',
      request_budget: requestData.budget ? `₱${Number(requestData.budget).toLocaleString()}` : 'Not specified',
      status: 'REJECTED',
      rejection_reason: reason || 'No reason provided',
      message: `Your request "${requestData.title}" has been rejected.`,
      to_email: recipientEmail  // Add this back for template usage
    };

    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateIdRejected,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );

    console.log('Rejection email sent successfully:', response.status, response.text);
  } catch (error) {
    console.error('Failed to send rejection email:', error);
    // Don't throw error - we don't want to block the rejection process if email fails
  }
}

/**
 * Test the email service configuration
 * @returns {Promise<boolean>} - Returns true if test email sent successfully
 */
export async function testEmailService() {
  if (typeof emailjs === 'undefined') {
    console.error('EmailJS is not loaded');
    return false;
  }

  try {
    const testParams = {
      to_email: 'test@example.com',
      to_name: 'Test User',
      request_title: 'Test Request',
      request_category: 'Test Category',
      request_location: 'Test Location',
      request_budget: '₱50,000',
      status: 'APPROVED',
      message: 'This is a test email.'
    };

    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateIdApproved,
      testParams
    );

    console.log('Test email sent successfully:', response);
    return true;
  } catch (error) {
    console.error('Test email failed:', error);
    return false;
  }
}
