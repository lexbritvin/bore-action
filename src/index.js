const core = require("@actions/core");
const exec = require("@actions/exec");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require('child_process');

function getBoreBinaryPath() {
  const platform = os.platform();
  const runnerTemp = process.env.RUNNER_TEMP;

  if (platform === "win32") {
    return path.join(runnerTemp, "bin", "bore.exe");
  } else {
    return "/usr/local/bin/bore";
  }
}

async function startDetachedBoreProcess(port, server, secret, logPath, pidPath) {
  const boreBinary = getBoreBinaryPath();

  // Verify binary exists
  if (!fs.existsSync(boreBinary)) {
    throw new Error(`Bore binary not found at: ${boreBinary}`);
  }

  // Build command args
  const args = ["local", port.toString(), "--to", server];
  if (secret) {
    args.push("--secret", secret);
  }

  core.info(`🔧 Starting detached bore process: ${boreBinary} ${args.join(" ")}`);

  // Create log directories
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });

  if (os.platform() === "win32") {
    // Windows: Use Node.js spawn with file descriptors
    const errorLogPath = logPath.replace(/\.log$/, ".err.log");

    // Open file descriptors
    const outFd = fs.openSync(logPath, 'w');
    const errFd = fs.openSync(errorLogPath, 'w');

    const child = spawn(boreBinary, args, {
      detached: true,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true
    });

    // Close file descriptors in parent (child keeps them open)
    fs.closeSync(outFd);
    fs.closeSync(errFd);

    // Unref the child process so parent can exit
    child.unref();

    const pid = child.pid;
    core.info(`📋 Bore process started with PID: ${pid}`);

    // Save PID for cleanup
    fs.writeFileSync(pidPath, pid.toString());

    return pid;
  } else {
    // Unix/macOS: Use existing nohup approach
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });

    const detachCmd = `nohup "${boreBinary}" ${args.join(" ")} > "${logPath}" 2>&1 & echo $!`;
    const { stdout } = await exec.getExecOutput("bash", ["-c", detachCmd]);

    const pid = stdout.trim();
    fs.writeFileSync(pidPath, pid);

    core.info(`📋 Bore process started with PID: ${pid}`);
    return pid;
  }
}

async function waitForTunnel(logPath, timeoutSeconds = 30) {
  core.info(`⏳ Waiting for tunnel to establish (timeout: ${timeoutSeconds}s)...`);

  const startTime = Date.now();
  let lastLoggedTime = 0;

  while (Date.now() - startTime < timeoutSeconds * 1000) {
    const currentTime = Date.now() - startTime;

    // Log progress every 5 seconds
    if (currentTime - lastLoggedTime >= 5000) {
      core.info(`⏳ Still waiting... (${Math.floor(currentTime / 1000)}/${timeoutSeconds}s)`);
      lastLoggedTime = currentTime;
    }

    try {
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, "utf8");

        // Check for success patterns
        if (logContent.includes("listening at") ||
          logContent.includes("forwarding") ||
          logContent.includes("tunnel established") ||
          logContent.match(/https?:\/\/[^\s]+/)) {
          core.info("✅ Tunnel established successfully!");
          return { success: true, logContent };
        }

        // Check for error patterns
        if (logContent.includes("error") ||
          logContent.includes("failed") ||
          logContent.includes("connection refused")) {
          return { success: false, error: "Tunnel failed", logContent };
        }
      }
    } catch (error) {
      if (error.message.includes("Tunnel failed")) {
        return { success: false, error: error.message, logContent: "" };
      }
      // Ignore file reading errors, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // If we reach here, we timed out
  let logContent = "";
  try {
    if (fs.existsSync(logPath)) {
      logContent = fs.readFileSync(logPath, "utf8");
    }
  } catch (error) {
    core.warning(`Failed to read log file: ${error.message}`);
  }

  return { success: false, error: "Timeout", logContent };
}

