// QA harness for the custom-scheme opener change. Runs the real compiled
// opener + settings store inside real Electron on macOS and captures the
// native confirm dialog. Modes:
//   MODE=dialog   trigger the confirm dialog for obsidian:// and screenshot it
//   MODE=approved pre-approve the scheme, then open the URL for real
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const DESKTOP_DIST = process.env.DESKTOP_DIST;
const MODE = process.env.MODE || "dialog";
const SHOT = process.env.SHOT || "/tmp/paseo-qa/scheme-dialog.png";
const TEST_URL = process.env.QA_URL || "obsidian://open?vault=notes";

const { registerOpenerHandlers } = require(path.join(DESKTOP_DIST, "features/opener.js"));
const {
  createDesktopSettingsStore,
} = require(path.join(DESKTOP_DIST, "settings/desktop-settings.js"));

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-opener-qa-"));

async function main() {
  await app.whenReady();

  console.log(
    "[qa] getApplicationNameForProtocol(%s) = %j",
    TEST_URL,
    app.getApplicationNameForProtocol(TEST_URL),
  );

  const settingsStore = createDesktopSettingsStore({ userDataPath });
  if (MODE === "approved") {
    await settingsStore.patch({ links: { approvedSchemes: ["obsidian"] } });
    console.log("[qa] pre-approved schemes:", (await settingsStore.get()).links.approvedSchemes);
  }
  registerOpenerHandlers({ settingsStore });

  const win = new BrowserWindow({
    x: 120,
    y: 120,
    width: 880,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, "qa-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(
    "data:text/html,<body style='font:14px sans-serif;padding:2rem'><h2>Paseo opener QA harness</h2><p>Invoking paseo:opener:openUrl with obsidian://open?vault=notes</p></body>",
  );

  const invocation = win.webContents
    .executeJavaScript(`window.qa.openUrl(${JSON.stringify(TEST_URL)})`)
    .then(() => console.log("[qa] openUrl resolved"))
    .catch((error) => console.log("[qa] openUrl rejected:", String(error)));

  if (MODE === "dialog") {
    // The dialog sheet is attached to the window; capture the window region
    // while the promise is pending, then exit (exit dismisses the sheet).
    setTimeout(() => {
      try {
        execFileSync("screencapture", ["-x", "-R120,120,880,560", SHOT]);
        console.log("[qa] captured", SHOT);
      } catch (error) {
        console.log("[qa] screencapture failed:", String(error));
      }
      app.exit(0);
    }, 2000);
    return;
  }

  await invocation;
  setTimeout(() => {
    try {
      const frontmost = execFileSync("osascript", [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ])
        .toString()
        .trim();
      console.log("[qa] frontmost app after open:", frontmost);
    } catch (error) {
      console.log("[qa] frontmost check failed:", String(error));
    }
    app.exit(0);
  }, 2500);
}

void main();
