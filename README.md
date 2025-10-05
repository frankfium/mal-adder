#production site
https://mal-adder.vercel.app
# MAL List Updater
A modern web app to bulk add anime shows to your MyAnimeList account.

## Features

-  Secure OAuth2 authentication with MyAnimeList
-  Paste multiple anime titles at once
-  Modern, responsive UI
- Fast bulk updates to your MAL list

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
