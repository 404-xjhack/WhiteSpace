import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export async function startServer(extraEnv = {}) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root, env: { ...process.env, PORT: "0", AI_API_KEY: "", AMAP_WEB_KEY: "", AMAP_SECURITY_CODE: "", AMAP_SERVICE_KEY: "", ...extraEnv }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stderr.on("data", () => {});
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Test server did not start")); }, 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { url, child, async close() {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill(); await exited;
  } };
}