async function main() {
  try {
    // Get inputs
    const version = core.getInput("version") || "latest";
    const port = core.getInput("port");
    const server = core.getInput("server") || "bore.pub";
    const secret = core.getInput("secret");
    const timeout = parseInt(core.getInput("timeout") || "30");

    // Validate required inputs
    if (!port) {
      throw new Error("Port is required");
    }

    core.info("🚀 Starting bore tunnel setup...");

    // Set up paths
    const actionPath = process.env.GITHUB_ACTION_PATH || path.join(__dirname, "..");
    const scriptsDir = path.join(actionPath, "scripts");
    const installScript = path.join(scriptsDir, "install.sh");
    const logPath = path.join(process.env.RUNNER_TEMP, `bore_${server}_${port}.log`);
    const pidPath = path.join(process.env.RUNNER_TEMP, `bore_${server}_${port}.pid`);

    // Make scripts executable (Unix only)
    if (os.platform() !== "win32") {
      await exec.exec("chmod", ["+x", installScript]);
    }

    // Install bore binary first
    core.info("📦 Installing bore binary...");
    const installExitCode = await exec.exec("bash", [installScript, version]);

    if (installExitCode !== 0) {
      throw new Error(`Bore installation failed with exit code ${installExitCode}`);
    }

    // Start detached bore process
    core.info("🌐 Starting detached bore tunnel...");
    const pid = await startDetachedBoreProcess(port, server, secret, logPath, pidPath);

    // Wait for tunnel to establish
    const result = await waitForTunnel(logPath, timeout);

    if (!result.success) {
      // Kill the process if it failed
      try {
        if (os.platform() === "win32") {
          await exec.exec("taskkill", ["/F", "/T", "/PID", pid]);
        } else {
          await exec.exec("kill", ["-9", pid]);
        }
      } catch (killError) {
        core.warning(`Failed to kill failed process: ${killError.message}`);
      }

      // Show log for debugging
      core.info("📋 Bore output:");
      core.info(result.logContent);

      throw new Error(`${result.error}: Failed to establish tunnel`);
    }

    // Parse tunnel information
    const tunnelMatch = result.logContent.match(/listening at ([^:\s]+):(\d+)/);

    if (!tunnelMatch) {
      throw new Error("Failed to parse tunnel information from: " + result.logContent);
    }

    const tunnelHost = tunnelMatch[1];
    const tunnelPort = tunnelMatch[2];

    core.info("🎉 Tunnel established and detached!");
    core.info(`🏠 Host: ${tunnelHost}`);
    core.info(`🔌 Port: ${tunnelPort}`);
    core.info(`🔧 Process ID: ${pid}`);

    // Set outputs
    core.setOutput("host", tunnelHost);
    core.setOutput("port", tunnelPort);

    // Save state for cleanup
    core.saveState("bore_pid", pid);
    core.saveState("bore_log", logPath);
    core.saveState("bore_pid_path", pidPath);
    core.saveState("tunnel_active", "true");

    core.info("✅ Action completed - tunnel is running in background");

    // Action exits here, but tunnel keeps running

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    process.exit(1);
  }
}

async function cleanup() {
  try {
    const tunnelActive = core.getState("tunnel_active");

    if (tunnelActive !== "true") {
      core.info("🔍 No active tunnel to clean up");
      return;
    }

    const pid = core.getState("bore_pid");
    const pidPath = core.getState("bore_pid_path");

    core.info("🧹 Starting bore tunnel cleanup...");

    if (pid) {
      core.info(`🛑 Terminating bore process (PID: ${pid})`);

      try {
        if (os.platform() === "win32") {
          // Windows: Use taskkill
          await exec.exec("taskkill", ["/F", "/T", "/PID", pid]);
        } else {
          // Unix: Use kill
          await exec.exec("kill", ["-9", pid]);
        }
      } catch (error) {
        core.warning(`Failed to kill process: ${error.message}`);
      }

      // Clean up PID file
      try {
        if (fs.existsSync(pidPath)) {
          fs.unlinkSync(pidPath);
        }
      } catch (error) {
        core.warning(`Failed to remove PID file: ${error.message}`);
      }

      core.info("✅ Cleanup completed");
    } else {
      core.warning("⚠️ No PID found for cleanup");
    }

  } catch (error) {
    core.warning(`Cleanup failed: ${error.message}`);
  }
}

const isPost = !!core.getState("isPost");
if (!isPost) {
  // Setup phase
  core.saveState("isPost", "true");
  main();
} else {
  // Cleanup phase
  cleanup();
}
