# Gmail delivery for Palettè

The application supports Gmail SMTP for verification, password-reset and password-change notices. This is application email delivery, not Google Sign-In. No Google password is used.

This guide is for local Gmail SMTP testing. The live Render deployment uses [Brevo for password resets](DEPLOYMENT-RENDER.md#password-reset-emails). After connecting a local sender, set `ENABLE_PASSWORD_RESET=true` in `.env.local` for reset testing, or `ENABLE_EMAIL_FEATURES=true` to test signup verification as well.

## Connect locally

1. Sign in to the Gmail account you want to use as the sender and enable Google 2-Step Verification.
2. Open https://myaccount.google.com/apppasswords and create an app password named Palettè. Google may hide this option for protected or managed accounts. See https://support.google.com/accounts/answer/185833.
3. In a terminal in this project, run `npm run mail:setup:gmail`. Accept the sender address and enter the app password at the hidden prompt. Do not paste it into chat, source files or screenshots.
4. The command authenticates with Gmail before saving settings. It sends no email. On success it saves only the mail settings in ignored `.env.local`, preserving other settings and the existing outbox encryption key.
5. Restart `npm start` (or `npm run start:api`). Development reads `.env.local`; explicit process environment takes precedence. `npm run mail:check` checks authentication without sending email.
6. In Palettè, request a password reset from the login form and check Inbox and Spam. Open the link on the computer running Palettè and sign in with the new password. If signup verification is enabled, test Resend verification from the account dashboard as well. Keep recovery links private.

Existing messages written to the development file inbox are not sent retroactively. Request a fresh verification or reset email. There is a 60-second resend cooldown; the persistent queue polls every 10 seconds and retries failed deliveries up to six times with backoff, until message expiry. SMTP retries after an ambiguous connection failure can occasionally duplicate a message; tokens still work only once.

## Local links and troubleshooting

When `APP_ORIGIN` points to `http://127.0.0.1:4200`, open the email links on the computer running Palettè.

If authentication fails, check the sender account, app password, 2-Step Verification and network access to smtp.gmail.com:465. Google revokes app passwords after a Google password change. Do not use the normal account password. Revoke the Palettè app password in Google if it is exposed. The ignored local environment file still contains a secret: keep the Windows account and its files private.

## Validation status

Automated tests use an injected SMTP adapter; they do not send messages to real inboxes. Actual Gmail authentication and inbox receipt remain pending until the account owner completes setup and the verification/reset checks above.
