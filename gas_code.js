// Google Apps Script backend — handles POST/GET requests from the frontend
// Deploy as Web App: Execute as USER_DEPLOYING, access ANYONE_ANONYMOUS

function doPost(e) {
  const sheet = getSheet()
  const data = JSON.parse(e.postData.contents)
  sheet.appendRow([new Date(), JSON.stringify(data)])
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON)
}

function doGet(e) {
  const sheet = getSheet()
  const rows = sheet.getDataRange().getValues()
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON)
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  return ss.getSheetByName('Sheet1') || ss.insertSheet('Sheet1')
}
