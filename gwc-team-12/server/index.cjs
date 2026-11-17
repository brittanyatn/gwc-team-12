const express = require('express')
const dotenv = require('dotenv')

dotenv.config()

const app = express()
const port = 3000

const spotify_client_id = process.env.SPOTIFY_CLIENT_ID
const spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET

const redirect_uri = "http://127.0.0.1:3000/auth/callback"
const frontend_url = "http://127.0.0.1:1420/"

let access_token = ""
let refresh_token = ""   // lets us renew the login without signing in again
let expires_at = 0       // ms timestamp when access_token stops working

function saveTokens(body) {
  access_token = body.access_token
  if (body.refresh_token) refresh_token = body.refresh_token // Spotify may not send a new one on refresh
  expires_at = Date.now() + (body.expires_in || 3600) * 1000
}

// Spotify logins last 1 hour; swap the refresh token for a new one shortly before that
async function refreshIfNeeded() {
  if (!refresh_token || Date.now() < expires_at - 60 * 1000) return
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token })
  })
  const body = await res.json()
  if (res.ok) {
    saveTokens(body)
    console.log('Refreshed Spotify login')
  } else {
    console.error('Token refresh failed', body)
  }
}

const generateRandomString = function (length) {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

app.get('/auth/login', (req, res) => {
  // user-top-read: read the listener's most-played artists/tracks for the forest mix
  // playlist-modify-private: optionally save the mix as a private playlist
  // user-library-read / user-read-recently-played: Liked Songs + recent plays for a more personal mix
  const scope = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-top-read playlist-modify-private user-library-read user-read-recently-played"

  const params = new URLSearchParams({
    response_type: "code",
    client_id: spotify_client_id,
    scope: scope,
    redirect_uri: redirect_uri,
    state: generateRandomString(16)
  })

  res.redirect('https://accounts.spotify.com/authorize/?' + params.toString())
})

app.get('/auth/callback', async (req, res) => {
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code: req.query.code,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    })
  })

  const body = await tokenRes.json()

  if (tokenRes.ok) {
    saveTokens(body)
    res.redirect(frontend_url)
  } else {
    console.error(body)
    res.status(500).send('Token exchange failed')
  }
})

app.get('/auth/token', async (req, res) => {
  await refreshIfNeeded()
  res.json({ access_token: access_token })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Listening at http://127.0.0.1:${port}`)
})