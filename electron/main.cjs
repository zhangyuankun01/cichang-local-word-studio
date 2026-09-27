const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const APP_NAME = "词场";
const APP_DATA_FOLDER = "Cichang Local Word Studio";
const isDev = process.argv.includes("--dev");
let mainWindow;

app.setName(APP_NAME);
const userDataPath = path.join(app.getPath("appData"), APP_DATA_FOLDER);
app.setPath("userData", userDataPath);

function dataPath(name) {
  return path.join(app.getPath("userData"), name);
}

async function readPiperConfig() {
  try {
    const content = await fs.readFile(dataPath("piper-config.json"), "utf8");
    const value = JSON.parse(content);
    return {
      executable: typeof value.executable === "string" ? value.executable : "",
      model: typeof value.model === "string" ? value.model : "",
    };
  } catch {
    return { executable: "", model: "" };
  }
}

function bundledPiperPaths() {
  const root = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "resources");
  return {
    executable: path.join(root, "piper", "runtime", "piper", "piper.exe"),
    model: path.join(root, "piper-voice", "en_US-lessac-high.onnx"),
  };
}

async function activePiperConfig() {
  const saved = await readPiperConfig();
  const bundled = bundledPiperPaths();
  const selected = {
    executable: saved.executable || bundled.executable,
    model: saved.model || bundled.model,
  };
  const [executableExists, modelExists] = await Promise.all([
    fs.access(selected.executable).then(() => true, () => false),
    fs.access(selected.model).then(() => true, () => false),
  ]);
  if (executableExists && modelExists) return selected;
  return null;
}

async function savePiperConfig(config) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const target = dataPath("piper-config.json");
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(config, null, 2), "utf8");
  await fs.rename(temporary, target);
}

async function publicPiperConfig() {
  const config = await readPiperConfig();
  const bundled = bundledPiperPaths();
  const active = await activePiperConfig();
  return {
    executableName: path.basename(config.executable || bundled.executable),
    modelName: path.basename(config.model || bundled.model),
    configured: Boolean(active),
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 930,
    minWidth: 920,
    minHeight: 680,
    show: false,
    backgroundColor: "#f5f4ee",
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    const isAllowed = isDev
      ? destination.startsWith("http://127.0.0.1:5173")
      : destination.startsWith("file://");
    if (!isAllowed) event.preventDefault();
  });

  if (isDev) {
    void mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("store:read", async () => {
  try {
    return await fs.readFile(dataPath("study-data.json"), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
});

ipcMain.handle("store:write", async (_event, value) => {
  if (typeof value !== "string" || value.length > 512 * 1024 * 1024) {
    throw new Error("本地数据内容无效或超过 512 MB。");
  }
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const target = dataPath("study-data.json");
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, value, "utf8");
  await fs.rename(temporary, target);
  return true;
});

ipcMain.handle("store:path", () => app.getPath("userData"));
ipcMain.handle("store:open-folder", async () => {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const error = await shell.openPath(app.getPath("userData"));
  if (error) throw new Error(error);
});

ipcMain.handle("backup:save", async (_event, { name, content }) => {
  if (typeof content !== "string" || content.length > 512 * 1024 * 1024) {
    throw new Error("导出内容无效或超过 512 MB。");
  }
  const safeName = path.basename(String(name || "cichang-backup.json")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "保存词场文件",
    defaultPath: path.join(app.getPath("documents"), safeName),
    buttonLabel: "保存到本机",
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, content, "utf8");
  return true;
});

ipcMain.handle("piper:get-config", publicPiperConfig);

ipcMain.handle("piper:choose-path", async (_event, kind) => {
  if (kind !== "executable" && kind !== "model") throw new Error("未知的 Piper 配置类型。");
  const filters = kind === "model"
    ? [{ name: "Piper ONNX voice model", extensions: ["onnx"] }, { name: "All files", extensions: ["*"] }]
    : process.platform === "win32"
      ? [{ name: "Piper executable", extensions: ["exe"] }, { name: "All files", extensions: ["*"] }]
      : [{ name: "Piper executable", extensions: ["*"] }];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: kind === "model" ? "选择离线英语语音模型" : "选择 Piper 命令行程序",
    properties: ["openFile"],
    filters,
  });
  if (result.canceled || !result.filePaths[0]) return publicPiperConfig();
  const config = await readPiperConfig();
  config[kind] = result.filePaths[0];
  await savePiperConfig(config);
  return publicPiperConfig();
});

