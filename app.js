const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const pool = require('./db');

const fs = require('fs');
const path = require('path');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'company-archive'
    }),

    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ],
        headless: true
    }
});

// =====================================
// DATABASE PREPARATION
// =====================================

async function prepareDatabase() {
    try {
        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS media_path TEXT
        `);

        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS sender_id TEXT
        `);

        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS sender_number TEXT
        `);

        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS sender_name TEXT
        `);

        console.log('Database structure ready ✅');

    } catch (error) {
        console.error('Database preparation failed ❌');
        console.error(error);
    }
}

// =====================================
// QR CODE
// =====================================

client.on('qr', (qr) => {
    console.log('QR code scan karo:');
    qrcode.generate(qr, { small: true });
});

// =====================================
// AUTHENTICATED
// =====================================

client.on('authenticated', () => {
    console.log('WhatsApp authenticated ✅');
});

// =====================================
// READY
// =====================================

client.on('ready', async () => {
    try {
        console.log('');
        console.log('============================================================');
        console.log('🎉 WHATSAPP READY ✅');
        console.log('============================================================');
        console.log(`Time: ${new Date().toISOString()}`);
        console.log('WhatsApp client is completely ready.');

        try {
            const info = client.info;

            if (info) {
                console.log('[READY DEBUG] Client info available ✅');
                console.log('Phone:', info.wid?._serialized || 'Unknown');
                console.log('Push name:', info.pushname || 'Unknown');
                console.log('Platform:', info.platform || 'Unknown');
            }
        } catch (infoError) {
            console.log(
                '[READY DEBUG] Client info unavailable:',
                infoError.message
            );
        }

        await prepareDatabase();

        console.log('============================================================');
        console.log('');

    } catch (error) {
        console.error('READY handler failed ❌');
        console.error(error);
    }
});

// =====================================
// AUTH FAILURE
// =====================================

client.on('auth_failure', (message) => {
    console.error('Authentication failed ❌');
    console.error(message);
});

// =====================================
// DISCONNECTED
// =====================================

client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
});


// =====================================
// NORMALIZE WHATSAPP ID
// =====================================

function normalizeWhatsAppId(id) {
    if (!id) {
        return null;
    }

    if (typeof id === 'string') {
        return id;
    }

    if (id._serialized) {
        return id._serialized;
    }

    if (id.user && id.server) {
        return `${id.user}@${id.server}`;
    }

    return null;
}


// =====================================
// EXTRACT PHONE FROM ID
// =====================================

function extractPhoneFromId(id) {
    if (!id) {
        return null;
    }

    const normalizedId = normalizeWhatsAppId(id);

    if (!normalizedId) {
        return null;
    }

    if (normalizedId.endsWith('@c.us')) {
        return normalizedId.replace('@c.us', '');
    }

    return null;
}


// =====================================
// GET CONTACT NAME
// =====================================

function getBestContactName(contact) {
    if (!contact) {
        return null;
    }

    const possibleNames = [
        contact.pushname,
        contact.name,
        contact.shortName,
        contact.verifiedName,
        contact.formattedName
    ];

    for (const name of possibleNames) {
        if (
            typeof name === 'string' &&
            name.trim().length > 0
        ) {
            return name.trim();
        }
    }

    return null;
}


// =====================================
// SAFE CONTACT LOOKUP
// =====================================

async function safeGetContact(contactId) {
    try {
        if (!contactId) {
            return null;
        }

        const normalizedId = normalizeWhatsAppId(contactId);

        if (!normalizedId) {
            return null;
        }

        console.log(
            `[CONTACT] Looking up contact: ${normalizedId}`
        );

        const contact = await client.getContactById(normalizedId);

        return contact || null;

    } catch (error) {
        console.log(
            `[CONTACT] getContactById failed for ${contactId}:`,
            error.message
        );

        return null;
    }
}


// =====================================
// LID -> PHONE NUMBER
// =====================================

