import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// Check rendered text against composed CSS backgrounds, rather than token names.
export async function assertTextContrast(evaluate, selectors) {
  const samples = await evaluate(`(${function (selectors) {
    const rgb = (color) => color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
    const compose = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const chain = []; for (let node = element; node; node = node.parentElement) chain.unshift(node);
      let background = [255, 255, 255];
      for (const node of chain) background = compose(rgb(getComputedStyle(node).backgroundColor), background);
      return { selector, foreground: compose(rgb(getComputedStyle(element).color), background), background };
    });
  }.toString()})(${JSON.stringify(selectors)})`);
  const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  for (const sample of samples) {
    assert.equal(sample.missing, undefined, `Contrast sample exists: ${sample.selector}`);
    const a = luminance(sample.foreground), b = luminance(sample.background);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= 4.5, `${sample.selector} text contrast ${ratio.toFixed(2)} must reach 4.5:1`);
  }
}

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
