# WhatsApp Group Archive

A Node.js application that connects to WhatsApp using `whatsapp-web.js`, monitors group messages, stores message and sender information in PostgreSQL, and downloads supported media files such as images and PDFs to the local filesystem.

Media files are exposed through a local HTTP server so that the database stores a clickable HTTP URL instead of a filesystem path.

## Features

* WhatsApp Web connection using `whatsapp-web.js`
* Local WhatsApp authentication using `LocalAuth`
* QR code authentication
* Group message detection
* Group information storage
* Sender ID, phone number, and contact name detection
* WhatsApp LID to phone number resolution where supported
* Message ID compatibility for newer WhatsApp Web versions
* Image and PDF media downloading
* Local media file storage
* HTTP URLs for stored images and PDFs
* PostgreSQL message and group storage
* Automatic database column preparation
* Media retry and WhatsApp Store fallback handling
* Support for existing database structures

## Project Structure

```text
project/
├── images/
│   └── downloaded image files
│
├── pdfs/
│   └── downloaded PDF files
│
├── .wwebjs_auth/
│   └── WhatsApp LocalAuth session data
│
├── db.js
├── index.js
├── package.json
├── package-lock.json
└── .env
```

The main WhatsApp application file can have any filename, depending on your project configuration. In the examples below, it is referred to as `index.js`.

## Requirements

Install the following before running the project:

* Node.js
* npm
* PostgreSQL
* A WhatsApp account
* Internet connection

A Chromium-compatible environment is required by `whatsapp-web.js` and Puppeteer.

## Installation

Clone the project:

```bash
git clone <YOUR_REPOSITORY_URL>
cd <PROJECT_DIRECTORY>
```

Install dependencies:

```bash
npm install
```

## Environment Configuration

Create a `.env` file in the project root.

Example:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_database_user
DB_PASSWORD=your_database_password

MEDIA_PORT=3000
MEDIA_BASE_URL=http://localhost:3000
```

### Database Variables

| Variable      | Description                      |
| ------------- | -------------------------------- |
| `DB_HOST`     | PostgreSQL server hostname or IP |
| `DB_PORT`     | PostgreSQL port                  |
| `DB_NAME`     | PostgreSQL database name         |
| `DB_USER`     | PostgreSQL username              |
| `DB_PASSWORD` | PostgreSQL password              |

### Media Server Variables

| Variable         | Description                                         |
| ---------------- | --------------------------------------------------- |
| `MEDIA_PORT`     | Port used by the local media HTTP server            |
| `MEDIA_BASE_URL` | Base URL stored in the `media_path` database column |

For local development:

```env
MEDIA_PORT=3000
MEDIA_BASE_URL=http://localhost:3000
```

If the application needs to be accessed from another computer on the same network, use the server's LAN IP:

```env
MEDIA_PORT=3000
MEDIA_BASE_URL=http://192.168.1.100:3000
```

For production, use the appropriate public domain:

```env
MEDIA_PORT=3000
MEDIA_BASE_URL=https://yourdomain.com
```

## PostgreSQL Setup

Create the PostgreSQL database before starting the application.

For example:

```sql
CREATE DATABASE whatsapp_archive;
```

Configure the database credentials in `.env`.

The project automatically creates the required tables when `db.js` is executed.

## Database Structure

### groups

The `groups` table stores WhatsApp group information.

```text
id
whatsapp_group_id
group_name
created_at
```

### messages

The `messages` table stores WhatsApp messages and related information.

```text
id
whatsapp_message_id
group_id
sender_id
sender_number
sender_name
message
message_type
timestamp
has_media
media_path
extracted_text
created_at
```

### Media Path

The `media_path` column stores an HTTP URL.

Example:

```text
http://localhost:3000/images/1755481234567_0_12345_xxx.jpg
```

PDF example:

```text
http://localhost:3000/pdfs/1755481234567_0_12345_xxx.pdf
```

The column remains:

```sql
media_path TEXT
```

No special PostgreSQL URL type is required.

## Database Initialization

Run:

```bash
node db.js
```

Expected output:

```text
Database tables ready
```

The database initialization creates the required tables if they do not already exist.

## Starting the WhatsApp Client

Start the main application:

```bash
node index.js
```

The application will start the WhatsApp client and display a QR code in the terminal.

Scan the QR code using WhatsApp.

After successful authentication, the application will report that WhatsApp is ready.

The LocalAuth session is stored locally, so subsequent application starts normally do not require scanning the QR code again unless the session expires or is removed.

## WhatsApp Authentication

The project uses:

```js
new LocalAuth({
    clientId: 'company-archive'
})
```

WhatsApp session data is stored by `whatsapp-web.js`.

Do not commit the authentication directory to Git.

Add the following to `.gitignore`:

```gitignore
node_modules/
.wwebjs_auth/
.wwebjs_cache/
.env
images/
pdfs/
```

## Group Message Processing

The application listens for incoming WhatsApp messages.

Only group messages are processed.

The application identifies the group using the WhatsApp group ID.

Messages that are not associated with a group are skipped.

For every group message, the application attempts to determine:

* Group ID
* Group name
* Sender ID
* Sender phone number
* Sender name
* WhatsApp message ID
* Message type
* Message timestamp
* Message content
* Media information

## Sender Information

The application attempts multiple methods to identify the sender.

It first checks available WhatsApp message identifiers.

It then attempts to retrieve contact information using:

```js
msg.getContact()
```

Additional contact lookups are performed when required.

For WhatsApp LID identifiers, the application attempts to resolve the LID to a phone number when the installed WhatsApp Web environment supports:

```js
client.getContactLidAndPhone()
```

If a phone number or contact name cannot be resolved, the application falls back to the available WhatsApp identifier.

## Media Processing

The application currently supports:

* Images
* PDF files

Downloaded images are stored in:

```text
images/
```

Downloaded PDFs are stored in:

```text
pdfs/
```

Files are saved using a generated filename based on the current timestamp and message ID.

Example:

```text
images/1755481234567_0_12345_xxx.jpg
```

## Media HTTP Server

The application starts a local HTTP server.

By default:

```text
http://localhost:3000
```

Images are served from:

```text
http://localhost:3000/images/
```

PDFs are served from:

```text
http://localhost:3000/pdfs/
```

The server returns the correct MIME type and uses:

```text
Content-Disposition: inline
```

This allows supported images and PDFs to open directly in the browser.

## Example Media URL

If the application downloads:

```text
images/1755481234567_0_12345_abc.jpg
```

the database stores:

```text
http://localhost:3000/images/1755481234567_0_12345_abc.jpg
```

Opening the URL in a browser displays the image directly.

For PDFs:

```text
http://localhost:3000/pdfs/1755481234567_0_12345_abc.pdf
```

the browser opens the PDF using its built-in PDF viewer.

## Accessing Media From Another Computer

`localhost` only works on the computer running the Node.js application.

If another computer needs to access the media, configure the server's local network IP.

Example:

```env
MEDIA_PORT=3000
MEDIA_BASE_URL=http://192.168.1.100:3000
```

Then a media URL will look like:

```text
http://192.168.1.100:3000/images/example.jpg
```

Make sure port `3000` is allowed through the server firewall.

## Production Deployment

For production, it is recommended to expose the application through a domain or reverse proxy.

Example:

```env
MEDIA_PORT=3000
MEDIA_BASE_URL=https://archive.example.com
```

A reverse proxy such as Nginx can forward requests from the public domain to the Node.js media server.

The database will then store URLs such as:

```text
https://archive.example.com/images/example.jpg
```

## Running With npm

If `package.json` contains a start script:

```json
{
    "scripts": {
        "start": "node index.js"
    }
}
```

start the application with:

```bash
npm start
```

Otherwise:

```bash
node index.js
```

## Development

For development, the application can be started directly with:

```bash
node index.js
```

After modifying the source code, stop the process and start it again.

If you use a process manager such as PM2, the application can be managed with:

```bash
pm2 start index.js --name whatsapp-archive
```

Check status:

```bash
pm2 status
```

View logs:

```bash
pm2 logs whatsapp-archive
```

## Git Setup

Initialize Git if required:

```bash
git init
```

Add files:

```bash
git add .
```

Create a commit:

```bash
git commit -m "Initial project setup"
```

Add the remote repository:

```bash
git remote add origin <YOUR_REPOSITORY_URL>
```

Push the project:

```bash
git push -u origin main
```

For later changes:

```bash
git add .
git commit -m "Update project"
git push
```

## Important Security Notes

Do not commit `.env` to Git.

Do not commit WhatsApp authentication/session data.

Do not expose PostgreSQL credentials publicly.

Do not expose the media server publicly without appropriate access control if the stored WhatsApp media is private.

Recommended `.gitignore`:

```gitignore
node_modules/
.env
.wwebjs_auth/
.wwebjs_cache/
images/
pdfs/
```

## Troubleshooting

### QR code is not appearing

Check that Node.js is running correctly and that the application starts without dependency errors.

Delete the existing WhatsApp authentication directory only if you intentionally want to authenticate again.

### Database connection fails

Verify:

```env
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

