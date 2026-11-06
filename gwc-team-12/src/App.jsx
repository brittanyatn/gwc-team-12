import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SpotifyPlayer from "./components/SpotifyPlayer";
import Login from './components/Login'





function App() {
    const [token, setToken] = useState('');

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
    {!token ? <Login /> : <SpotifyPlayer token={token} />}
      </div>

      
    </main>
  );
}

export default App;
