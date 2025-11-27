const { google } = require('googleapis');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const open = require('open');

const app = express();
const PORT = 3000;

// Configuration
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDENTIALS_PATH = './credentials/owner_oauth.json';
const TOKEN_PATH = './tokens/owner_token.json';

app.use(express.static('public'));
app.use(express.json());

class DriveTransfer {
  constructor() {
    this.oauth2Client = null;
    this.drive = null;
    this.isAuthenticated = false;
    this.currentUserEmail = null;
  }

  async initialize() {
    try {
      // Load OAuth credentials
      const content = await fs.readFile(CREDENTIALS_PATH);
      const credentials = JSON.parse(content);
      const { client_secret, client_id, redirect_uris } = credentials.installed;
      
      this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      
      // Try to load existing token
      try {
        const token = await fs.readFile(TOKEN_PATH);
        this.oauth2Client.setCredentials(JSON.parse(token));
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.isAuthenticated = true;
        
        // Get current user email
        try {
          const about = await this.drive.about.get({ fields: 'user' });
          this.currentUserEmail = about.data.user.emailAddress;
          console.log(`✅ Using existing authentication for: ${this.currentUserEmail}`);
        } catch (error) {
          console.log('✅ Using existing authentication (could not fetch user info)');
        }
      } catch (error) {
        console.log('🔐 Authentication required');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      return false;
    }
  }

  getAuthUrl() {
  return this.oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'select_account consent',
    redirect_uri: 'http://localhost:3000/oauth'  // Make sure this matches
  });
}

  async handleOAuthCallback(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      
      // Save token for future use
      await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
      
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      this.isAuthenticated = true;
      
      // Get user email
      const about = await this.drive.about.get({ fields: 'user' });
      this.currentUserEmail = about.data.user.emailAddress;
      
      return { 
        success: true, 
        message: '✅ Authentication successful!',
        userEmail: this.currentUserEmail
      };
    } catch (error) {
      return { success: false, message: `❌ Authentication failed: ${error.message}` };
    }
  }

  async resetAuthentication() {
    try {
      // Delete token file
      await fs.unlink(TOKEN_PATH).catch(() => {}); // Ignore if file doesn't exist
      
      // Reset state
      this.oauth2Client = null;
      this.drive = null;
      this.isAuthenticated = false;
      this.currentUserEmail = null;
      
      // Re-initialize without token
      const content = await fs.readFile(CREDENTIALS_PATH);
      const credentials = JSON.parse(content);
      const { client_secret, client_id, redirect_uris } = credentials.installed;
      this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      
      return { success: true, message: '✅ Signed out successfully!' };
    } catch (error) {
      return { success: false, message: `❌ Sign out failed: ${error.message}` };
    }
  }

  async getMyFiles(searchQuery = '') {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      let query = "mimeType contains 'application/vnd.google-apps'";
      if (searchQuery) {
        query += ` and name contains '${searchQuery}'`;
      }

      const response = await this.drive.files.list({
        pageSize: 50, // Get more for sorting
        fields: 'files(id, name, mimeType, owners, webViewLink, createdTime, modifiedTime)',
        q: query,
        orderBy: 'modifiedTime desc' // Sort by recently modified
      });

      // Sort by modified time and take top 5
      const files = response.data.files
        .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
        .slice(0, 5)
        .map(file => ({
          id: file.id,
          name: file.name,
          type: this.getFileType(file.mimeType),
          owner: file.owners[0].emailAddress,
          url: file.webViewLink,
          created: new Date(file.createdTime).toLocaleDateString(),
          modified: new Date(file.modifiedTime).toLocaleDateString(),
          isOwnedByMe: file.owners[0].emailAddress === this.currentUserEmail
        }));

      return files;
    } catch (error) {
      throw new Error(`Failed to get files: ${error.message}`);
    }
  }

  getFileType(mimeType) {
    const types = {
      'application/vnd.google-apps.document': 'Google Doc',
      'application/vnd.google-apps.spreadsheet': 'Google Sheet',
      'application/vnd.google-apps.presentation': 'Google Slides',
      'application/vnd.google-apps.form': 'Google Form',
      'application/vnd.google-apps.drawing': 'Google Drawing'
    };
    return types[mimeType] || 'Google File';
  }

  async transferFile(fileId, receiverEmail) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      console.log(`🚀 Starting transfer: ${fileId} → ${receiverEmail}`);
      
      // Step 1: Verify file exists and get info
      const file = await this.drive.files.get({
        fileId: fileId,
        fields: 'id,name,owners'
      });

      const fileName = file.data.name;
      const currentOwner = file.data.owners[0].emailAddress;
      
      console.log(`📁 File: ${fileName}`);
      console.log(`👑 Current owner: ${currentOwner}`);
      console.log(`👤 Authenticated as: ${this.currentUserEmail}`);

      // Verify we own the file
      if (currentOwner !== this.currentUserEmail) {
        throw new Error(`You don't own this file. Current owner: ${currentOwner}. You are signed in as: ${this.currentUserEmail}`);
      }

      // Step 2: Add receiver as writer
      console.log(`➕ Adding ${receiverEmail} as writer...`);
      await this.drive.permissions.create({
        fileId: fileId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: receiverEmail,
        },
        sendNotificationEmail: true,
      });

      // Step 3: Find the permission and set as pending owner
      console.log('🔄 Setting up ownership transfer...');
      const permissions = await this.drive.permissions.list({
        fileId: fileId,
        fields: 'permissions(id,emailAddress,role)',
      });

      const receiverPermission = permissions.data.permissions.find(
        p => p.emailAddress === receiverEmail && p.role === 'writer'
      );

      if (!receiverPermission) {
        throw new Error('Could not find writer permission for receiver');
      }

      // Step 4: Initiate ownership transfer
      await this.drive.permissions.update({
        fileId: fileId,
        permissionId: receiverPermission.id,
        requestBody: {
          role: 'writer',
          pendingOwner: true,
        },
      });

      console.log('✅ Transfer initiated successfully!');
      
      return {
        success: true,
        message: `✅ Ownership transfer initiated!`,
        details: {
          file: fileName,
          receiver: receiverEmail,
          status: 'pending_owner',
          note: 'Receiver needs to accept ownership in their Google Drive'
        }
      };

    } catch (error) {
      console.error('❌ Transfer failed:', error.message);
      throw error;
    }
  }

  getCurrentUser() {
    return {
      authenticated: this.isAuthenticated,
      email: this.currentUserEmail
    };
  }
}