Also verify that PostgreSQL is running.

### Media downloads but URL does not open

Check that the media server is running.

The terminal should show:

```text
Media server running on port 3000
```

Then test:

```text
http://localhost:3000/images/
```

A directory listing is not provided, so a specific filename is required.

### Media works on the server but not on another computer

Do not use:

```text
http://localhost:3000
```

for remote access.

Use the server's LAN IP or public domain:

```env
MEDIA_BASE_URL=http://SERVER_IP:3000
```

Also verify firewall and network settings.

### Port 3000 is already in use

Change:

```env
MEDIA_PORT=3000
```

to another available port:

```env
MEDIA_PORT=3001
```

Then restart the application.

## Current Media Flow

The complete media flow is:

```text
WhatsApp Message
       |
       v
Message Event
       |
       v
Media Detection
       |
       v
WhatsApp Media Download
       |
       v
Save File To Disk
       |
       +--------------------+
       |                    |
       v                    v
    images/               pdfs/
       |                    |
       +---------+----------+
                 |
                 v
        HTTP Media Server
                 |
                 v
        HTTP Media URL
                 |
                 v
        PostgreSQL
        media_path
```

## Example

An incoming WhatsApp image is downloaded and saved locally:

```text
images/1755481234567_0_12345_abc.jpg
```

The application then generates:

```text
http://localhost:3000/images/1787047762789_false_120363422775530841_g_us_3EB00D43ECB7FBCA1D46FA_51969255325752_lid.jpg
```

This URL is stored in:

```text
messages.media_path
```

The physical file remains on the Node.js server while the database contains the browser-accessible URL.

## Notes

The database structure does not require a separate URL column.

The existing:

```sql
media_path TEXT
```

column is sufficient for storing local HTTP URLs.

The media server and WhatsApp client run within the same Node.js application.

The WhatsApp message processing logic, sender resolution, group handling, database operations, and media download fallback mechanisms remain independent of the HTTP media URL functionality.
