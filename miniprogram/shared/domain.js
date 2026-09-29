// Shared, pure vocabulary and count-based review rules used by desktop and WeChat.
const MASTERY_STREAK = 2;
const REVIEW_GAPS = [12, 24, 48, 96, 192, 384];
const RETRY_GAP = 2;
const MAX_SESSION_ATTEMPTS = 6;
const count = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(value)))) : fallback;
const starterEntries = [
  ["serendipity", "意外发现珍奇事物的本领；机缘巧合", "noun", "/ˌser.ənˈdɪp.ə.ti/", "A little serendipity brought them together.", "一次偶然的机缘让他们相遇。"],
  ["resilient", "有韧性的；能迅速恢复的", "adjective", "/rɪˈzɪl.jənt/", "She stayed resilient through every setback.", "面对每一次挫折，她都保持着韧性。"],
  ["subtle", "微妙的；不易察觉的", "adjective", "/ˈsʌt.əl/", "There is a subtle difference in meaning.", "两者的含义有细微差别。"],
  ["immerse", "使沉浸；使专心于", "verb", "/ˈɪmɝːs/", "Try to immerse yourself in the language.", "试着让自己沉浸在这门语言里。"],
  ["eloquent", "雄辩的；表达清晰有力的", "adjective", "/ˈel.ə.kwənt/", "His silence was more eloquent than words.", "他的沉默胜过千言万语。"],
  ["wander", "漫步；徘徊；走神", "verb", "/ˈwɑːn.dɚ/", "We wandered through the old streets.", "我们漫步在老街之间。"],
  ["vivid", "生动的；鲜明的", "adjective", "/ˈvɪv.ɪd/", "I still have a vivid memory of that day.", "那一天至今仍留在我的鲜明记忆里。"],
  ["nourish", "滋养；培育", "verb", "/ˈnɝː.ɪʃ/", "Good habits nourish a curious mind.", "好习惯滋养着好奇的心灵。"],
  ["tranquil", "宁静的；平和的", "adjective", "/ˈtræŋ.kwɪl/", "The lake looked tranquil at dawn.", "黎明时的湖面显得宁静平和。"],
  ["compass", "指南针；行动准则", "noun", "/ˈkʌm.pəs/", "Curiosity became her moral compass.", "好奇心成了她的行事准则。"],
  ["abundant", "充裕的；丰富的", "adjective", "/əˈbʌn.dənt/", "Wildlife is abundant in this valley.", "这个山谷里野生动物资源丰富。"],
  ["precise", "准确的；精确的", "adjective", "/prɪˈsaɪs/", "Please give me a precise answer.", "请给我一个准确的回答。"],
  ["hesitate", "犹豫；迟疑", "verb", "/ˈhez.ɪteɪt/", "Don't hesitate to ask for help.", "需要帮助时尽管开口。"],
  ["essential", "必不可少的；本质的", "adjective", "/ɪˈsen.ʃəl/", "Water is essential for all life.", "水是所有生命必不可少的。"],
  ["glimpse", "一瞥；短暂感受", "noun", "/ɡlɪmps/", "We caught a glimpse of the sea.", "我们瞥见了一角海面。"],
  ["cultivate", "培养；耕作；建立", "verb", "/ˈkʌltɪveɪt/", "Reading can cultivate empathy.", "阅读可以培养共情能力。"],
  ["deliberate", "深思熟虑的；故意的", "adjective", "/dɪˈlɪb.ɚ.ət/", "She made a deliberate choice to slow down.", "她经过深思熟虑，决定放慢脚步。"],
  ["perspective", "视角；观点；透视法", "noun", "/pɚˈspek.tɪv/", "Travel gives you a fresh perspective.", "旅行会带来全新的视角。"],
];
const todayKey = (date = new Date()) => `${date.getFullYear()}-${`${date.getMonth()+1}`.padStart(2,"0")}-${`${date.getDate()}`.padStart(2,"0")}`;
const emptyDailyStats = () => ({ answered: 0, known: 0, fuzzy: 0, again: 0, newIntroduced: 0, reviewIntroduced: 0, seenIds: [] });
function createInitialData() {
  const now = Date.now();
  return { version: 1, reviewCount: 0, words: starterEntries.map(([word, meaning, partOfSpeech, phonetic, example, translation], i) => ({ id:`starter-${i+1}`, word, meaning, partOfSpeech, phonetic, example, translation, status:"new", createdAt:now+i, repetitions:0, correctStreak:0, reviewBox:0, reviewAtCount:0 })), studyDays:{}, activeSession:null, settings:{dailyGoal:10,dailyReviewGoal:30,speechRate:0.9,voiceURI:""} };
}
const isDue = (word, count) => word.status === "learning" || (word.status === "mastered" && word.reviewAtCount <= count);
function createSession(data, date = todayKey(), extraPractice = false) {
  const day = data.studyDays[date] || emptyDailyStats();
  const seen = new Set(day.seenIds || []);
  let capacity = Math.max(0, data.settings.dailyReviewGoal - day.reviewIntroduced);
  const due = data.words.filter(w => isDue(w, data.reviewCount)).sort((a,b) =>
    (a.status === "learning" ? 0 : 1) - (b.status === "learning" ? 0 : 1) || a.reviewAtCount - b.reviewAtCount
  ).filter(w => {
    // Unfinished learning and today's already-counted words never consume another quota.
    if (w.status === "learning" || seen.has(w.id)) return true;
    if (capacity > 0) { capacity--; return true; }
    return false;
  });
  const fresh = data.words.filter(w => w.status === "new").sort((a,b) => a.createdAt-b.createdAt)
    .slice(0, Math.max(0, data.settings.dailyGoal - day.newIntroduced));
  const fallback = extraPractice && !due.length && !fresh.length
    ? data.words.filter(w => w.status !== "new").sort((a,b) => a.reviewAtCount-b.reviewAtCount).slice(0,10) : [];
  return { date, ids:[...due,...fresh,...fallback].map(w=>w.id), seenIds:[], index:0,
    mode:data.activeSession?.mode || "word-first", feedback:null, attempts:{}, deferredIds:[], extraPractice:fallback.length > 0 };
}
function answer(data, wordId, rating, date = todayKey()) {
  const session = data.activeSession, word = data.words.find(w=>w.id===wordId);
  if (!session || !word || session.feedback || session.ids[session.index] !== wordId || !["again","fuzzy","known"].includes(rating)) return data;
  const nextCount = data.reviewCount + 1;
  const streak = rating === "known" ? word.correctStreak + 1 : 0;
  const status = rating === "known" && (word.status === "mastered" || streak >= MASTERY_STREAK) ? "mastered" : "learning";
  const box = rating === "again" ? Math.max(0,word.reviewBox-2)
    : rating === "fuzzy" ? Math.max(0,word.reviewBox-1)
    : status === "mastered" ? Math.max(1,Math.min(REVIEW_GAPS.length,word.reviewBox+(word.status === "mastered"?1:0))) : word.reviewBox;
  const gap = status === "mastered" ? REVIEW_GAPS[box-1] : rating === "again" ? RETRY_GAP : rating === "fuzzy" ? 4 : 6;
  const attempts = {...session.attempts, [wordId]:(session.attempts?.[wordId] || 0)+1};
  // Remove any stale duplicate retries before inserting exactly one new retry.
  const ids = [...session.ids.slice(0,session.index+1), ...session.ids.slice(session.index+1).filter(id=>id!==wordId)];
  const deferred = status === "learning" && attempts[wordId] >= MAX_SESSION_ATTEMPTS;
  let intervening = 0;
  if (status === "learning" && !deferred) {
    const position = Math.min(ids.length, session.index+1+gap);
    intervening = position-session.index-1;
    ids.splice(position,0,wordId);
  }
  const message = deferred ? "这个词本轮已练 6 次，先休息一下；它会保留在待复习中。"
    : status === "learning" ? intervening ? `先练 ${intervening} 道其他题，再复习这个词。` : "本轮已没有其他词，下一题会再练这个词。"
    : `已进入巩固，再完成约 ${gap} 次答题后复习。`;
  const stats = data.studyDays[date] || emptyDailyStats();
  const daySeen = stats.seenIds || session.seenIds || [];
  const first = !daySeen.includes(wordId);
  const before = {
    date, wordId, reviewCount:data.reviewCount, day:stats,
    schedule:Object.fromEntries(["status","repetitions","correctStreak","reviewBox","reviewAtCount"].map(k=>[k,word[k]])),
    session:{...session,feedback:null},
  };
  return {...data, reviewCount:nextCount,
    words:data.words.map(w=>w.id===wordId?{...w,status,repetitions:w.repetitions+1,correctStreak:streak,reviewBox:box,reviewAtCount:nextCount+gap}:w),
    studyDays:{...data.studyDays,[date]:{...stats,answered:stats.answered+1,
      known:stats.known+(rating==="known"?1:0), fuzzy:(stats.fuzzy||0)+(rating==="fuzzy"?1:0), again:stats.again+(rating==="again"?1:0),
      newIntroduced:stats.newIntroduced+(first&&word.status==="new"?1:0),
      reviewIntroduced:stats.reviewIntroduced+(first&&word.status!=="new"?1:0),
      seenIds:first?[...daySeen,wordId]:daySeen}},
    activeSession:{...session,ids,attempts,deferredIds:deferred?[...new Set([...(session.deferredIds||[]),wordId])]:session.deferredIds||[],
      seenIds:session.seenIds.includes(wordId)?session.seenIds:[...session.seenIds,wordId], feedback:{wordId,rating,message,undo:before}}};
}
function undoAnswer(data) {
  const previous = data.activeSession?.feedback?.undo;
  if (!previous || previous.date !== todayKey()) return data;
  return {...data,reviewCount:previous.reviewCount,
    words:data.words.map(w=>w.id===previous.wordId?{...w,...previous.schedule}:w),
    studyDays:{...data.studyDays,[previous.date]:previous.day},activeSession:previous.session};
}
function regradeAnswer(data, rating) {
  const id = data.activeSession?.feedback?.wordId;
  const restored = undoAnswer(data);
  return restored === data ? data : answer(restored,id,rating);
}
function continueSession(data) { return data.activeSession?.feedback ? {...data,activeSession:{...data.activeSession,index:data.activeSession.index+1,feedback:null}} : data; }
function decodeAppData(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || value.version !== 1 || !Array.isArray(value.words)) return null;
    const reviewCount = count(value.reviewCount);
    const wordIds = new Set();
    const words = value.words.filter(w => {
      if (!w || typeof w.id!=="string" || !w.id || typeof w.word!=="string" || !w.word.trim() || wordIds.has(w.id)) return false;
      wordIds.add(w.id);return true;
    }).map(entry => {
      const status = entry.status === "learning" || entry.status === "mastered" ? entry.status : "new";
      return {
        id: entry.id, word: entry.word.trim(), meaning: typeof entry.meaning === "string" ? entry.meaning : "",
        partOfSpeech: typeof entry.partOfSpeech === "string" ? entry.partOfSpeech : "",
        phonetic: typeof entry.phonetic === "string" ? entry.phonetic : "",
        example: typeof entry.example === "string" ? entry.example : "",
        translation: typeof entry.translation === "string" ? entry.translation : "",
        audioData: typeof entry.audioData === "string" && entry.audioData.startsWith("data:audio/") ? entry.audioData : undefined,
        audioPath: typeof entry.audioPath === "string" ? entry.audioPath : undefined,
        status, createdAt: Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now(),
        repetitions: count(entry.repetitions),
        correctStreak: Number.isFinite(entry.correctStreak) ? Math.max(0, Number(entry.correctStreak)) : status === "mastered" ? 3 : 0,
        reviewBox: Number.isFinite(entry.reviewBox) ? Math.min(REVIEW_GAPS.length, Math.max(0, Math.floor(Number(entry.reviewBox)))) : status === "mastered" ? 1 : 0,
        reviewAtCount: Number.isFinite(entry.reviewAtCount) ? Math.max(0, Number(entry.reviewAtCount)) : status === "mastered" ? reviewCount + 12 : reviewCount,
      };
    });
    const settings = value.settings || {};
    const studyDays = {};
    if (value.studyDays && typeof value.studyDays === "object") for (const [key, rawStats] of Object.entries(value.studyDays)) {
      if (!rawStats || typeof rawStats !== "object") continue;
      studyDays[key] = Object.fromEntries(["answered", "known", "fuzzy", "again", "newIntroduced", "reviewIntroduced"].map(field => [field, count(rawStats[field])]));
      studyDays[key].seenIds = Array.isArray(rawStats.seenIds) ? [...new Set(rawStats.seenIds.filter(id=>typeof id==="string"))] : [];
    }
    let activeSession = null;
    const rawSession = value.activeSession;
    if (rawSession && typeof rawSession.date === "string" && Array.isArray(rawSession.ids)) {
      let ids = rawSession.ids.filter(id => typeof id === "string" && words.some(word => word.id === id));
      const index = rawSession.ids.slice(0,count(rawSession.index)).filter(id=>wordIds.has(id)).length;
      const feedback = rawSession.feedback && typeof rawSession.feedback.wordId === "string" && ids[index] === rawSession.feedback.wordId && ["known","again","fuzzy"].includes(rawSession.feedback.rating) ? { wordId: rawSession.feedback.wordId, rating: rawSession.feedback.rating, message:typeof rawSession.feedback.message==="string"?rawSession.feedback.message:"进度已保存，可继续学习。" } : null;
      activeSession = { date:rawSession.date, ids, seenIds:Array.isArray(rawSession.seenIds)?rawSession.seenIds.filter(id=>typeof id==="string"&&words.some(word=>word.id===id)):feedback?[feedback.wordId]:[], index, mode:rawSession.mode==="audio-first"?"audio-first":"word-first", feedback };
      activeSession.attempts = Object.fromEntries(Object.entries(rawSession.attempts || {}).filter(([id])=>words.some(w=>w.id===id)).map(([id,n])=>[id,Math.max(0,Math.min(100,Math.floor(Number(n)||0)))]));
      activeSession.deferredIds = Array.isArray(rawSession.deferredIds)?rawSession.deferredIds.filter(id=>words.some(w=>w.id===id)):[];
      const day = studyDays[activeSession.date];
      if (day) day.seenIds = [...new Set([...day.seenIds,...activeSession.seenIds])];
    }
    return {
      version:1, reviewCount, words, studyDays, activeSession,
      settings:{ dailyGoal:Math.max(0,Math.min(500,Number.isFinite(settings.dailyGoal)?Number(settings.dailyGoal):10)), dailyReviewGoal:Math.max(0,Math.min(500,Number.isFinite(settings.dailyReviewGoal)?Number(settings.dailyReviewGoal):30)), speechRate:Math.max(0.65,Math.min(1.2,Number(settings.speechRate)||0.9)), voiceURI:typeof settings.voiceURI==="string"?settings.voiceURI:"" },
    };
  } catch { return null; }
}
function lookupStarterWord(word) {const row=starterEntries.find(x=>x[0].toLowerCase()===word.trim().toLowerCase());return row?{meaning:row[1],partOfSpeech:row[2],phonetic:row[3],example:row[4],translation:row[5]}:undefined;}
module.exports={MASTERY_STREAK,isDue,todayKey,emptyDailyStats,createInitialData,createSession,answer,undoAnswer,regradeAnswer,continueSession,decodeAppData,lookupStarterWord};
