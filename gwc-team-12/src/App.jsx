import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SpotifyPlayer from "./components/SpotifyPlayer";



function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  

  

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div>
      <SpotifyPlayer token={token} />
      </div>


    </main>
  );
}

export default App;
