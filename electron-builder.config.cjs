module.exports = {
  appId: "org.cichang.localwordstudio",
  productName: "词场",
  directories: {
    output: "release",
  },
  files: [
    "dist/**/*",
    "electron/main.cjs",
    "electron/preload.cjs",
    "package.json",
  ],
  extraResources: [
    { from: "resources/piper/runtime/piper", to: "piper/runtime/piper" },
    { from: "resources/piper-voice/en_US-lessac-high.onnx", to: "piper-voice/en_US-lessac-high.onnx" },
    { from: "resources/piper-voice/en_US-lessac-high.onnx.json", to: "piper-voice/en_US-lessac-high.onnx.json" },
    { from: "THIRD-PARTY-LICENSES.md", to: "THIRD-PARTY-LICENSES.md" },
  ],
  extraMetadata: {
    name: "cichang-local-word-studio",
    version: "1.0.2",
    main: "electron/main.cjs",
  },
  asar: true,
  win: {
    icon: "assets/app-icon.ico",
    target: ["nsis"],
  },
  mac: {
    target: ["dmg"],
  },
  linux: {
    target: ["AppImage"],
  },
};