// Initialize the transfer service
const transferService = new DriveTransfer();

// API Routes
app.get('/api/auth-status', (req, res) => {
  const userInfo = transferService.getCurrentUser();
  res.json(userInfo);
});

app.get('/api/auth-url', (req, res) => {
  res.json({ url: transferService.getAuthUrl() });
});

app.post('/api/oauth-callback', async (req, res) => {
  const { code } = req.body;
  const result = await transferService.handleOAuthCallback(code);
  res.json(result);
});

app.post('/api/reset-auth', async (req, res) => {
  const result = await transferService.resetAuthentication();
  res.json(result);
});

app.get('/api/my-files', async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const files = await transferService.getMyFiles(searchQuery);
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/transfer', async (req, res) => {
  try {
    const { fileId, receiverEmail } = req.body;
    
    if (!fileId || !receiverEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'File ID and receiver email are required' 
      });
    }

    const result = await transferService.transferFile(fileId, receiverEmail);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

//OAuth callback route
app.get('/oauth', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.send(`
        <html>
          <body>
            <h2>❌ OAuth Error</h2>
            <p>No authorization code received.</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }

    // Handle the OAuth callback
    const result = await transferService.handleOAuthCallback(code);
    
    if (result.success) {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #34a853;">✅ Authentication Successful!</h2>
            <p>You are now signed in as: <strong>${result.userEmail}</strong></p>
            <p>You can close this window and return to the application.</p>
            <button onclick="window.close()" style="padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 5px; cursor: pointer;">
              Close Window
            </button>
            <script>
              setTimeout(() => {
                window.close();
              }, 2000);
            </script>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #ea4335;">❌ Authentication Failed</h2>
            <p>${result.message}</p>
            <button onclick="window.close()" style="padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 5px; cursor: pointer;">
              Close Window
            </button>
          </body>
        </html>
      `);
    }
  } catch (error) {
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #ea4335;">❌ OAuth Error</h2>
          <p>${error.message}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 5px; cursor: pointer;">
            Close Window
          </button>
        </body>
      </html>
    `);
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
  await transferService.initialize();
  
  app.listen(PORT, async () => {
    console.log(`🚀 Drive Transfer Server running at http://localhost:${PORT}`);
    console.log(`📁 Make sure you have credentials/owner_oauth.json`);
    
    // Auto-open browser
    try {
      await open(`http://localhost:${PORT}`);
    } catch (error) {
      console.log(`📋 Please open http://localhost:${PORT} in your browser`);
    }
  });
}

startServer().catch(console.error);