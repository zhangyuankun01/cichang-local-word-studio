export type PracticeMode = "word-first" | "audio-first";
export type WordStatus = "new" | "learning" | "mastered";
export type Rating = "known" | "again";

export type WordEntry = {
  id: string;
  word: string;
  meaning: string;
  partOfSpeech: string;
  phonetic: string;
  example: string;
  translation: string;
  audioData?: string;
  status: WordStatus;
  createdAt: number;
  repetitions: number;
  correctStreak: number;
  reviewBox: number;
  reviewAtCount: number;
};

export type DailyStats = {
  answered: number;
  known: number;
  again: number;
  newIntroduced: number;
  reviewIntroduced: number;
};

export type SessionFeedback = {
  wordId: string;
  rating: Rating;
};

export type ActiveSession = {
  date: string;
  ids: string[];
  seenIds: string[];
  index: number;
  mode: PracticeMode;
  feedback: SessionFeedback | null;
};

export type AppData = {
  version: 1;
  reviewCount: number;
  words: WordEntry[];
  studyDays: Record<string, DailyStats>;
  activeSession: ActiveSession | null;
  settings: {
    dailyGoal: number;
    dailyReviewGoal: number;
    speechRate: number;
    voiceURI: string;
  };
};

export const todayKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const starterEntries = [
  ["serendipity", "意外发现珍奇事物的本领；机缘巧合", "noun", "/ˌser.ənˈdɪp.ə.ti/", "A little serendipity brought them together.", "一次偶然的机缘让他们相遇。"],
  ["resilient", "有韧性的；能迅速恢复的", "adjective", "/rɪˈzɪl.jənt/", "She stayed resilient through every setback.", "面对每一次挫折，她都保持着韧性。"],
  ["subtle", "微妙的；不易察觉的", "adjective", "/ˈsʌt.əl/", "There is a subtle difference in meaning.", "两者的含义有细微差别。"],
  ["immerse", "使沉浸；使专心于", "verb", "/ɪˈmɜːrs/", "Try to immerse yourself in the language.", "试着让自己沉浸在这门语言里。"],
  ["eloquent", "雄辩的；表达清晰有力的", "adjective", "/ˈel.ə.kwənt/", "His silence was more eloquent than words.", "他的沉默胜过千言万语。"],
  ["wander", "漫步；徘徊；走神", "verb", "/ˈwɑːn.dɚ/", "We wandered through the old streets.", "我们漫步在老街之间。"],
  ["vivid", "生动的；鲜明的", "adjective", "/ˈvɪv.ɪd/", "I still have a vivid memory of that day.", "那一天至今仍留在我的鲜明记忆里。"],
  ["nourish", "滋养；培育", "verb", "/ˈnɝː.ɪʃ/", "Good habits nourish a curious mind.", "好习惯滋养着好奇的心灵。"],
  ["tranquil", "宁静的；平和的", "adjective", "/ˈtræŋ.kwɪl/", "The lake looked tranquil at dawn.", "黎明时的湖面显得宁静平和。"],
  ["compass", "指南针；行动准则", "noun", "/ˈkʌm.pəs/", "Curiosity became her moral compass.", "好奇心成了她的行事准则。"],
  ["abundant", "充裕的；丰富的", "adjective", "/əˈbʌn.dənt/", "Wildlife is abundant in this valley.", "这个山谷里野生动物资源丰富。"],
  ["precise", "准确的；精确的", "adjective", "/prɪˈsaɪs/", "Please give me a precise answer.", "请给我一个准确的回答。"],
  ["hesitate", "犹豫；迟疑", "verb", "/ˈhez.ə.teɪt/", "Don't hesitate to ask for help.", "需要帮助时尽管开口。"],
  ["essential", "必不可少的；本质的", "adjective", "/ɪˈsen.ʃəl/", "Water is essential for all life.", "水是所有生命必不可少的。"],
  ["glimpse", "一瞥；短暂感受", "noun", "/ɡlɪmps/", "We caught a glimpse of the sea.", "我们瞥见了一角海面。"],
  ["cultivate", "培养；耕作；建立", "verb", "/ˈkʌl.tə.veɪt/", "Reading can cultivate empathy.", "阅读可以培养共情能力。"],
  ["deliberate", "深思熟虑的；故意的", "adjective", "/dɪˈlɪb.ɚ.ət/", "She made a deliberate choice to slow down.", "她经过深思熟虑，决定放慢脚步。"],
  ["perspective", "视角；观点；透视法", "noun", "/pɚˈspek.tɪv/", "Travel gives you a fresh perspective.", "旅行会带来全新的视角。"],
];

