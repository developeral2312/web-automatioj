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


// ============================================================
// DATABASE PREPARATION
// ============================================================

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


// ============================================================
// QR CODE
// ============================================================

client.on('qr', (qr) => {
    console.log('QR code scan karo:');
    qrcode.generate(qr, { small: true });
});


// ============================================================
// AUTHENTICATED
// ============================================================

client.on('authenticated', () => {
    console.log('WhatsApp authenticated ✅');
});


// ============================================================
// READY
// ============================================================

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

                console.log(
                    'Phone:',
                    info.wid?._serialized ||
                    info.wid?.$1 ||
                    'Unknown'
                );

                console.log(
                    'Push name:',
                    info.pushname || 'Unknown'
                );

                console.log(
                    'Platform:',
                    info.platform || 'Unknown'
                );
            }

        } catch (infoError) {
            console.log(
                '[READY DEBUG] Client info unavailable:',
                infoError.message
            );
        }

        try {
            if (typeof client.getWWebVersion === 'function') {
                const version =
                    await client.getWWebVersion();

                console.log(
                    '[READY DEBUG] WhatsApp Web version:',
                    version
                );
            }

        } catch (versionError) {
            console.log(
                '[READY DEBUG] WhatsApp Web version unavailable:',
                versionError.message
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


// ============================================================
// AUTH FAILURE
// ============================================================

client.on('auth_failure', (message) => {
    console.error('Authentication failed ❌');
    console.error(message);
});


// ============================================================
// DISCONNECTED
// ============================================================

client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
});


// ============================================================
// NORMALIZE WHATSAPP ID
// ============================================================

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

    // WA Web 2.3000.x compatibility
    if (id.$1) {
        return id.$1;
    }

    if (id.user && id.server) {
        return `${id.user}@${id.server}`;
    }

    return null;
}


// ============================================================
// GET REAL MESSAGE SERIALIZED ID
// ============================================================

function getMessageSerializedId(msg) {
    try {
        if (!msg || !msg.id) {
            return null;
        }

        const id = msg.id;

        // Old whatsapp-web.js
        if (id._serialized) {
            return id._serialized;
        }

        // New WhatsApp Web 2.3000.x
        if (id.$1) {
            return id.$1;
        }

        // Reconstruct from raw message ID fields
        const fromMe =
            typeof id.fromMe !== 'undefined'
                ? id.fromMe
                : msg.fromMe;

        const remote =
            id.remote ||
            msg.from ||
            null;

        const messagePart =
            id.id ||
            null;

        const participant =
            id.participant ||
            msg.author ||
            null;

        if (
            typeof fromMe !== 'undefined' &&
            remote &&
            messagePart
        ) {
            let serialized =
                `${fromMe}_${remote}_${messagePart}`;

            if (participant) {
                serialized += `_${participant}`;
            }

            return serialized;
        }

        return null;

    } catch (error) {
        console.log(
            '[MESSAGE ID] Failed:',
            error.message
        );

        return null;
    }
}


// ============================================================
// EXTRACT PHONE FROM ID
// ============================================================

function extractPhoneFromId(id) {
    if (!id) {
        return null;
    }

    const normalizedId =
        normalizeWhatsAppId(id);

    if (!normalizedId) {
        return null;
    }

    if (normalizedId.endsWith('@c.us')) {
        return normalizedId.replace('@c.us', '');
    }

    return null;
}


// ============================================================
// GET CONTACT NAME
// ============================================================

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


// ============================================================
// SAFE CONTACT LOOKUP
// ============================================================

async function safeGetContact(contactId) {
    try {
        if (!contactId) {
            return null;
        }

        const normalizedId =
            normalizeWhatsAppId(contactId);

        if (!normalizedId) {
            return null;
        }

        console.log(
            `[CONTACT] Looking up contact: ${normalizedId}`
        );

        const contact =
            await client.getContactById(
                normalizedId
            );

        return contact || null;

    } catch (error) {
        console.log(
            `[CONTACT] getContactById failed for ${contactId}:`,
            error.message
        );

        return null;
    }
}


