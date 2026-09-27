import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActiveSession,
  AppData,
  DailyStats,
  PracticeMode,
  Rating,
  WordEntry,
  WordStatus,
  createInitialData,
  createSession,
  decodeAppData,
  emptyDailyStats,
  formatDateLabel,
  lookupStarterWord,
  todayKey,
} from "./domain";
import { ImportedWord, ParseResult, parseVocabularyFile } from "./importer";

type Screen = "study" | "library" | "import" | "stats" | "settings";
type LibraryFilter = "all" | "due" | "new" | "mastered";
type DuplicatePolicy = "skip" | "update";
type IconName =
  | "book" | "stack" | "chart" | "settings" | "speaker" | "play" | "plus" | "search"
  | "edit" | "trash" | "upload" | "download" | "check" | "arrow" | "repeat" | "close"
  | "folder" | "cloudOff" | "spark" | "file" | "headphones" | "clock" | "refresh" | "external";

type PiperConfig = { executableName: string; modelName: string; configured: boolean };
type DesktopBridge = {
  readStore: () => Promise<string | null>;
  writeStore: (value: string) => Promise<boolean>;
  getPiperConfig: () => Promise<PiperConfig>;
  choosePiperPath: (kind: "executable" | "model") => Promise<PiperConfig>;
  synthesizeOffline: (text: string) => Promise<string>;
  synthesizeBatch: (entries: { id: string; text: string }[]) => Promise<{ id: string; audioData: string }[]>;
  getStoragePath: () => Promise<string>;
  openDataFolder: () => Promise<void>;
  saveTextFile: (name: string, content: string) => Promise<boolean>;
};

declare global {
  interface Window {
    localStudy?: DesktopBridge;
  }
}

type Toast = { message: string; actionLabel?: string; onAction?: () => void };
type WordDraft = {
  word: string;
  meaning: string;
  partOfSpeech: string;
  phonetic: string;
  example: string;
  translation: string;
  audioData?: string;
};
type ImportDraft = { fileName: string; parsed: ParseResult };
type ImportOutcome = { added: number; updated: number; skipped: number; duplicatesInFile: number };

const STORAGE_KEY = "cichang-local-study-v1";
const AUDIO_LIMIT = 1024 * 1024;

const iconPaths: Record<IconName, ReactNode> = {
  book: <><path d="M4 5.8A2.8 2.8 0 0 1 6.8 3H20v16H6.8A2.8 2.8 0 0 0 4 21V5.8Z" /><path d="M4 17.5a2.8 2.8 0 0 1 2.8-2.8H20M8 7h8M8 10h6" /></>,
  stack: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  chart: <><path d="M4 19V9m8 10V4m8 15v-7" /><path d="M2 19h20" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.7a7.7 7.7 0 0 1-1.4.8l-.3 1.9h-2.8l-.3-1.9a7.7 7.7 0 0 1-1.4-.8l-1.8.7-1.4-2.4 1.4-1.1A7 7 0 0 1 7.5 14l-1.8-.7v-2.8l1.8-.7a7 7 0 0 1 .2-1.6L6.3 7.1l1.4-2.4 1.8.7a7.7 7.7 0 0 1 1.4-.8l.3-1.9H14l.3 1.9a7.7 7.7 0 0 1 1.4.8l1.8-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 .2 1.6l1.8.7v2.8l-1.8.7a7 7 0 0 1-.3 1.4Z" /></>,
  speaker: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  edit: <><path d="m15 5 4 4M4 20l4.1-.8L19 8.3a2.1 2.1 0 0 0-3-3L5.1 16.2 4 20Z" /></>,
  trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  download: <><path d="M12 4v12m5-5-5 5-5-5" /><path d="M4 17v3h16v-3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
  repeat: <><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-3v2a3 3 0 0 1-3 3H3" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></>,
  cloudOff: <><path d="m3 3 18 18M10.6 5.2A7 7 0 0 1 20 12a4 4 0 0 1-1 8H8" /><path d="M5.4 7.5A6 6 0 0 0 5 19" /></>,
  spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
  file: <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h8" /></>,
  headphones: <><path d="M3 13v-2a9 9 0 0 1 18 0v2" /><path d="M5 13h2v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Zm14 0h-2v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></>,
  external: <><path d="M14 4h6v6m0-6-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
};