export function createInitialData(): AppData {
  const now = Date.now();
  return {
    version: 1,
    reviewCount: 0,
    words: starterEntries.map(([word, meaning, partOfSpeech, phonetic, example, translation], index) => ({
      id: `starter-${index + 1}`,
      word,
      meaning,
      partOfSpeech,
      phonetic,
      example,
      translation,
      status: "new",
      createdAt: now + index,
      repetitions: 0,
      correctStreak: 0,
      reviewBox: 0,
      reviewAtCount: 0,
    })),
    studyDays: {},
    activeSession: null,
    settings: { dailyGoal: 10, dailyReviewGoal: 30, speechRate: 0.9, voiceURI: "" },
  };
}

export function lookupStarterWord(word: string): Pick<WordEntry, "meaning" | "partOfSpeech" | "phonetic" | "example" | "translation"> | undefined {
  const entry = starterEntries.find((item) => item[0].toLocaleLowerCase() === word.trim().toLocaleLowerCase());
  if (!entry) return undefined;
  return {
    meaning: entry[1],
    partOfSpeech: entry[2],
    phonetic: entry[3],
    example: entry[4],
    translation: entry[5],
  };
}

export function emptyDailyStats(): DailyStats {
  return { answered: 0, known: 0, again: 0, newIntroduced: 0, reviewIntroduced: 0 };
}

