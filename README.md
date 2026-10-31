# Wadi Alhuroof – Invoice & Quotation Generator

A simple web app (HTML + CSS + JavaScript, no frameworks, no server) to create,
save and print **invoices** and **quotations**.

## Features
- Switch between Invoice and Quotation
- Automatic numbering (editable)
- Multiple service lines with quantity and price
- Discount, paid amount and previous credit, with automatic totals
- Amount in words (AED / Fils)
- **PAID** stamp and company stamp (can be turned off)
- Save documents in the browser, reload them, back them up to a file
- Print or save as a PDF (A4)

## Put it online with GitHub Pages (free)
1. Create a GitHub account and click **New repository** (for example `invoice-generator`).
2. Upload everything in this folder (`index.html`, `css/`, `js/`, `assets/`) to the repository root.
   On github.com: **Add file → Upload files**, drag the contents in, then **Commit changes**.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select branch `main`
   and folder `/ (root)`, then **Save**.
5. After a minute your site is live at `https://YOUR-USERNAME.github.io/invoice-generator/`.

> A public repository means anyone can open the page. Your saved documents are **not** uploaded –
> they stay in your own browser (localStorage). Use **Backup** regularly.

## Customise
Open `js/script.js` and edit the settings at the top:
- `COMPANY` – name, phone, email, website
- `DEFAULT_BANK` – bank details
- `COUNTER_START` – the last invoice / quotation number already used
- `NOTES` and `THANKS` – default wording

Replace `assets/logo.png`, `assets/company-stamp.png` or `assets/paid-stamp.png` to change the images.

## Print / PDF
Click **Print / Save PDF**, choose **Save as PDF**, paper size **A4**, margins **None**,
and turn on **Background graphics** so the purple colours print.
