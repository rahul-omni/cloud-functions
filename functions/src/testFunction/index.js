const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require("../scCauseListScrapper/scCauseListScrapper.js");

// Runtime options for the function
const runtimeOpts = {
    timeoutSeconds: 540,
    memory: '2GB',
};

exports.testFunction = regionFunctions.runWith(runtimeOpts).https
    .onRequest(async (req, res) => {

        const listType = req.body.listType
        const searchBy = req.body.searchBy || 'all_courts'
        const causelistType = req.body.causelistType || 'misce'
        const listingDate = req.body.listingDate
        const mainAndSupplementry = req.body.mainAndSupplementry
        console.log(req.body)
        try {

            console.log("[start] [testFunction] testFunction service started at:", new Date().toISOString());

            const resData = await fetchSupremeCourtCauseList(listType, searchBy, causelistType, listingDate, mainAndSupplementry);
            
            res.status(200).json({
                success: true,
                message: "Test function completed successfully",
                data: resData
            });

        } catch (error) {
            console.error('[error] [testFunction] Error in test function:', error);
            res.status(500).json({
                success: false,
                message: "Test function failed. " + error.message,
                data: []
            });
        } finally {
            console.log("[end] [testFunction] testFunction service completed at:", new Date().toISOString());
        }
    });

// Test WhatsApp template sending for a given case_id.
// Payload: { caseId: "<uuid>", link?: "<url>", dayISO?: "YYYY-MM-DD" }
exports.testWhatsAppTemplateNotification = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }

      const caseId = body?.caseId || body?.case_id || body?.id;
      if (!caseId) {
        return res.status(400).json({ success: false, error: "caseId is required" });
      }

      const link = body?.link || "https://example.com/test.pdf";

      // For dedupe: notifications.day is Date, so we store YYYY-MM-DD
      // Default day = tomorrow (same as hcCauseListScrapper default)
      const dayObj = (() => {
        if (body?.dayISO && typeof body.dayISO === "string") {
          const d = new Date(body.dayISO + "T00:00:00.000Z");
          if (!isNaN(d.getTime())) return d;
        }
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
      })();

      const pad2 = (n) => String(n).padStart(2, "0");
      const dayISO = `${dayObj.getUTCFullYear()}-${pad2(dayObj.getUTCMonth() + 1)}-${pad2(dayObj.getUTCDate())}`;
      const formattedDate = `${pad2(dayObj.getUTCDate())}-${pad2(dayObj.getUTCMonth() + 1)}-${dayObj.getUTCFullYear()}`; // DD-MM-YYYY

      const db = require("../config/database");
      const { insertNotifications } = require("../hcCauseListScrapper/components/db");
      const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");

      // Fetch case number and all subscribed users for this case_id
      const sql = `
        SELECT
          cd.case_number,
          sc.user_id,
          u.country_code,
          u.mobile_number
        FROM subscribed_cases sc
        JOIN users u ON u.id = sc.user_id
        JOIN case_details cd ON cd.id = sc.case_id
        WHERE sc.case_id = $1
      `;
      const result = await db.query(sql, [caseId]);
      const rows = result?.rows || [];

      if (!rows || rows.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No subscribed users found for this caseId",
          sent: 0,
        });
      }

      const caseNumber = rows[0]?.case_number;
      const method = "whatsapp";

      let sent = 0;
      let failed = 0;
      const errors = [];

      for (const row of rows) {
        const { user_id, country_code, mobile_number } = row;
        const contact = `${country_code || ""}${mobile_number || ""}`.trim();
        const message = `Test notification for case ${caseNumber} on ${formattedDate}. Link: ${link}`;

        try {
          const inserted = await insertNotifications(caseId, dayISO, user_id, method, contact, message);
          await processWhatsAppNotificationsWithTemplate(inserted.id, "order_status", [caseNumber, formattedDate, link]);
          sent += 1;
        } catch (e) {
          failed += 1;
          errors.push({ user_id, error: e?.message || String(e) });
        }
      }

      return res.status(200).json({
        success: true,
        message: "WhatsApp template test completed",
        sent,
        failed,
        errors,
      });
    } catch (error) {
      console.error("[error] testWhatsAppTemplateNotification:", error);
      return res.status(500).json({ success: false, error: error.message || String(error) });
    }
  });
