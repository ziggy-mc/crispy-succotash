const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const BOT_NAME = "bot";
const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
const PULL_BUFFER = 5000;
const DEBOUNCE_MS = 10000;

const REPO_PATH = "/home/ziggymc/Downloads/zigybot";
const CONSOLE_FILE = path.join(REPO_PATH, "console.txt");
const ERROR_FILE = path.join(REPO_PATH, "error.txt");

let consoleBuffer = "";
let debounceTimer;

// ✅ Safe console logger (NO GIT)
function logConsole(text) {
  consoleBuffer += text;

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    fs.appendFileSync(CONSOLE_FILE, consoleBuffer);
    console.log("📝 Console appended to console.txt");
    consoleBuffer = "";
  }, DEBOUNCE_MS);
}

// ✅ Safe error logger (NO GIT)
function logError(text) {
  fs.appendFileSync(ERROR_FILE, text);
}

// ✅ Compare commit hashes instead of diff
function checkUpdates() {
  exec(`cd ${REPO_PATH} && git fetch origin master`, (err) => {
    if (err) return logError(`Git fetch error: ${err}\n`);

    exec(`cd ${REPO_PATH} && git rev-parse HEAD`, (err, localHash) => {
      if (err) return logError(`Local hash error: ${err}\n`);

      exec(`cd ${REPO_PATH} && git rev-parse origin/master`, (err, remoteHash) => {
        if (err) return logError(`Remote hash error: ${err}\n`);

        if (localHash.trim() === remoteHash.trim()) {
          logConsole("✅ No updates found.\n");
          return;
        }

        logConsole("🔄 Update detected! Pulling changes...\n");

        exec(`cd ${REPO_PATH} && git pull --ff-only origin master`, (err, stdout, stderr) => {
          if (stdout) logConsole(stdout);
          if (stderr) logError(stderr);

          // ✅ DOUBLE CHECK (extra safety)
          if (stdout.includes("Already up to date")) {
            logConsole("✅ Pull said up-to-date — skipping restart.\n");
            return;
          }

          logConsole("🚀 Restarting bot...\n");

          setTimeout(() => {
            exec(`pm2 restart ${BOT_NAME}`, (err, stdout, stderr) => {
              if (stdout) logConsole(stdout);
              if (stderr) logError(stderr);
            });
          }, PULL_BUFFER);
        });
      });
    });
  });
}

// ✅ Start bot if not running
exec(`pm2 describe ${BOT_NAME}`, (err, stdout) => {
  if (err || stdout.includes("errored") || stdout.includes("stopped")) {
    logConsole("🚀 Starting bot...\n");

    exec(`pm2 start ${REPO_PATH}/index.js --name ${BOT_NAME}`, (err, stdout, stderr) => {
      if (stdout) logConsole(stdout);
      if (stderr) logError(stderr);
    });
  } else {
    logConsole("✅ Bot already running.\n");
  }
});

// ✅ Reduced log spam (optional but safer)
const pm2Logs = exec(`pm2 logs ${BOT_NAME} --lines 50`);

pm2Logs.stdout.on("data", (data) => logConsole(data.toString()));
pm2Logs.stderr.on("data", (data) => logError(data.toString()));

// ✅ Run loop
setInterval(checkUpdates, CHECK_INTERVAL);

// ✅ Initial check
checkUpdates();