async function resolveLidToPhone(lid) {
    try {
        if (!lid) {
            return null;
        }

        if (!lid.endsWith('@lid')) {
            return extractPhoneFromId(lid);
        }

        console.log(`[LID] Resolving LID: ${lid}`);

        if (
            typeof client.getContactLidAndPhone !== 'function'
        ) {
            console.log(
                '[LID] getContactLidAndPhone() is not available'
            );

            return null;
        }

        const result = await client.getContactLidAndPhone([
            lid
        ]);

        console.log('[LID] Resolution result:', result);

        if (
            Array.isArray(result) &&
            result.length > 0 &&
            result[0]
        ) {
            const phone = result[0].pn;

            if (phone) {
                return phone.replace('@c.us', '');
            }
        }

        return null;

    } catch (error) {
        console.log(
            '[LID] Failed to resolve LID:',
            error.message
        );

        return null;
    }
}


// =====================================
// GET SENDER INFORMATION
// =====================================

async function getSenderInfo(msg) {
    let senderId = null;
    let senderNumber = null;
    let senderName = null;

    try {
        // =================================
        // 1. GET SENDER ID
        // =================================

        senderId =
            normalizeWhatsAppId(msg.author) ||
            normalizeWhatsAppId(msg.id?.participant) ||
            normalizeWhatsAppId(msg.from);

        console.log('[SENDER] Initial sender ID:', senderId);

        if (!senderId) {
            console.log('[SENDER] Sender ID unavailable');

            return {
                senderId: null,
                senderNumber: null,
                senderName: 'Unknown Sender'
            };
        }

        // =================================
        // 2. DIRECT PHONE NUMBER
        // =================================

        senderNumber = extractPhoneFromId(senderId);

        if (senderNumber) {
            console.log(
                '[SENDER] Phone from ID:',
                senderNumber
            );
        }

        // =================================
        // 3. TRY MESSAGE GET CONTACT
        // =================================

        try {
            console.log('[SENDER] Trying msg.getContact()...');

            const contact = await msg.getContact();

            if (contact) {
                console.log('[SENDER] Contact found ✅');

                senderName = getBestContactName(contact);

                if (!senderNumber && contact.id?.user) {
                    senderNumber = contact.id.user;
                }

                console.log(
                    '[SENDER] Contact name:',
                    senderName || 'Not available'
                );

                console.log(
                    '[SENDER] Contact number:',
                    senderNumber || 'Not available'
                );
            }

        } catch (error) {
            console.log(
                '[SENDER] msg.getContact() failed:',
                error.message
            );
        }

        // =================================
        // 4. LID RESOLUTION
        // =================================

        if (
            senderId.endsWith('@lid') &&
            !senderNumber
        ) {
            senderNumber = await resolveLidToPhone(
                senderId
            );

            if (senderNumber) {
                console.log(
                    '[SENDER] LID resolved to phone:',
                    senderNumber
                );
            }
        }

        // =================================
        // 5. GET CONTACT USING PHONE
        // =================================

        if (
            senderNumber &&
            !senderName
        ) {
            const phoneId = `${senderNumber}@c.us`;

            console.log(
                '[SENDER] Trying phone contact:',
                phoneId
            );

            const phoneContact =
                await safeGetContact(phoneId);

            if (phoneContact) {
                senderName =
                    getBestContactName(phoneContact);

                console.log(
                    '[SENDER] Phone contact name:',
                    senderName || 'Not available'
                );
            }
        }

        // =================================
        // 6. LAST TRY - ORIGINAL SENDER ID
        // =================================

        if (!senderName) {
            const originalContact =
                await safeGetContact(senderId);

            if (originalContact) {
                senderName =
                    getBestContactName(originalContact);
            }
        }

        // =================================
        // 7. GUARANTEED FALLBACK NAME
        // =================================

        if (!senderName) {
            if (senderNumber) {
                senderName = senderNumber;
            } else {
                senderName = senderId;
            }
        }

        console.log('');
        console.log('========== SENDER INFO ==========');
        console.log('Sender ID:', senderId);
        console.log('Sender Number:', senderNumber);
        console.log('Sender Name:', senderName);
        console.log('=================================');
        console.log('');

        return {
            senderId,
            senderNumber,
            senderName
        };

    } catch (error) {
        console.error(
            '[SENDER] Unexpected sender lookup error:',
            error.message
        );

        return {
            senderId:
                senderId ||
                normalizeWhatsAppId(msg.author) ||
                normalizeWhatsAppId(msg.from),

            senderNumber:
                senderNumber || null,

            senderName:
                senderName ||
                senderNumber ||
                senderId ||
                'Unknown Sender'
        };
    }
}


