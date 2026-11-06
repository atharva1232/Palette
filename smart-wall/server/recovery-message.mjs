const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function recoveryMessage(to, purpose, origin, token) {
  const verify = purpose === 'verify';
  const action = verify ? 'Confirm your email' : 'Choose a new password';
  const duration = verify ? '24 hours' : '30 minutes';
  const url = `${origin}/#${purpose}=${token}`;
  return {
    to, subject: verify ? 'Verify your SmartWall email' : 'Reset your SmartWall password',
    text: `${action}: ${url}\nThis link works once and expires in ${duration}. If you did not request it, ignore this message.`,
    html: `<div style="background:#faf5ef;padding:32px;font-family:Arial,sans-serif;color:#35232b"><div style="max-width:520px;margin:auto;background:white;padding:32px;border-radius:16px"><h1 style="color:#713d4d">SmartWall</h1><h2>${action}</h2><p>${verify ? 'Welcome! Verify your email to save your room designs to your account.' : 'Use the button below to reset your SmartWall password.'}</p><p style="margin:32px 0"><a href="${escape(url)}" style="background:#713d4d;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">${action}</a></p><p>This link works once and expires in ${duration}.</p><p>If the button does not work, copy this link:</p><p style="word-break:break-all">${escape(url)}</p><p>If you did not request this email, ignore it.</p></div></div>`,
  };
}
