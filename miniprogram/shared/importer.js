// Generated from src/importer.ts by scripts/build-mini-shared.cjs.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVocabularyFile = parseVocabularyFile;
const aliases = {
    word: ["word", "english", "englishword", "term", "英文", "单词", "词汇"],
    meaning: ["meaning", "definition", "gloss", "chinesemeaning", "meaningcn", "中文", "中文释义", "释义", "含义", "意思"],
    partOfSpeech: ["pos", "partofspeech", "词性"],
    phonetic: ["phonetic", "ipa", "pronunciation", "音标"],
    example: ["example", "sentence", "例句"],
    translation: ["translation", "exampletranslation", "sentencetranslation", "例句中文", "例句翻译", "例句译文"],
    audioData: ["audio", "audiodata", "audiouri", "音频"],
};
const normalizeHeader = (value) => value.trim().toLowerCase().replace(/[\s_-]/g, "");
const emptyRow = (line) => ({
    word: "",
    meaning: "",
    partOfSpeech: "",
    phonetic: "",
    example: "",
    translation: "",
    line,
});
function parseCsv(source) {
    const text = source.replace(/^\uFEFF/, "");
    const records = [];
    let cells = [];
    let field = "";
    let quoted = false;
    let afterQuote = false;
    let line = 1;
    let recordLine = 1;
    const finishRecord = () => {
        cells.push(field.trim());
        if (cells.some((cell) => cell.length > 0))
            records.push({ cells, line: recordLine });
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
            }
            else if (character === '"') {
                quoted = false;
                afterQuote = true;
            }
            else {
                field += character;
                if (character === "\n")
                    line += 1;
            }
            continue;
        }
        if (afterQuote) {
            if (character === ",") {
                cells.push(field.trim());
                field = "";
                afterQuote = false;
            }
            else if (character === "\n" || character === "\r") {
                if (character === "\r" && text[index + 1] === "\n")
                    index += 1;
                finishRecord();
                line += 1;
                afterQuote = false;
            }
            else if (/\s/.test(character)) {
                continue;
            }
            else {
                return { records, error: `CSV 第 ${line} 行的引号后有多余字符。` };
            }
            continue;
        }
        if (character === '"' && field.length === 0) {
            quoted = true;
        }
        else if (character === '"') {
            return { records, error: `CSV 第 ${line} 行有未转义的双引号。` };
        }
        else if (character === ",") {
            cells.push(field.trim());
            field = "";
        }
        else if (character === "\n" || character === "\r") {
            if (character === "\r" && text[index + 1] === "\n")
                index += 1;
            finishRecord();
            line += 1;
        }
        else {
            field += character;
        }
    }
    if (quoted)
        return { records, error: "CSV 文件中有未闭合的双引号，请检查对应行。" };
    if (field.length > 0 || cells.length > 0)
        finishRecord();
    return { records };
}
function findHeaderIndexes(cells) {
    const normalized = cells.map(normalizeHeader);
    const indexes = {};
    let recognized = false;
    for (const [field, names] of Object.entries(aliases)) {
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
        }
        else {
            indexes.translation = genericTranslation;
        }
    }
    return { indexes, recognized };
}
function mapCells(cells, line, indexes) {
    const row = emptyRow(line);
    for (const field of Object.keys(aliases)) {
        const index = indexes[field];
        if (index !== undefined && cells[index] !== undefined)
            row[field] = cells[index].trim();
    }
    if (row.audioData && !row.audioData.startsWith("data:audio/"))
        row.audioData = "";
    return row;
}
const validEnglishTerm = (word) => /[A-Za-z\u00C0-\u024F]/.test(word) && /^[A-Za-z\u00C0-\u024F]+(?:[ '\u2019-][A-Za-z\u00C0-\u024F]+)*$/.test(word);
function validateRows(candidates) {
    const rows = [];
    const invalid = [];
    for (const row of candidates) {
        const word = row.word.trim();
        if (!word) {
            invalid.push({ line: row.line, value: "", reason: "缺少英文单词" });
        }
        else if (!validEnglishTerm(word)) {
            invalid.push({ line: row.line, value: word, reason: "单词只能包含英文字母、空格、连字符或撇号" });
        }
        else {
            rows.push({ ...row, word });
        }
    }
    return { rows, invalid };
}
function parseVocabularyFile(filename, source) {
    var _a;
    const extension = (_a = filename.split(".").pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    const text = source.replace(/^\uFEFF/, "");
    if (extension === "json") {
        try {
            const parsed = JSON.parse(text);
            const values = Array.isArray(parsed)
                ? parsed
                : parsed && typeof parsed === "object" && "words" in parsed && Array.isArray(parsed.words)
                    ? parsed.words
                    : null;
            if (!values)
                return { rows: [], invalid: [], error: "JSON 需为词条数组，或包含 words 数组的对象。" };
            const candidates = values.map((item, index) => {
                if (typeof item === "string")
                    return { ...emptyRow(index + 1), word: item.trim() };
                if (!item || typeof item !== "object")
                    return emptyRow(index + 1);
                const object = item;
                const headers = Object.keys(object);
                const { indexes } = findHeaderIndexes(headers);
                const cells = headers.map((header) => { var _a; return String((_a = object[header]) !== null && _a !== void 0 ? _a : ""); });
                return mapCells(cells, index + 1, indexes);
            });
            return validateRows(candidates);
        }
        catch {
            return { rows: [], invalid: [], error: "JSON 格式无法解析，请检查括号、逗号和引号。" };
        }
    }
    if (extension === "txt") {
        const candidates = text.split(/\r?\n/).map((line, index) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            const cells = line.split("\t");
            return {
                ...emptyRow(index + 1),
                word: (_b = (_a = cells[0]) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "",
                meaning: (_d = (_c = cells[1]) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : "",
                partOfSpeech: (_f = (_e = cells[2]) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : "",
                phonetic: (_h = (_g = cells[3]) === null || _g === void 0 ? void 0 : _g.trim()) !== null && _h !== void 0 ? _h : "",
                example: (_k = (_j = cells[4]) === null || _j === void 0 ? void 0 : _j.trim()) !== null && _k !== void 0 ? _k : "",
                translation: (_m = (_l = cells[5]) === null || _l === void 0 ? void 0 : _l.trim()) !== null && _m !== void 0 ? _m : "",
            };
        }).filter((row) => row.word || row.meaning || row.partOfSpeech || row.phonetic || row.example || row.translation);
        return validateRows(candidates);
    }
    if (extension !== "csv")
        return { rows: [], invalid: [], error: "目前支持 CSV、TXT 和 JSON 文件。" };
    const parsed = parseCsv(text);
    if (parsed.error)
        return { rows: [], invalid: [], error: parsed.error };
    if (parsed.records.length === 0)
        return { rows: [], invalid: [], error: "文件为空。" };
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
