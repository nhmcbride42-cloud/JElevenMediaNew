// lib/contact-email.js
//
// Plain HTML for the contact-form notification email. Kept outside /api so
// Vercel doesn't deploy it as its own endpoint.
//
// Uses tables and inline styles on purpose: many email clients strip <style>
// blocks or ignore modern CSS.
//
// Every value passed in must already be HTML-escaped by the caller.

const CLAY = '#9c6b4e';
const FONT = 'Georgia, serif';

// A row with a null label is a section heading (value is the heading text).
const row = (label, value) =>
  label === null
    ? `<tr><td colspan="2" style="padding:20px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${CLAY};border-bottom:1px solid #e8e2d9;">${value}</td></tr>`
    : `<tr><td style="padding:8px 16px 8px 0;font-size:14px;color:#8a8176;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:8px 0;font-size:15px;color:#2c2420;">${value}</td></tr>`;

// rows: [label | null, escapedValue][]; message: escaped HTML (newlines already <br>).
function renderContactEmail(rows, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>New project inquiry</title></head>
<body style="margin:0;padding:0;background:#f0ece4;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ece4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${CLAY};">J Eleven Media &middot; Contact form</p>
          <h1 style="margin:6px 0 0;font-size:24px;font-weight:normal;color:#2c2420;">New project inquiry</h1>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${rows.map(([label, value]) => row(label, value)).join('\n            ')}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 32px;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${CLAY};">About their business</p>
          <p style="margin:0;padding:14px 16px;background:#f7f4ef;border-left:3px solid ${CLAY};font-size:15px;line-height:1.6;color:#2c2420;">${message}</p>
          <p style="margin:20px 0 0;font-size:13px;color:#8a8176;">Reply to this email to answer them directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { renderContactEmail };
