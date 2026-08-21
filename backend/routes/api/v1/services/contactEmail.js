import sgMail from "@sendgrid/mail";

export class ContactEmailConfigurationError extends Error {}

export async function sendContactEmail({ name, email, inquiryType, message }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.CONTACT_EMAIL_FROM;
  const to = process.env.CONTACT_EMAIL_TO || "iuga@uw.edu";

  if (!apiKey || !from) {
    throw new ContactEmailConfigurationError("Contact email delivery is not configured");
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to,
    from,
    replyTo: { email: email, name: name },
    subject: `[IUGA contact] ${inquiryType} inquiry from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nInquiry type: ${inquiryType}\n\nMessage:\n${message}`,
  });
}
