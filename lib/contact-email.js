// lib/contact-email.js
//
// Branded HTML for the contact-form notification email. Kept outside /api so
// Vercel doesn't deploy it as its own endpoint.
//
// Written with table-based layout and inline styles on purpose: many email
// clients strip <style> blocks or ignore modern CSS like Flexbox/Grid.
//
// Every value passed in must already be HTML-escaped by the caller.

const CLAY = '#9c6b4e';
const INK = '#2c2420';
const LINE = '#e8e2d9';
const FONT = "'Playfair Display',Georgia,serif";

const fieldRow = (label, value, isLink) => `
                <tr>
                  <td style="padding:20px 40px 0;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${CLAY};font-family:${FONT};">${label}</p>
                    ${isLink
                      ? `<a href="mailto:${value}" style="margin:0;font-size:17px;color:${INK};font-family:${FONT};text-decoration:none;line-height:1.4;">${value}</a>`
                      : `<p style="margin:0;font-size:17px;color:${INK};font-family:${FONT};line-height:1.4;">${value}</p>`}
                  </td>
                </tr>
                <tr><td style="padding:20px 40px 0;"><div style="height:1px;background:${LINE};"></div></td></tr>`;

// rows: [label, escapedValue][]; message: escaped HTML (newlines already <br>);
// sender: { name, email } escaped, used for the reply button.
function renderContactEmail(rows, message, sender) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Contact Form Submission</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ece4;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0ece4;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Brand kicker above the card -->
          <tr>
            <td style="padding:0 0 24px 0;">
              <p style="margin:0;font-family:${FONT};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${CLAY};">J Eleven Media</p>
            </td>
          </tr>

          <!-- Main white card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:32px 40px 24px;border-bottom:1px solid ${LINE};">
                    <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${CLAY};font-family:${FONT};">New Inquiry</p>
                    <h1 style="margin:0;font-family:${FONT};font-size:28px;font-weight:400;color:${INK};letter-spacing:-0.01em;line-height:1.15;">Someone reached out</h1>
                  </td>
                </tr>
              </table>

              <!-- One row per form field, separated by thin dividers -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows.map(([label, value]) => fieldRow(label, value, label === 'Email')).join('')}

                <!-- Message, italicized as quoted visitor content -->
                <tr>
                  <td style="padding:20px 40px 32px;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${CLAY};font-family:${FONT};">Message</p>
                    <p style="margin:0;font-size:17px;color:${INK};font-family:${FONT};line-height:1.65;font-style:italic;">${message}</p>
                  </td>
                </tr>
              </table>

              <!-- One-click reply -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 40px 36px;">
                    <a href="mailto:${sender.email}" style="display:inline-block;background:${CLAY};color:#ffffff;font-family:${FONT};font-size:14px;letter-spacing:0.06em;text-decoration:none;padding:12px 28px;border-radius:50px;">Reply to ${sender.name} &rarr;</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="margin:0;font-family:${FONT};font-size:11px;color:#b8a99a;letter-spacing:0.08em;">J Eleven Media &nbsp;&middot;&nbsp; Lenoir City, TN</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { renderContactEmail };
