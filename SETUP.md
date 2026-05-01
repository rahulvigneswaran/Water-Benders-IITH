# Water Benders IITH – Setup Guide

A dog water bowl tracker for IIT Hyderabad. Free, no server needed.

---

## 1. Create the Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it **"Water Benders IITH"** (or anything you like).
3. The Apps Script will automatically create all required sheets on first run.

---

## 2. Set Up the Google Apps Script

1. In the spreadsheet, open **Extensions → Apps Script**.
2. Delete the default `myFunction()` code.
3. Copy the entire contents of `apps-script/Code.gs` from this repo and paste it in.
4. Click **Save** (Ctrl+S / ⌘+S).

---

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: Water Benders IITH
   - **Execute as**: Me
   - **Who has access**: Anyone (even anonymous)
4. Click **Deploy**.
5. Authorise the app when prompted (it needs Drive + Sheets access to store data and photos).
6. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## 4. Configure the Frontend

Open `js/config.js` and replace the placeholder:

```js
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
```

You can also adjust:
- `MAP_CENTER` — default map centre (latitude, longitude)
- `MAP_ZOOM` — default zoom level
- `DEFAULT_TIMER_HOURS` — default refill interval
- `REFRESH_INTERVAL` — how often the page re-fetches data (ms)

---

## 5. Set the Admin Passcode

The first time you click **Admin (🔒)** in the app, enter any passcode — it will be rejected but the default `changeme123` will be written into the **Settings** sheet.

1. Open the spreadsheet → **Settings** sheet.
2. Find the row with `admin_passcode` in column A.
3. Change the value in column B to your own secret passcode.
4. Save. You can now log in with that passcode.

---

## 6. Deploy to GitHub Pages

```bash
git add .
git commit -m "Initial Water Benders IITH app"
git push origin main
```

Then in your GitHub repo go to **Settings → Pages → Source: Deploy from branch → main → / (root)**.

Your app will be live at:
```
https://rahulvigneswaran.github.io/Water-Benders-IITH/
```

---

## 7. Add PWA Icons (recommended)

For the best experience on Android/iOS, add two PNG icons:

- `icons/icon-192.png` — 192 × 192 px
- `icons/icon-512.png` — 512 × 512 px

You can generate them from `icons/icon.svg` using any image editor or [squoosh.app](https://squoosh.app).

---

## How It Works

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | HTML + CSS + Vanilla JS | Free (GitHub Pages) |
| Backend / API | Google Apps Script | Free |
| Database | Google Sheets | Free |
| Photo storage | Google Drive | Free (15 GB) |
| Maps | Leaflet.js + OpenStreetMap | Free |
| Notifications | Web Notifications API | Free |

---

## Bowl Status Colors

| Color | Meaning | When |
|-------|---------|------|
| 🟢 Green | Fresh | < 55% of timer elapsed |
| 🟠 Orange | Getting dry | 55–85% of timer elapsed |
| 🔴 Red (pulsing) | Needs water NOW | > 85% of timer elapsed |
| ⚪ Grey | Never filled | No fill recorded |

---

## FAQ

**Q: Can anyone fill a bowl or only admins?**  
A: Anyone can tap "I Filled It!" — no login needed. Admin mode is only for adding/editing bowls and managing Water Benders.

**Q: What if the Google Apps Script URL changes?**  
A: Re-deploy the script (Deploy → Manage deployments → Edit → increment version → Deploy) and the URL stays the same.

**Q: Photos not showing?**  
A: Make sure the Drive folder sharing is set to "Anyone with the link". The script does this automatically when uploading.