export function decodeAppData(raw: string | null): AppData | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AppData>;
    if (value.version !== 1 || !Array.isArray(value.words)) return null;
    const reviewCount = Math.max(0, Number(value.reviewCount) || 0);
    const words = value.words
      .filter((word) => Boolean(word && typeof word.id === "string" && typeof word.word === "string"))
      .map((word) => {
        const entry = word as Partial<WordEntry>;
        const status: WordStatus = entry.status === "learning" || entry.status === "mastered" ? entry.status : "new";
        return {
          id: entry.id!,
          word: entry.word!.trim(),
          meaning: typeof entry.meaning === "string" ? entry.meaning : "",
          partOfSpeech: typeof entry.partOfSpeech === "string" ? entry.partOfSpeech : "",
          phonetic: typeof entry.phonetic === "string" ? entry.phonetic : "",
          example: typeof entry.example === "string" ? entry.example : "",
          translation: typeof entry.translation === "string" ? entry.translation : "",
          audioData: typeof entry.audioData === "string" && entry.audioData.startsWith("data:audio/") ? entry.audioData : undefined,
          status,
          createdAt: Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now(),
          repetitions: Math.max(0, Number(entry.repetitions) || 0),
          correctStreak: Number.isFinite(entry.correctStreak)
            ? Math.max(0, Number(entry.correctStreak))
            : status === "mastered" ? 3 : 0,
          reviewBox: Number.isFinite(entry.reviewBox)
            ? Math.min(5, Math.max(0, Math.floor(Number(entry.reviewBox))))
            : status === "mastered" ? 1 : 0,
          reviewAtCount: Number.isFinite(entry.reviewAtCount)
            ? Math.max(0, Number(entry.reviewAtCount))
            : status === "mastered" ? reviewCount + 12 : reviewCount,
        } satisfies WordEntry;
      });
    const settings = value.settings ?? { dailyGoal: 10, dailyReviewGoal: 30, speechRate: 0.9, voiceURI: "" };
    const studyDays: Record<string, DailyStats> = {};
    if (value.studyDays && typeof value.studyDays === "object") {
      for (const [key, rawStats] of Object.entries(value.studyDays)) {
        if (!rawStats || typeof rawStats !== "object") continue;
        const stats = rawStats as Partial<DailyStats>;
        studyDays[key] = {
          answered: Math.max(0, Number(stats.answered) || 0),
          known: Math.max(0, Number(stats.known) || 0),
          again: Math.max(0, Number(stats.again) || 0),
          newIntroduced: Math.max(0, Number(stats.newIntroduced) || 0),
          reviewIntroduced: Math.max(0, Number(stats.reviewIntroduced) || 0),
        };
      }
    }
    const rawSession = value.activeSession;
    let activeSession: ActiveSession | null = null;
    if (rawSession && typeof rawSession.date === "string" && Array.isArray(rawSession.ids)) {
      let ids = rawSession.ids.filter((id): id is string =>
        typeof id === "string" && words.some((word) => word.id === id),
      );
      const feedback = rawSession.feedback
        && typeof rawSession.feedback.wordId === "string"
        && ids.includes(rawSession.feedback.wordId)
        && (rawSession.feedback.rating === "known" || rawSession.feedback.rating === "again")
        ? { wordId: rawSession.feedback.wordId, rating: rawSession.feedback.rating }
        : null;
      if (feedback && ids.filter((id) => id === feedback.wordId).length < 2) {
        const word = words.find((entry) => entry.id === feedback.wordId);
        if (feedback.rating === "again" || (word && word.status !== "mastered" && word.correctStreak < 3)) {
          ids = [...ids, feedback.wordId];
        }
      }
      activeSession = {
        date: rawSession.date,
        ids,
        seenIds: Array.isArray(rawSession.seenIds)
          ? rawSession.seenIds.filter((id): id is string => typeof id === "string" && words.some((word) => word.id === id))
          : feedback ? [feedback.wordId] : [],
        index: Math.min(ids.length, Math.max(0, Math.floor(Number(rawSession.index) || 0))),
        mode: rawSession.mode === "audio-first" ? "audio-first" : "word-first",
        feedback,
      };
    }
    return {
      version: 1,
      reviewCount,
      words,
      studyDays,
      activeSession,
      settings: {
        dailyGoal: Math.max(0, Math.min(500, Number.isFinite(settings.dailyGoal) ? Number(settings.dailyGoal) : 10)),
        dailyReviewGoal: Math.max(0, Math.min(500, Number.isFinite(settings.dailyReviewGoal) ? Number(settings.dailyReviewGoal) : 30)),
        speechRate: Math.max(0.65, Math.min(1.2, Number(settings.speechRate) || 0.9)),
        voiceURI: typeof settings.voiceURI === "string" ? settings.voiceURI : "",
      },
    };
  } catch {
    return null;
  }
}

export function createSession(data: AppData, date = todayKey()): ActiveSession {
  const dayStats = data.studyDays[date] ?? emptyDailyStats();
  const due = data.words
    .filter((word) => word.status !== "new" && word.reviewAtCount <= data.reviewCount)
    .sort((a, b) => a.reviewAtCount - b.reviewAtCount || a.correctStreak - b.correctStreak)
    .slice(0, Math.max(0, data.settings.dailyReviewGoal - dayStats.reviewIntroduced));
  const newLimit = Math.max(0, data.settings.dailyGoal - dayStats.newIntroduced);
  const fresh = data.words
    .filter((word) => word.status === "new")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, newLimit);
  const reviewCapacity = Math.max(0, data.settings.dailyReviewGoal - dayStats.reviewIntroduced);
  const fallback = due.length === 0 && fresh.length === 0 && reviewCapacity > 0
    ? data.words
      .filter((word) => word.status !== "new")
      .sort((a, b) => a.reviewAtCount - b.reviewAtCount)
      .slice(0, 1)
    : [];

  return {
    date,
    ids: [...due, ...fresh, ...fallback].map((word) => word.id),
    seenIds: [],
    index: 0,
    mode: "word-first",
    feedback: null,
  };
}

export function formatDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}
