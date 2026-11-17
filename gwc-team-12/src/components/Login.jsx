// "1 · Connect to Spotify" screen from the Figma user flow.
import React from 'react';
import ForestCard, { useSystemForestTheme } from './ForestCard';
import spotifyWhite from '../assets/forest/spotify-white.svg';

function Login() {
    const theme = useSystemForestTheme();

    return (
        <ForestCard theme={theme} className="connect-card">
            <p className="forest-kicker">Enchanted Grove</p>
            <div className="forest-spacer" style={{ height: 10 }} />
            <p className="forest-lead">To begin…</p>
            <p className="forest-title">Link your account</p>
            <p className="forest-body">Connect Spotify so the forest can play your music.</p>
            <div className="forest-spacer" style={{ height: 14 }} />
            <a className="btn-spotify-signin" href="/auth/login">
                <img src={spotifyWhite} width="24" height="24" alt="" />
                Sign in with Spotify
            </a>
            <div className="forest-spacer" style={{ height: 30 }} />
        </ForestCard>
    );
}

export default Login;