ipcMain.handle("piper:synthesize-batch", async (_event, entries) => {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 24) {
    throw new Error("每批语音数量无效。请分批重试。");
  }
  const normalized = entries.map((entry) => {
    if (!entry || typeof entry.id !== "string" || !entry.id || entry.id.length > 160
      || typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 300) {
      throw new Error("发音文本为空或长度超出支持范围。");
    }
    return { id: entry.id, text: entry.text.trim() };
  });
  const config = await activePiperConfig();
  if (!config) throw new Error("本地语音引擎或模型文件缺失，请重新安装应用。");

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "cichang-audio-"));
  const outputs = normalized.map((entry, index) => ({
    ...entry,
    file: path.join(outputDir, `${index}.wav`),
  }));
  const args = ["--model", config.model, "--json-input"];
  const stdinPayload = outputs.map(({ text, file }) => JSON.stringify({ text, output_file: file })).join("\n") + "\n";
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(config.executable, [...args, "--quiet"], {
        cwd: path.dirname(config.executable), stdio: ["pipe", "ignore", "pipe"], windowsHide: true,
      });
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        child.kill();
        reject(new Error("Piper 语音合成超时，请检查语音模型与运行程序是否匹配。"));
      }, 15 * 60_000);
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      child.stdin.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`无法向 Piper 发送发音文本：${error.message}`));
      });
      child.stdin.end(stdinPayload);
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`无法启动 Piper：${error.message}`));
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Piper 返回错误（退出码 ${code}）。${stderr.trim().slice(-350)}`));
      });
    });
    return await Promise.all(outputs.map(async ({ id, file }) => {
      const audio = await fs.readFile(file);
      if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") {
        throw new Error("Piper 没有生成有效的 WAV 文件，请确认语音模型与引擎版本兼容。");
      }
      return { id, audioData: `data:audio/wav;base64,${audio.toString("base64")}` };
    }));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Piper 合成失败。");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
});

ipcMain.handle("piper:synthesize", async (_event, text) => {
  if (typeof text !== "string" || !text.trim() || text.length > 300) {
    throw new Error("发音文本为空或长度超出支持范围。");
  }
  const config = await activePiperConfig();
  if (!config) throw new Error("本地语音引擎或模型文件缺失，请重新安装应用。");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "cichang-audio-"));
  const file = path.join(outputDir, "single.wav");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(config.executable, ["--model", config.model, "--json-input", "--quiet"], {
        cwd: path.dirname(config.executable), stdio: ["pipe", "ignore", "pipe"], windowsHide: true,
      });
      let stderr = "";
      const timeout = setTimeout(() => { child.kill(); reject(new Error("Piper 语音合成超时。")); }, 60_000);
      child.stderr.on("data", (chunk) => { if (stderr.length < 4000) stderr += chunk.toString(); });
      child.once("error", (error) => { clearTimeout(timeout); reject(new Error(`无法启动 Piper：${error.message}`)); });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Piper 返回错误（退出码 ${code}）。${stderr.trim().slice(-350)}`));
      });
      child.stdin.end(`${JSON.stringify({ text: text.trim(), output_file: file })}\n`);
    });
    const audio = await fs.readFile(file);
    if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") throw new Error("Piper 没有生成有效的 WAV 文件。");
    return `data:audio/wav;base64,${audio.toString("base64")}`;
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (mainWindow) mainWindow.destroy();
});
