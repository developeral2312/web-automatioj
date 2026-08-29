const { Client, LocalAuth } = require('whatsapp-web.js');

    const qrcode = require('qrcode-terminal');
    const path = require('path');

    const pool = require('./db');
    const QRCode = require('qrcode');  // Top par add karein


    const googleSheets = require('./google-sheets');

    const http = require('http');

    const moment = require('moment-timezone');

    require('dotenv').config();

    const fs = require('fs');




    const MEDIA_PORT = process.env.MEDIA_PORT || 3000;



    const MEDIA_BASE_URL =

        process.env.MEDIA_BASE_URL ||

        `http://localhost:${MEDIA_PORT}`;




        
    // ============================================================

    // WHATSAPP CLIENT FACTORY

    // ============================================================

   
    function createWhatsAppClient() {



        console.log('');

        console.log('============================================================');

        console.log('[CLIENT] Creating WhatsApp client...');

        console.log('[CLIENT] Node version:', process.version);

        console.log('[CLIENT] Platform:', process.platform);

        console.log('[CLIENT] CWD:', process.cwd());

        console.log('============================================================');



        const newClient = new Client({



            authStrategy: new LocalAuth({

                clientId: 'company-archive',

                dataPath: './.wwebjs_auth'
                  
            }),



            puppeteer: {


               // executablePath: '/usr/bin/chromium',  // ✅ YE ADD KARO
                headless: true,



                args: [

                    '--no-sandbox',

                    '--disable-setuid-sandbox',

                    '--disable-dev-shm-usage',

                    '--disable-accelerated-2d-canvas',

                    '--disable-gpu',

                    '--disable-extensions',

                    '--disable-background-networking',

                    '--disable-background-timer-throttling',

                    '--disable-backgrounding-occluded-windows',

                    '--disable-breakpad',

                    '--disable-component-extensions-with-background-pages',

                    '--disable-features=Translate,BackForwardCache',

                    '--disable-hang-monitor',

                    '--disable-ipc-flooding-protection',

                    '--disable-renderer-backgrounding',

                    '--disable-sync',

                    '--metrics-recording-only',

                    '--no-first-run',

                    '--no-default-browser-check',

                    '--password-store=basic',

                    '--use-mock-keychain',

                    // --- ADD THESE FOR BETTER CONNECTION ---

                    '--disable-web-security',

                    '--disable-features=IsolateOrigins,site-per-process',

                    '--window-size=1280,720'

                ],



                timeout: 120000,



                protocolTimeout: 120000,

                defaultViewport: null   // <--- ADD THIS

            }

        });



        console.log('[CLIENT] Client object created successfully');



        return newClient;

    }



    // ============================================================

    // CLEAR WHATSAPP SESSION (IMPROVED)

    // ============================================================



    async function clearWhatsAppSession() {

        try {

            console.log('');

            console.log('============================================================');

            console.log('[SESSION] Starting session cleanup...');

            console.log('============================================================');



            const sessionPath = path.join(

                process.cwd(),

                '.wwebjs_auth',

                'session-company-archive'

            );



            console.log('[SESSION] Checking session path:', sessionPath);



            if (fs.existsSync(sessionPath)) {

                console.log('[SESSION] Found session folder. Removing...');

                await fs.promises.rm(sessionPath, {

                    recursive: true,

                    force: true

                });

                console.log('✅ WhatsApp session-company-archive removed');

            } else {

                console.log('ℹ️ Main session folder not found');

            }



            // --- Clean up any leftover files with company-archive in name ---

            const authPath = path.join(process.cwd(), '.wwebjs_auth');

            console.log('[SESSION] Checking auth path:', authPath);



            if (fs.existsSync(authPath)) {

                const files = await fs.promises.readdir(authPath);

                console.log('[SESSION] Files in .wwebjs_auth:', files);



                let removedCount = 0;

                for (const file of files) {

                    if (file.includes('company-archive')) {

                        const filePath = path.join(authPath, file);

                        console.log(`[SESSION] Removing leftover file: ${file}`);

                        await fs.promises.rm(filePath, {

                            recursive: true,

                            force: true

                        });

                        removedCount++;

                        console.log(`✅ Removed: ${file}`);

                    }

                }



                if (removedCount === 0) {

                    console.log('ℹ️ No leftover company-archive files found');

                } else {

                    console.log(`✅ Total ${removedCount} leftover files removed`);

                }

            } else {

                console.log('ℹ️ Auth path not found');

            }



            console.log('============================================================');

            console.log('[SESSION] Session cleanup completed');

            console.log('============================================================');



        } catch (error) {

            console.error('❌ Failed to remove WhatsApp session:', error?.message || error);

            console.error('Stack:', error?.stack);

        }

    }



    let client = createWhatsAppClient();



    let isRestartingWhatsApp = false;

    let isForceRestarting = false;  // <--- NEW: For force restart


    async function forceRestartWhatsAppClient() {

        console.log('');

        console.log('============================================================');

        console.log('🔄 FORCE RESTART WHATSAPP CLIENT');

        console.log('============================================================');



        if (isForceRestarting) {

            console.log('[FORCE RESTART] Already in progress. Skipping...');

            return;

        }



        if (isRestartingWhatsApp) {

            console.log('[FORCE RESTART] Normal restart in progress. Waiting...');

            // Wait for normal restart to finish

            let waitCount = 0;

            while (isRestartingWhatsApp && waitCount < 30) {

                await new Promise(resolve => setTimeout(resolve, 1000));

                waitCount++;

            }

            if (isRestartingWhatsApp) {

                console.log('[FORCE RESTART] Normal restart still in progress. Force proceeding...');

            }

        }
        isForceRestarting = true;

        isRestartingWhatsApp = true;  // Lock both



        try {

            const oldClient = client;

            if (oldClient && typeof oldClient.removeAllListeners === 'function') {

                console.log('[FORCE RESTART] Removing old client event listeners...');

                oldClient.removeAllListeners();

                console.log('✅ Old client event listeners removed');

            }


            await clearWhatsAppSession();



            // --- STEP 3: Destroy old client (force) ---

            if (oldClient) {

                try {

                    console.log('[FORCE RESTART] Force destroying old client...');



                    // Try to close browser directly

                    if (oldClient.pupBrowser) {

                        try {

                            await oldClient.pupBrowser.close();

                            console.log('✅ Browser closed directly');

                        } catch (e) {

                            console.log('⚠️ Browser close error:', e.message);

                        }

                    }



                    // Try destroy

                    try {

                        await oldClient.destroy();

                        console.log('✅ Old client destroyed');

                    } catch (e) {

                        console.log('⚠️ Destroy error:', e.message);

                    }



                } catch (error) {

                    console.log('[FORCE RESTART] Old client cleanup warning:', error.message);

                }

            }



            // --- STEP 4: Wait ---

            console.log('[FORCE RESTART] Waiting 2 seconds...');

            await new Promise(resolve => setTimeout(resolve, 2000));



            // --- STEP 5: Create NEW client ---

            console.log('[FORCE RESTART] Creating new WhatsApp client...');

            const newClient = createWhatsAppClient();



            // --- STEP 6: Update global ---

            client = newClient;



            // --- STEP 7: Attach events ---

            console.log('[FORCE RESTART] Attaching WhatsApp events...');

            attachClientEvents(newClient);



            // --- STEP 8: Initialize ---

            console.log('[FORCE RESTART] Initializing new WhatsApp client...');

            await newClient.initialize();



            console.log('');

            console.log('============================================================');

            console.log('✅ FORCE RESTART COMPLETED');

            console.log('📱 NEW QR SHOULD NOW APPEAR');

            console.log('============================================================');



        } catch (error) {

            console.error('');

            console.error('============================================================');

            console.error('❌ FORCE RESTART FAILED');

            console.error('Message:', error?.message);

            console.error('Stack:', error?.stack);

            console.error('============================================================');



            // Try to recover by creating a new client

            try {

                console.log('[FORCE RESTART] Attempting recovery...');

                const recoveryClient = createWhatsAppClient();

                client = recoveryClient;

                attachClientEvents(recoveryClient);

                await recoveryClient.initialize();

                console.log('✅ Recovery successful');

            } catch (recoveryError) {

                console.error('❌ Recovery failed:', recoveryError.message);

            }



        } finally {

            isForceRestarting = false;

            isRestartingWhatsApp = false;

            console.log('[FORCE RESTART] Process completed');

        }

    }



    // ============================================================

    // RESTART WHATSAPP CLIENT (NORMAL)

    // ============================================================

    async function restartWhatsAppClient() {



        if (isRestartingWhatsApp) {



            console.log(

                '[RESTART] Restart already in progress. Skipping...'

            );



            return;

        }



        isRestartingWhatsApp = true;



        console.log('');

        console.log('============================================================');

        console.log('🔄 RESTARTING WHATSAPP CLIENT');

        console.log('============================================================');



        try {



            // ----------------------------------------------------

            // 1. Destroy current client

            // ----------------------------------------------------



            const oldClient = client;



            if (oldClient) {



                try {



                    console.log(

                        '[RESTART] Destroying old client...'

                    );



                    await oldClient.destroy();



                    console.log(

                        '[RESTART] Old client destroyed'

                    );



                } catch (error) {



                    console.log(

                        '[RESTART] Old client destroy warning:',

                        error.message

                    );

                }

            }



            // ----------------------------------------------------

            // 2. Remove old LocalAuth session

            // ----------------------------------------------------



            await clearWhatsAppSession();



            // ----------------------------------------------------

            // 3. Wait a little

            // ----------------------------------------------------



            console.log(

                '[RESTART] Waiting before creating new client...'

            );



            await new Promise(resolve =>

                setTimeout(resolve, 2000)

            );



            // ----------------------------------------------------

            // 4. Create NEW client

            // ----------------------------------------------------



            console.log(

                '[RESTART] Creating new WhatsApp client...'

            );



            const newClient =

                createWhatsAppClient();



            client = newClient;



            // ----------------------------------------------------

            // 5. Attach events BEFORE initialize

            // ----------------------------------------------------



            console.log(

                '[RESTART] Attaching WhatsApp events...'

            );



            attachClientEvents(newClient);



            // ----------------------------------------------------

            // 6. Initialize NEW client

            // ----------------------------------------------------



            console.log(

                '[RESTART] Initializing new WhatsApp client...'

            );



            await newClient.initialize();



            console.log('');

            console.log('============================================================');

            console.log('✅ NEW WHATSAPP CLIENT INITIALIZED');

            console.log('============================================================');



        } catch (error) {



            console.error('');

            console.error('============================================================');

            console.error('❌ WHATSAPP RESTART FAILED');

            console.error('Message:', error.message);

            console.error('============================================================');



        } finally {



            isRestartingWhatsApp = false;

        }

    }



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



            console.log(

                'Database structure ready'

            );



        } catch (error) {



            console.error(

                'Database preparation failed'

            );



            console.error(error);

        }

    }



    // ============================================================

    // WHATSAPP ID HELPERS

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



            return normalizedId.replace(

                '@c.us',

                ''

            );

        }



        return null;

    }



    // ============================================================

    // CONTACT HELPERS

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



            console.log(

                `[LID] Resolving LID: ${lid}`

            );



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



                const phone =

                    result[0].pn;



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

    // SENDER INFO

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

                        senderName || 'Not available'

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

    // GROUP INFO

    // ============================================================



    async function getGroupInfo(msg, groupWhatsappId) {



        let groupName = null;



        console.log('');

        console.log(

            '========== GROUP DEBUG START =========='

        );



        console.log(

            '[GROUP] groupWhatsappId:',

            groupWhatsappId

        );



        if (!groupWhatsappId) {



            console.log(

                '[GROUP] No group ID'

            );



            return {



                groupName: null,

                chat: null



            };

        }



        // --------------------------------------------------------

        // 1. WWebJS

        // --------------------------------------------------------



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



                                        error:

                                            'WWebJS.getChat unavailable'



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



                                        error:

                                            'WWebJS returned no chat'



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



                                    name,



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



                    groupName =

                        result.name;



                    return {



                        groupName,

                        chat: null



                    };

                }

            }



        } catch (error) {



            console.log(

                '[GROUP-WWEBJS] Lookup failed:',

                error?.message || error

            );

        }



        // --------------------------------------------------------

        // 2. WAWebCollections

        // --------------------------------------------------------



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



                                if (collections.Chat) {



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

                                            'Chat not found'



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



                                    name,



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



        // --------------------------------------------------------

        // 3. getChatById

        // --------------------------------------------------------



        try {



            console.log(

                '[GROUP-FALLBACK] Trying client.getChatById()...'

            );



            const chat =

                await client.getChatById(

                    groupWhatsappId

                );



            if (chat) {



                groupName =

                    chat.name ||

                    chat.formattedTitle ||

                    chat.groupMetadata?.subject ||

                    chat.groupMetadata?.name ||

                    null;



                if (groupName) {



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



        // --------------------------------------------------------

        // 4. msg.getChat()

        // --------------------------------------------------------



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



                if (groupName) {



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



        console.log(

            '[GROUP] Group name could not be resolved'

        );



        console.log(

            '========== GROUP DEBUG END =========='

        );



        return {



            groupName:

                groupName || null,



            chat: null

        };

    }



    // ============================================================

    // MEDIA DOWNLOAD

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

            return null;

        }



        // --------------------------------------------------------

        // Repair internal ID

        // --------------------------------------------------------



        try {



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

            }



        } catch (error) {



            console.log(

                '[MEDIA] Internal ID repair warning:',

                error.message

            );

        }



        // --------------------------------------------------------

        // Patch public message ID

        // --------------------------------------------------------



        try {



            if (

                msg.id &&

                !msg.id._serialized &&

                msg.id.$1

            ) {



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

            }



        } catch (_) {}



        // --------------------------------------------------------

        // Normal download

        // --------------------------------------------------------



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



        } catch (error) {



            console.log(

                '[MEDIA] First downloadMedia() failed:',

                error.message

            );

        }



        // --------------------------------------------------------

        // Retry

        // --------------------------------------------------------



        try {



            await new Promise(resolve =>

                setTimeout(resolve, 3000)

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



        // --------------------------------------------------------

        // Direct Store fallback

        // --------------------------------------------------------



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



                                if (!message.mediaData) {



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



                                const base64 =

                                    mediaData?.body ||

                                    mediaData?.data ||

                                    null;



                                if (

                                    typeof base64 === 'string' &&

                                    base64.length > 100

                                ) {



                                    return {



                                        ok: true,



                                        media: {



                                            data: base64,



                                            mimetype:

                                                message.mimetype ||

                                                mediaData.mimetype ||

                                                'application/octet-stream',



                                            filename:

                                                message.filename ||

                                                mediaData.filename ||

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

                    directResult &&                directResult.ok &&

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



        return null;

    }



    // ============================================================

    // MEDIA PREPARATION

    // ============================================================



    async function saveMediaToDisk(media, messageId) {



        try {



            if (

                !media ||

                !media.data

            ) {

                return null;

            }



            let extension;

            let mediaFolder;



            if (

                media.mimetype &&

                media.mimetype.startsWith('image/')

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



            } else if (

                media.mimetype === 'application/pdf'

            ) {



                extension = 'pdf';

                mediaFolder = 'pdfs';



            } else if (

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



            } else {



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



            return {



                databasePath,



                filename,



                mimetype:

                    media.mimetype,



                buffer:

                    fileBuffer



            };



        } catch (error) {



            console.error(

                'Failed to prepare media:',

                error.message

            );



            return null;

        }

    }



    // ============================================================

    // MESSAGE HANDLER

    // ============================================================



    async function handleMessage(msg) {



        try {



            console.log('');

            console.log(

                '===================================='

            );



            console.log(

                'MESSAGE EVENT RECEIVED'

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



            // ------------------------------------------------------

            // GROUP ID

            // ------------------------------------------------------



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

                !groupWhatsappId.endsWith('@g.us')

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



            // ------------------------------------------------------

            // GROUP INFO

            // ------------------------------------------------------



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



            // ------------------------------------------------------

            // SAVE / UPDATE GROUP

            // ------------------------------------------------------



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



            // ------------------------------------------------------

            // SENDER

            // ------------------------------------------------------



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



            // ------------------------------------------------------

            // MESSAGE ID

            // ------------------------------------------------------



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



            // ------------------------------------------------------

            // TIMESTAMP

            // ------------------------------------------------------



            const timestamp =

                Number(msg.timestamp);



            const messageDate =

                timestamp > 0

                    ? moment(timestamp * 1000)

                        .tz('Asia/Kolkata')

                        .format('DD/MM/YYYY HH:mm')

                    : moment()

                        .tz('Asia/Kolkata')

                        .format('DD/MM/YYYY HH:mm');



            // ------------------------------------------------------

            // LOCATION

            // ------------------------------------------------------



            let hasMedia = false;

            let mediaPath = null;

            let mediaData = null;

            let mediaMimetype = null;

            let mediaFilename = null;



            let originalMessage = null;

            let locationLink = null;



            if (msg.type === 'location') {



                console.log(

                    '📍 Location message detected'

                );



                try {



                    const location =

                        msg.location;



                    if (location) {



                        const lat =

                            location.latitude;



                        const lon =

                            location.longitude;



                        locationLink =

                            `https://www.google.com/maps?q=${lat},${lon}`;



                        originalMessage =

                            locationLink;



                        console.log(

                            '📍 Location link:',

                            locationLink

                        );

                    }



                } catch (error) {



                    console.error(

                        'Location parsing failed:',

                        error.message

                    );



                    originalMessage =

                        '📍 Location (failed to parse)';

                }



            } else {



                originalMessage =

                    msg.body || null;

            }



            // ------------------------------------------------------

            // MEDIA

            // ------------------------------------------------------



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

                            media.filename || 'none'

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

                        }



                    } else {



                        console.log(

                            'Media data unavailable after all attempts'

                        );

                    }



                } catch (mediaError) {



                    console.error(

                        'Media processing failed:',

                        mediaError.message

                    );

                }

            }



            // ------------------------------------------------------

            // SAVE MESSAGE TO POSTGRESQL

            // ------------------------------------------------------



            const saveResult =

                await pool.query(

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



                    VALUES (

                        $1, $2, $3, $4, $5,

                        $6, $7, $8, $9, $10,

                        $11, $12, $13, $14, $15

                    )



                    ON CONFLICT (whatsapp_message_id)



                    DO UPDATE SET



                        group_id =

                            COALESCE(

                                EXCLUDED.group_id,

                                messages.group_id

                            ),



                        group_name =

                            COALESCE(

                                EXCLUDED.group_name,

                                messages.group_name

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

                            ),



                        media_data =

                            COALESCE(

                                EXCLUDED.media_data,

                                messages.media_data

                            ),



                        media_mimetype =

                            COALESCE(

                                EXCLUDED.media_mimetype,

                                messages.media_mimetype

                            ),



                        media_filename =

                            COALESCE(

                                EXCLUDED.media_filename,

                                messages.media_filename

                            ),



                        location_link =

                            COALESCE(

                                EXCLUDED.location_link,

                                messages.location_link

                            )



                    RETURNING

                        id,

                        media_path,

                        has_media,

                        media_filename

                    `,

                    [

                        messageId,

                        groupId,

                        groupName,

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

                        mediaPath,

                        mediaData,

                        mediaMimetype,

                        mediaFilename,

                        locationLink

                    ]

                );



            // ======================================================

            // GOOGLE SHEETS

            // ======================================================



            if (saveResult.rows[0]) {



                const messageData = {



                    id:

                        saveResult.rows[0].id,



                    whatsapp_message_id:

                        messageId,



                    // IMPORTANT: Google Sheet column C

                    group_id:

                        groupId,



                    group_name:

                        groupName,



                    sender_id:

                        senderId,



                    sender_number:

                        senderNumber,



                    sender_name:

                        senderName,



                    message:

                        originalMessage,



                    message_type:

                        msg.type,



                        timestamp:
                        "'" + String(messageDate),



                    has_media:

                        hasMedia,



                    media_path:

                        mediaPath,



                    location_link:

                        locationLink

                };



                // Google Sheets

                googleSheets

                    .appendMessage(messageData)

                    .catch(error => {



                        console.error(

                            '❌ Google Sheet sync failed:',

                            error.message

                        );

                    });

            }



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

                '=================================='

            );



        } catch (error) {



            console.error('');



            console.error(

                '================================'

            );



            console.error(

                'MESSAGE PROCESSING FAILED'

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

                '================================'

            );

        }

    }



    // ============================================================

    // CLIENT EVENT ATTACHMENT (WITH DASHBOARD FIX)

    // ============================================================



    function attachClientEvents(clientInstance) {



        // ============================================================

        // DASHBOARD SETUP

        // ============================================================
        
        const express = require('express');
        const dashboardApp = express();
        dashboardApp.set('view engine', 'ejs');
        dashboardApp.set('views', path.join(__dirname, 'views'));
        dashboardApp.use(express.static('public'));

        let currentQR = null;
        let isConnected = false;
        let phoneNumber = null;
        let qrError = null;

        // Dashboard routes
        dashboardApp.get('/', (req, res) => {
            res.render('dashboard', {
                qrCode: currentQR,
                connected: isConnected,
                phone: phoneNumber,
                error: qrError
            });
        });

        dashboardApp.get('/api/qr-status', (req, res) => {
            res.json({
                qr: currentQR,
                connected: isConnected,
                phone: phoneNumber,
                error: qrError
            });
        });

        // ============================================================

        // QR EVENT

        // ============================================================



        clientInstance.on('qr', async (qr) => {
            console.log('');
            console.log('============================================================');
            console.log('📱 NEW WHATSAPP QR CODE REQUIRED');
            console.log('============================================================');
            
            // ✅ Sirf tab dikhao jab QR generate ho (matlab connected nahi hai)
            // Terminal QR (chhota)
            qrcode.generate(qr, { small: true });
            
            // QR code URL generate karein (as backup)
            try {
                const qrUrl = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2
                });
                console.log('\n🔗 QR Code URL (Copy this link):');
                console.log(qrUrl);
                console.log('\n💡 Open this URL in browser to scan');
            } catch (err) {
                console.log('QR URL generation failed');
            }
            
            // Dashboard update
            try {
                const qrImage = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2
                });
                currentQR = qrImage;
                isConnected = false;
                qrError = null;
                console.log('✅ QR code ready for dashboard');
            } catch (err) {
                qrError = 'Failed to generate QR code';
            }
            
            console.log('✅ Scan QR with WhatsApp to connect');
        });


        // --------------------------------------------------------

        // AUTHENTICATED

        // --------------------------------------------------------



        clientInstance.on('authenticated', () => {
            console.log('');
            console.log('✅ WhatsApp authenticated successfully');
            console.log('✅ No QR code needed - already connected');
            // QR code variables clear karo
            currentQR = null;
            isConnected = true;
            qrError = null;
        });



        // --------------------------------------------------------

        // AUTH FAILURE

        // --------------------------------------------------------



        clientInstance.on(

            'auth_failure',

            (message) => {



                console.error(

                    'Authentication failed:',

                    message

                );

            }

        );



        // --------------------------------------------------------

        // READY

        // --------------------------------------------------------



        clientInstance.on(

            'ready',

            async () => {



                try {



                    console.log('');



                    console.log(

                        '============================================================'

                    );



                    console.log(

                        '✅ WHATSAPP READY'

                    );



                    console.log(

                        '============================================================'

                    );



                    console.log(

                        `Time: ${new Date().toISOString()}`

                    );



                    try {



                        const info =

                            clientInstance.info;



                        if (info) {



                            console.log(

                                '[READY DEBUG] Client info available'

                            );



                            const phone =

                                info.wid?._serialized ||

                                info.wid?.$1 ||

                                'Unknown';



                            const pushName =

                                info.pushname ||

                                'Unknown';



                            const platform =

                                info.platform ||

                                'Unknown';



                            console.log(

                                '📱 Phone:',

                                phone

                            );



                            console.log(

                                '👤 Push name:',

                                pushName

                            );



                            console.log(

                                '💻 Platform:',

                                platform

                            );

                        }



                    } catch (infoError) {



                        console.log(

                            '[READY DEBUG] Client info unavailable:',

                            infoError.message

                        );

                    }



                    // WhatsApp Web version

                    try {



                        if (

                            typeof clientInstance.getWWebVersion ===

                            'function'

                        ) {



                            const version =

                                await clientInstance.getWWebVersion();



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



                    // Database

                    await prepareDatabase();



                    // Google Sheets headers

                    try {



                        await googleSheets.initializeSheet();



                        console.log(

                            '✅ Google Sheet headers initialized'

                        );



                    } catch (sheetError) {



                        console.log(

                            '⚠️ Google Sheet init warning:',

                            sheetError.message

                        );

                    }



                    console.log(

                        '============================================================'

                    );



                } catch (error) {



                    console.error(

                        'READY handler failed:',

                        error

                    );

                }

            }

        );



        // --------------------------------------------------------

        // MESSAGE

        // --------------------------------------------------------



        clientInstance.on(

            'message',

            handleMessage

        );



        // --------------------------------------------------------

        // ERROR

        // --------------------------------------------------------



        clientInstance.on(

            'error',

            (error) => {



                console.error(

                    'WhatsApp client error:',

                    error

                );

            }

        );



        // --------------------------------------------------------

        // DISCONNECTED (IMPROVED)

        // --------------------------------------------------------



        clientInstance.on(

            'disconnected',

            async (reason) => {



                console.log('');



                console.log(

                    '============================================================'

                );



                console.log(

                    '⚠️ WHATSAPP DISCONNECTED'

                );



                console.log(

                    'Reason:',

                    reason

                );



                console.log(

                    '============================================================'

                );



                // ------------------------------------------------

                // LOGOUT

                // ------------------------------------------------



                if (reason === 'LOGOUT') {



                    // Prevent another logout/restart from running

                    // at the same time.

                    if (isRestartingWhatsApp) {



                        console.log(

                            '[LOGOUT] Restart already in progress. Skipping duplicate logout event...'

                        );



                        return;

                    }



                    isRestartingWhatsApp = true;



                    console.log('');

                    console.log(

                        '============================================================'

                    );



                    console.log(

                        '🔄 WHATSAPP LOGOUT DETECTED'

                    );



                    console.log(

                        '============================================================');



                    try {



                        // ------------------------------------------------

                        // 1. Remove event listeners from old client

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Removing event listeners from old client...'

                        );



                        if (typeof clientInstance.removeAllListeners === 'function') {

                            clientInstance.removeAllListeners();

                            console.log('✅ Old client event listeners removed');

                        }



                        // ------------------------------------------------

                        // 2. Destroy old client

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Destroying old WhatsApp client...'

                        );



                        try {



                            // Try to close browser directly first

                            if (clientInstance.pupBrowser) {

                                try {

                                    await clientInstance.pupBrowser.close();

                                    console.log('✅ Browser closed directly');

                                } catch (e) {

                                    console.log('⚠️ Browser close error:', e.message);

                                }

                            }



                            await clientInstance.destroy();



                            console.log(

                                '✅ Old WhatsApp client destroyed'

                            );



                        } catch (destroyError) {



                            console.log(

                                '[LOGOUT] Client destroy warning:',

                                destroyError.message

                            );

                        }



                        // ------------------------------------------------

                        // 3. Clear invalid logged-out session

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Clearing logged-out LocalAuth session...'

                        );



                        await clearWhatsAppSession();



                        // ------------------------------------------------

                        // 4. Small delay

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Waiting before starting new login session...'

                        );



                        await new Promise(resolve =>

                            setTimeout(resolve, 3000)

                        );



                        // ------------------------------------------------

                        // 5. Create NEW client

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Creating new WhatsApp client...'

                        );



                        const newClient =

                            createWhatsAppClient();



                        // IMPORTANT:

                        // Global client reference update.

                        client = newClient;



                        // ------------------------------------------------

                        // 6. Attach ALL events before initialize

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Attaching events to new client...'

                        );



                        attachClientEvents(

                            newClient

                        );



                        // ------------------------------------------------

                        // 7. Initialize new client

                        // ------------------------------------------------

                        console.log(

                            '[LOGOUT] Initializing new WhatsApp client...'

                        );



                        await newClient.initialize();



                        console.log('');

                        console.log(

                            '============================================================'

                        );



                        console.log(

                            '✅ NEW WHATSAPP CLIENT STARTED AFTER LOGOUT'

                        );



                        console.log(

                            '📱 Scan the NEW QR code to login'

                        );



                        console.log(

                            '============================================================');



                    } catch (error) {



                        console.error('');



                        console.error(

                            '============================================================'

                        );



                        console.error(

                            '❌ WHATSAPP LOGOUT RESTART FAILED'

                        );



                        console.error(

                            'Message:',

                            error?.message

                        );



                        console.error(

                            'Stack:',

                            error?.stack

                        );



                        console.error(

                            '============================================================'

                        );



                    } finally {



                        isRestartingWhatsApp = false;

                    }

                }

            }

        );

        // ============================================================
        // DASHBOARD SERVER START
        // ============================================================
        
        const DASHBOARD_PORT = 3002;
        dashboardApp.listen(DASHBOARD_PORT, '0.0.0.0', () => {
            console.log('');
            console.log('============================================================');
            console.log(`📊 DASHBOARD READY at http://localhost:${DASHBOARD_PORT}`);
            console.log('============================================================');
        });

    }



    // ============================================================

    // MEDIA SERVER

    // ============================================================



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



    // ============================================================

    // START MEDIA SERVER

    // ============================================================



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



    // ============================================================

    // START WHATSAPP

    // ============================================================



    console.log('');



    console.log(

        '============================================================'

    );



    console.log(

        'Starting WhatsApp client...'

    );



    console.log(

        '============================================================'

    );



    // IMPORTANT:

    // Events sirf EK BAAR attach honge.

    attachClientEvents(client);



    // Initialize

    console.log('');



    console.log(

        '============================================================'

    );



    console.log(

        '🚀 CALLING WHATSAPP CLIENT INITIALIZE()'

    );



    console.log(

        '============================================================'

    );



    const initializeStartedAt =

        Date.now();



    client.initialize()

        .then(() => {



            const seconds =

                (

                    (Date.now() - initializeStartedAt) /

                    1000

                ).toFixed(2);



            console.log('');



            console.log(

                '============================================================'

            );



            console.log(

                '✅ client.initialize() PROMISE RESOLVED'

            );



            console.log(

                'Time taken:',

                seconds,

                'seconds'

            );



            console.log(

                '============================================================'

            );



        })

        .catch(error => {



            const seconds =

                (

                    (Date.now() - initializeStartedAt) /

                    1000

                ).toFixed(2);



            console.error('');



            console.error(

                '============================================================'

            );



            console.error(

                '❌ client.initialize() FAILED'

            );



            console.error(

                'Time before failure:',

                seconds,

                'seconds'

            );



            console.error(

                'Name:',

                error?.name

            );



            console.error(

                'Message:',

                error?.message

            );



            console.error(

                'Stack:'

            );



            console.error(

                error?.stack

            );



            console.error(

                '============================================================'

            );

        });



    // ============================================================

    // PERIODIC CLIENT DEBUG

    // ============================================================



    setInterval(async () => {



        console.log('');



        console.log(

            '---------------- CLIENT STATUS DEBUG ----------------'

        );



        try {



            console.log(

                'Client exists:',

                !!client

            );



            console.log(

                'Client pupBrowser:',

                !!client?.pupBrowser

            );



            console.log(

                'Client pupPage:',

                !!client?.pupPage

            );



            console.log(

                'Client info:',

                client?.info || null

            );



            if (client?.pupBrowser) {



                try {



                    console.log(

                        'Browser connected:',

                        client.pupBrowser.isConnected()

                    );



                } catch (error) {



                    console.log(

                        'Browser connected check failed:',

                        error.message

                    );

                }



                try {



                    const pages =

                        await client.pupBrowser.pages();



                    console.log(

                        'Browser pages:',

                        pages.length

                    );



                    for (

                        let i = 0;

                        i < pages.length;

                        i++

                    ) {



                        try {



                            console.log(

                                `Page ${i}:`,

                                await pages[i].url()

                            );



                        } catch (error) {



                            console.log(

                                `Page ${i}: URL error:`,

                                error.message

                            );

                        }

                    }



                } catch (error) {



                    console.log(

                        'Browser pages error:',

                        error.message

                    );

                }

            }



            if (client?.pupPage) {



                try {



                    console.log(

                        'Main page closed:',

                        client.pupPage.isClosed()

                    );



                    console.log(

                        'Main page URL:',

                        await client.pupPage.url()

                    );



                } catch (error) {



                    console.log(

                        'Main page debug error:',

                        error.message

                    );

                }

            }



        } catch (error) {



            console.error(

                '[PERIODIC DEBUG] Error:',

                error.stack ||

                error.message

            );

        }



        console.log(

            '------------------------------------------------------'

        );



    }, 30000);

    module.exports = {

        client

    };