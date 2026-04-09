const { insertNotifications } = require("./db");
const {
  processWhatsAppNotificationsWithTemplate,
} = require("../../notification/processWhatsappNotification");

/**
 * WhatsApp for PHHC cause-list hits — same template flow as hcCauseListScrapper (Delhi).
 * Inserts notifications row (case_id + day + user + method) then sends Meta template "order_status".
 * Template variables: [case identifier, list date DD-MM-YYYY, PDF URL]
 */
async function notifyPhhcCauseListMatch({
  case_id,
  user_id,
  country_code,
  mobile_number,
  case_number,
  formattedDate,
  pdfUrl,
}) {
  const [dDay, dMonth, dYear] = formattedDate.split("-");
  const dayISO = `${dYear}-${dMonth}-${dDay}`;
  const contact = `${country_code || ""}${mobile_number || ""}`.trim();
  const identifier = case_number;
  const message = `You have a new order on ${identifier} dated ${formattedDate}.\nLink: ${pdfUrl}`;

  const inserted = await insertNotifications(
    case_id,
    dayISO,
    user_id,
    "whatsapp",
    contact,
    message
  );

  if (!inserted || !inserted.id) {
    console.log(
      `[notifyPhhcCauseListMatch] Skip WhatsApp: already sent for case_id=${case_id} day=${dayISO}`
    );
    return null;
  }

  await processWhatsAppNotificationsWithTemplate(inserted.id, "order_status", [
    identifier,
    formattedDate,
    pdfUrl,
  ]);

  return inserted.id;
}

module.exports = {
  notifyPhhcCauseListMatch,
};
