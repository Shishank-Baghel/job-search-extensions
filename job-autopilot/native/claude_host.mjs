// Chrome native-messaging host: lets the extension ask Claude through Claude Code on this
// computer, so it runs on your Claude plan (no API key). One request per launch:
//   {op:"ping"}  -> {ok, claude}
//   {op:"ask", system, prompt, schema, model, effort} -> {ok, data} | {ok:false, error, limit}
// Claude runs with every tool switched off, no MCP servers, no settings/hooks and an empty
// working folder: it can only answer, never act on this machine.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_TEXT = 300000;
const EFFORTS = new Set(["low", "medium", "high"]);

function reply(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]), () => process.exit(0));
}

function findClaude() {
  const home = os.homedir();
  const cands = [process.env.CLAUDE_BIN, path.join(home, ".local/bin/claude"), path.join(home, ".claude/local/claude"), "/usr/local/bin/claude", "/usr/bin/claude",
    ...(process.env.PATH || "").split(":").map((d) => path.join(d, "claude"))];
  return cands.find((p) => { try { return p && fs.statSync(p).isFile(); } catch (_) { return false; } }) || null;
}

function ask(m) {
  const bin = findClaude();
  if (!bin) return reply({ ok: false, error: "Claude Code isn't installed on this computer (no `claude` command found)." });
  if (typeof m.system !== "string" || typeof m.prompt !== "string" || !m.prompt || m.system.length > MAX_TEXT || m.prompt.length > MAX_TEXT)
    return reply({ ok: false, error: "bad request" });
  if (!m.schema || typeof m.schema !== "object") return reply({ ok: false, error: "bad schema" });
  const model = /^[\w.-]{1,60}$/.test(m.model || "") ? m.model : "claude-opus-5-5";
  const effort = EFFORTS.has(m.effort) ? m.effort : "low";
  const cwd = path.join(os.homedir(), ".cache", "job-autopilot", "claude");
  fs.mkdirSync(cwd, { recursive: true });
  const args = ["-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
    "--system-prompt", m.system, "--json-schema", JSON.stringify(m.schema), "--model", model, "--effort", effort];
  const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
  let out = "", err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  const timer = setTimeout(() => { child.kill("SIGTERM"); reply({ ok: false, error: "Claude took longer than 3 minutes." }); }, 180000);
  child.on("error", (e) => { clearTimeout(timer); reply({ ok: false, error: "Couldn't start Claude Code: " + e.message }); });
  child.on("close", () => {
    clearTimeout(timer);
    let d = null;
    try { d = JSON.parse(out); } catch (_) {}
    if (!d) return reply({ ok: false, error: (err || out || "no output from Claude Code").trim().slice(0, 300), limit: /limit|quota/i.test(err + out) });
    if (d.is_error || d.subtype !== "success") {
      const msg = String(d.result || d.subtype || "error").slice(0, 300);
      return reply({ ok: false, error: msg, limit: /usage limit|limit reached|rate limit|quota|credit/i.test(msg) });
    }
    let data = d.structured_output;
    if (!data) { try { data = JSON.parse(d.result); } catch (_) {} }
    if (!data) return reply({ ok: false, error: "Claude's reply wasn't valid JSON." });
    reply({ ok: true, data });
  });
  child.stdin.end(m.prompt);
}

// Chrome frames each message as a 4-byte little-endian length + UTF-8 JSON.
let buf = Buffer.alloc(0);
process.stdin.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  if (buf.length < 4) return;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return;
  process.stdin.pause();
  let m;
  try { m = JSON.parse(buf.subarray(4, 4 + len).toString("utf8")); } catch (_) { return reply({ ok: false, error: "bad message" }); }
  if (m.op === "ping") return reply({ ok: true, claude: findClaude() });
  if (m.op === "ask") return ask(m);
  reply({ ok: false, error: "unknown op" });
});
process.stdin.on("end", () => { if (buf.length < 4) process.exit(0); });
