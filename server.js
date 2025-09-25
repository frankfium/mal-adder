const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const session = require("cookie-session");
const fs = require("fs");
const crypto = require("crypto");

// Load .env if present (no external deps)
const path = require("path");
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      const key = m[1];
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const CLIENT_ID = process.env.MAL_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.MAL_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const ENV_ACCESS_TOKEN = process.env.MAL_ACCESS_TOKEN || "";
const ENV_REFRESH_TOKEN = process.env.MAL_REFRESH_TOKEN || "";
const PKCE_METHOD = (process.env.MAL_PKCE_METHOD || "S256").toUpperCase();
const REDIRECT_URI = process.env.MAL_REDIRECT_URI || "http://localhost:5173/callback"; // must match MAL config
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AUTH_URL = "https://myanimelist.net/v1/oauth2/authorize";
const TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
const API_BASE = "https://api.myanimelist.net/v2";

const app = express();

// Behind Vercel/other proxies we must trust the forwarded proto so secure cookies stick
app.set('trust proxy', 1);

// Core middleware before routes so sessions work everywhere
app.use(bodyParser.json());
app.use(session({
  name: "session",
  secret: process.env.SESSION_SECRET || "supersecret",
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: IS_PRODUCTION ? "none" : "lax",
  secure: IS_PRODUCTION,
  httpOnly: false
}));

// Serve static assets from ./public
app.use(express.static(path.join(__dirname, "public")));
// Serve built frontend if available (./dist from Vite build)
const distPath = path.join(__dirname, "dist");
const hasDist = fs.existsSync(distPath);
if (hasDist) {
  app.use(express.static(distPath));
}
// Serve the main page (prefer built app)
app.get("/", (req, res) => {
  if (hasDist && fs.existsSync(path.join(distPath, "index.html"))) {
    return res.sendFile(path.join(distPath, "index.html"));
  }
  res.sendFile(path.join(__dirname, "index.html"));
});
// Serve decorative image from project root if present
app.get("/rmtj.jpg", (req, res) => {
  const img = path.join(__dirname, "rmtj.jpg");
  if (fs.existsSync(img)) return res.sendFile(img);
  res.status(404).end();
});

// Session/user helper endpoint
app.get("/me", async (req, res) => {
  // Disable caching for this endpoint
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  try {
    let accessToken = (req.session && req.session.tokens && req.session.tokens.access_token) || ENV_ACCESS_TOKEN || "";
    console.log('/me: hasAccessToken=', !!accessToken, 'sessionTokens=', !!(req.session && req.session.tokens));
    if (!accessToken) return res.json({ loggedIn: false });

    const fetchMe = async () => {
      const r = await axios.get(`${API_BASE}/users/@me`, {
        params: { fields: "name,username" },
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      return r.data;
    };

    try {
      const me = await fetchMe();
      console.log('/me: fetched user data:', me);
      return res.json({ loggedIn: true, name: me.name || me.username || "User" });
    } catch (err) {
      console.log('/me: error fetching user:', err.response?.status, err.response?.data);
      if (err.response?.status === 401) {
        try {
          accessToken = await refreshToken(req);
          const me = await fetchMe();
          return res.json({ loggedIn: true, name: me.name || me.username || "User" });
        } catch (inner) {
          console.log('/me: refresh failed:', inner.response?.status);
          return res.json({ loggedIn: false });
        }
      }
      return res.json({ loggedIn: false });
    }
  } catch (err) {
    console.log('/me: general error:', err.message);
    return res.json({ loggedIn: false });
  }
});

// Logout endpoint
app.post("/logout", (req, res) => {
  req.session.tokens = null;
  delete req.session.tokens;
  res.json({ success: true });
});

// PKCE helpers
function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}

function generateCodeVerifier(length = 96) {
  const allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const random = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += allowed[random[i] % allowed.length];
  }
  return out;
}

// Store verifiers keyed by state as a fallback when cookies don't persist
const verifierStore = new Map();

// Step 1: Login route
app.get("/login", (req, res) => {
    // Generate PKCE values per session
    const codeVerifier = generateCodeVerifier(96);
    const codeChallenge = PKCE_METHOD === "PLAIN" ? codeVerifier : base64url(sha256(codeVerifier));
    const state = base64url(crypto.randomBytes(16));
    req.session.code_verifier = codeVerifier;
    req.session.oauth_state = state;
    verifierStore.set(state, codeVerifier);

    const url = `${AUTH_URL}?response_type=code`
        + `&client_id=${CLIENT_ID}`
        + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
        + `&code_challenge=${codeChallenge}`
        + `&code_challenge_method=${PKCE_METHOD === "PLAIN" ? "plain" : "S256"}`
        + `&state=${state}`;
    console.log("/login: issued state=", state, "verifierLen=", codeVerifier.length, "method=", PKCE_METHOD);
    res.redirect(url);
});

