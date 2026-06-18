import { execFileSync, spawn } from "child_process";

const port = process.env.PORT || "5001";

function getPortPids() {
  try {
    const output = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split(/\s+/)
      .map((pid) => pid.trim())
      .filter(Boolean)
      .filter((pid) => pid !== String(process.pid));
  } catch (error) {
    return [];
  }
}

for (const pid of getPortPids()) {
  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`Stopped old process on port ${port} (PID ${pid})`);
  } catch (error) {
    console.warn(`Could not stop process ${pid} on port ${port}: ${error.message}`);
  }
}

const child = spawn("nodemon", ["--ignore", "dist", "server.js"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

function stopChild(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
