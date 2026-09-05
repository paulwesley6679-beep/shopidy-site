import crypto from "crypto";
import { logOrderToSheet } from "../lib/sheets.js";

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const rawBody = await getRawBody(req);

  // Verify request actually came from Paystack
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    console.error("Invalid Paystack signature — rejected");
    return res.status(401).json({ message: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString());

  // Only handle successful payments
  if (event.event !== "charge.success") {
    return res.status(200).json({ message: "Event ignored" });
  }

  const data = event.data;

  // Double-check with Paystack API
  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${data.reference}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const verifyData = await verifyRes.json();

  if (!verifyData.status || verifyData.data.status !== "success") {
    console.error("Transaction verification failed", data.reference);
    return res.status(400).json({ message: "Verification failed" });
  }

  // Extract order details
  const customFields = verifyData.data.metadata?.custom_fields || [];
  const getField = (name) =>
    customFields.find((f) => f.variable_name === name)?.value || "—";

  const order = {
    reference:   verifyData.data.reference,
    email:       verifyData.data.customer.email,
    phone:       getField("phone"),
    product:     getField("product") || getField("plan"),
    amountNaira: verifyData.data.amount / 100,
    status:      verifyData.data.status,
    paidAt:      verifyData.data.paid_at,
  };

  // Log to Google Sheets
  try {
    await logOrderToSheet(order);
    console.log("Order logged →", order.reference);
  } catch (err) {
    console.error("Sheet log failed →", err.message);
  }

  return res.status(200).json({ message: "Order processed" });
}