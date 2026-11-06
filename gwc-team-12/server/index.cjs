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

const generateRandomString = function (length) {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

app.get('/auth/login', (req, res) => {
  const scope = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state"

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
    access_token = body.access_token
    res.redirect(frontend_url)
  } else {
    console.error(body)
    res.status(500).send('Token exchange failed')
  }
})

app.get('/auth/token', (req, res) => {
  res.json({ access_token: access_token })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Listening at http://127.0.0.1:${port}`)
})