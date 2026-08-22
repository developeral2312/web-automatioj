require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                whatsapp_group_id TEXT UNIQUE NOT NULL,
                group_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                whatsapp_message_id TEXT UNIQUE NOT NULL,
                group_id INTEGER REFERENCES groups(id),
                group_name TEXT,                    -- ✅ YEH COLUMN ADD KARO
                sender_id TEXT,
                sender_number TEXT,
                sender_name TEXT,
                message TEXT,
                message_type TEXT,
                timestamp TIMESTAMP,
                has_media BOOLEAN DEFAULT FALSE,
                media_path TEXT,
                location_link TEXT,         
                extracted_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Database tables ready');
        console.log('✅ Columns: group_id, group_name, sender_id, sender_number, sender_name, extracted_text');
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        console.error(error);
        throw error;
    } finally {
        await pool.end();
    }
}

initDatabase();