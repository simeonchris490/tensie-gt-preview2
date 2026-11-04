# Tensie GT — Full-stack starter

This package keeps the original Tensie GT design and adds a working Node.js backend. It uses only Node's built-in modules, so there are no npm packages to install.

## Included features
- Original responsive frontend, vehicle customizer and finance calculator
- Test-drive request form saved to `data/db.json`
- Shared vehicle builds with 8-character links
- Persistent concept votes
- Email-list signups (stored locally; no marketing email is sent)
- Tess chat endpoint with basic rule-based replies and page actions
- Basic request-size checks, input validation and per-IP rate limiting

## Run on Android
1. Install Termux from its official F-Droid/GitHub distribution.
2. Put this folder somewhere Termux can access, or unzip it in Termux.
3. In Termux run:
   ```sh
   pkg update
   pkg install nodejs
   cd /path/to/tensie-fullstack
   npm start
   ```
4. Open `http://127.0.0.1:3000` in Chrome on the same phone.

On a computer, install Node.js 18 or newer, open this folder in a terminal, and run `npm start`.

## Data and admin
All records are saved in `data/db.json`. Back up this file regularly. There is intentionally no public admin route for reading private customer details. To review bookings or subscribers while developing, inspect this file locally and do not publish it.

## Important before public launch
This is a functional development starter, not a production dealership platform. The page still contains template/demo content and a placeholder price/currency and dealer email (`sales@example.com`). Confirm the real business name, currency, pricing, contact details, terms and privacy notice before launch. Add authentication and a protected admin dashboard, HTTPS, a real database with backups, spam/bot protection, consent/unsubscribe handling and an email provider before collecting real customer data. The current email-list endpoint stores addresses but does not send email. Tess is rule-based, not an AI model. The concept car specifications and pricing are placeholders from the supplied page.

## Deploy
Deploy the folder to a Node.js host that supports persistent storage, set `PORT` if required, and ensure the `data` directory is writable and backed up. Do not use ephemeral serverless storage for this JSON database.