// Step 2: Callback
app.get("/callback", async (req, res) => {
    const { code, state } = req.query;
    try {
        if (!state) {
            return res.status(400).send("Missing state");
        }

        // Prefer verifier mapped to this exact state to avoid stale session values
        let codeVerifier = verifierStore.get(state);
        const sessionState = req.session.oauth_state;
        if (!codeVerifier && sessionState === state) {
            codeVerifier = req.session.code_verifier;
        }

        console.log("/callback: hasVerifier=", Boolean(codeVerifier), "state=", state);

        if (!codeVerifier) {
            return res.status(400).send("Missing or mismatched PKCE verifier");
        }

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        });
        // Include client_secret if configured (confidential clients). For public clients, leave unset.
        if (CLIENT_SECRET && CLIENT_SECRET !== "YOUR_CLIENT_SECRET") {
            params.set("client_secret", CLIENT_SECRET);
        }

        console.log("/callback: exchanging code with token endpoint:", {
            client_id_preview: CLIENT_ID.slice(0, 6) + "…",
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
            has_code: Boolean(code),
            pkce_method: PKCE_METHOD,
            sending_client_secret: Boolean(CLIENT_SECRET && CLIENT_SECRET !== "YOUR_CLIENT_SECRET")
        });
        const response = await axios.post(TOKEN_URL, params, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

        req.session.tokens = response.data;
        
        // Fetch user data immediately after setting tokens
        let userData = { loggedIn: false };
        try {
          const userResponse = await axios.get(`${API_BASE}/users/@me`, {
            params: { fields: "name,username" },
            headers: { Authorization: `Bearer ${response.data.access_token}` }
          });
          userData = { loggedIn: true, name: userResponse.data.name || userResponse.data.username || "User" };
          console.log('/callback: fetched user data:', userData);
        } catch (err) {
          console.log('/callback: error fetching user:', err.response?.status);
        }
        
        // clear one-time verifier and state
        delete req.session.code_verifier;
        delete req.session.oauth_state;
        verifierStore.delete(state);
        
        // If opened as a popup, notify opener and close. Fallback: redirect home.
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`<!doctype html><html><head><title>Auth Complete</title></head><body style="background:#0b0f14;color:#e6edf3;font-family:ui-sans-serif,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;">
  <div style="margin-bottom:20px;">✅ Authentication complete!</div>
  <div style="font-size:14px;color:#9fb0c0;">This window will close automatically...</div>
</div>
<script>
  (function() {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ 
          type: 'oauth-success', 
          userData: ${JSON.stringify(userData)}
        }, '*');
        setTimeout(function() {
          window.close();
        }, 1000);
      } else {
        setTimeout(function() {
          location.replace('/');
        }, 1000);
      }
    } catch (e) {
      setTimeout(function() {
        location.replace('/');
      }, 1000);
    }
  })();
<\/script>
</body></html>`);
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Token exchange failed.");
    }
});

// Refresh token helper
async function refreshToken(req) {
    const tokens = req.session.tokens || (ENV_ACCESS_TOKEN ? { access_token: ENV_ACCESS_TOKEN, refresh_token: ENV_REFRESH_TOKEN } : null);
    if (!tokens || !tokens.refresh_token) throw new Error("No refresh token");
    const response = await axios.post(TOKEN_URL, new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token
    }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

    req.session.tokens = response.data;
    return response.data.access_token;
}

// Step 3a: Preview shows before updating
app.post("/preview-shows", async (req, res) => {
    try {
        const { shows = [] } = req.body || {};
        let accessToken = await ensureAccessToken(req);
        const preview = await buildPreviewSet(shows, accessToken, req);
        res.json({ results: preview });
    } catch (err) {
        if (err.status === 401 || err.message === 'AUTH_REQUIRED') {
            return res.status(401).json({ error: "Authentication required. Log in with MAL before previewing shows." });
        }
        console.error('/preview-shows error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to preview shows.' });
    }
});

