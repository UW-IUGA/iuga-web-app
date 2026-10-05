/**
 * Purpose: Start the local API before Vite and point this frontend at that API's selected port.
 * Expected Request: `npm run dev` with project dependencies installed.
 * Expected Response: Backend and frontend development servers run together until stopped.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = spawn("npm", ["run", "backend-dev"], {
  cwd: root,
  stdio: ["inherit", "pipe", "inherit"],
});
let frontend;
let output = "";
let stopping = false;

backend.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  output += chunk.toString();
  const ready = output.match(/\[startup\] Listening at [^\s:]+:(\d+)/);
  if (ready && !frontend) {
    const apiUrl = `http://localhost:${ready[1]}`;
    console.log(`[dev] starting frontend with API ${apiUrl}`);
    frontend = spawn("npm", ["run", "frontend"], {
      cwd: root,
      env: { ...process.env, VITE_API_URL: apiUrl },
      stdio: "inherit",
    });
    frontend.on("exit", (code) => stop(code ?? 0));
  }
  if (output.length > 2000) output = output.slice(-1000);
});

backend.on("exit", (code) => stop(code ?? 1));
backend.on("error", (error) => {
  console.error(`[dev] backend failed to start: ${error.message}`);
  stop(1);
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

function stop(code) {
  if (stopping) return;
  stopping = true;
  if (backend.exitCode === null) backend.kill("SIGTERM");
  if (frontend && frontend.exitCode === null) frontend.kill("SIGTERM");
  process.exitCode = code;
}
