/**
 * Yavamo — Google Form self-intake auto-import.
 *
 * Paste this entire file into the form's script editor, then follow the
 * 3 setup steps below. On every form submit it POSTs all answers (plus any
 * uploaded photos) to Yavamo, which creates a Lead automatically.
 *
 * ── 3-STEP SETUP ─────────────────────────────────────────────────────────
 * STEP 1 — Paste & configure
 *   1. Open the Google Form → click ⋮ (top right) → "Script editor".
 *   2. Delete any code in Code.gs and paste this whole file.
 *   3. Set WEBHOOK_SECRET below to the EXACT same value as the
 *      GOOGLE_FORM_WEBHOOK_SECRET environment variable in Vercel
 *      (Project → Settings → Environment Variables). They must match.
 *   4. Confirm WEBHOOK_URL is https://www.yavamo.ca/api/intake/google-form
 *   5. Save (Ctrl/Cmd + S), name the project "Yavamo intake webhook".
 *
 * STEP 2 — Install the submit trigger
 *   1. In the script editor click the clock icon (Triggers) → "+ Add Trigger".
 *   2. Choose: function → onFormSubmit | deployment → Head |
 *      event source → From form | event type → On form submit → Save.
 *
 * STEP 3 — Authorize (Google will ask once)
 *   1. Google shows "Authorization required" → Review permissions →
 *      choose the Google account that owns the form → Advanced →
 *      "Go to Yavamo intake webhook (unsafe)" → Allow.
 *   2. The script needs permission to read form responses AND uploaded
 *      files (Drive) so photos can be attached to the lead.
 *   3. Submit a TEST response on the form, then check Executions
 *      (stack icon, left sidebar) — you should see HTTP 200. The test
 *      lead appears in Yavamo under Jobs → Lead / Client.
 *
 * TROUBLESHOOTING
 * - HTTP 401: WEBHOOK_SECRET here doesn't match GOOGLE_FORM_WEBHOOK_SECRET.
 * - HTTP 503 "not configured": the env var is missing in Vercel (redeploy
 *   after adding it), or SUPABASE_SECRET_KEY is missing.
 * - Photos missing: the file-upload question must allow images; each photo
 *   is capped at ~4 MB and 5 photos per submit (larger ones are skipped).
 * - Page-2 questions Lavie adds later are imported automatically — unknown
 *   titles land in the lead's notes thread, never dropped.
 * ──────────────────────────────────────────────────────────────────────────
 */

var WEBHOOK_URL = 'https://www.yavamo.ca/api/intake/google-form';
var WEBHOOK_SECRET = 'PASTE_THE_SAME_SECRET_AS_GOOGLE_FORM_WEBHOOK_SECRET';

var MAX_PHOTO_BYTES = 4 * 1024 * 1024;
var MAX_PHOTOS = 5;

/**
 * Installable trigger: runs on every form submit.
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onFormSubmit(e) {
  var pairs = {};
  var attachments = [];

  var itemResponses = e.response.getItemResponses();
  for (var i = 0; i < itemResponses.length; i++) {
    var itemResponse = itemResponses[i];
    var item = itemResponse.getItem();
    var title = item.getTitle();

    // File-upload answers: fetch the bytes from Drive and attach them.
    // getResponse() returns an array of Drive file IDs for upload items.
    if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
      var fileIds = itemResponse.getResponse() || [];
      for (var f = 0; f < fileIds.length && attachments.length < MAX_PHOTOS; f++) {
        var attachment = driveFileToAttachment(fileIds[f]);
        if (attachment) attachments.push(attachment);
      }
      continue; // don't also put raw file IDs in the answers
    }

    pairs[title] = itemResponse.getResponse();
  }

  var payload = { responses: pairs, attachments: attachments };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var res = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log('Yavamo intake webhook: HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 500));
}

/**
 * Reads an uploaded file from Drive and returns a base64 attachment object.
 * Returns null when the file can't be read or is over the size cap.
 * @param {string} fileId Drive file ID from the upload answer.
 * @return {?{name:string,mimeType:string,dataBase64:string}}
 */
function driveFileToAttachment(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    if (!bytes || bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
      Logger.log('Skipping photo ' + fileId + ': empty or over size cap.');
      return null;
    }
    return {
      name: file.getName(),
      mimeType: blob.getContentType() || 'image/jpeg',
      dataBase64: Utilities.base64Encode(bytes),
    };
  } catch (err) {
    Logger.log('Skipping photo ' + fileId + ': ' + err);
    return null;
  }
}

/**
 * Manual test helper: run this once from the editor to verify connectivity
 * without submitting the form. Check the log for HTTP 200.
 */
function testWebhook() {
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: JSON.stringify({
      responses: {
        'Name': 'Webhook Test',
        'Email': 'test@example.com',
        'Number': '416-555-0100',
        'Address': '1 Test St, Toronto',
        'Role': 'tenant',
        'Job details': 'Connectivity test — safe to delete this lead.',
      },
      attachments: [],
    }),
    muteHttpExceptions: true,
  };
  var res = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log('Test: HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 500));
}