// ============================================================
// LID -> PHONE NUMBER
// ============================================================

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
            typeof client.getContactLidAndPhone !==
            'function'
        ) {
            console.log(
                '[LID] getContactLidAndPhone() is not available'
            );

            return null;
        }

        const result =
            await client.getContactLidAndPhone([
                lid
            ]);

        console.log(
            '[LID] Resolution result:',
            result
        );

        if (
            Array.isArray(result) &&
            result.length > 0 &&
            result[0]
        ) {
            const phone = result[0].pn;

            if (phone) {
                return phone.replace(
                    '@c.us',
                    ''
                );
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


// ============================================================
// GET SENDER INFORMATION
// ============================================================

async function getSenderInfo(msg) {
    let senderId = null;
    let senderNumber = null;
    let senderName = null;

    try {
        senderId =
            normalizeWhatsAppId(msg.author) ||
            normalizeWhatsAppId(
                msg.id?.participant
            ) ||
            normalizeWhatsAppId(msg.from);

        console.log(
            '[SENDER] Initial sender ID:',
            senderId
        );

        if (!senderId) {
            console.log(
                '[SENDER] Sender ID unavailable'
            );

            return {
                senderId: null,
                senderNumber: null,
                senderName: 'Unknown Sender'
            };
        }

        senderNumber =
            extractPhoneFromId(senderId);

        if (senderNumber) {
            console.log(
                '[SENDER] Phone from ID:',
                senderNumber
            );
        }

        try {
            console.log(
                '[SENDER] Trying msg.getContact()...'
            );

            const contact =
                await msg.getContact();

            if (contact) {
                console.log(
                    '[SENDER] Contact found ✅'
                );

                senderName =
                    getBestContactName(contact);

                if (
                    !senderNumber &&
                    contact.id?.user
                ) {
                    senderNumber =
                        contact.id.user;
                }

                console.log(
                    '[SENDER] Contact name:',
                    senderName ||
                    'Not available'
                );

                console.log(
                    '[SENDER] Contact number:',
                    senderNumber ||
                    'Not available'
                );
            }

        } catch (error) {
            console.log(
                '[SENDER] msg.getContact() failed:',
                error.message
            );
        }

        if (
            senderId.endsWith('@lid') &&
            !senderNumber
        ) {
            senderNumber =
                await resolveLidToPhone(
                    senderId
                );

            if (senderNumber) {
                console.log(
                    '[SENDER] LID resolved to phone:',
                    senderNumber
                );
            }
        }

        if (
            senderNumber &&
            !senderName
        ) {
            const phoneId =
                `${senderNumber}@c.us`;

            console.log(
                '[SENDER] Trying phone contact:',
                phoneId
            );

            const phoneContact =
                await safeGetContact(
                    phoneId
                );

            if (phoneContact) {
                senderName =
                    getBestContactName(
                        phoneContact
                    );

                console.log(
                    '[SENDER] Phone contact name:',
                    senderName ||
                    'Not available'
                );
            }
        }

        if (!senderName) {
            const originalContact =
                await safeGetContact(
                    senderId
                );

            if (originalContact) {
                senderName =
                    getBestContactName(
                        originalContact
                    );
            }
        }

        if (!senderName) {
            if (senderNumber) {
                senderName = senderNumber;
            } else {
                senderName = senderId;
            }
        }

        console.log('');
        console.log(
            '========== SENDER INFO =========='
        );

        console.log(
            'Sender ID:',
            senderId
        );

        console.log(
            'Sender Number:',
            senderNumber
        );

        console.log(
            'Sender Name:',
            senderName
        );

        console.log(
            '================================='
        );

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
                normalizeWhatsAppId(
                    msg.author
                ) ||
                normalizeWhatsAppId(
                    msg.from
                ),

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


// ============================================================
// GET GROUP INFORMATION
// ============================================================

async function getGroupInfo(
    msg,
    groupWhatsappId
) {
    let groupName = null;

    try {
        console.log(
            '[GROUP] Trying msg.getChat()...'
        );

        const chat =
            await msg.getChat();

        if (
            chat &&
            chat.isGroup
        ) {
            groupName =
                chat.name || null;

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

    // Extra fallback
    try {
        console.log(
            '[GROUP] Trying client.getChats() fallback...'
        );

        const chats =
            await client.getChats();

        const foundChat =
            chats.find(chat =>
                normalizeWhatsAppId(
                    chat?.id
                ) === groupWhatsappId
            );

        if (foundChat) {
            groupName =
                foundChat.name ||
                foundChat.formattedTitle ||
                null;

            console.log(
                '[GROUP] getChats() group name:',
                groupName
            );

            return {
                groupName,
                chat: foundChat
            };
        }

    } catch (error) {
        console.log(
            '[GROUP] getChats() fallback failed:',
            error.message
        );
    }

    console.log(
        '[GROUP] Group name could not be resolved'
    );

    return {
        groupName: null,
        chat: null
    };
}


// ============================================================
// MEDIA DOWNLOAD — WA WEB 2.3000.x FIX
// ============================================================

async function downloadMediaWithFallback(msg) {
    if (!msg || !msg.hasMedia) {
        return null;
    }

    const resolvedMessageId =
        getMessageSerializedId(msg);

    console.log(
        '[MEDIA] Resolved message ID:',
        resolvedMessageId
    );

    if (!resolvedMessageId) {
        console.log(
            '[MEDIA] Could not resolve message ID ❌'
        );

        return null;
    }

    console.log(
        '[MEDIA] msg.id._serialized:',
        msg.id?._serialized
    );

    console.log(
        '[MEDIA] msg.id.$1:',
        msg.id?.$1
    );

    console.log(
        '[MEDIA] msg.id.id:',
        msg.id?.id
    );

    // ========================================================
    // METHOD 1
    // Repair internal Message ID, then downloadMedia()
    // ========================================================

    try {
        console.log(
            '[MEDIA] Repairing internal WA message ID...'
        );

        if (
            client.pupPage &&
            !client.pupPage.isClosed()
        ) {
            await client.pupPage.evaluate(
                async (messageId) => {

                    try {
                        const store =
                            window.Store;

                        if (
                            !store ||
                            !store.Msg
                        ) {
                            throw new Error(
                                'WhatsApp Store.Msg unavailable'
                            );
                        }

                        let message =
                            store.Msg.get(
                                messageId
                            );

                        if (!message) {

                            const messages =
                                store.Msg.getMessagesById
                                    ? store.Msg.getMessagesById([
                                        messageId
                                    ])
                                    : null;

                            if (
                                messages &&
                                messages.length
                            ) {
                                message =
                                    messages[0];
                            }
                        }

                        if (!message) {
                            throw new Error(
                                'Message not found in WA Store'
                            );
                        }

                        if (
                            message.id &&
                            !message.id._serialized
                        ) {
                            try {
                                if (
                                    message.id.$1
                                ) {
                                    Object.defineProperty(
                                        message.id,
                                        '_serialized',
                                        {
                                            configurable: true,
                                            enumerable: true,
                                            get() {
                                                return this.$1;
                                            }
                                        }
                                    );
                                }
                            } catch (_) {}
                        }

                        return {
                            found: true,
                            serialized:
                                message.id?._serialized ||
                                message.id?.$1 ||
                                null
                        };

                    } catch (error) {
                        return {
                            found: false,
                            error:
                                error?.message ||
                                String(error)
                        };
                    }

                },
                resolvedMessageId
            );

            console.log(
                '[MEDIA] Internal message ID repaired ✅'
            );
        }

    } catch (error) {
        console.log(
            '[MEDIA] Internal ID repair warning:',
            error.message
        );
    }


    // ========================================================
    // METHOD 1B
    // Rebuild the public message ID object when possible.
    // ========================================================

    try {
        if (
            msg.id &&
            !msg.id._serialized &&
            msg.id.$1
        ) {
            try {
                Object.defineProperty(
                    msg.id,
                    '_serialized',
                    {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return this.$1;
                        }
                    }
                );

                console.log(
                    '[MEDIA] Public message ID patched ✅'
                );

            } catch (patchError) {
                console.log(
                    '[MEDIA] Public ID patch skipped:',
                    patchError.message
                );
            }
        }
    } catch (_) {}


    // ========================================================
    // NORMAL whatsapp-web.js DOWNLOAD
    // ========================================================

    try {
        console.log(
            '[MEDIA] Calling downloadMedia()...'
        );

        const media =
            await msg.downloadMedia();

        if (
            media &&
            media.data
        ) {
            console.log(
                '[MEDIA] Media downloaded successfully ✅'
            );

            return media;
        }

        console.log(
            '[MEDIA] downloadMedia() returned empty data'
        );

    } catch (error) {
        console.log(
            '[MEDIA] First downloadMedia() failed:',
            error.message
        );
    }


    // ========================================================
    // WAIT + SECOND ATTEMPT
    // ========================================================

    try {
        console.log(
            '[MEDIA] Waiting before retry...'
        );

        await new Promise(resolve =>
            setTimeout(
                resolve,
                3000
            )
        );

        const media =
            await msg.downloadMedia();

        if (
            media &&
            media.data
        ) {
            console.log(
                '[MEDIA] Media downloaded on retry ✅'
            );

            return media;
        }

    } catch (error) {
        console.log(
            '[MEDIA] Retry downloadMedia() failed:',
            error.message
        );
    }


    // ========================================================
    // DIRECT WA STORE FALLBACK
    // ========================================================

    try {
        if (
            client.pupPage &&
            !client.pupPage.isClosed()
        ) {
            console.log(
                '[MEDIA] Trying direct WhatsApp Store fallback...'
            );

            const directResult =
                await client.pupPage.evaluate(
                    async (messageId) => {

                        try {
                            const store =
                                window.Store;

                            if (
                                !store ||
                                !store.Msg
                            ) {
                                return {
                                    ok: false,
                                    error:
                                        'Store.Msg unavailable'
                                };
                            }

                            let message =
                                store.Msg.get(
                                    messageId
                                );

                            if (!message) {
                                return {
                                    ok: false,
                                    error:
                                        'Message not found'
                                };
                            }

                            if (
                                message.id &&
                                !message.id._serialized &&
                                message.id.$1
                            ) {
                                try {
                                    Object.defineProperty(
                                        message.id,
                                        '_serialized',
                                        {
                                            configurable: true,
                                            enumerable: true,
                                            get() {
                                                return this.$1;
                                            }
                                        }
                                    );
                                } catch (_) {}
                            }

                            if (
                                !message.mediaData
                            ) {
                                return {
                                    ok: false,
                                    error:
                                        'mediaData unavailable'
                                };
                            }

                            if (
                                message.mediaData.mediaStage !==
                                'RESOLVED'
                            ) {
                                await message.downloadMedia({
                                    downloadEvenIfExpensive: true,
                                    rmrReason: 1,
                                    downloadQpl: true
                                });
                            }

                            const mediaData =
                                message.mediaData;

                            if (
                                !mediaData ||
                                !mediaData.mediaStage
                            ) {
                                return {
                                    ok: false,
                                    error:
                                        'Media stage unavailable'
                                };
                            }

                            if (
                                String(
                                    mediaData.mediaStage
                                ).includes('ERROR')
                            ) {
                                return {
                                    ok: false,
                                    error:
                                        `Media stage: ${mediaData.mediaStage}`
                                };
                            }

                            if (
                                typeof window.WWebJS?.getMessageMedia ===
                                'function'
                            ) {
                                const result =
                                    await window.WWebJS.getMessageMedia(
                                        message
                                    );

                                if (
                                    result &&
                                    result.data
                                ) {
                                    return {
                                        ok: true,
                                        media: result
                                    };
                                }
                            }

                            const media =
                                mediaData;

                            const base64 =
                                media?.body ||
                                media?.data ||
                                media?.filehash ||
                                null;

                            if (
                                typeof base64 ===
                                'string' &&
                                base64.length > 100
                            ) {
                                return {
                                    ok: true,
                                    media: {
                                        data: base64,
                                        mimetype:
                                            message.mimetype ||
                                            media.mimetype ||
                                            'application/octet-stream',
                                        filename:
                                            message.filename ||
                                            media.filename ||
                                            null
                                    }
                                };
                            }

                            return {
                                ok: false,
                                error:
                                    'Direct media data unavailable'
                            };

                        } catch (error) {
                            return {
                                ok: false,
                                error:
                                    error?.message ||
                                    String(error)
                            };
                        }

                    },
                    resolvedMessageId
                );

            if (
                directResult &&
                directResult.ok &&
                directResult.media &&
                directResult.media.data
            ) {
                console.log(
                    '[MEDIA] Direct WhatsApp Store download successful ✅'
                );

                return directResult.media;
            }

            console.log(
                '[MEDIA] Direct fallback failed:',
                directResult?.error ||
                'Unknown error'
            );
        }

    } catch (error) {
        console.log(
            '[MEDIA] Direct Store fallback failed:',
            error.message
        );
    }


    // ========================================================
    // FINAL RESULT
    // ========================================================

    console.log(
        '[MEDIA] Media download failed ❌'
    );

    return null;
}


// ============================================================
// SAVE MEDIA TO DISK
// ============================================================

async function saveMediaToDisk(
    media,
    messageId
) {
    try {
        if (
            !media ||
            !media.data
        ) {
            console.log(
                'No media data to save ❌'
            );

            return null;
        }

        const imagesDir =
            path.join(
                __dirname,
                'images'
            );

        const pdfsDir =
            path.join(
                __dirname,
                'pdfs'
            );

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

        // ====================================================
        // IMAGE
        // ====================================================

        if (
            media.mimetype &&
            media.mimetype.startsWith(
                'image/'
            )
        ) {
            folder = imagesDir;

            const mimeExtension =
                media.mimetype
                    .split('/')[1]
                    .split(';')[0];

            extension =
                mimeExtension === 'jpeg'
                    ? 'jpg'
                    : mimeExtension;
        }

        // ====================================================
        // PDF
        // ====================================================

        else if (
            media.mimetype ===
            'application/pdf'
        ) {
            folder = pdfsDir;
            extension = 'pdf';
        }

        // ====================================================
        // UNSUPPORTED
        // ====================================================

        else {
            console.log(
                'Unsupported media type:',
                media.mimetype
            );

            return null;
        }

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

        const fileBuffer =
            Buffer.from(
                media.data,
                'base64'
            );

        await fs.promises.writeFile(
            fullPath,
            fileBuffer
        );

        let databasePath;

        if (
            media.mimetype &&
            media.mimetype.startsWith(
                'image/'
            )
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


// ============================================================
// MESSAGE EVENT
// ============================================================

client.on(
    'message',
    async (msg) => {

        try {

            console.log('');
            console.log(
                '============================================================'
            );

            console.log(
                '📩 MESSAGE EVENT RECEIVED'
            );

            console.log(
                '============================================================'
            );

            console.log(
                'Time:',
                new Date().toISOString()
            );

            console.log(
                'Message ID:',
                getMessageSerializedId(msg) ||
                'undefined'
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


            // ==================================================
            // GROUP ID
            // ==================================================

            const groupWhatsappId =
                normalizeWhatsAppId(
                    msg.id?.remote
                ) ||
                normalizeWhatsAppId(
                    msg.from
                );

            console.log(
                '[GROUP] Detected chat ID:',
                groupWhatsappId
            );


            // ==================================================
            // GROUP CHECK
            // ==================================================

            if (
                !groupWhatsappId ||
                !groupWhatsappId.endsWith(
                    '@g.us'
                )
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


            // ==================================================
            // GROUP INFORMATION
            // ==================================================

            const {
                groupName
            } =
                await getGroupInfo(
                    msg,
                    groupWhatsappId
                );

            console.log(
                'Final Group Name:',
                groupName ||
                'Unknown Group'
            );


            // ==================================================
            // SAVE / UPDATE GROUP
            // ==================================================

            const groupResult =
                await pool.query(
                    `
                    INSERT INTO groups (
                        whatsapp_group_id,
                        group_name
                    )
                    VALUES ($1, $2)

                    ON CONFLICT (
                        whatsapp_group_id
                    )

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


            // ==================================================
            // SENDER
            // ==================================================

            const {
                senderId,
                senderNumber,
                senderName
            } =
                await getSenderInfo(msg);

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


            // ==================================================
            // MESSAGE ID
            // ==================================================

            const messageId =
                getMessageSerializedId(msg);

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


            // ==================================================
            // MESSAGE DATE
            // ==================================================

            const timestamp =
                Number(
                    msg.timestamp
                );

            const messageDate =
                timestamp > 0
                    ? new Date(
                        timestamp * 1000
                    )
                    : new Date();


            // ==================================================
            // MEDIA VARIABLES
            // ==================================================

            let hasMedia = false;
            let mediaPath = null;

            // IMPORTANT:
            // Text-message behavior remains unchanged.
            const originalMessage =
                msg.body || null;


            // ==================================================
            // MEDIA PROCESSING
            // ==================================================

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
                            media.filename ||
                            'none'
                        );

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


            // ==================================================
            // SAVE MESSAGE
            // ==================================================

            const saveResult =
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

                    DO UPDATE SET

                        group_id =
                            COALESCE(
                                EXCLUDED.group_id,
                                messages.group_id
                            ),

                        sender_id =
                            COALESCE(
                                EXCLUDED.sender_id,
                                messages.sender_id
                            ),

                        sender_number =
                            COALESCE(
                                EXCLUDED.sender_number,
                                messages.sender_number
                            ),

                        sender_name =
                            COALESCE(
                                EXCLUDED.sender_name,
                                messages.sender_name
                            ),

                        message =
                            COALESCE(
                                EXCLUDED.message,
                                messages.message
                            ),

                        message_type =
                            COALESCE(
                                EXCLUDED.message_type,
                                messages.message_type
                            ),

                        timestamp =
                            COALESCE(
                                EXCLUDED.timestamp,
                                messages.timestamp
                            ),

                        has_media =
                            messages.has_media OR EXCLUDED.has_media,

                        media_path =
                            COALESCE(
                                EXCLUDED.media_path,
                                messages.media_path
                            )

                    RETURNING id, media_path, has_media
                    `,
                    [
                        messageId,
                        groupId,
                        senderId,
                        senderNumber,

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
                '✅ Message saved/updated in PostgreSQL'
            );

            console.log(
                '[DATABASE] ID:',
                saveResult.rows[0]?.id
            );

            console.log(
                '[DATABASE] has_media:',
                saveResult.rows[0]?.has_media
            );

            console.log(
                '[DATABASE] media_path:',
                saveResult.rows[0]?.media_path
            );


            console.log(
                '========== MESSAGE SAVED =========='
            );

            console.log(
                'Group:',
                groupName ||
                'Unknown Group'
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
                senderNumber ||
                'Not available'
            );

            console.log(
                'Message:',
                originalMessage ||
                '(media/no text)'
            );

            console.log(
                'Media:',
                hasMedia
            );

            console.log(
                'Media path:',
                mediaPath ||
                'None'
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
                error?.name ||
                'Unknown'
            );

            console.error(
                'Message:',
                error?.message ||
                error
            );

            console.error(
                'Stack:',
                error?.stack ||
                'No stack'
            );

            console.error(
                '============================================================'
            );
        }
    }
);


// ============================================================
// CLIENT ERROR
// ============================================================

client.on(
    'error',
    (error) => {

        console.error(
            'WhatsApp client error ❌'
        );

        console.error(
            error
        );
    }
);


// ============================================================
// START WHATSAPP
// ============================================================

console.log('');

console.log(
    '============================================================'
);

console.log(
    '🚀 Starting WhatsApp client...'
);

console.log(
    '=============================================================='
);

client.initialize();