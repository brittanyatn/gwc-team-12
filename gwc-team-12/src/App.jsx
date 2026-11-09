import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SpotifyPlayer from "./components/SpotifyPlayer";
import Login from './components/Login'
import OnboardingQuiz from './components/OnboardingQuiz'; //(ginny) this is for the theme quiz! :D




function App() {
    const [token, setToken] = useState(''); 
    const [theme, setTheme] = useState(null); //(ginny) adds theme state for lightforest or darkforest

    useEffect(() => {

    async function getToken() {
      const response = await fetch('/auth/token');
      const json = await response.json();
      setToken(json.access_token);
    }

    getToken();

  }, []);

  

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div>
    {!token ? (
      <Login />
    ) : !theme ? 
    (
      // (ginny) once logged in, show quiz if no theme chosen yet
      <OnboardingQuiz onComplete={(selectedTheme) => setTheme(selectedTheme)} />
    ) : 
    (
    // (ginny) pass chosen theme to player
      <SpotifyPlayer token={token} theme={theme} />
    )}
    </div>

      
    </main>
  );
}

export default App;