// Step 3b: Add shows
app.post("/add-shows", async (req, res) => {
    try {
        const { shows = [], matches = [] } = req.body || {};
        let accessToken = await ensureAccessToken(req);

        let confirmations = matches;
        if (!Array.isArray(confirmations) || confirmations.length === 0) {
            if (!Array.isArray(shows) || shows.length === 0) {
                return res.json({ results: [] });
            }
            confirmations = await buildPreviewSet(shows, accessToken, req);
        }

        const results = [];
        for (const item of confirmations) {
            if (item.error) {
                results.push({
                    title: item.inputTitle || item.rawInput,
                    status: 'error',
                    error: item.error
                });
                continue;
            }

            const applyUpdate = async (tokenOverride) => {
                const tokenToUse = tokenOverride || accessToken;
                const payload = new URLSearchParams({
                    status: item.plannedStatus,
                    num_watched_episodes: String(typeof item.plannedEpisodes === 'number' ? item.plannedEpisodes : 0)
                });
                if (item.plannedScore !== null && item.plannedScore !== undefined) {
                    payload.set('score', String(item.plannedScore));
                }
                await axios.patch(`${API_BASE}/anime/${item.animeId}/my_list_status`,
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${tokenToUse}`,
                            "Content-Type": "application/x-www-form-urlencoded"
                        }
                    }
                );

                return {
                    title: item.matchedTitle || item.inputTitle || item.rawInput,
                    status: item.plannedStatus,
                    episodes: item.plannedEpisodes,
                    score: item.plannedScore !== undefined && item.plannedScore !== null ? item.plannedScore : null,
                    total: item.totalEpisodes || null
                };
            };

            try {
                const success = await handleAuthError(req, (tokenOverride) => applyUpdate(tokenOverride));
                accessToken = req.session?.tokens?.access_token || accessToken;
                results.push(success);
            } catch (err) {
                console.error('/add-shows update error:', err.response?.data || err.message);
                const message = err.response?.data?.message || err.response?.data?.error || err.message;
                results.push({
                    title: item.matchedTitle || item.inputTitle || item.rawInput,
                    status: 'error',
                    error: message
                });
            }

            await sleep(350);
        }

        res.json({ results });
    } catch (err) {
        if (err.status === 401 || err.message === 'AUTH_REQUIRED') {
            return res.status(401).json({ error: "Authentication required. Log in with MAL before adding shows." });
        }
        console.error('/add-shows error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to add shows.' });
    }
});

// Step 4: Fetch user's MAL list snapshot
app.get("/my-list", async (req, res) => {
    try {
        const initialToken = await ensureAccessToken(req);
        const items = await buildUserListSnapshot(req, initialToken);
        res.json({ results: items });
    } catch (err) {
        if (err.status === 401 || err.message === 'AUTH_REQUIRED') {
            return res.status(401).json({ error: "Authentication required. Log in with MAL to view your list." });
        }
        console.error('/my-list error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to load MAL list.' });
    }
});

if (!CLIENT_ID || CLIENT_ID === "YOUR_CLIENT_ID") {
  console.error("Missing MAL_CLIENT_ID. Set it in .env or env vars before starting the server.");
  process.exit(1);
}

app.listen(3000, () => console.log("Server running at http://localhost:3000"));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseShowInput(raw) {
  let working = raw.trim();
  let score = null;
  let scoreError = null;

  const ratingMatch = working.match(/\[(\d{1,2})\]\s*$/);
  if (ratingMatch) {
    const candidate = parseInt(ratingMatch[1], 10);
    if (!Number.isNaN(candidate) && candidate >= 1 && candidate <= 10) {
      score = candidate;
    } else {
      scoreError = 'Score must be between 1 and 10';
    }
    working = working.slice(0, ratingMatch.index).trim();
  }

  const episodeMatch = working.match(/^(.+?)\s*\((\d+)\)\s*$/);
  const title = episodeMatch ? episodeMatch[1].trim() : working.trim();
  const episodeCount = episodeMatch ? parseInt(episodeMatch[2], 10) : null;
  return { rawInput: raw, title, episodeCount, score, scoreError };
}

async function fetchAnimeMatch(title, accessToken) {
  const searchRes = await axios.get(`${API_BASE}/anime`, {
    params: { q: title, limit: 1, fields: "id,title,num_episodes" },
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const anime = searchRes.data?.data?.[0]?.node;
  if (!anime) {
    const err = new Error(`No match found for "${title}"`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return anime;
}

function buildPlannedStatus(episodeCount, totalEpisodes) {
  if (episodeCount !== null) {
    return {
      watchedEpisodes: episodeCount,
      status: totalEpisodes > 0 && episodeCount < totalEpisodes ? 'watching' : 'completed'
    };
  }
  return {
    watchedEpisodes: totalEpisodes || 0,
    status: 'completed'
  };
}

async function ensureAccessToken(req) {
  let accessToken = (req.session && req.session.tokens && req.session.tokens.access_token) || ENV_ACCESS_TOKEN || "";
  if (!accessToken) {
    const err = new Error('AUTH_REQUIRED');
    err.status = 401;
    throw err;
  }
  return accessToken;
}

async function handleAuthError(req, handler) {
  try {
    return await handler();
  } catch (err) {
    if (err.response?.status === 401) {
      const refreshed = await refreshToken(req);
      return handler(refreshed);
    }
    throw err;
  }
}

async function buildPreviewSet(shows, initialToken, req) {
  let accessToken = initialToken;
  const preview = [];
  for (const raw of shows) {
    const parsed = parseShowInput(raw);
    if (parsed.scoreError) {
      preview.push({ rawInput: raw, inputTitle: parsed.title || raw, episodeCount: parsed.episodeCount, error: parsed.scoreError });
      continue;
    }
    if (!parsed.title) {
      preview.push({ rawInput: raw, inputTitle: raw, error: 'Title is empty' });
      continue;
    }

    const run = async (tokenOverride) => {
      const tokenToUse = tokenOverride || accessToken;
      const anime = await fetchAnimeMatch(parsed.title, tokenToUse);
      const totalEpisodes = anime.num_episodes || 0;
      const { watchedEpisodes, status } = buildPlannedStatus(parsed.episodeCount, totalEpisodes);
      return {
        rawInput: raw,
        inputTitle: parsed.title,
        episodeCount: parsed.episodeCount,
        matchedTitle: anime.title,
        animeId: anime.id,
        totalEpisodes,
        plannedEpisodes: watchedEpisodes,
        plannedScore: parsed.score,
        plannedStatus: status
      };
    };

    try {
      const previewEntry = await handleAuthError(req, (tokenOverride) => run(tokenOverride));
      accessToken = req.session?.tokens?.access_token || accessToken;
      preview.push(previewEntry);
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message;
      preview.push({
        rawInput: raw,
        inputTitle: parsed.title,
        episodeCount: parsed.episodeCount,
        error: message
      });
    }

    await sleep(350);
  }
  return preview;
}

async function buildUserListSnapshot(req, initialToken) {
  let accessToken = initialToken;
  const collected = [];
  const maxPages = parseInt(process.env.MAL_LIST_MAX_PAGES || '5', 10);
  const maxItems = parseInt(process.env.MAL_LIST_MAX_ITEMS || '400', 10);
  let nextUrl = null;
  let pagesFetched = 0;

  while (pagesFetched < maxPages && collected.length < maxItems) {
    const run = async (tokenOverride) => {
      const tokenToUse = tokenOverride || accessToken;
      const url = nextUrl || `${API_BASE}/users/@me/animelist`;
      const config = {
        headers: { Authorization: `Bearer ${tokenToUse}` }
      };
      if (!nextUrl) {
        config.params = {
          limit: 100,
          fields: 'id,title,num_episodes,my_list_status{status,num_episodes_watched,score,updated_at}'
        };
      }
      const response = await axios.get(url, config);
      return response.data;
    };

    const data = await handleAuthError(req, (tokenOverride) => run(tokenOverride));
    accessToken = req.session?.tokens?.access_token || accessToken;

    if (Array.isArray(data?.data)) {
      for (const entry of data.data) {
        const node = entry?.node || {};
        const status = node.my_list_status || {};
        collected.push({
          id: node.id,
          title: node.title || 'Untitled',
          status: status.status || 'unknown',
          watchedEpisodes: typeof status.num_episodes_watched === 'number' ? status.num_episodes_watched : null,
          totalEpisodes: typeof node.num_episodes === 'number' ? node.num_episodes : null,
          score: typeof status.score === 'number' && status.score > 0 ? status.score : null,
          updatedAt: status.updated_at || null
        });
        if (collected.length >= maxItems) break;
      }
    }

    pagesFetched += 1;
    nextUrl = data?.paging?.next || null;
    if (!nextUrl || collected.length >= maxItems) break;
    await sleep(350);
  }

  return collected;
}
