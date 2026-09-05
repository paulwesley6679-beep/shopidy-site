import { google } from "googleapis";

function formatDate(isoString) {
  if (!isoString) return new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
  return new Date(isoString).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
}

function formatAmount(amount) {
  return `₦${Number(amount).toLocaleString()}`;
}

export async function logOrderToSheet(order) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const row = [
    formatDate(order.paidAt),
    order.reference,
    order.product,
    formatAmount(order.amountNaira),
    order.email,
    order.phone,
    order.status.toUpperCase(),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Orders!A:G",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}