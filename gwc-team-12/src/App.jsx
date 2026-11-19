import { useState, useEffect, useLayoutEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SpotifyPlayer from "./components/SpotifyPlayer";
import Login from './components/Login'
import OnboardingQuiz from './components/OnboardingQuiz'; //(ginny) this is for the theme quiz! :D




function App() {
    const [token, setToken] = useState(''); 
    const [theme, setTheme] = useState(null); //(ginny) adds theme state for lightforest or darkforest
    const [quizAnswers, setQuizAnswers] = useState([]); // quiz picks, used to build the forest mix

    useEffect(() => {

    // Preview mode for working on the UI: http://127.0.0.1:1420/?preview skips the Spotify login (only in npm run dev)
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
      setToken('preview-token');
      return;
    }

    async function getToken() {
      const response = await fetch('/auth/token');
      const json = await response.json();
      setToken(json.access_token);
    }

    getToken();

  }, []);

  
  useLayoutEffect(() => {
  const root = document.documentElement;

  function fitForestCard() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(width / 349, height / 371);
    if (scale <= 0) return;

    // Scale the quiz uniformly so its text and buttons keep their proportions.
    root.style.setProperty("--forest-scale", String(scale));

    // Give the card enough space to fill the window after scaling.
    root.style.setProperty("--forest-width", `${width / scale}px`);
    root.style.setProperty("--forest-height", `${height / scale}px`);
  }

  fitForestCard();
  window.addEventListener("resize", fitForestCard);
  return () => window.removeEventListener("resize", fitForestCard);
  }, []);

  

  return (
    <main className="container">
      <div>
    {!token ? (
      <Login />
    ) : !theme ? 
    (
      // (ginny) once logged in, show quiz if no theme chosen yet
      <OnboardingQuiz onComplete={(selectedTheme, answers = []) => { setQuizAnswers(answers); setTheme(selectedTheme); }} />
    ) : 
    (
    // (ginny) pass chosen theme to player
      <SpotifyPlayer token={token} theme={theme} answers={quizAnswers} onBack={() => setTheme(null)} />
    )}
    </div>

      
    </main>
  );
}

export default App;
