const { google } = require('googleapis');
const moment = require('moment-timezone');
require('dotenv').config();

class GoogleSheets {
    constructor() {
        this.sheetId = process.env.GOOGLE_SHEET_ID;
        this.clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
        this.privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

        // ============================================================
        // VALIDATE GOOGLE SHEETS CONFIG
        // ============================================================

        if (!this.sheetId) {
            console.error('❌ GOOGLE_SHEET_ID is missing in .env');
        }

        if (!this.clientEmail) {
            console.error('❌ GOOGLE_SHEETS_CLIENT_EMAIL is missing in .env');
        }

        if (!this.privateKey) {
            console.error('❌ GOOGLE_SHEETS_PRIVATE_KEY is missing in .env');
        }

        // ============================================================
        // GOOGLE AUTH
        // ============================================================

        this.auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: this.clientEmail,
                private_key: this.privateKey
                    ? this.privateKey.replace(/\\n/g, '\n')
                    : '',
            },
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
            ],
        });

        this.sheets = google.sheets({
            version: 'v4',
            auth: this.auth,
        });

        // ============================================================
        // SHEET NAME
        // ============================================================

        // IMPORTANT:
        // Google Sheet ke andar tab ka exact naam "whatshapp" hona chahiye.
        this.sheetName = 'whatshapp';

        console.log('✅ Google Sheets service initialized');
        console.log('📄 Sheet:', this.sheetName);
    }

    // ============================================================
    // APPEND MESSAGE
    // ============================================================

    async appendMessage(messageData) {
        try {
            if (!messageData) {
                console.error('❌ appendMessage: messageData is missing');
                return null;
            }

            if (!this.sheetId) {
                console.error('❌ Google Sheet ID is missing');
                return null;
            }

            // ========================================================
            // SYNC TIME
            // ========================================================

            const syncedAt = moment()
                .tz('Asia/Kolkata')
                .format('DD/MM/YYYY HH:mm');

            // ========================================================
            // TIMESTAMP
            // ========================================================

            let timestamp = '';

            if (
                messageData.timestamp !== undefined &&
                messageData.timestamp !== null &&
                messageData.timestamp !== ''
            ) {
                timestamp = String(messageData.timestamp);
            }

            // ========================================================
            // 14 COLUMNS: A -> N
            // ========================================================

            const values = [[
                messageData.id || '',                          // A: ID
                messageData.whatsapp_message_id || '',         // B: WhatsApp Message ID
                messageData.group_id || '',                    // C: Group ID
                messageData.group_name || '',                  // D: Group Name
                messageData.sender_id || '',                   // E: Sender ID
                messageData.sender_number || '',               // F: Sender Number
                messageData.sender_name || '',                 // G: Sender Name
                messageData.message || '',                     // H: Message
                messageData.message_type || '',                // I: Message Type
                timestamp,                                     // J: Timestamp
                messageData.has_media ? 'Yes' : 'No',          // K: Has Media
                messageData.media_path || '',                  // L: Media Path
                messageData.location_link || '',                // M: Location Link
                syncedAt                                       // N: Synced At
            ]];

            // ========================================================
            // GOOGLE SHEETS APPEND REQUEST
            // ========================================================

            const request = {
                spreadsheetId: this.sheetId,

                range: `'${this.sheetName}'!A:N`,

                valueInputOption: 'USER_ENTERED',

                insertDataOption: 'INSERT_ROWS',

                resource: {
                    values,
                },
            };

            const response = await this.sheets.spreadsheets.values.append(
                request
            );

            console.log(
                `✅ Google Sheet updated: ${
                    response.data?.updates?.updatedRange || 'unknown range'
                }`
            );

            return response.data;

        } catch (error) {
            console.error(
                '❌ Google Sheets append failed:',
                error?.message || error
            );

            if (error?.response?.data) {
                console.error(
                    'Google API Error:',
                    JSON.stringify(error.response.data, null, 2)
                );
            }

            return null;
        }
    }

    // ============================================================
    // INITIALIZE SHEET HEADERS
    // ============================================================

    async initializeSheet() {
        try {
            if (!this.sheetId) {
                console.error('❌ Google Sheet ID is missing');
                return false;
            }

            // ========================================================
            // 14 HEADERS: A -> N
            // ========================================================

            const headers = [[
                'ID',                       // A
                'WhatsApp Message ID',      // B
                'Group ID',                 // C
                'Group Name',               // D
                'Sender ID',                // E
                'Sender Number',            // F
                'Sender Name',              // G
                'Message',                  // H
                'Message Type',             // I
                'Timestamp',                // J
                'Has Media',                // K
                'Media Path',               // L
                'Location Link',            // M
                'Synced At'                 // N
            ]];

            const request = {
                spreadsheetId: this.sheetId,

                range: `'${this.sheetName}'!A1:N1`,

                valueInputOption: 'RAW',

                resource: {
                    values: headers,
                },
            };

            const response = await this.sheets.spreadsheets.values.update(
                request
            );

            console.log(
                `✅ Google Sheet "${this.sheetName}" headers initialized`
            );

            console.log(
                `📊 Updated range: ${
                    response.data?.updatedRange || 'unknown'
                }`
            );

            return true;

        } catch (error) {
            console.error(
                '❌ Google Sheet initialization failed:',
                error?.message || error
            );

            if (error?.response?.data) {
                console.error(
                    'Google API Error:',
                    JSON.stringify(error.response.data, null, 2)
                );
            }

            return false;
        }
    }

    // ============================================================
    // TEST CONNECTION
    // ============================================================

    async testConnection() {
        try {
            if (!this.sheetId) {
                console.error('❌ GOOGLE_SHEET_ID is missing');
                return false;
            }

            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId,
                fields: 'spreadsheetId,properties.title,sheets.properties',
            });

            console.log('');
            console.log('========================================');
            console.log('✅ GOOGLE SHEETS CONNECTION SUCCESS');
            console.log('========================================');

            console.log(
                '📄 Spreadsheet:',
                response.data?.properties?.title || 'Unknown'
            );

            const sheets = response.data?.sheets || [];

            console.log(
                '📑 Available tabs:',
                sheets
                    .map(sheet => sheet.properties?.title)
                    .filter(Boolean)
                    .join(', ') || 'None'
            );

            const targetSheetExists = sheets.some(
                sheet =>
                    sheet.properties?.title === this.sheetName
            );

            if (!targetSheetExists) {
                console.error(
                    `❌ Sheet tab "${this.sheetName}" was not found`
                );

                console.error(
                    `⚠️ Create a Google Sheets tab named exactly: "${this.sheetName}"`
                );

                return false;
            }

            console.log(
                `✅ Target tab "${this.sheetName}" found`
            );

            return true;

        } catch (error) {
            console.error(
                '❌ Google Sheets connection test failed:',
                error?.message || error
            );

            if (error?.response?.data) {
                console.error(
                    'Google API Error:',
                    JSON.stringify(error.response.data, null, 2)
                );
            }

            return false;
        }
    }
}


// ============================================================
// EXPORT SINGLE INSTANCE
// ============================================================

module.exports = new GoogleSheets();