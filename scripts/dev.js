import { execFileSync, spawn } from "child_process";
import os from "os";

const port = process.env.PORT || "5001";
const host = process.env.HOST || "0.0.0.0";

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

const lanAddress = getLanAddress();
console.log(`Local URL: http://localhost:${port}`);
if (lanAddress && host === "0.0.0.0") {
  console.log(`Mobile URL: http://${lanAddress}:${port}`);
}

const child = spawn("nodemon", ["--ignore", "dist", "server.js"], {
  env: {
    ...process.env,
    HOST: host,
  },
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

function getLanAddress() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "";
}
