# Send-to-Sheet-
send-to-google-sheet-with a right click 
# Send to Google Sheet (Chrome Extension)

Right-click any link, selection, or page → **Send to Google Sheet**.  
This extension calls a Google  **webhook** that appends a new row to your sheet:

- **Column A**: Date (MM/dd/yy)
- **Column B**: Clickable hyperlink (`HYPERLINK(url, url)`)

## Demo
- Right-click a link → “Send link to Google Sheet”
- Right-click selected text → “Send selection to Google Sheet”
- Right-click the page → “Send page URL to Google Sheet”

---

## How it works (high level)
- A minimal Chrome extension adds context-menu items.
- On click, it sends the URL/selection to your **Apps Script Web App** via `GET ?data=...`.
- The Apps Script writes a new row into your target sheet.

---

## Prerequisites
- A Google Sheet (e.g., **Production Tracker**).
- Permission to deploy Apps Script Web Apps.
- Chrome  browser that supports **Manifest v3**.

---

## Set up the Google Sheet webhook (Apps Script)

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Paste the following **Apps Script** code into your project and save:
VVVVVVVVVVVVVVV

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Production Tracker");
    
    if (!sheet) {
      return ContentService.createTextOutput("ERROR: No 'Production Tracker' tab found");
    }
    
    const data = (e && e.parameter && e.parameter.data) ? e.parameter.data : "";
    if (!data) return ContentService.createTextOutput("OK - no data provided");
    
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy");
    
    // Find the first empty row in column A (more reliable than getLastRow)
    const columnA = sheet.getRange("A:A").getValues();
    let newRow = 1;
    for (let i = 0; i < columnA.length; i++) {
      if (columnA[i][0] === "") {
        newRow = i + 1;
        break;
      }
    }
    
    // Write to columns A and B
    sheet.getRange(newRow, 1).setValue(dateStr);  // Column A: Date
    sheet.getRange(newRow, 2).setValue(data);      // Column B: URL/text
    
    return ContentService.createTextOutput("OK - Written to row " + newRow);
    
  } catch(error) {
    return ContentService.createTextOutput("ERROR: " + error.toString());
  }
}
## Deploy the Web App:

Click Deploy → New deployment → Web app

Execute as: Me

Who has access: Anyone with the link (or your domain)

Click Deploy and copy the Web App URL (ends with /exec).

## Security note: “Anyone with the link” is easiest. If you need stricter control, add a shared secret (e.g., a key= param) and verify it in code before writing to the sheet.

## Install the extension (unpacked)

Download/clone this repo to your computer.

Open chrome://extensions → enable Developer mode (top-right).

Click Load unpacked → select the project folder.

Open the extension’s Options page and paste your Apps Script /exec URL.

## Usage

Right-click a link → Send link to Google Sheet

Right-click selected text → Send selection to Google Sheet

Right-click page → Send page URL to Google Sheet

Each action appends a row in your sheet: A = date, B = hyperlink.

## Files

manifest.json — Chrome extension manifest (v3)

background.js — Context-menu registration + webhook call

options.html — Simple UI to save your webhook URL (in chrome.storage.sync)

icon128.png — Extension icon

Customization
