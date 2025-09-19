# MAL List Updater

A modern web app to bulk add anime shows to your MyAnimeList account.

## Features

- 🔐 Secure OAuth2 authentication with MyAnimeList
- 📝 Paste multiple anime titles at once
- 🎨 Modern, responsive UI
- ⚡ Fast bulk updates to your MAL list

## Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo>
   cd mal-adder
   npm install
   ```

2. **Set up MyAnimeList OAuth app:**
   - Go to https://myanimelist.net/apiconfig
   - Create a new app with redirect URI: `http://localhost:5173/callback`
   - Copy your Client ID and Client Secret

3. **Create environment file:**
   ```bash
   cp env.example .env
   ```
   Edit `.env` with your MAL credentials.

4. **Run the app:**
   ```bash
   npm run dev
   ```
   Open http://localhost:5173

## Deploy to Vercel

1. **Push to GitHub** (if not already)

2. **Connect to Vercel:**
   - Go to https://vercel.com
   - Import your GitHub repository
   - Vercel will auto-detect the Node.js setup

3. **Set environment variables in Vercel:**
   - `MAL_CLIENT_ID`: Your MAL app Client ID
   - `MAL_CLIENT_SECRET`: Your MAL app Client Secret  
   - `MAL_REDIRECT_URI`: `https://your-app.vercel.app/callback`
   - `SESSION_SECRET`: A random secret string (generate one)

4. **Update your MAL app settings:**
   - Go back to https://myanimelist.net/apiconfig
   - Update redirect URI to your Vercel domain: `https://your-app.vercel.app/callback`

5. **Deploy!** Vercel will automatically deploy on every push.

## How it works

- Users authenticate with MyAnimeList OAuth2
- Paste anime titles (one per line)
- App searches MAL API for each title
- Automatically marks shows as "completed" on your list
- Rate-limited to respect MAL API limits

## Privacy

- No user data is stored permanently
- Sessions expire after 24 hours
- All API calls go directly to MyAnimeList
