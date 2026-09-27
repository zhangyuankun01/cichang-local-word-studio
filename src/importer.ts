export type ImportedWord = {
  word: string;
  meaning: string;
  partOfSpeech: string;
  phonetic: string;
  example: string;
  translation: string;
  audioData?: string;
  line: number;
};

export type ImportProblem = { line: number; value: string; reason: string };
export type ParseResult = { rows: ImportedWord[]; invalid: ImportProblem[]; error?: string };

type CsvRecord = { cells: string[]; line: number };

const aliases: Record<keyof Omit<ImportedWord, "line">, string[]> = {
  word: ["word", "english", "englishword", "term", "英文", "单词", "词汇"],
  meaning: ["meaning", "definition", "gloss", "chinesemeaning", "meaningcn", "中文", "中文释义", "释义", "含义", "意思"],
  partOfSpeech: ["pos", "partofspeech", "词性"],
  phonetic: ["phonetic", "ipa", "pronunciation", "音标"],
  example: ["example", "sentence", "例句"],
  translation: ["translation", "exampletranslation", "sentencetranslation", "例句中文", "例句翻译", "例句译文"],
  audioData: ["audio", "audiodata", "audiouri", "音频"],
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_-]/g, "");
const emptyRow = (line: number): ImportedWord => ({
  word: "",
  meaning: "",
  partOfSpeech: "",
  phonetic: "",
  example: "",
  translation: "",
  line,
});

function parseCsv(source: string): { records: CsvRecord[]; error?: string } {
  const text = source.replace(/^\uFEFF/, "");
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    cells.push(field.trim());
    if (cells.some((cell) => cell.length > 0)) records.push({ cells, line: recordLine });
    cells = [];
    field = "";
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += character;
        if (character === "\n") line += 1;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        cells.push(field.trim());
        field = "";
        afterQuote = false;
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        finishRecord();
        line += 1;
        afterQuote = false;
      } else if (/\s/.test(character)) {
        continue;
      } else {
        return { records, error: `CSV 第 ${line} 行的引号后有多余字符。` };
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      return { records, error: `CSV 第 ${line} 行有未转义的双引号。` };
    } else if (character === ",") {
      cells.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRecord();
      line += 1;
    } else {
      field += character;
    }
  }

  if (quoted) return { records, error: "CSV 文件中有未闭合的双引号，请检查对应行。" };
  if (field.length > 0 || cells.length > 0) finishRecord();
  return { records };
}

function findHeaderIndexes(cells: string[]) {
  const normalized = cells.map(normalizeHeader);
  const indexes: Partial<Record<keyof Omit<ImportedWord, "line">, number>> = {};
  let recognized = false;

  for (const [field, names] of Object.entries(aliases) as [keyof Omit<ImportedWord, "line">, string[]][]) {
    const index = normalized.findIndex((value) => names.map(normalizeHeader).includes(value));
    if (index >= 0) {
      indexes[field] = index;
      recognized = true;
    }
  }
  const genericTranslation = normalized.indexOf("translation");
  if (genericTranslation >= 0) {
    if (indexes.meaning === undefined) {
      indexes.meaning = genericTranslation;
      delete indexes.translation;
    } else {
      indexes.translation = genericTranslation;
    }
  }
  return { indexes, recognized };
}

function mapCells(cells: string[], line: number, indexes: Partial<Record<keyof Omit<ImportedWord, "line">, number>>) {
  const row = emptyRow(line);
  for (const field of Object.keys(aliases) as (keyof Omit<ImportedWord, "line">)[]) {
    const index = indexes[field];
    if (index !== undefined && cells[index] !== undefined) row[field] = cells[index].trim();
  }
  if (row.audioData && !row.audioData.startsWith("data:audio/")) row.audioData = "";
  return row;
}

const validEnglishTerm = (word: string) =>
  /[A-Za-z\u00C0-\u024F]/.test(word) && /^[A-Za-z\u00C0-\u024F]+(?:[ '\u2019-][A-Za-z\u00C0-\u024F]+)*$/.test(word);

function validateRows(candidates: ImportedWord[]): ParseResult {
  const rows: ImportedWord[] = [];
  const invalid: ImportProblem[] = [];
  for (const row of candidates) {
    const word = row.word.trim();
    if (!word) {
      invalid.push({ line: row.line, value: "", reason: "缺少英文单词" });
    } else if (!validEnglishTerm(word)) {
      invalid.push({ line: row.line, value: word, reason: "单词只能包含英文字母、空格、连字符或撇号" });
    } else {
      rows.push({ ...row, word });
    }
  }
  return { rows, invalid };
}

export function parseVocabularyFile(filename: string, source: string): ParseResult {
  const extension = filename.split(".").pop()?.toLowerCase();
  const text = source.replace(/^\uFEFF/, "");

  if (extension === "json") {
    try {
      const parsed = JSON.parse(text) as unknown;
      const values = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "words" in parsed && Array.isArray((parsed as { words: unknown[] }).words)
          ? (parsed as { words: unknown[] }).words
          : null;
      if (!values) return { rows: [], invalid: [], error: "JSON 需为词条数组，或包含 words 数组的对象。" };
      const candidates: ImportedWord[] = values.map((item, index) => {
        if (typeof item === "string") return { ...emptyRow(index + 1), word: item.trim() };
        if (!item || typeof item !== "object") return emptyRow(index + 1);
        const object = item as Record<string, unknown>;
        const headers = Object.keys(object);
        const { indexes } = findHeaderIndexes(headers);
        const cells = headers.map((header) => String(object[header] ?? ""));
        return mapCells(cells, index + 1, indexes);
      });
      return validateRows(candidates);
    } catch {
      return { rows: [], invalid: [], error: "JSON 格式无法解析，请检查括号、逗号和引号。" };
    }
  }

  if (extension === "txt") {
    const candidates = text.split(/\r?\n/).map((line, index) => {
      const cells = line.split("\t");
      return {
        ...emptyRow(index + 1),
        word: cells[0]?.trim() ?? "",
        meaning: cells[1]?.trim() ?? "",
        partOfSpeech: cells[2]?.trim() ?? "",
        phonetic: cells[3]?.trim() ?? "",
        example: cells[4]?.trim() ?? "",
        translation: cells[5]?.trim() ?? "",
      };
    }).filter((row) => row.word || row.meaning || row.partOfSpeech || row.phonetic || row.example || row.translation);
    return validateRows(candidates);
  }

  if (extension !== "csv") return { rows: [], invalid: [], error: "目前支持 CSV、TXT 和 JSON 文件。" };

  const parsed = parseCsv(text);
  if (parsed.error) return { rows: [], invalid: [], error: parsed.error };
  if (parsed.records.length === 0) return { rows: [], invalid: [], error: "文件为空。" };

  const first = findHeaderIndexes(parsed.records[0].cells);
  if (first.recognized && first.indexes.word === undefined) {
    return { rows: [], invalid: [], error: "检测到表头，但没有找到单词列。请使用 word 或 单词 作为列名。" };
  }
  const hasHeader = first.indexes.word !== undefined;
  const indexes = hasHeader
    ? first.indexes
    : { word: 0, meaning: 1, partOfSpeech: 2, phonetic: 3, example: 4, translation: 5 };
  const records = hasHeader ? parsed.records.slice(1) : parsed.records;
  return validateRows(records.map(({ cells, line }) => mapCells(cells, line, indexes)));
}