// =====================================
// GET GROUP INFORMATION SAFELY
// =====================================

async function getGroupInfo(msg, groupWhatsappId) {
    let groupName = null;

    try {
        console.log(
            '[GROUP] Trying msg.getChat()...'
        );

        const chat = await msg.getChat();

        if (chat && chat.isGroup) {
            groupName = chat.name || null;

            console.log(
                '[GROUP] Group name from msg.getChat():',
                groupName
            );

            return {
                groupName,
                chat
            };
        }

    } catch (error) {
        console.log(
            '[GROUP] msg.getChat() failed:',
            error.message
        );
    }

    // =================================
    // FALLBACK: client.getChatById()
    // =================================

    try {
        console.log(
            '[GROUP] Trying client.getChatById()...'
        );

        const chat =
            await client.getChatById(
                groupWhatsappId
            );

        if (chat) {
            groupName =
                chat.name ||
                chat.formattedTitle ||
                null;

            console.log(
                '[GROUP] Fallback group name:',
                groupName
            );

            return {
                groupName,
                chat
            };
        }

    } catch (error) {
        console.log(
            '[GROUP] client.getChatById() failed:',
            error.message
        );
    }

    // =================================
    // FINAL FALLBACK
    // =================================

    console.log(
        '[GROUP] Group name could not be resolved'
    );

    return {
        groupName: null,
        chat: null
    };
}


// =====================================
// DOWNLOAD MEDIA WITH FALLBACK
// =====================================

async function downloadMediaWithFallback(msg) {
    try {
        console.log('Attempting to download media...');

        // Method 1
        let media = await msg.downloadMedia();

        if (media && media.data) {
            console.log(
                'Media downloaded successfully ✅'
            );

            return media;
        }

        console.log(
            'Standard download returned empty, retrying...'
        );

        // Method 2
        await new Promise(resolve =>
            setTimeout(resolve, 3000)
        );

        media = await msg.downloadMedia();

        if (media && media.data) {
            console.log(
                'Media downloaded on retry ✅'
            );

            return media;
        }

        console.log(
            'Media download failed ❌'
        );

        return null;

    } catch (error) {
        console.log(
            'Media download error:',
            error.message
        );

        return null;
    }
}


// =====================================
// SAVE MEDIA TO DISK
// =====================================

async function saveMediaToDisk(media, messageId) {
    try {
        if (!media || !media.data) {
            console.log('No media data to save ❌');
            return null;
        }

        // =================================
        // PROJECT KE ANDAR FOLDERS
        // =================================

        const imagesDir =
            path.join(__dirname, 'images');

        const pdfsDir =
            path.join(__dirname, 'pdfs');

        // =================================
        // CREATE FOLDERS
        // =================================

        await fs.promises.mkdir(
            imagesDir,
            {
                recursive: true
            }
        );

        await fs.promises.mkdir(
            pdfsDir,
            {
                recursive: true
            }
        );

        let folder;
        let extension;

        // =================================
        // IMAGE
        // =================================

        if (
            media.mimetype &&
            media.mimetype.startsWith('image/')
        ) {
            folder = imagesDir;

            const mimeExtension =
                media.mimetype.split('/')[1];

            extension =
                mimeExtension === 'jpeg'
                    ? 'jpg'
                    : mimeExtension;
        }

        // =================================
        // PDF
        // =================================

        else if (
            media.mimetype === 'application/pdf'
        ) {
            folder = pdfsDir;
            extension = 'pdf';
        }

        // =================================
        // OTHER FILES
        // =================================

        else {
            console.log(
                'Unsupported media type:',
                media.mimetype
            );

            return null;
        }

        // =================================
        // SAFE FILENAME
        // =================================

        const safeMessageId =
            String(messageId)
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    '_'
                );

        const filename =
            `${Date.now()}_${safeMessageId}.${extension}`;

        const fullPath =
            path.join(
                folder,
                filename
            );

        // =================================
        // BASE64 -> ACTUAL FILE
        // =================================

        const fileBuffer =
            Buffer.from(
                media.data,
                'base64'
            );

        await fs.promises.writeFile(
            fullPath,
            fileBuffer
        );

        // =================================
        // DATABASE PATH
        // =================================

        let databasePath;

        if (
            media.mimetype &&
            media.mimetype.startsWith('image/')
        ) {
            databasePath =
                `/images/${filename}`;
        } else {
            databasePath =
                `/pdfs/${filename}`;
        }

        console.log(
            'Media saved successfully ✅'
        );

        console.log(
            'Physical file:',
            fullPath
        );

        console.log(
            'Database path:',
            databasePath
        );

        return databasePath;

    } catch (error) {
        console.error(
            'Failed to save media ❌'
        );

        console.error(
            error.message
        );

        return null;
    }
}


