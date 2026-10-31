# Wadi Alhuroof – Invoice & Quotation Generator (Team version)

A web app to create, save and print **invoices** and **quotations**.
Only your team can open it: everyone signs in with their own email and password,
and all documents are shared and updated live between team members.

Built with plain HTML, CSS and JavaScript. Sign-in and shared storage use
**Firebase** (Google), which has a free plan that is more than enough for a small team.
Hosting is done with **GitHub Pages** (free).

---

## Setup (about 15 minutes, one time)

### Part 1 – Create the Firebase project
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click **Create a project**, give it a name (for example `wadi-invoices`). Google Analytics is not needed.
3. **Sign-in:** open **Build → Authentication → Get started → Sign-in method**,
   enable **Email/Password**, and save.
4. **Database:** open **Build → Firestore Database → Create database**.
   Choose a location close to you (for example `eur3` or `me-central1`) and start in **production mode**.
5. **Team list and rules:**
   - Open `firestore.rules` from this folder in any text editor.
   - Replace the example emails with your team's emails, **all in lowercase**.
   - In Firebase open **Firestore Database → Rules**, paste the whole file, and click **Publish**.
6. **Create the team accounts:** open **Authentication → Users → Add user**
   and add each team member's email with a password
   (they can change it later with "Forgot password?").
   Do not let people sign up on their own – you add them here.
7. **Get your settings:** open **Project settings (gear icon) → General → Your apps**,
   click the web icon `</>`, register an app (no hosting needed), and copy the
   `firebaseConfig` values.

### Part 2 – Paste the settings
Open `js/firebase-config.js` and replace the placeholders with your values:
`apiKey`, `authDomain`, `projectId`, `appId`.

### Part 3 – Publish on GitHub Pages
1. Create a repository on GitHub and upload everything in this folder to the repository root.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/ (root)` → Save.**
3. After a minute the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain**
   and add `YOUR-USERNAME.github.io`.
   (If you skip this step, sign-in will fail.)

Share the link with your team. They sign in with the email and password you created.

---

## How access is protected
- The web page itself is public, because GitHub Pages is public on the free plan, but it shows
  **only a sign-in screen** until someone logs in.
- Your documents are stored in Firestore. The rules in `firestore.rules` make the database refuse
  anyone whose email is not on your list, even if they know the address of the page.
- The Firebase settings in `firebase-config.js` are not secrets. They only identify your project.
- The bank details and company stamp are in the page code, but they already appear on every invoice
  you send to customers.

## Adding or removing a team member
1. Add or delete the person in **Authentication → Users**.
2. Add or remove their email in the rules (**Firestore Database → Rules**) and publish.

## Features
- Invoice / Quotation toggle, with team-wide automatic numbering (editable)
- Several service lines with quantity and price
- Discount, paid amount and previous credit; amount in words (AED / Fils)
- Optional 5% VAT on quotations (invoices have no VAT line)
- **PAID** stamp and company stamp (can be turned off)
- Shared document list, updated live; shows who saved each document last
- Warnings if the number is already used, or if a teammate changed the same document after you opened it
- Backup to a file and restore
- Print or save as PDF (A4)

## Customise
Open `js/script.js` and edit the settings at the top:
`COMPANY`, `DEFAULT_BANK`, `COUNTER_START` (the last numbers already used), `NOTES`, `THANKS`.
Images are in `assets/`.

## Print / PDF
Click **Print / Save PDF**, choose **Save as PDF**, paper size **A4**, margins **None**,
and turn on **Background graphics** so the purple colours print.

## Good to know
- Opening `index.html` by double-clicking will not work, because browsers block module scripts on `file://`.
  Use the GitHub Pages link, or run `python3 -m http.server` in this folder and open `http://localhost:8000`.
- Unsaved work (a draft you are typing) is remembered on that device only until you save it.
- If two people edit the same document at the same time, the last person to press Save wins
  (the app warns before overwriting).
