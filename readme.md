DRIVE TRANSFER PRO
==================

A web app for transferring Google Drive file ownership with a beautiful interface.

QUICK START
-----------
1. Install: npm install
2. Add credentials/owner_oauth.json
3. Run: node app.js
4. App opens automatically at http://localhost:3000

DEPENDENCIES
------------
- googleapis: Google Drive API client
- express: Web server framework  
- open: Auto-opens browser

TECH STACK
----------
Backend: Node.js, Express, Google APIs
Frontend: HTML5, CSS3, Vanilla JavaScript
Auth: OAuth 2.0, Google Identity Services

FILE STRUCTURE
--------------
drive-transfer/
├── app.js (main server)
├── package.json
├── credentials/
│   └── owner_oauth.json
├── tokens/ (auto-generated)
└── public/
    └── index.html

HOW TO USE
----------
1. AUTHENTICATION
   - Click "Sign In" 
   - Select Google account
   - Grant permissions

2. BROWSE FILES
   - View 5 most recent files
   - Search with search bar
   - Click file to select

3. TRANSFER OWNERSHIP
   - File ID auto-fills when selected
   - Enter receiver email
   - Click "Transfer Ownership"

4. ACCOUNT MANAGEMENT
   - "Switch Account" to change Google accounts
   - "Sign Out" to reset authentication

KEY FEATURES
------------
- File browser with search
- One-click file selection
- Auto file ID copying
- Account switching
- Real-time activity log
- Mobile-friendly design
- Professional UI/UX

GOOGLE SETUP REQUIRED
---------------------
1. Google Cloud Console project
2. Enable Google Drive API  
3. OAuth 2.0 credentials (Web application)
4. Add authorized origins: http://localhost:3000
5. Add test users in OAuth consent screen

TROUBLESHOOTING
---------------
- "Cannot GET /oauth": Check server routes
- Auth errors: Verify OAuth credentials
- "Don't own file": Switch to correct account
- File not found: Must be Google Docs/Sheets/Slides

SUPPORT
-------
- Check browser console (F12) for errors
- Verify Google Cloud Console configuration
- Ensure port 3000 is available

Drive Transfer Pro - Simple, efficient ownership transfers! 🚀