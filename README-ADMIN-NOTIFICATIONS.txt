EditPrompt Admin Notifications Update

Files in this archive:
- v6/server.js -> replace the server.js file in your project root
- v6/public/admin.html -> replace public/admin.html

Features:
- Contact messages appear in the Admin Dashboard Notifications tab.
- Refresh messages button.
- Delete button on each message, with confirmation.
- Clear all button, with two confirmation prompts.
- Admin-protected server endpoints for deleting one message or clearing all messages.

Deploy:
1. Back up your current server.js and public/admin.html.
2. Replace them with the files in this ZIP.
3. Commit and push the changed files to GitHub.
4. Wait for Render to deploy, then test in Admin > Notifications.

Warning: Delete and Clear all permanently delete contact messages from the database. Confirm before using Clear all.
