PART 1: LOGOUT PROCEDURE
Step 1: Navigate to Application Directory
Open your terminal and go to the application folder:

bash
cd /opt/whatsapp-archiver
Step 2: Check Current Running Status
Verify the application is running:

bash
pm2 status
Look for "whatsapp-archiver" in the list. Note if it shows "online" or "stopped".

Step 3: Stop the Application
Stop the PM2 process completely:

bash
pm2 stop whatsapp-archiver
Wait 5 seconds for the process to fully stop. You should see:

text
[PM2] Stopping app:whatsapp-archiver
[PM2] App stopped
Step 4: Remove WhatsApp Session Data
Delete the specific session folder:

bash
rm -rf .wwebjs_auth/session-company-archive
Step 5: Remove Any Leftover Session Files
Delete any other files containing "company-archive":

bash
rm -rf .wwebjs_auth/*company-archive*
Step 6: Verify Session Cleanup
Check if any session files remain:

bash
ls -la .wwebjs_auth/
The output should show no files with "company-archive" in their name. If you see any, delete them manually.

Step 7: Restart the Application
Start the application again:

bash
pm2 restart whatsapp-archiver
Wait for the application to initialize. This may take 30-60 seconds.

Step 8: Verify Logout Status
Check the logs to confirm logout:

bash
pm2 logs whatsapp-archiver --lines 20
Look for messages like:

"WhatsApp disconnected"

"Authentication failed"

"New QR code received" (this confirms you are logged out)

Step 9: Check Browser Session Status
For additional verification, check if any browser processes remain:

bash
ps aux | grep chromium
If you see chromium processes, wait 10 seconds as they will auto-cleanup.

Step 10: Confirm Complete Logout
The application should now show a new QR code in the logs. If you see:

text
NEW WHATSAPP QR CODE RECEIVED
This confirms you are successfully logged out and ready for a new login.

PART 2: LOGIN PROCEDURE
Step 1: Verify Application is Running
Check if the application is online:

bash
pm2 status
If not running, start it:

bash
pm2 start whatsapp-archiver
Step 2: Clear Old Logs (Optional)
Clear previous logs for a clean view:

bash
pm2 flush whatsapp-archiver
Step 3: Start Watching Logs
Open the log stream to see the QR code:

bash
pm2 logs whatsapp-archiver
Keep this terminal window open. Do not close it during the login process.

Step 4: Wait for QR Code Generation
Wait 30-60 seconds. You will see in the logs:

text
============================================================
NEW WHATSAPP QR CODE RECEIVED
============================================================
Then a QR code will appear in the terminal as ASCII art.

Step 5: Prepare Your Phone
Open WhatsApp on your phone

Go to the Settings or Menu option

Tap on "Linked Devices" or "WhatsApp Web"

Keep your phone unlocked and ready

Step 6: Scan the QR Code
Tap "Link a Device" on your phone

Point your phone camera at the QR code shown in the terminal

The QR code will automatically scan

Step 7: Wait for Authentication
After scanning, wait 10-20 seconds. Watch the logs for:

text
WhatsApp authenticated
Step 8: Wait for Ready Status
Continue watching the logs. Within 30-60 seconds, you should see:

text
WHATSAPP READY
The log will also show your phone number:

text
Phone: 91XXXXXXXXXX@c.us
Step 9: Verify Connection
Check that the application is now fully connected. Look for:

No error messages in logs

Messages are being saved to database

Google Sheets sync is working

Step 10: Confirm Final Status
Exit the log viewer by pressing Ctrl+C, then check:

bash
pm2 status
Ensure the process shows "online" with a stable uptime.

PART 3: FORCED CLEAN LOGIN (If Above Fails)
Step 1: Complete Cleanup
Delete ALL session data:

bash
pm2 stop whatsapp-archiver
rm -rf .wwebjs_auth
Step 2: Recreate Auth Directory
Create fresh authentication directory:

bash
mkdir -p .wwebjs_auth
chmod 755 .wwebjs_auth
Step 3: Start Fresh
bash
pm2 start whatsapp-archiver
Step 4: Monitor Logs
bash
pm2 logs whatsapp-archiver
Step 5: Scan QR and Verify
Follow Steps 5-10 from the Login Procedure above.

PART 4: TROUBLESHOOTING COMMON ISSUES
Issue: QR Code Not Showing
bash
# Solution 1: Increase Puppeteer timeout
# Edit ecosystem.config.js and add:
env: {
    PUPPETEER_TIMEOUT: 120000
}
# Then restart:
pm2 restart whatsapp-archiver

# Solution 2: Force headless mode off temporarily
# In .env file add:
PUPPETEER_HEADLESS=false
# Restart:
pm2 restart whatsapp-archiver
Issue: "Session Already Exists" Error
bash
# Complete wipe:
pm2 delete whatsapp-archiver
rm -rf .wwebjs_auth
rm -rf /tmp/.com.google.Chrome*
pm2 start ecosystem.config.js
Issue: Login Taking Too Long
bash
# Check if browser is stuck:
ps aux | grep chromium
# Kill stuck processes:
pkill chromium
# Restart application:
pm2 restart whatsapp-archiver
Issue: Authentication Failure
bash
# Clear all sessions and try again:
pm2 stop whatsapp-archiver
rm -rf .wwebjs_auth
rm -rf node_modules/.cache
npm install
pm2 start whatsapp-archiver
PART 5: QUICK REFERENCE COMMANDS
Check Login Status
bash
# View last 50 lines of logs
pm2 logs whatsapp-archiver --lines 50

# Check if authenticated
pm2 logs whatsapp-archiver --lines 20 | grep authenticated

# Check connection status
pm2 logs whatsapp-archiver --lines 20 | grep "READY"
Check Session Files
bash
# View session directory
ls -la .wwebjs_auth/

# Check session size
du -sh .wwebjs_auth/
Monitor Application
bash
# Real-time monitoring
pm2 monit

# Detailed process info
pm2 show whatsapp-archiver
Full Application Reset
bash
# Complete reset command
pm2 delete whatsapp-archiver && rm -rf .wwebjs_auth && pm2 start ecosystem.config.js