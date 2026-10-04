// Shared helpers for emails sent by the application
export const escapeHtml = (text = '') =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const clientUrl = () =>
  (process.env.CLIENT_URL || 'https://www.mycogniverse.org').replace(/\/$/, '');

// Comma-separated list in ADMIN_EMAILS overrides the default recipients
export const adminEmails = () =>
  process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim())
    : [
        'gerald@sephoraberrebi.org',
        'associationsephoraberrebi@gmail.com',
        'noemie@sephoraberrebi.org',
      ];

export const emailButton = (href, label) =>
  `<a href="${href}" style="display:inline-block;padding:10px 16px;background:#00695c;color:#fff;text-decoration:none;border-radius:4px">${label}</a>`;