// =====================================
// MESSAGE EVENT
// =====================================

client.on('message', async (msg) => {
    try {
        console.log('');
        console.log('============================================================');
        console.log('📩 MESSAGE EVENT RECEIVED');
        console.log('============================================================');

        console.log(
            'Time:',
            new Date().toISOString()
        );

        console.log(
            'Message ID:',
            msg.id?._serialized || 'undefined'
        );

        console.log(
            'Message type:',
            msg.type
        );

        console.log(
            'Message body:',
            msg.body || '(empty)'
        );

        console.log(
            'Has media:',
            msg.hasMedia
        );

        console.log(
            'From:',
            msg.from
        );

        console.log(
            'To:',
            msg.to
        );

        console.log(
            'From Me:',
            msg.fromMe
        );

        console.log(
            'Author:',
            msg.author
        );

        console.log(
            'Timestamp:',
            msg.timestamp
        );

        // =====================================
        // GROUP ID
        // =====================================

        const groupWhatsappId =
            normalizeWhatsAppId(msg.id?.remote) ||
            normalizeWhatsAppId(msg.from);

        console.log(
            '[GROUP] Detected chat ID:',
            groupWhatsappId
        );

        // =====================================
        // GROUP CHECK
        // =====================================

        if (
            !groupWhatsappId ||
            !groupWhatsappId.endsWith('@g.us')
        ) {
            console.log(
                'Not a group message — skipped'
            );

            return;
        }

        console.log(
            'GROUP MESSAGE DETECTED ✅'
        );

        console.log(
            'Group WhatsApp ID:',
            groupWhatsappId
        );

        // =====================================
        // GROUP INFORMATION
        // =====================================

        const {
            groupName
        } = await getGroupInfo(
            msg,
            groupWhatsappId
        );

        console.log(
            'Final Group Name:',
            groupName || 'Unknown Group'
        );

        // =====================================
        // SAVE / UPDATE GROUP
        // =====================================

        const groupResult = await pool.query(
            `
            INSERT INTO groups (
                whatsapp_group_id,
                group_name
            )
            VALUES ($1, $2)
            ON CONFLICT (whatsapp_group_id)
            DO UPDATE SET
                group_name =
                    COALESCE(
                        EXCLUDED.group_name,
                        groups.group_name
                    )
            RETURNING id
            `,
            [
                groupWhatsappId,
                groupName
            ]
        );

        const groupId =
            groupResult.rows[0].id;

        console.log(
            'Database Group ID:',
            groupId
        );

        // =====================================
        // SENDER INFORMATION
        // =====================================

        const {
            senderId,
            senderNumber,
            senderName
        } = await getSenderInfo(msg);

        console.log(
            'Final Sender ID:',
            senderId
        );

        console.log(
            'Final Sender Number:',
            senderNumber
        );

        console.log(
            'Final Sender Name:',
            senderName
        );

        // =====================================
        // MESSAGE ID
        // =====================================

        const messageId =
            msg.id?._serialized ||
            msg.id?.$1 ||
            `${msg.id?.fromMe}_${msg.id?.remote}_${msg.id?.id}_${msg.id?.participant}`;

        console.log(
            'Message ID:',
            messageId
        );

        if (!messageId) {
            console.log(
                'Message ID unavailable — skipped ❌'
            );

            return;
        }

        // =====================================
        // MESSAGE DATE
        // =====================================

        const timestamp =
            Number(msg.timestamp);

        const messageDate =
            timestamp > 0
                ? new Date(timestamp * 1000)
                : new Date();

        // =====================================
        // MEDIA VARIABLES
        // =====================================

        let hasMedia = false;
        let mediaPath = null;

        const originalMessage =
            msg.body || null;

        // =====================================
        // MEDIA PROCESSING
        // =====================================

        if (msg.hasMedia) {
            console.log(
                'Media detected 📎'
            );

            try {
                const media =
                    await downloadMediaWithFallback(
                        msg
                    );

                if (
                    media &&
                    media.data
                ) {
                    hasMedia = true;

                    console.log(
                        'MIME type:',
                        media.mimetype
                    );

                    console.log(
                        'Filename:',
                        media.filename || 'none'
                    );

                    // =================================
                    // SAVE ORIGINAL FILE
                    // =================================

                    mediaPath =
                        await saveMediaToDisk(
                            media,
                            messageId
                        );

                    if (mediaPath) {
                        console.log(
                            'Media path:',
                            mediaPath
                        );
                    } else {
                        console.log(
                            'Media could not be saved ❌'
                        );
                    }

                } else {
                    console.log(
                        '❌ Media data unavailable after all attempts'
                    );
                }

            } catch (mediaError) {
                console.error(
                    'Media processing failed ❌'
                );

                console.error(
                    'Error details:',
                    mediaError.message
                );
            }
        }

        // =====================================
        // SAVE MESSAGE
        // =====================================

        await pool.query(
            `
            INSERT INTO messages (
                whatsapp_message_id,
                group_id,
                sender_id,
                sender_number,
                sender_name,
                message,
                message_type,
                timestamp,
                has_media,
                media_path
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10
            )
            ON CONFLICT (
                whatsapp_message_id
            )
            DO NOTHING
            `,
            [
                messageId,
                groupId,
                senderId,
                senderNumber,

                // IMPORTANT:
                // sender_name blank nahi jayega
                senderName ||
                    senderNumber ||
                    senderId ||
                    'Unknown Sender',

                originalMessage,
                msg.type,
                messageDate,
                hasMedia,
                mediaPath
            ]
        );

        console.log(
            '✅ Message saved to PostgreSQL'
        );

        console.log('');
        console.log(
            '========== MESSAGE SAVED =========='
        );

        console.log(
            'Group:',
            groupName || 'Unknown Group'
        );

        console.log(
            'Sender:',
            senderName ||
                senderNumber ||
                senderId ||
                'Unknown Sender'
        );

        console.log(
            'Number:',
            senderNumber || 'Not available'
        );

        console.log(
            'Message:',
            originalMessage || '(media/no text)'
        );

        console.log(
            'Media:',
            hasMedia
        );

        console.log(
            'Media path:',
            mediaPath || 'None'
        );

        console.log(
            '==================================='
        );

        console.log(
            '============================================================'
        );

    } catch (error) {
        console.error('');
        console.error(
            '============================================================'
        );

        console.error(
            '❌ MESSAGE PROCESSING FAILED'
        );

        console.error(
            '============================================================'
        );

        console.error(
            'Name:',
            error?.name || 'Unknown'
        );

        console.error(
            'Message:',
            error?.message || error
        );

        console.error(
            'Stack:',
            error?.stack || 'No stack'
        );

        console.error(
            '============================================================'
        );
    }
});


// =====================================
// CLIENT ERROR
// =====================================

client.on('error', (error) => {
    console.error(
        'WhatsApp client error ❌'
    );

    console.error(
        error
    );
});


// =====================================
// START WHATSAPP
// =====================================

console.log('');
console.log(
    '============================================================'
);

console.log(
    '🚀 Starting WhatsApp client...'
);

console.log(
    '============================================================'
);

client.initialize();