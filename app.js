const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const pool = require('./db');

const fs = require('fs');
const path = require('path');
const http = require('http');

const MEDIA_PORT = process.env.MEDIA_PORT || 3000;

const MEDIA_BASE_URL =
    process.env.MEDIA_BASE_URL ||
    `http://localhost:${MEDIA_PORT}`;

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

        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS media_data BYTEA
        `);

        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS media_mimetype TEXT
        `);

        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS media_filename TEXT
        `);
        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS location_link TEXT
        `);
        console.log('Database structure ready');

    } catch (error) {
        console.error('Database preparation failed');
        console.error(error);
    }
}
client.on('qr', (qr) => {
    console.log('QR code scan karo:');
    qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => {
    console.log('WhatsApp authenticated');
});
client.on('ready', async () => {
    try {
        console.log('');
        console.log('============================================================');
        console.log('WHATSAPP READY');
        console.log('============================================================');
        console.log(`Time: ${new Date().toISOString()}`);
        console.log('WhatsApp client is completely ready.');

        try {
            const info = client.info;

            if (info) {
                console.log('[READY DEBUG] Client info available');

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

        console.log('================================');
        console.log('');

    } catch (error) {
        console.error('READY handler failed');
        console.error(error);
    }
});
client.on('auth_failure', (message) => {
    console.error('Authentication failed');
    console.error(message);
});
client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
});
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

    if (id.$1) {
        return id.$1;
    }

    if (id.user && id.server) {
        return `${id.user}@${id.server}`;
    }

    return null;
}
function getMessageSerializedId(msg) {
    try {
        if (!msg || !msg.id) {
            return null;
        }

        const id = msg.id;

        if (id._serialized) {
            return id._serialized;
        }

        if (id.$1) {
            return id.$1;
        }

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
                    '[SENDER] Contact found'
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
async function getGroupInfo(msg, groupWhatsappId) {
    let groupName = null;

    console.log('');
    console.log('========== GROUP DEBUG START ==========');
    console.log('[GROUP] groupWhatsappId:', groupWhatsappId);

    if (!groupWhatsappId) {
        console.log('[GROUP] No group ID');

        return {
            groupName: null,
            chat: null
        };
    }

    // ==================================================
    // 1. CURRENT WHATSAPP-WEB.JS / WWebJS LOOKUP
    // ==================================================
    try {
        if (
            client.pupPage &&
            !client.pupPage.isClosed()
        ) {
            console.log(
                '[GROUP-WWEBJS] Trying WWebJS.getChat()...'
            );

            const result =
                await client.pupPage.evaluate(
                    async (groupId) => {

                        try {

                            if (
                                !window.WWebJS ||
                                typeof window.WWebJS.getChat !== 'function'
                            ) {
                                return {
                                    ok: false,
                                    error: 'WWebJS.getChat unavailable'
                                };
                            }

                            const chat =
                                await window.WWebJS.getChat(
                                    groupId,
                                    {
                                        getAsModel: true
                                    }
                                );

                            if (!chat) {
                                return {
                                    ok: false,
                                    error: 'WWebJS returned no chat'
                                };
                            }

                            const name =
                                chat.name ||
                                chat.formattedTitle ||
                                chat.groupMetadata?.subject ||
                                chat.groupMetadata?.name ||
                                null;

                            return {
                                ok: true,
                                name: name,
                                id:
                                    chat.id?._serialized ||
                                    chat.id?.$1 ||
                                    null,
                                isGroup:
                                    chat.isGroup ||
                                    chat.id?.server === 'g.us' ||
                                    false
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
                    groupWhatsappId
                );

            console.log(
                '[GROUP-WWEBJS] Result:',
                result
            );

            if (
                result?.ok &&
                result?.name
            ) {
                groupName = result.name;

                console.log(
                    '[GROUP-WWEBJS] GROUP NAME FOUND:',
                    groupName
                );

                console.log(
                    '========== GROUP DEBUG END =========='
                );

                return {
                    groupName,
                    chat: null
                };
            }

        } else {

            console.log(
                '[GROUP-WWEBJS] pupPage unavailable'
            );
        }

    } catch (error) {

        console.log(
            '[GROUP-WWEBJS] Lookup failed:',
            error?.message || error
        );
    }


    // ==================================================
    // 2. DIRECT WAWebCollections FALLBACK
    // ==================================================
    try {

        if (
            client.pupPage &&
            !client.pupPage.isClosed()
        ) {

            console.log(
                '[GROUP-COLLECTION] Trying WAWebCollections.Chat...'
            );

            const result =
                await client.pupPage.evaluate(
                    async (groupId) => {

                        try {

                            const collections =
                                window.require(
                                    'WAWebCollections'
                                );

                            if (!collections) {
                                return {
                                    ok: false,
                                    error:
                                        'WAWebCollections unavailable'
                                };
                            }

                            let chat = null;

                            if (
                                collections.Chat
                            ) {

                                try {
                                    chat =
                                        collections.Chat.get(
                                            groupId
                                        );
                                } catch (_) {}

                                if (!chat) {

                                    try {
                                        chat =
                                            await collections.Chat.find(
                                                groupId
                                            );
                                    } catch (_) {}
                                }
                            }

                            if (!chat) {
                                return {
                                    ok: false,
                                    error:
                                        'Chat not found in WAWebCollections'
                                };
                            }

                            const name =
                                chat.name ||
                                chat.formattedTitle ||
                                chat.groupMetadata?.subject ||
                                chat.groupMetadata?.name ||
                                null;

                            return {
                                ok: true,
                                name: name,
                                id:
                                    chat.id?._serialized ||
                                    chat.id?.$1 ||
                                    null,
                                isGroup:
                                    chat.isGroup ||
                                    chat.id?.server === 'g.us' ||
                                    false
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
                    groupWhatsappId
                );

            console.log(
                '[GROUP-COLLECTION] Result:',
                result
            );

            if (
                result?.ok &&
                result?.name
            ) {

                groupName =
                    result.name;

                console.log(
                    '[GROUP-COLLECTION] GROUP NAME FOUND:',
                    groupName
                );

                console.log(
                    '========== GROUP DEBUG END =========='
                );

                return {
                    groupName,
                    chat: null
                };
            }
        }

    } catch (error) {

        console.log(
            '[GROUP-COLLECTION] Lookup failed:',
            error?.message || error
        );
    }


    // ==================================================
    // 3. NORMAL whatsapp-web.js FALLBACK
    // ==================================================
    try {

        console.log(
            '[GROUP-FALLBACK] Trying client.getChatById()...'
        );

        const chat =
            await client.getChatById(
                groupWhatsappId
            );

        if (chat) {

            console.log(
                '[GROUP-FALLBACK] Chat object found'
            );

            console.log(
                '[GROUP-FALLBACK] Chat name:',
                chat.name
            );

            console.log(
                '[GROUP-FALLBACK] Chat formattedTitle:',
                chat.formattedTitle
            );

            groupName =
                chat.name ||
                chat.formattedTitle ||
                chat.groupMetadata?.subject ||
                chat.groupMetadata?.name ||
                null;

            if (groupName) {

                console.log(
                    '[GROUP-FALLBACK] GROUP NAME FOUND:',
                    groupName
                );

                console.log(
                    '========== GROUP DEBUG END =========='
                );

                return {
                    groupName,
                    chat
                };
            }
        }

    } catch (error) {

        console.log(
            '[GROUP-FALLBACK] client.getChatById failed:',
            error?.message || error
        );
    }


    // ==================================================
    // 4. MESSAGE CHAT FALLBACK
    // ==================================================
    try {

        console.log(
            '[GROUP-MESSAGE] Trying msg.getChat()...'
        );

        const chat =
            await msg.getChat();

        if (chat) {

            groupName =
                chat.name ||
                chat.formattedTitle ||
                chat.groupMetadata?.subject ||
                chat.groupMetadata?.name ||
                null;

            console.log(
                '[GROUP-MESSAGE] Name:',
                groupName
            );

            if (groupName) {

                console.log(
                    '========== GROUP DEBUG END =========='
                );

                return {
                    groupName,
                    chat
                };
            }
        }

    } catch (error) {

        console.log(
            '[GROUP-MESSAGE] msg.getChat() failed:',
            error?.message || error
        );
    }


    // ==================================================
    // FINAL
    // ==================================================

    console.log(
        '[GROUP] Group name could not be resolved'
    );

    console.log(
        '[GROUP] Group ID:',
        groupWhatsappId
    );

    console.log(
        '[GROUP] Final group name:',
        groupName
    );

    console.log(
        '========== GROUP DEBUG END =========='
    );

    return {
        groupName: groupName || null,
        chat: null
    };
}
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
            '[MEDIA] Could not resolve message ID'
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
                '[MEDIA] Internal message ID repaired'
            );
        }

    } catch (error) {
        console.log(
            '[MEDIA] Internal ID repair warning:',
            error.message
        );
    }


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
                    '[MEDIA] Public message ID patched'
                );

            } catch (patchError) {
                console.log(
                    '[MEDIA] Public ID patch skipped:',
                    patchError.message
                );
            }
        }
    } catch (_) {}


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
                '[MEDIA] Media downloaded successfully'
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
                '[MEDIA] Media downloaded on retry'
            );

            return media;
        }

    } catch (error) {
        console.log(
            '[MEDIA] Retry downloadMedia() failed:',
            error.message
        );
    }


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
                    '[MEDIA] Direct WhatsApp Store download successful'
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

    console.log(
        '[MEDIA] Media download failed'
    );

    return null;
}
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
                'No media data to save'
            );

            return null;
        }

        let extension;
        let mediaFolder;

        if (
            media.mimetype &&
            media.mimetype.startsWith(
                'image/'
            )
        ) {
            const mimeExtension =
                media.mimetype
                    .split('/')[1]
                    .split(';')[0];

            extension =
                mimeExtension === 'jpeg'
                    ? 'jpg'
                    : mimeExtension;
            mediaFolder = 'images';
        }
        else if (
            media.mimetype ===
            'application/pdf'
        ) {
            extension = 'pdf';
            mediaFolder = 'pdfs';
        }
        // 🆕 VIDEO SUPPORT
        else if (
            media.mimetype &&
            media.mimetype.startsWith('video/')
        ) {
            const mimeExtension =
                media.mimetype
                    .split('/')[1]
                    .split(';')[0];
            extension =
                mimeExtension === 'quicktime'
                    ? 'mov'
                    : mimeExtension;
            mediaFolder = 'videos';
            console.log('🎬 Video detected:', media.mimetype);
        }
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

        const fileBuffer =
            Buffer.from(
                media.data,
                'base64'
            );

        const databasePath =
            `${MEDIA_BASE_URL}/${mediaFolder}/${encodeURIComponent(filename)}`;

        console.log(
            'Media prepared for PostgreSQL BYTEA'
        );

        console.log(
            'Filename:',
            filename
        );

        console.log(
            'Database path:',
            databasePath
        );

        console.log(
            'Media size:',
            fileBuffer.length,
            'bytes'
        );

        return {
            databasePath,
            filename,
            mimetype: media.mimetype,
            buffer: fileBuffer
        };

    } catch (error) {
        console.error(
            'Failed to prepare media'
        );

        console.error(
            error.message
        );

        return null;
    }
}
client.on(
    'message',
    async (msg) => {

        try {

            console.log('');
            console.log(
                '===================================='
            );

            console.log(
                'MESSAGE EVENT RECEIVED'
            );

            console.log(
                '==============================='
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
                'GROUP MESSAGE DETECTED'
            );

            console.log(
                'Group WhatsApp ID:',
                groupWhatsappId
            );

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
            const messageId =
                getMessageSerializedId(msg);
            console.log(
                'Message ID:',
                messageId
            );

            if (!messageId) {

                console.log(
                    'Message ID unavailable — skipped'
                );

                return;
            }
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
            let hasMedia = false;
            let mediaPath = null;
            let mediaData = null;
            let mediaMimetype = null;
            let mediaFilename = null;
            // 🆕 LOCATION DETECT - originalMessage se PEHLE
            // 🆕 LOCATION DETECT
            let originalMessage = null;
            let locationLink = null;

            if (msg.type === 'location') {
                console.log('📍 Location message detected');
                try {
                    const location = msg.location;
                    if (location) {
                        const lat = location.latitude;
                        const lon = location.longitude;
                        locationLink = `https://www.google.com/maps?q=${lat},${lon}`;
                        originalMessage = locationLink;
                        console.log('📍 Location link:', locationLink);
                    }
                } catch (error) {
                    console.error('Location parsing failed:', error.message);
                    originalMessage = '📍 Location (failed to parse)';
                }
            } else {
                originalMessage = msg.body || null;
            }
            if (msg.hasMedia) {

                console.log(
                    'Media detected'
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

                        const savedMedia =
                            await saveMediaToDisk(
                                media,
                                messageId
                            );

                        if (savedMedia) {

                            mediaPath =
                                savedMedia.databasePath;

                            mediaData =
                                savedMedia.buffer;

                            mediaMimetype =
                                savedMedia.mimetype;

                            mediaFilename =
                                savedMedia.filename;

                            console.log(
                                'Media prepared successfully'
                            );

                            console.log(
                                'Media path:',
                                mediaPath
                            );

                            console.log(
                                'Media filename:',
                                mediaFilename
                            );

                            console.log(
                                'Media BYTEA size:',
                                mediaData.length
                            );

                        } else {

                            console.log(
                                'Media could not be prepared'
                            );
                        }

                    } else {

                        console.log(
                            'Media data unavailable after all attempts'
                        );
                    }

                } catch (mediaError) {

                    console.error(
                        'Media processing failed'
                    );

                    console.error(
                        'Error details:',
                        mediaError.message
                    );
                }
            }
            
            // ✅ FIXED INSERT QUERY - VALUES ORDER CORRECT
            const saveResult = await pool.query(
                `
                INSERT INTO messages (
                whatsapp_message_id,
                group_id,
                group_name,
                sender_id,
                sender_number,
                sender_name,
                message,
                message_type,
                timestamp,
                has_media,
                media_path,
                media_data,
                media_mimetype,
                media_filename,
                location_link          
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (whatsapp_message_id)
                DO UPDATE SET
                    group_id = COALESCE(EXCLUDED.group_id, messages.group_id),
                    group_name = COALESCE(EXCLUDED.group_name, messages.group_name),
                    sender_id = COALESCE(EXCLUDED.sender_id, messages.sender_id),
                    sender_number = COALESCE(EXCLUDED.sender_number, messages.sender_number),
                    sender_name = COALESCE(EXCLUDED.sender_name, messages.sender_name),
                    message = COALESCE(EXCLUDED.message, messages.message),
                    message_type = COALESCE(EXCLUDED.message_type, messages.message_type),
                    timestamp = COALESCE(EXCLUDED.timestamp, messages.timestamp),
                    has_media = messages.has_media OR EXCLUDED.has_media,
                    media_path = COALESCE(EXCLUDED.media_path, messages.media_path),
                    media_data = COALESCE(EXCLUDED.media_data, messages.media_data),
                    media_mimetype = COALESCE(EXCLUDED.media_mimetype, messages.media_mimetype),
                    media_filename = COALESCE(EXCLUDED.media_filename, messages.media_filename),
                    location_link = COALESCE(EXCLUDED.location_link, messages.location_link)

                RETURNING id, media_path, has_media, media_filename
                `,
                [
                    messageId,                // $1
                    groupId,                  // $2
                    groupName,                // $3
                    senderId,                 // $4
                    senderNumber,             // $5
                    senderName || senderNumber || senderId || 'Unknown Sender', // $6
                    originalMessage,          // $7
                    msg.type,                 // $8
                    messageDate,              // $9
                    hasMedia,                 // $10
                    mediaPath,                // $11
                    mediaData,                // $12
                    mediaMimetype,            // $13
                    mediaFilename,            // $14
                    locationLink              // $15
                ]
            );

            console.log(
                'Message saved/updated in PostgreSQL'
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
                '[DATABASE] media_filename:',
                saveResult.rows[0]?.media_filename
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
                '==========================='
            );

            console.log(
                '=============================='
            );

        } catch (error) {

            console.error('');

            console.error(
                '==========================='
            );

            console.error(
                'MESSAGE PROCESSING FAILED'
            );

            console.error(
                '================================'
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
                '=================================='
            );
        }
    }
);