function Icon({ name, size = 19, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

const createId = () => globalThis.crypto?.randomUUID?.() ?? `word-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const wordKey = (word: string) => word.trim().toLocaleLowerCase();
const missingDetails = (word: WordEntry) => !word.meaning || !word.partOfSpeech || !word.phonetic || !word.example || !word.translation;
const formatClock = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(timestamp));

function defaultDraft(): WordDraft {
  return { word: "", meaning: "", partOfSpeech: "", phonetic: "", example: "", translation: "" };
}

function makeNewWord(draft: WordDraft, now = Date.now()): WordEntry {
  return {
    ...draft,
    id: createId(),
    word: draft.word.trim(),
    meaning: draft.meaning.trim(),
    partOfSpeech: draft.partOfSpeech.trim(),
    phonetic: draft.phonetic.trim(),
    example: draft.example.trim(),
    translation: draft.translation.trim(),
    status: "new",
    createdAt: now,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
  };
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatInterval(timestamp: number) {
  const difference = timestamp - Date.now();
  if (difference < 60 * 60 * 1000) return "约 10 分钟后";
  if (difference < 48 * 60 * 60 * 1000) return "明天";
  return formatClock(timestamp);
}

function playLocalAudio(audio: HTMLAudioElement) {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const complete = (error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const timer = window.setTimeout(() => complete(new Error("音频播放超时。")), 120_000);
    audio.onended = () => complete();
    audio.onerror = () => complete(new Error("本地录音文件无法播放。"));
    void audio.play().catch((error: unknown) => complete(error instanceof Error ? error : new Error("浏览器拒绝播放该音频。")));
  });
}

function App() {
  const [data, setData] = useState<AppData>(() => createInitialData());
  const [ready, setReady] = useState(false);
  const [storageSafe, setStorageSafe] = useState(true);
  const persistQueue = useRef<Promise<void>>(Promise.resolve());
  const audioQueueIds = useRef(new Set<string>());
  const [screen, setScreen] = useState<Screen>("study");
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastAction, setToastAction] = useState<Screen | null>(null);
  const [desktopPath, setDesktopPath] = useState("");
  const [piper, setPiper] = useState<PiperConfig>({ executableName: "", modelName: "", configured: false });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WordDraft>(defaultDraft());
  const [screenFilter, setScreenFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip");
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [restoreInputKey, setRestoreInputKey] = useState(0);

  const bridge = window.localStudy;

  const notify = useCallback((message: string, action?: { label: string; screen: Screen }) => {
    setToast({ message, actionLabel: action?.label });
    setToastAction(action?.screen ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const raw = bridge ? await bridge.readStore() : localStorage.getItem(STORAGE_KEY);
        const restored = decodeAppData(raw);
        if (active && restored) setData(restored);
        if (active && raw && !restored) {
          setStorageSafe(false);
          notify("本地学习数据无法解析，已保留原文件；请从备份恢复。", { label: "查看备份设置", screen: "settings" });
        }
        if (bridge && active) {
          const [path, config] = await Promise.all([bridge.getStoragePath(), bridge.getPiperConfig()]);
          if (active) {
            setDesktopPath(path);
            setPiper(config);
          }
        }
      } catch {
        if (active) {
          setStorageSafe(false);
          notify("无法读取本地数据，请检查应用数据目录权限。", { label: "查看设置", screen: "settings" });
        }
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    return () => { active = false; };
  }, [bridge, notify]);

  useEffect(() => {
    if (!ready || !storageSafe) return;
    const serialized = JSON.stringify(data);
    if (bridge) {
      const write = persistQueue.current.then(() => bridge.writeStore(serialized)).then((saved) => {
        if (!saved) notify("学习进度暂时没有写入磁盘，请检查数据目录空间和权限。", { label: "打开设置", screen: "settings" });
      }).catch(() => notify("保存失败。请先导出备份，再检查应用数据目录。", { label: "导出备份", screen: "settings" }));
      persistQueue.current = write.then(() => undefined, () => undefined);
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
      } catch {
        notify("浏览器本地空间不足，建议使用桌面版并导出备份。", { label: "导出备份", screen: "settings" });
      }
    }
  }, [data, ready, storageSafe, bridge, notify]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => setVoices(synth.getVoices().filter((voice) => voice.localService && voice.lang.toLowerCase().startsWith("en")));
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    const retry = window.setTimeout(refresh, 700);
    return () => {
      window.clearTimeout(retry);
      synth.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  useEffect(() => {
    if (!ready || !storageSafe || !bridge || !piper.configured) return;
    const pending = data.words.filter((word) => !word.audioData && !audioQueueIds.current.has(word.id));
    if (pending.length === 0) return;
    for (const word of pending) audioQueueIds.current.add(word.id);
    notify(`正在后台生成 ${pending.length} 个单词的发音；完成后会自动保存。`);
    const generate = async () => {
      for (let offset = 0; offset < pending.length; offset += 24) {
        const batch = pending.slice(offset, offset + 24);
        try {
          const results = await bridge.synthesizeBatch(batch.map(({ id, word }) => ({ id, text: word })));
          const audioById = new Map(results.map((item) => [item.id, item.audioData]));
          setData((previous) => ({
            ...previous,
            words: previous.words.map((word) => {
              const audioData = audioById.get(word.id);
              return audioData && !word.audioData ? { ...word, audioData } : word;
            }),
          }));
          for (const word of batch) audioQueueIds.current.delete(word.id);
        } catch (error) {
          notify(`后台语音生成暂时失败：${error instanceof Error ? error.message : "未知错误"}。下次启动应用会自动重试。`);
          return;
        }
      }
    };
    void generate();
  }, [bridge, data.words, notify, piper.configured, ready, storageSafe]);

  useEffect(() => {
    if (!ready) return;
    const session = data.activeSession;
    if (!session || session.date !== todayKey()) {
      setData((previous) => ({ ...previous, activeSession: createSession(previous) }));
    }
  }, [data.activeSession, ready]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(null); setToastAction(null); }, 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const localVoice = useMemo(() => {
    return voices.find((voice) => voice.voiceURI === data.settings.voiceURI)
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us"))
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
      ?? voices[0];
  }, [voices, data.settings.voiceURI]);

  const activeSession = data.activeSession;
  const currentId = activeSession?.ids[activeSession.index];
  const currentWord = currentId ? data.words.find((word) => word.id === currentId) : undefined;
  const todayStats = data.studyDays[todayKey()] ?? emptyDailyStats();
  const dueCount = data.words.filter((word) => word.status !== "new" && word.dueAt <= Date.now()).length;
  const freshCount = Math.min(
    Math.max(0, data.settings.dailyGoal - todayStats.newIntroduced),
    data.words.filter((word) => word.status === "new").length,
  );

  const speakSystemVoice = useCallback(async (text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) throw new Error("当前运行环境没有语音合成功能。");
    let available = synth.getVoices().filter((voice) => voice.localService && voice.lang.toLowerCase().startsWith("en"));
    if (available.length === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      available = synth.getVoices().filter((voice) => voice.localService && voice.lang.toLowerCase().startsWith("en"));
    }
    if (available.length === 0) throw new Error("未找到本地英语语音。请安装英语离线语音包，或改用 Piper 模型。");

    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const selected = available.find((voice) => voice.voiceURI === data.settings.voiceURI)
        ?? available.find((voice) => voice.lang.toLowerCase().startsWith("en-us"))
        ?? available.find((voice) => voice.lang.toLowerCase().startsWith("en"))
        ?? available[0];
      utterance.voice = selected;
      utterance.lang = selected.lang || "en-US";
      utterance.rate = data.settings.speechRate;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          synth.cancel();
          setSpeaking(false);
          reject(new Error("系统语音播放超时。"));
        }
      }, 15000);
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          setSpeaking(false);
          resolve();
        }
      };
      utterance.onerror = (event) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          setSpeaking(false);
          reject(new Error(`系统语音播放失败（${event.error || "未知错误"}）。`));
        }
      };
      synth.cancel();
      setSpeaking(true);
      synth.speak(utterance);
    });
  }, [data.settings.speechRate, data.settings.voiceURI]);

  const playText = useCallback(async (text: string, audioData?: string) => {
    let localAudioError: string | null = null;
    if (audioData) {
      try {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(audioData);
        audioRef.current = audio;
        setSpeaking(true);
        await playLocalAudio(audio);
        setSpeaking(false);
        return;
      } catch (error) {
        setSpeaking(false);
        localAudioError = error instanceof Error ? error.message : "本地录音无法播放。";
      }
    }

    let piperError: string | null = null;
    if (bridge && piper.configured) {
      try {
        setSpeaking(true);
        const audioDataUrl = await bridge.synthesizeOffline(text);
        const audio = new Audio(audioDataUrl);
        audioRef.current = audio;
        setSpeaking(true);
        await playLocalAudio(audio);
        setSpeaking(false);
        return;
      } catch (error) {
        piperError = error instanceof Error ? error.message : "Piper 语音引擎不可用。";
      }
    }

    try {
      await speakSystemVoice(text);
      if (piperError) notify(`Piper 播放失败，已改用系统离线语音：${piperError}`);
      if (localAudioError) notify(`本地录音无法播放，已改用离线语音：${localAudioError}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "语音播放失败。";
      const details = [piperError, localAudioError].filter(Boolean).join("；");
      notify(`${reason}${details ? ` ${details}` : ""} 请在设置中配置 Piper 离线语音，或安装系统离线英语语音。`, {
        label: "配置离线发音",
        screen: "settings",
      });
    }
  }, [bridge, notify, piper.configured, speakSystemVoice]);

  const playWord = useCallback((word: WordEntry) => playText(word.word, word.audioData), [playText]);

  useEffect(() => {
    if (screen !== "study" || !currentWord || !activeSession) return;
    const handleKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, [contenteditable=true]")) return;
      if (modal || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        void playWord(currentWord);
      } else if (!activeSession.feedback && event.key === "1") {
        answerWord("again");
      } else if (!activeSession.feedback && event.key === "2") {
        answerWord("known");
      } else if (activeSession.feedback && event.key === "Enter") {
        continueSession();
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  });

  function startFreshSession() {
    const session = { ...createSession(data), mode: data.activeSession?.mode ?? "word-first" };
    setData((previous) => ({ ...previous, activeSession: session }));
    setRevealed(false);
    if (session.ids.length === 0) {
      notify("当前没有到期单词。新词达到每日目标后会进入下一轮。");
      return;
    }
    const first = data.words.find((word) => word.id === session.ids[0]);
    if (first) void playWord(first);
  }

  function answerWord(rating: Rating) {
    if (!activeSession || !currentWord || activeSession.feedback) return;
    const now = Date.now();
    const wasNew = currentWord.status === "new";
    const repetitions = rating === "known" ? currentWord.repetitions + 1 : 0;
    const intervalDays = rating === "again"
      ? 0
      : currentWord.repetitions === 0
        ? 1
        : currentWord.repetitions === 1
          ? 3
          : Math.min(180, Math.round(Math.max(1, currentWord.intervalDays) * 2.3));
    const dueAt = rating === "again" ? now + 10 * 60 * 1000 : now + intervalDays * 24 * 60 * 60 * 1000;
    const nextStatus: WordStatus = rating === "again"
      ? "learning"
      : repetitions >= 4 && intervalDays >= 14
        ? "mastered"
        : "learning";

    setData((previous) => {
      const session = previous.activeSession;
      if (!session || session.feedback || session.ids[session.index] !== currentWord.id) return previous;
      const days = previous.studyDays[todayKey()] ?? emptyDailyStats();
      return {
        ...previous,
        words: previous.words.map((word) => word.id === currentWord.id
          ? { ...word, status: nextStatus, dueAt, intervalDays, repetitions, lastReviewedAt: now }
          : word),
        studyDays: {
          ...previous.studyDays,
          [todayKey()]: {
            answered: days.answered + 1,
            known: days.known + (rating === "known" ? 1 : 0),
            again: days.again + (rating === "again" ? 1 : 0),
            newIntroduced: days.newIntroduced + (wasNew ? 1 : 0),
          },
        },
        activeSession: { ...session, feedback: { wordId: currentWord.id, rating, dueAt } },
      };
    });
  }

  function continueSession() {
    if (!activeSession?.feedback) return;
    const nextIndex = activeSession.index + 1;
    const nextWord = data.words.find((word) => word.id === activeSession.ids[nextIndex]);
    setData((previous) => previous.activeSession
      ? { ...previous, activeSession: { ...previous.activeSession, index: nextIndex, feedback: null } }
      : previous);
    setRevealed(false);
    if (nextWord) void playWord(nextWord);
  }

  function changeMode(mode: PracticeMode) {
    if (!activeSession || activeSession.mode === mode) return;
    setData((previous) => previous.activeSession
      ? { ...previous, activeSession: { ...previous.activeSession, mode } }
      : previous);
    setRevealed(false);
    if (currentWord) void playWord(currentWord);
  }

  function openAddWord() {
    setEditingId(null);
    setDraft(defaultDraft());
    setModal(true);
  }

  function openEditWord(word: WordEntry) {
    setEditingId(word.id);
    setDraft({
      word: word.word,
      meaning: word.meaning,
      partOfSpeech: word.partOfSpeech,
      phonetic: word.phonetic,
      example: word.example,
      translation: word.translation,
      audioData: word.audioData,
    });
    setModal(true);
  }

  function saveWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.word.trim();
    if (!/^[A-Za-z\u00C0-\u024F]+(?:[ '\u2019-][A-Za-z\u00C0-\u024F]+)*$/.test(value)) {
      notify("单词需由英文字母、空格、连字符或撇号组成。");
      return;
    }
    const duplicate = data.words.find((word) => wordKey(word.word) === wordKey(value) && word.id !== editingId);
    if (duplicate) {
      notify(`“${duplicate.word}”已在词库中。请编辑原词条，或从批量导入中选择重复项处理方式。`);
      return;
    }
    const cleaned = { ...draft, word: value };
    let savedWord: WordEntry;
    if (editingId) {
      savedWord = { ...data.words.find((word) => word.id === editingId)!, ...cleaned };
      setData((previous) => ({
        ...previous,
        words: previous.words.map((word) => word.id === editingId ? savedWord : word),
      }));
    } else {
      const localDetails = lookupStarterWord(cleaned.word);
      savedWord = makeNewWord({
        ...cleaned,
        meaning: cleaned.meaning || localDetails?.meaning || "",
        partOfSpeech: cleaned.partOfSpeech || localDetails?.partOfSpeech || "",
        phonetic: cleaned.phonetic || localDetails?.phonetic || "",
        example: cleaned.example || localDetails?.example || "",
        translation: cleaned.translation || localDetails?.translation || "",
      });
      setData((previous) => ({ ...previous, words: [savedWord, ...previous.words] }));
    }
    setModal(false);
    const autoCompleted = !editingId && !draft.meaning && Boolean(lookupStarterWord(value));
    notify(autoCompleted ? "已用内置离线词条补充信息，并开始播放发音。" : editingId ? "词条已更新，正在播放发音。" : "词条已添加，正在播放发音。");
    void playWord(savedWord);
  }

  function deleteWord(word: WordEntry) {
    if (!window.confirm(`确定从本地词库删除 “${word.word}” 吗？学习记录也会随词条一起删除。`)) return;
    setData((previous) => {
      const session = previous.activeSession;
      if (!session) return { ...previous, words: previous.words.filter((item) => item.id !== word.id) };
      const removedIndex = session.ids.indexOf(word.id);
      const ids = session.ids.filter((id) => id !== word.id);
      const index = removedIndex >= 0 && removedIndex < session.index ? session.index - 1 : session.index;
      return {
        ...previous,
        words: previous.words.filter((item) => item.id !== word.id),
        activeSession: { ...session, ids, index: Math.max(0, index), feedback: session.feedback?.wordId === word.id ? null : session.feedback },
      };
    });
    notify(`已删除 “${word.word}”。`);
  }

  async function attachAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      notify("请选择 WAV、MP3、M4A 或其他音频文件。");
      event.target.value = "";
      return;
    }
    if (file.size > AUDIO_LIMIT) {
      notify("为避免本地存储空间不足，单个录音请控制在 1 MB 以内。");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft((previous) => ({ ...previous, audioData: String(reader.result) }));
    reader.onerror = () => notify("录音读取失败，请尝试其他音频文件。");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function inspectFile(file?: File) {
    if (!file) return;
    setReadingFile(true);
    setImportOutcome(null);
    try {
      const text = await file.text();
      setImportDraft({ fileName: file.name, parsed: parseVocabularyFile(file.name, text) });
    } catch {
      setImportDraft({ fileName: file.name, parsed: { rows: [], invalid: [], error: "文件读取失败，请检查文件后重试。" } });
    } finally {
      setReadingFile(false);
    }
  }

  const importPlan = useMemo(() => {
    if (!importDraft) return null;
    const unique: ImportedWord[] = [];
    const seen = new Set<string>();
    let duplicatesInFile = 0;
    for (const row of importDraft.parsed.rows) {
      const key = wordKey(row.word);
      if (seen.has(key)) {
        duplicatesInFile += 1;
        continue;
      }
      seen.add(key);
      unique.push(row);
    }
    const existing = new Map(data.words.map((word) => [wordKey(word.word), word]));
    const duplicateCount = unique.filter((row) => existing.has(wordKey(row.word))).length;
    const addCount = unique.filter((row) => !existing.has(wordKey(row.word))).length;
    return {
      unique,
      duplicatesInFile,
      duplicateCount,
      addCount,
      updateCount: duplicatePolicy === "update" ? duplicateCount : 0,
      skipCount: duplicatePolicy === "skip" ? duplicateCount : 0,
    };
  }, [importDraft, data.words, duplicatePolicy]);

  function confirmImport() {
    if (!importDraft || !importPlan || importPlan.unique.length === 0) return;
    const existing = new Map(data.words.map((word) => [wordKey(word.word), word]));
    const additions: WordEntry[] = [];
    const replacements = new Map<string, WordEntry>();
    let skipped = 0;

    for (const row of importPlan.unique) {
      const match = existing.get(wordKey(row.word));
      if (match && duplicatePolicy === "skip") {
        skipped += 1;
        continue;
      }
      if (match) {
        const localDetails = lookupStarterWord(row.word);
        replacements.set(match.id, {
          ...match,
          meaning: row.meaning || match.meaning || localDetails?.meaning || "",
          partOfSpeech: row.partOfSpeech || match.partOfSpeech || localDetails?.partOfSpeech || "",
          phonetic: row.phonetic || match.phonetic || localDetails?.phonetic || "",
          example: row.example || match.example || localDetails?.example || "",
          translation: row.translation || match.translation || localDetails?.translation || "",
          audioData: row.audioData || match.audioData,
        });
      } else {
        const localDetails = lookupStarterWord(row.word);
        additions.push(makeNewWord({
          word: row.word,
          meaning: row.meaning || localDetails?.meaning || "",
          partOfSpeech: row.partOfSpeech || localDetails?.partOfSpeech || "",
          phonetic: row.phonetic || localDetails?.phonetic || "",
          example: row.example || localDetails?.example || "",
          translation: row.translation || localDetails?.translation || "",
          audioData: row.audioData,
        }));
      }
    }

    setData((previous) => ({
      ...previous,
      words: [
        ...additions,
        ...previous.words.map((word) => replacements.get(word.id) ?? word),
      ],
    }));
    setImportOutcome({
      added: additions.length,
      updated: replacements.size,
      skipped: skipped + importPlan.duplicatesInFile,
      duplicatesInFile: importPlan.duplicatesInFile,
    });
    setImportDraft(null);
    setDuplicatePolicy("skip");
    const first = additions[0] ?? replacements.values().next().value as WordEntry | undefined;
    if (first && (first.audioData || !bridge || !piper.configured)) void playWord(first);
    notify(`导入完成：新增 ${additions.length} 个，更新 ${replacements.size} 个，跳过 ${skipped + importPlan.duplicatesInFile} 个重复项。`);
  }

  function downloadTemplate() {
    const template = [
      "word,meaning,part_of_speech,phonetic,example,translation",
      '"serendipity","意外发现珍奇事物的本领；机缘巧合","noun","/ˌser.ənˈdɪp.ə.ti/","A little serendipity brought them together.","一次偶然的机缘让他们相遇。"',
      '"resilient","有韧性的；能迅速恢复的","adjective","/rɪˈzɪl.jənt/","She stayed resilient through every setback.","面对每一次挫折，她都保持着韧性。"',
    ].join("\n");
    void saveTextFile("词场-导入模板.csv", template, "text/csv;charset=utf-8");
  }

  async function saveTextFile(name: string, content: string, type: string): Promise<boolean> {
    if (bridge) {
      try {
        const saved = await bridge.saveTextFile(name, content);
        if (!saved) notify("已取消保存文件。");
        return saved;
      } catch {
        notify("保存文件失败，请检查目标目录权限。");
        return false;
      }
    }
    const blob = new Blob(["\uFEFF", content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  function exportWords() {
    const header = ["word", "meaning", "part_of_speech", "phonetic", "example", "translation"];
    const records = data.words.map((word) => [word.word, word.meaning, word.partOfSpeech, word.phonetic, word.example, word.translation]);
    const content = [header, ...records].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    void saveTextFile(`词场-词库-${todayKey()}.csv`, content, "text/csv;charset=utf-8").then((saved) => {
      if (saved) notify("词库 CSV 已导出。");
    });
  }

  function exportBackup() {
    const backup = {
      ...data,
      exportedAt: new Date().toISOString(),
      application: "词场 Local Vocabulary",
    };
    void saveTextFile(`词场-完整备份-${todayKey()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8").then((saved) => {
      if (saved) notify("完整备份已导出，包含词条、复习进度和设置。");
    });
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const restored = decodeAppData(await file.text());
      if (!restored) {
        notify("这不是有效的词场备份。请使用完整备份 JSON，而不是 CSV 词库文件。");
        return;
      }
      if (!window.confirm(`备份中有 ${restored.words.length} 个词条。恢复会替换当前词库与全部学习记录，是否继续？`)) return;
      setStorageSafe(true);
      setData(restored);
      setSearch("");
      setImportDraft(null);
      notify(`已恢复 ${restored.words.length} 个词条和本地学习记录。`);
    } catch {
      notify("备份文件无法读取，请选择未损坏的 JSON 文件。");
    } finally {
      event.target.value = "";
      setRestoreInputKey((value) => value + 1);
    }
  }

  async function choosePiper(kind: "executable" | "model") {
    if (!bridge) {
      notify("Piper 文件选择需要桌面版。浏览器预览可使用本机已安装的离线语音。", { label: "了解设置", screen: "settings" });
      return;
    }
    try {
      const config = await bridge.choosePiperPath(kind);
      setPiper(config);
      notify(config.configured ? "Piper 离线语音已就绪。" : "已保存路径。请继续选择另一个 Piper 文件。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法配置 Piper 文件。");
    }
  }

  const allCounts = useMemo(() => ({
    new: data.words.filter((word) => word.status === "new").length,
    due: data.words.filter((word) => word.status !== "new" && word.dueAt <= Date.now()).length,
    mastered: data.words.filter((word) => word.status === "mastered").length,
  }), [data.words]);

  const visibleWords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return data.words.filter((word) => {
      const matchesQuery = !query || [word.word, word.meaning, word.phonetic].some((text) => text.toLocaleLowerCase().includes(query));
      const matchesFilter = screenFilter === "all"
        || (screenFilter === "new" && word.status === "new")
        || (screenFilter === "due" && word.status !== "new" && word.dueAt <= Date.now())
        || (screenFilter === "mastered" && word.status === "mastered");
      return matchesQuery && matchesFilter;
    }).sort((a, b) => a.word.localeCompare(b.word));
  }, [data.words, screenFilter, search]);

  const localVoiceReady = Boolean(piper.configured || localVoice);
  const dailyTotal = activeSession?.ids.length ?? 0;
  const progress = dailyTotal > 0 ? Math.min(100, (activeSession!.index / dailyTotal) * 100) : 0;

  if (!ready) {
    return <div className="startup-screen"><div className="startup-mark">词</div><span>正在打开本地词库…</span></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-lockup" onClick={() => setScreen("study")} aria-label="词场首页">
          <span className="brand-mark">词</span>
          <span className="brand-copy"><strong>词场</strong><small>LOCAL WORD STUDIO</small></span>
        </button>

        <div className="sidebar-label">学习空间</div>
        <nav className="primary-nav" aria-label="主导航">
          <NavButton icon="headphones" label="每日学习" active={screen === "study"} onClick={() => setScreen("study")} />
          <NavButton icon="book" label="我的词库" count={data.words.length} active={screen === "library"} onClick={() => setScreen("library")} />
          <NavButton icon="upload" label="批量导入" active={screen === "import"} onClick={() => setScreen("import")} />
          <NavButton icon="chart" label="学习统计" active={screen === "stats"} onClick={() => setScreen("stats")} />
        </nav>

        <div className="sidebar-bottom">
          <div className={`voice-indicator ${localVoiceReady ? "is-ready" : "is-missing"}`}>
            <span className="voice-indicator-dot" />
            <div><strong>{localVoiceReady ? "离线发音已就绪" : "离线发音待配置"}</strong><small>{piper.configured ? "Piper 本地语音" : localVoice ? localVoice.name : "需要本地英语语音"}</small></div>
          </div>
          <button className={`nav-link settings-link ${screen === "settings" ? "active" : ""}`} onClick={() => setScreen("settings")}>
            <Icon name="settings" /><span>设置与备份</span><span className="nav-link-arrow">›</span>
          </button>
          <div className="sidebar-footnote"><span className="local-dot" />所有数据只保存在本机</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>词场</span><span className="breadcrumb-separator">/</span><strong>{screenLabel(screen)}</strong></div>
          <div className="topbar-right">
            <span className={`save-status ${storageSafe ? "" : "protected"}`}><span className={`save-dot ${storageSafe ? "" : "warning"}`} />{storageSafe ? bridge ? "已保存到本地文件" : "保存在此设备" : "原数据保护中"}</span>
            <div className="topbar-divider" />
            <button className="avatar-button" onClick={() => setScreen("settings")} aria-label="打开设置">L</button>
          </div>
        </header>

        <div className="page-content" key={screen}>
          {screen === "study" && (
            <StudyPage
              date={formatDateLabel()}
              session={activeSession}
              currentWord={currentWord}
              todayStats={todayStats}
              dailyGoal={data.settings.dailyGoal}
              freshCount={freshCount}
              dueCount={dueCount}
              progress={progress}
              totalWords={data.words.length}
              speaking={speaking}
              revealed={revealed}
              onMode={changeMode}
              onPlay={() => currentWord && void playWord(currentWord)}
              onAnswer={answerWord}
              onContinue={continueSession}
              onReveal={() => setRevealed(true)}
              onStart={startFreshSession}
              onEdit={() => currentWord && openEditWord(currentWord)}
              onBrowse={() => setScreen("library")}
              onSettings={() => setScreen("settings")}
              voiceReady={localVoiceReady}
              mode={activeSession?.mode ?? "word-first"}
            />
          )}

          {screen === "library" && (
            <LibraryPage
              words={visibleWords}
              search={search}
              filter={screenFilter}
              counts={allCounts}
              total={data.words.length}
              onSearch={setSearch}
              onFilter={setScreenFilter}
              onAdd={openAddWord}
              onEdit={openEditWord}
              onDelete={deleteWord}
              onPlay={(word) => void playWord(word)}
              onImport={() => setScreen("import")}
            />
          )}

          {screen === "import" && (
            <ImportPage
              importDraft={importDraft}
              importPlan={importPlan}
              outcome={importOutcome}
              duplicatePolicy={duplicatePolicy}
              readingFile={readingFile}
              dragging={dragging}
              onFile={inspectFile}
              onPolicy={setDuplicatePolicy}
              onConfirm={confirmImport}
              onTemplate={downloadTemplate}
              onDragChange={setDragging}
              onBackToLibrary={() => setScreen("library")}
              onReset={() => { setImportDraft(null); setImportOutcome(null); }}
              onNewImport={() => setImportOutcome(null)}
            />
          )}

          {screen === "stats" && <StatsPage data={data} dueCount={dueCount} freshCount={freshCount} />}

          {screen === "settings" && (
            <SettingsPage
              data={data}
              wordsCount={data.words.length}
              desktopPath={desktopPath}
              isDesktop={Boolean(bridge)}
              piper={piper}
              voices={voices}
              localVoice={localVoice}
              onChoosePiper={choosePiper}
              onVoiceChange={(voiceURI) => setData((previous) => ({ ...previous, settings: { ...previous.settings, voiceURI } }))}
              onRateChange={(speechRate) => setData((previous) => ({ ...previous, settings: { ...previous.settings, speechRate } }))}
              onGoalChange={(dailyGoal) => setData((previous) => ({ ...previous, settings: { ...previous.settings, dailyGoal } }))}
              onExportBackup={exportBackup}
              onExportWords={exportWords}
              onRestore={restoreBackup}
              onOpenFolder={() => bridge?.openDataFolder()}
              restoreInputKey={restoreInputKey}
            />
          )}
        </div>
      </main>

      {modal && (
        <WordModal
          draft={draft}
          editing={Boolean(editingId)}
          onChange={setDraft}
          onAudio={attachAudio}
          onClose={() => setModal(false)}
          onSubmit={saveWord}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-mark"><Icon name="spark" size={17} /></span>
          <span className="toast-message">{toast.message}</span>
          {toast.actionLabel && toastAction && <button onClick={() => { setScreen(toastAction); setToast(null); }}>{toast.actionLabel}</button>}
          <button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}><Icon name="close" size={16} /></button>
        </div>
      )}
    </div>
  );
}

function NavButton({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`nav-link ${active ? "active" : ""}`} onClick={onClick}>
      <Icon name={icon} /><span>{label}</span>{typeof count === "number" && <span className="nav-count">{count}</span>}
    </button>
  );
}

function screenLabel(screen: Screen) {
  return ({ study: "每日学习", library: "我的词库", import: "批量导入", stats: "学习统计", settings: "设置与备份" })[screen];
}

function StudyPage({
  date,
  session,
  currentWord,
  todayStats,
  dailyGoal,
  freshCount,
  dueCount,
  progress,
  totalWords,
  speaking,
  revealed,
  onMode,
  onPlay,
  onAnswer,
  onContinue,
  onReveal,
  onStart,
  onEdit,
  onBrowse,
  onSettings,
  voiceReady,
  mode,
}: {
  date: string;
  session: ActiveSession | null;
  currentWord?: WordEntry;
  todayStats: DailyStats;
  dailyGoal: number;
  freshCount: number;
  dueCount: number;
  progress: number;
  totalWords: number;
  speaking: boolean;
  revealed: boolean;
  onMode: (mode: PracticeMode) => void;
  onPlay: () => void;
  onAnswer: (rating: Rating) => void;
  onContinue: () => void;
  onReveal: () => void;
  onStart: () => void;
  onEdit: () => void;
  onBrowse: () => void;
  onSettings: () => void;
  voiceReady: boolean;
  mode: PracticeMode;
}) {
  const finished = Boolean(session && session.ids.length > 0 && session.index >= session.ids.length);
  const feedback = session?.feedback ?? null;
  const showWord = mode === "word-first" || revealed || Boolean(feedback);
  const position = session && session.ids.length > 0 ? Math.min(session.index + 1, session.ids.length) : 0;
  const examples = currentWord?.example.split(/\r?\n/).filter(Boolean) ?? [];
  const translations = currentWord?.translation.split(/\r?\n/) ?? [];

  return (
    <section className="study-page">
      <div className="page-heading study-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />{date}</div>
          <h1>每日学习</h1>
          <p>认真听，再凭记忆作答。短暂的回想，让单词留得更久。</p>
        </div>
        <div className="daily-summary">
          <div className="daily-ring" style={{ "--progress": `${Math.min(100, (todayStats.newIntroduced / dailyGoal) * 100)}%` } as React.CSSProperties}>
            <div><strong>{todayStats.newIntroduced}</strong><span>/ {dailyGoal}</span></div>
          </div>
          <div><span>今日新词</span><strong>{todayStats.answered ? `已练习 ${todayStats.answered} 次` : "等你开始"}</strong></div>
        </div>
      </div>

      <div className="study-toolbar">
        <div className="mode-switch" role="tablist" aria-label="练习模式">
          <button role="tab" aria-selected={mode === "word-first"} className={mode === "word-first" ? "selected" : ""} onClick={() => onMode("word-first")}>
            <span className="mode-index">01</span><span>看词听音</span>
          </button>
          <button role="tab" aria-selected={mode === "audio-first"} className={mode === "audio-first" ? "selected" : ""} onClick={() => onMode("audio-first")}>
            <span className="mode-index">02</span><span>听音猜词</span>
          </button>
        </div>
        <div className="session-counter">
          <span>本轮进度</span><strong>{position.toString().padStart(2, "0")}<i>/</i>{(session?.ids.length ?? 0).toString().padStart(2, "0")}</strong>
        </div>
      </div>
      <div className="session-progress"><span style={{ width: `${progress}%` }} /></div>

      {currentWord && !finished ? (
        <div className={`study-stage ${feedback ? "has-feedback" : ""}`}>
          <div className="word-stage">
            <div className="word-stage-top">
              <span className="word-kind"><span className="kind-dot" />{currentWord.status === "new" ? "新词 · 初次相遇" : "间隔复习 · 再次见面"}</span>
              <button className="edit-word-button" onClick={onEdit}><Icon name="edit" size={16} />编辑词条</button>
            </div>

            {showWord ? (
              <div className="word-reveal animate-word" key={`${currentWord.id}-shown`}>
                {feedback && <div className={`feedback-label ${feedback.rating === "known" ? "positive" : "gentle"}`}><Icon name={feedback.rating === "known" ? "check" : "clock"} size={15} />{feedback.rating === "known" ? "记住了" : "已加入短时复习"}</div>}
                <div className="word-title-line">
                  <h2>{currentWord.word}</h2>
                  <button className={`round-audio ${speaking ? "playing" : ""}`} onClick={onPlay} aria-label={`播放 ${currentWord.word} 的发音`}><Icon name={speaking ? "speaker" : "play"} size={22} /></button>
                </div>
                <div className="pronunciation-line"><span>{currentWord.phonetic || "音标待补充"}</span>{currentWord.partOfSpeech && <><span className="dot-separator">·</span><span>{currentWord.partOfSpeech}</span></>}</div>
                <div className="word-definition">{currentWord.meaning || <span className="muted-italic">释义待补充</span>}</div>
                {currentWord.example && (
                  <div className="example-block">
                    {examples.map((example, index) => <div className="example-entry" key={`${currentWord.id}-${index}`}><p>{example}</p>{translations[index] && <span>{translations[index]}</span>}</div>)}
                  </div>
                )}
                {missingDetails(currentWord) && !feedback && <div className="detail-reminder"><Icon name="spark" size={14} />这条词目还有内容待补充</div>}
                {feedback && <p className="next-review-copy">{feedback.rating === "known" ? `下一次复习：${formatInterval(feedback.dueAt)}` : "稍后再给它一次机会。"}</p>}
              </div>
            ) : (
              <div className="audio-question animate-word" key={`${currentWord.id}-hidden`}>
                <div className={`wave-orbit ${speaking ? "is-playing" : ""}`}>
                  <div className="wave-bars" aria-hidden="true">{[14, 23, 35, 20, 42, 28, 18, 37, 25, 44, 22, 34, 15].map((height, index) => <i key={index} style={{ "--bar-height": `${height}px`, "--bar-delay": `${index * 55}ms` } as React.CSSProperties} />)}</div>
                  <button className="round-audio large-audio" onClick={onPlay} aria-label="播放单词发音"><Icon name={speaking ? "speaker" : "play"} size={25} /></button>
                </div>
                <span className="listen-kicker">LISTEN CLOSELY</span>
                <h2>听音，回想这个单词</h2>
                <p>试着在心里拼出它，再判断自己是否认识。</p>
                <button className="replay-link" onClick={onPlay}><Icon name="repeat" size={15} />再听一遍</button>
              </div>
            )}

            <div className="answer-area">
              {!feedback ? (
                <>
                  {mode === "audio-first" && !revealed && <button className="reveal-link" onClick={onReveal}>先看答案</button>}
                  <div className="answer-buttons">
                    <button className="answer-button unsure" onClick={() => onAnswer("again")}><span className="answer-shortcut">1</span><span>还不认识</span><Icon name="repeat" size={17} /></button>
                    <button className="answer-button know" onClick={() => onAnswer("known")}><span className="answer-shortcut">2</span><span>认识</span><Icon name="arrow" size={18} /></button>
                  </div>
                  <span className="keyboard-hint"><kbd>空格</kbd> 重播 <span>·</span> <kbd>1</kbd> 不认识 <span>·</span> <kbd>2</kbd> 认识</span>
                </>
              ) : (
                <button className="continue-button" onClick={onContinue}>继续学习 <Icon name="arrow" size={18} /><span className="continue-shortcut">Enter</span></button>
              )}
            </div>
          </div>
          <div className="study-bottom-line"><span>{mode === "word-first" ? "看词 · 听音 · 判断" : "听音 · 回想 · 判断"}</span><span>每个答案都会安排下一次复习</span></div>
        </div>
      ) : (
        <div className="session-complete">
          <div className="complete-mark"><Icon name="check" size={30} /></div>
          <span className="eyebrow"><span className="eyebrow-line" />这一轮，完成了</span>
          <h2>{finished ? "记忆正在发生。" : "今天的词汇，已经就位。"}</h2>
          <p>{finished
            ? `今天已经完成 ${session?.ids.length ?? 0} 个练习。单词会按记忆节奏回到你的复习队列。`
            : totalWords === 0
              ? "先添加或导入一些单词，马上开始练习。"
              : "现在没有到期单词，新的复习会在设定的时间回来。"}</p>
          <div className="complete-actions">
            <button className="primary-action" onClick={totalWords === 0 ? onBrowse : onStart}><Icon name={totalWords === 0 ? "plus" : "refresh"} size={17} />{totalWords === 0 ? "添加第一个单词" : finished ? "开始新一轮" : "刷新学习队列"}</button>
            <button className="text-action" onClick={totalWords ? onBrowse : onSettings}>{totalWords ? "查看词库" : "打开设置"}<Icon name="arrow" size={16} /></button>
          </div>
          <div className="complete-note"><span className="local-dot" />今天认识 {todayStats.known} 个 · 再练习 {todayStats.again} 个 · 剩余新词 {freshCount} 个 · 到期复习 {dueCount} 个</div>
        </div>
      )}
      {!voiceReady && <button className="voice-warning" onClick={onSettings}><Icon name="speaker" size={17} /><span>没有检测到离线英语语音。请配置本地 Piper 或安装系统离线语音。</span><Icon name="arrow" size={16} /></button>}
    </section>
  );
}

function LibraryPage({
  words,
  search,
  filter,
  counts,
  total,
  onSearch,
  onFilter,
  onAdd,
  onEdit,
  onDelete,
  onPlay,
  onImport,
}: {
  words: WordEntry[];
  search: string;
  filter: LibraryFilter;
  counts: { new: number; due: number; mastered: number };
  total: number;
  onSearch: (value: string) => void;
  onFilter: (filter: LibraryFilter) => void;
  onAdd: () => void;
  onEdit: (word: WordEntry) => void;
  onDelete: (word: WordEntry) => void;
  onPlay: (word: WordEntry) => void;
  onImport: () => void;
}) {
  const filters: { id: LibraryFilter; label: string; count: number }[] = [
    { id: "all", label: "全部词条", count: total },
    { id: "due", label: "待复习", count: counts.due },
    { id: "new", label: "新词", count: counts.new },
    { id: "mastered", label: "已掌握", count: counts.mastered },
  ];

  return (
    <section className="library-page">
      <PageHeading eyebrow="YOUR WORD COLLECTION" title="我的词库" subtitle="每一个词，都有自己的记忆轨迹。" />
      <div className="library-toolbar">
        <div className="library-filters" role="tablist" aria-label="筛选词条">
          {filters.map((item) => <button key={item.id} className={filter === item.id ? "selected" : ""} onClick={() => onFilter(item.id)} role="tab" aria-selected={filter === item.id}>{item.label}<span>{item.count}</span></button>)}
        </div>
        <div className="library-actions">
          <label className="search-field"><Icon name="search" size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索单词或释义" aria-label="搜索单词或释义" />{search && <button onClick={() => onSearch("")} aria-label="清除搜索"><Icon name="close" size={15} /></button>}</label>
          <button className="outline-action" onClick={onImport}><Icon name="upload" size={17} />导入</button>
          <button className="primary-action add-action" onClick={onAdd}><Icon name="plus" size={18} />添加单词</button>
        </div>
      </div>

      {words.length > 0 ? (
        <div className="word-table-wrap">
          <div className="word-table table-heading"><span>单词 / 音标</span><span>释义</span><span>记忆状态</span><span>复习时间</span><span>操作</span></div>
          {words.map((word) => <WordRow key={word.id} word={word} onEdit={() => onEdit(word)} onDelete={() => onDelete(word)} onPlay={() => onPlay(word)} />)}
        </div>
      ) : (
        <div className="library-empty"><div className="empty-icon"><Icon name={search ? "search" : "book"} size={25} /></div><h2>{search ? "没有找到这个词。" : "词库里还没有这样的单词。"}</h2><p>{search ? "换个关键词试试。" : "从文件一次导入一整组，或添加一个新词开始。"}</p>{!search && <button className="primary-action" onClick={onImport}><Icon name="upload" size={17} />从文件导入</button>}</div>
      )}
      <div className="library-footnote"><span>共 {total} 个词条</span><span><span className="local-dot" />编辑与学习记录自动保存在本机</span></div>
    </section>
  );
}

function WordRow({ word, onEdit, onDelete, onPlay }: { word: WordEntry; onEdit: () => void; onDelete: () => void; onPlay: () => void }) {
  const statusLabel = word.status === "new" ? "新词" : word.status === "mastered" ? "已掌握" : word.dueAt <= Date.now() ? "待复习" : "学习中";
  const statusStyle = word.status === "new" ? "new" : word.status === "mastered" ? "mastered" : word.dueAt <= Date.now() ? "due" : "learning";
  return (
    <div className="word-table word-row">
      <div className="word-cell"><button className="row-word" onClick={onPlay}>{word.word}</button><button className="row-audio" onClick={onPlay} aria-label={`播放 ${word.word}`}><Icon name="speaker" size={15} /></button><span>{word.phonetic || "音标待补充"}</span></div>
      <div className="meaning-cell">{word.meaning || <span className="muted-italic">释义待补充</span>}{missingDetails(word) && <span className="missing-tag">待完善</span>}</div>
      <div><span className={`status-label ${statusStyle}`}><i />{statusLabel}</span></div>
      <div className="review-date">{word.status === "new" ? "首次学习" : formatClock(word.dueAt)}</div>
      <div className="row-actions"><button onClick={onEdit} aria-label={`编辑 ${word.word}`} title="编辑"><Icon name="edit" size={16} /></button><button onClick={onDelete} aria-label={`删除 ${word.word}`} title="删除"><Icon name="trash" size={16} /></button></div>
    </div>
  );
}

function ImportPage({
  importDraft,
  importPlan,
  outcome,
  duplicatePolicy,
  readingFile,
  dragging,
  onFile,
  onPolicy,
  onConfirm,
  onTemplate,
  onDragChange,
  onBackToLibrary,
  onReset,
  onNewImport,
}: {
  importDraft: ImportDraft | null;
  importPlan: { unique: ImportedWord[]; duplicatesInFile: number; duplicateCount: number; addCount: number; updateCount: number; skipCount: number } | null;
  outcome: ImportOutcome | null;
  duplicatePolicy: DuplicatePolicy;
  readingFile: boolean;
  dragging: boolean;
  onFile: (file?: File) => void;
  onPolicy: (policy: DuplicatePolicy) => void;
  onConfirm: () => void;
  onTemplate: () => void;
  onDragChange: (dragging: boolean) => void;
  onBackToLibrary: () => void;
  onReset: () => void;
  onNewImport: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const parsed = importDraft?.parsed;
  const invalid = parsed?.invalid ?? [];
  const sampleRows = importPlan?.unique.slice(0, 5) ?? [];

  return (
    <section className="import-page">
      <PageHeading eyebrow="BRING YOUR WORDS IN" title="批量导入" subtitle="一份文件，整组词汇。导入前先检查，确认后再写入本地词库。" />

      {!importDraft && !outcome && (
        <>
          <div
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); onDragChange(true); }}
            onDragLeave={() => onDragChange(false)}
            onDrop={(event) => { event.preventDefault(); onDragChange(false); onFile(event.dataTransfer.files[0]); }}
          >
            <input ref={fileInput} type="file" accept=".csv,.txt,.json,text/csv,text/plain,application/json" onChange={(event) => onFile(event.target.files?.[0])} aria-label="选择词库文件" />
            <div className="upload-stamp"><Icon name={readingFile ? "refresh" : "upload"} size={25} /></div>
            <h2>{readingFile ? "正在读取文件…" : "把你的词库，带进来。"}</h2>
            <p>拖放文件到这里，或 <button onClick={() => fileInput.current?.click()}>选择一个文件</button></p>
            <span className="supported-formats">支持 CSV、TXT、JSON · 可导入 100 个或更多单词</span>
          </div>
          <div className="import-guides">
            <div><span className="guide-number">01</span><div><strong>最简单的 TXT</strong><p>每行一个英文单词，释义会先留空，之后可补充。</p></div></div>
            <div><span className="guide-number">02</span><div><strong>完整 CSV 表格</strong><p>支持词义、词性、音标、例句和例句翻译。</p><button className="inline-download" onClick={onTemplate}><Icon name="download" size={15} />下载 CSV 示例模板</button></div></div>
            <div><span className="guide-number">03</span><div><strong>JSON 词条数组</strong><p>字段名可使用英文或常见中文列名。</p></div></div>
          </div>
        </>
      )}

      {importDraft && importPlan && (
        <div className="import-review animate-word">
          <div className="review-header"><div><span className="eyebrow"><span className="eyebrow-line" />导入前检查</span><h2>{importDraft.fileName}</h2></div><button className="text-action" onClick={onReset}>重新选择</button></div>
          {parsed?.error ? <div className="import-error"><Icon name="close" size={18} />{parsed.error}</div> : (
            <>
              <div className="import-counts">
                <div><strong>{parsed?.rows.length ?? 0}</strong><span>有效词条</span></div>
                <div className={importPlan.duplicateCount ? "count-warn" : ""}><strong>{importPlan.duplicateCount + importPlan.duplicatesInFile}</strong><span>重复项</span></div>
                <div className={invalid.length ? "count-warn" : ""}><strong>{invalid.length}</strong><span>格式错误</span></div>
                <div><strong>{parsed?.rows.filter((row) => !row.meaning || !row.partOfSpeech || !row.phonetic || !row.example || !row.translation).length ?? 0}</strong><span>内容待补</span></div>
              </div>
              <div className="duplicate-choice"><span>与词库重名时</span><div className="segmented-choice"><button className={duplicatePolicy === "skip" ? "selected" : ""} onClick={() => onPolicy("skip")}>跳过，不覆盖</button><button className={duplicatePolicy === "update" ? "selected" : ""} onClick={() => onPolicy("update")}>更新已有词条</button></div></div>
              <div className="import-preview-table">
                <div className="preview-row preview-head"><span>单词</span><span>释义</span><span>例句</span><span>检查结果</span></div>
                {sampleRows.map((row) => {
                  const isMissing = !row.meaning || !row.partOfSpeech || !row.phonetic || !row.example || !row.translation;
                  return <div className="preview-row" key={`${row.line}-${row.word}`}><strong>{row.word}</strong><span>{row.meaning || <i>释义待补</i>}</span><span>{row.example || <i>例句待补</i>}</span><span className={isMissing ? "preview-pending" : "preview-ok"}><i />{isMissing ? "待完善" : "格式正常"}</span></div>;
                })}
              </div>
              {(importPlan.duplicatesInFile > 0 || importPlan.duplicateCount > 0) && <p className="duplicate-note">文件内部有 {importPlan.duplicatesInFile} 个重复行（保留首条）；词库中已有 {importPlan.duplicateCount} 个同名单词，{duplicatePolicy === "skip" ? "默认保留原词条。" : "将以文件中的非空字段更新原词条，保留复习进度。"}</p>}
              {invalid.length > 0 && <div className="invalid-list"><strong>未导入的错误行</strong>{invalid.slice(0, 5).map((item) => <p key={`${item.line}-${item.value}`}>第 {item.line} 行 · {item.value || "空内容"} · {item.reason}</p>)}{invalid.length > 5 && <p>另有 {invalid.length - 5} 行错误未展开。</p>}</div>}
              <div className="import-review-footer"><span>将新增 {importPlan.addCount} 个{importPlan.updateCount > 0 ? `，更新 ${importPlan.updateCount} 个` : ""}{importPlan.skipCount > 0 ? `，跳过 ${importPlan.skipCount} 个` : ""}。</span><button className="primary-action" disabled={importPlan.unique.length === 0} onClick={onConfirm}><Icon name="check" size={17} />确认导入</button></div>
            </>
          )}
        </div>
      )}

      {outcome && (
        <div className="import-success animate-word"><div className="complete-mark"><Icon name="check" size={28} /></div><span className="eyebrow"><span className="eyebrow-line" />本地词库已更新</span><h2>词汇已安顿好。</h2><p>新增 {outcome.added} 个 · 更新 {outcome.updated} 个 · 跳过 {outcome.skipped} 个重复项</p>{outcome.duplicatesInFile > 0 && <p className="muted-copy">文件内部的重复行已保留首条，没有重复写入。</p>}<div className="complete-actions"><button className="primary-action" onClick={onBackToLibrary}><Icon name="book" size={17} />查看词库</button><button className="text-action" onClick={onNewImport}>继续导入 <Icon name="arrow" size={16} /></button></div></div>
      )}
    </section>
  );
}

function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>;
}

function StatsPage({ data, dueCount, freshCount }: { data: AppData; dueCount: number; freshCount: number }) {
  const today = todayKey();
  const week = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const key = todayKey(date);
    return { key, label: new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date), stats: data.studyDays[key] ?? emptyDailyStats() };
  });
  const maxValue = Math.max(4, ...week.map((day) => day.stats.answered));
  const allSessions = Object.values(data.studyDays);
  const totalReviewed = allSessions.reduce((sum, day) => sum + day.answered, 0);
  const mastered = data.words.filter((word) => word.status === "mastered").length;
  const learning = data.words.filter((word) => word.status === "learning").length;
  const newWords = data.words.filter((word) => word.status === "new").length;
  const accuracy = totalReviewed ? Math.round((allSessions.reduce((sum, day) => sum + day.known, 0) / totalReviewed) * 100) : 0;
  const totalActivity = week.reduce((sum, day) => sum + day.stats.answered, 0);

  return (
    <section className="stats-page">
      <PageHeading eyebrow="YOUR LEARNING RHYTHM" title="学习统计" subtitle="看见那些正在变成长期记忆的词。" />
      <div className="stats-metrics">
        <div><span>词库总量</span><strong>{data.words.length}<i>词</i></strong><small>{newWords} 个等待初次学习</small></div>
        <div><span>累计练习</span><strong>{totalReviewed}<i>次</i></strong><small>正确反馈率 {accuracy}%</small></div>
        <div><span>已掌握</span><strong>{mastered}<i>词</i></strong><small>{learning} 个正在巩固</small></div>
      </div>

      <div className="activity-section">
        <div className="section-title-line"><div><span className="eyebrow"><span className="eyebrow-line" />近七天</span><h2>一点点，积累成习惯。</h2></div><span className="activity-total">本周练习 <strong>{totalActivity}</strong> 次</span></div>
        <div className="weekly-chart" role="img" aria-label={`近七天共练习 ${totalActivity} 次`}>
          {week.map((day) => <div className="chart-day" key={day.key}><div className="chart-bar-track"><span className={day.key === today ? "today-bar" : ""} style={{ height: `${Math.max(day.stats.answered ? 8 : 3, (day.stats.answered / maxValue) * 100)}%` }} /><span className="chart-tooltip">{day.stats.answered} 次</span></div><span className={day.key === today ? "chart-today" : ""}>{day.label}</span></div>)}
        </div>
      </div>

      <div className="review-rhythm">
        <div><span className="eyebrow"><span className="eyebrow-line" />复习节奏</span><h2>单词会在恰好的时候回来。</h2><p>认识后，依次在 1 天、3 天、约 7 天后复习；不认识的词会在 10 分钟后再次出现。连续记住后，间隔逐步延长。</p></div>
        <div className="rhythm-counts"><div><span className="rhythm-dot due-dot" /><strong>{dueCount}</strong><span>今天待复习</span></div><div><span className="rhythm-dot new-dot" /><strong>{freshCount}</strong><span>今日新词计划</span></div><div><span className="rhythm-dot learned-dot" /><strong>{mastered}</strong><span>已进入长期记忆</span></div></div>
      </div>
      <div className="stats-footnote"><span className="local-dot" />统计数据跟随词库保存在本地，导出备份可一并迁移。</div>
    </section>
  );
}

function SettingsPage({
  data,
  wordsCount,
  desktopPath,
  isDesktop,
  piper,
  voices,
  localVoice,
  onChoosePiper,
  onVoiceChange,
  onRateChange,
  onGoalChange,
  onExportBackup,
  onExportWords,
  onRestore,
  onOpenFolder,
  restoreInputKey,
}: {
  data: AppData;
  wordsCount: number;
  desktopPath: string;
  isDesktop: boolean;
  piper: PiperConfig;
  voices: SpeechSynthesisVoice[];
  localVoice?: SpeechSynthesisVoice;
  onChoosePiper: (kind: "executable" | "model") => void;
  onVoiceChange: (value: string) => void;
  onRateChange: (value: number) => void;
  onGoalChange: (value: number) => void;
  onExportBackup: () => void;
  onExportWords: () => void;
  onRestore: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenFolder: () => void;
  restoreInputKey: number;
}) {
  const today = data.studyDays[todayKey()] ?? emptyDailyStats();
  return (
    <section className="settings-page">
      <PageHeading eyebrow="PRIVATE BY DESIGN" title="设置与备份" subtitle="学习记录只属于你。选择离线声音，把数据稳稳带在身边。" />

      <div className="settings-section speech-settings">
        <div className="settings-section-heading"><div className="settings-icon"><Icon name="headphones" size={20} /></div><div><h2>离线发音</h2><p>优先播放词条录音，其次使用本地 Piper 或系统离线语音。不调用在线接口。</p></div></div>
        {isDesktop && (
          <div className="piper-config">
            <div className="engine-heading"><span className={`engine-led ${piper.configured ? "ready" : ""}`} /><div><strong>{piper.configured ? "Piper 高品质神经语音" : "Piper 本地语音引擎"}</strong><span>{piper.configured ? "已内置美式英语高品质语音；导入后会在后台自动批量生成并保存。" : "正在检查内置离线英语语音引擎。"}</span></div></div>
            <div className="engine-files"><div><span>运行程序</span><strong>{piper.executableName || "尚未选择"}</strong><button onClick={() => onChoosePiper("executable")}>{piper.executableName ? "更换" : "选择程序"}</button></div><div><span>语音模型</span><strong>{piper.modelName || "尚未选择"}</strong><button onClick={() => onChoosePiper("model")}>{piper.modelName ? "更换" : "选择模型"}</button></div></div>
            <p className="settings-footnote">Windows 安装包已包含引擎和语音模型，无需手动配置。只有更换自定义语音时才需要选择其他文件。</p>
          </div>
        )}
        <div className="system-voice-settings">
          <div className="system-voice-copy"><strong>系统本地语音</strong><span>{localVoice ? `${localVoice.name} · ${localVoice.lang}` : "未检测到系统离线语音"}</span></div>
          <div className="voice-controls">
            <label className="setting-select-wrap"><span className="visually-hidden">选择系统语音</span><select value={data.settings.voiceURI} onChange={(event) => onVoiceChange(event.target.value)} disabled={voices.length === 0}><option value="">自动选择英文语音</option>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label>
            <label className="rate-control"><span>语速</span><input type="range" min="0.65" max="1.2" step="0.05" value={data.settings.speechRate} onChange={(event) => onRateChange(Number(event.target.value))} /><strong>{data.settings.speechRate.toFixed(2)}×</strong></label>
          </div>
        </div>
        <div className="speech-troubleshooting"><Icon name="spark" size={16} /><p>{isDesktop ? "如果播放没有声音，请重新安装 Windows 版词场，再试听系统离线语音。模型不可用时，应用会显示提示，不会静默跳过。" : "浏览器版只能使用本机浏览器暴露的离线语音。内置神经语音随 Windows 桌面版提供。"}</p></div>
      </div>

      <div className="settings-section plan-settings">
        <div className="settings-section-heading"><div className="settings-icon"><Icon name="spark" size={19} /></div><div><h2>每日计划</h2><p>设定每天首次学习的新词数量，已到期复习不计入新词上限。</p></div></div>
        <label className="goal-setting"><span>每天最多接触的新词</span><select value={data.settings.dailyGoal} onChange={(event) => onGoalChange(Number(event.target.value))}>{[5, 10, 15, 20, 30, 50].map((value) => <option key={value} value={value}>{value} 个</option>)}</select><span className="goal-progress">今日已学习 {today.newIntroduced} 个新词</span></label>
      </div>

      <div className="settings-section backup-settings">
        <div className="settings-section-heading"><div className="settings-icon"><Icon name="folder" size={19} /></div><div><h2>本地数据与备份</h2><p>词库和学习进度分别记录。完整备份可在另一台兼容设备上恢复。</p></div></div>
        <div className="storage-location"><div><span>保存位置</span><strong>{isDesktop ? desktopPath || "正在读取应用数据目录…" : "此浏览器的本地存储"}</strong><small>{wordsCount} 个词条 · 不需要账号或云端</small></div>{isDesktop && <button className="outline-action" onClick={onOpenFolder}><Icon name="folder" size={16} />打开文件夹</button>}</div>
        <div className="backup-actions"><button className="primary-action" onClick={onExportBackup}><Icon name="download" size={17} />导出完整备份</button><button className="outline-action" onClick={onExportWords}><Icon name="file" size={17} />仅导出 CSV 词库</button><label className="outline-action restore-action"><Icon name="upload" size={16} />恢复完整备份<input key={restoreInputKey} type="file" accept=".json,application/json" onChange={onRestore} /></label></div>
        <div className="backup-warning"><span>恢复完整备份会替换当前词库和学习记录。恢复前请先导出一份当前备份。</span></div>
      </div>
      <div className="about-line"><span>词场 · Local Word Studio</span><span>本地优先 · 无遥测 · 无网络服务</span></div>
    </section>
  );
}

function WordModal({
  draft,
  editing,
  onChange,
  onAudio,
  onClose,
  onSubmit,
}: {
  draft: WordDraft;
  editing: boolean;
  onChange: (draft: WordDraft) => void;
  onAudio: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const update = (field: keyof WordDraft, value: string) => onChange({ ...draft, [field]: value });
  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="word-modal animate-word" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="word-modal-title">
        <div className="modal-heading"><div><span className="eyebrow"><span className="eyebrow-line" />WORD ENTRY</span><h2 id="word-modal-title">{editing ? "编辑词条" : "添加一个新词"}</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="关闭"><Icon name="close" /></button></div>
        <div className="modal-fields">
          <label className="field-label field-full">英文单词 <span>必填</span><input autoFocus value={draft.word} onChange={(event) => update("word", event.target.value)} placeholder="例如：serendipity" required /></label>
          <label className="field-label">中文释义<input value={draft.meaning} onChange={(event) => update("meaning", event.target.value)} placeholder="一个或多个释义" /></label>
          <label className="field-label">词性<input value={draft.partOfSpeech} onChange={(event) => update("partOfSpeech", event.target.value)} placeholder="noun / verb / adjective" /></label>
          <label className="field-label">音标<input value={draft.phonetic} onChange={(event) => update("phonetic", event.target.value)} placeholder="/ˌser.ənˈdɪp.ə.ti/" /></label>
          <label className="field-label">英文例句<textarea value={draft.example} onChange={(event) => update("example", event.target.value)} placeholder="每行一个例句" rows={2} /></label>
          <label className="field-label">例句翻译<textarea value={draft.translation} onChange={(event) => update("translation", event.target.value)} placeholder="与上方例句逐行对应" rows={2} /></label>
          <div className="audio-upload-field"><div><strong>本地录音 <span>可选</span></strong><p>{draft.audioData ? "已附加录音，播放时将优先使用。" : "可附加 1 MB 以内的音频；没有录音时仍会使用离线语音。"}</p></div><label className="outline-action"><Icon name="speaker" size={15} />{draft.audioData ? "更换录音" : "选择音频"}<input type="file" accept="audio/*" onChange={onAudio} /></label>{draft.audioData && <button type="button" className="remove-audio" onClick={() => onChange({ ...draft, audioData: undefined })}>移除</button>}</div>
        </div>
        <div className="modal-footer"><span>* 词条保存后会自动尝试播放发音。</span><button type="button" className="text-action" onClick={onClose}>取消</button><button type="submit" className="primary-action"><Icon name="check" size={17} />保存词条</button></div>
      </form>
    </div>
  );
}

export default App;
