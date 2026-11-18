// Starts both halves of the app in one terminal: the Spotify login server
// (npm run server, port 3000) and the app itself (npm run dev, port 1420).
// Stop both with Ctrl + C.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const parts = [
  { name: "server", color: "\x1b[35m", args: ["run", "server"] },
  { name: "app", color: "\x1b[36m", args: ["run", "dev"] },
];

const children = parts.map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ["ignore", "pipe", "pipe"] });
  const tag = `${color}[${name}]\x1b[0m `;
  const print = (stream) => (data) =>
    String(data).split("\n").filter(Boolean).forEach((line) => stream.write(tag + line + "\n"));
  child.stdout.on("data", print(process.stdout));
  child.stderr.on("data", print(process.stderr));
  child.on("exit", (code) => {
    console.log(`${tag}stopped (exit ${code}). Stopping the other part too.`);
    children.forEach((c) => c !== child && c.kill());
    process.exit(code ?? 0);
  });
  return child;
});

console.log("Open http://127.0.0.1:1420/ in Chrome (add ?backup to use the backup playlists). Ctrl + C stops both.");
const stop = () => { children.forEach((c) => c.kill()); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