client.on(
    'error',
    (error) => {

        console.error(
            'WhatsApp client error'
        );

        console.error(
            error
        );
    }
);

const mediaServer =
    http.createServer(
        async (req, res) => {

            try {

                if (
                    req.method !== 'GET' &&
                    req.method !== 'HEAD'
                ) {
                    res.writeHead(
                        405,
                        {
                            'Content-Type':
                                'text/plain'
                        }
                    );

                    res.end(
                        'Method Not Allowed'
                    );

                    return;
                }

                const requestUrl =
                    new URL(
                        req.url,
                        MEDIA_BASE_URL
                    );

                const requestedPath =
                    decodeURIComponent(
                        requestUrl.pathname
                    );

                let mediaType = null;

                if (
                    requestedPath.startsWith(
                        '/images/'
                    )
                ) {
                    mediaType = 'image';

                } else if (
                    requestedPath.startsWith(
                        '/pdfs/'
                    )
                ) {
                    mediaType = 'pdf';

                } else if (
                    requestedPath.startsWith(
                        '/videos/'
                    )
                ) {
                    mediaType = 'video';

                } else {

                    res.writeHead(
                        404,
                        {
                            'Content-Type':
                                'text/plain'
                        }
                    );

                    res.end(
                        'File Not Found'
                    );

                    return;
                }

                const filename =
                    path.basename(
                        requestedPath
                    );

                if (!filename) {

                    res.writeHead(
                        400,
                        {
                            'Content-Type':
                                'text/plain'
                        }
                    );

                    res.end(
                        'Invalid filename'
                    );

                    return;
                }

                const result =
                    await pool.query(
                        `
                        SELECT
                            media_data,
                            media_mimetype,
                            media_filename
                        FROM messages
                        WHERE media_filename = $1
                          AND media_data IS NOT NULL
                        LIMIT 1
                        `,
                        [
                            filename
                        ]
                    );

                if (
                    result.rows.length === 0
                ) {

                    res.writeHead(
                        404,
                        {
                            'Content-Type':
                                'text/plain'
                        }
                    );
                    res.end(
                        'Media Not Found'
                    );
                    return;
                }
                const row =
                    result.rows[0];
                const mediaBuffer =
                    row.media_data;

                const contentType =
                    row.media_mimetype ||
                    (
                        mediaType === 'image'
                            ? 'image/jpeg'
                            : mediaType === 'video'
                            ? 'video/mp4'
                            : 'application/pdf'
                    );

                res.writeHead(
                    200,
                    {
                        'Content-Type':
                            contentType,

                        'Content-Length':
                            mediaBuffer.length,

                        'Content-Disposition':
                            'inline',

                        'Cache-Control':
                            'public, max-age=31536000'
                    }
                );

                if (
                    req.method === 'HEAD'
                ) {
                    res.end();
                    return;
                }

                res.end(
                    mediaBuffer
                );

            } catch (error) {

                console.error(
                    '[MEDIA SERVER] Error:',
                    error.message
                );

                if (!res.headersSent) {
                    res.writeHead(
                        500,
                        {
                            'Content-Type':
                                'text/plain'
                        }
                    );
                }

                res.end(
                    'Internal Server Error'
                );
            }
        }
    );

mediaServer.listen(
    MEDIA_PORT,
    '0.0.0.0',
    () => {

        console.log(
            `Media server running on port ${MEDIA_PORT}`
        );

        console.log(
            `Images URL: ${MEDIA_BASE_URL}/images/`
        );

        console.log(
            `PDFs URL: ${MEDIA_BASE_URL}/pdfs/`
        );

        console.log(
            `Videos URL: ${MEDIA_BASE_URL}/videos/`
        );
    }
);
console.log('');

console.log(
    '============================================================'
);

console.log(
    'Starting WhatsApp client...'
);

console.log(
    '=================================================================='
);

client.initialize();