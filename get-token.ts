import fs from 'fs';
import readline from 'readline';
import { google } from 'googleapis';

// Fill in your client info here
const client_id = '1050021151492-bc1lpu5jupocc503tql4jre67mh26v3i.apps.googleusercontent.com';
const client_secret = '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';
const redirect_uris = ['http://localhost:3000', 'https://generous-ai-core.lovable.app/'];

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly'
  ],
});

console.log('Visit this URL to authorize your app:');
console.log(authUrl);

// Ask for the code
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from the page here: ', async (code: string) => {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
  console.log('Token saved to token.json ✅');
  rl.close();
});
