const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');

function loader(globals={}, overrides={}) {
  const cache=new Map();
  function load(name) {
    let file=path.resolve(root,name);
    if(!fs.existsSync(file))file=['.ts','.tsx','.js'].map(ext=>file+ext).find(p=>fs.existsSync(p));
    if(overrides[file])return overrides[file];
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const requireLocal=id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id)):require(id);
    let source=fs.readFileSync(file,'utf8');
    if(/\.tsx?$/.test(file))source=require('typescript').transpileModule(source,{compilerOptions:{target:7,module:1,jsx:4}}).outputText;
    const fn=vm.runInThisContext('(function(module,exports,require,wx,getApp,Page,App){'+source+'\n})',{filename:file});
    fn(module,module.exports,requireLocal,globals.wx,globals.getApp,globals.Page,globals.App);
    return module.exports;
  }
  return load;
}
const d=loader()('miniprogram/shared/domain.js');
function initial(n=8) {const data=d.createInitialData();data.words=data.words.slice(0,n);data.activeSession=d.createSession(data);return data;}
const grade=(data,rating)=>d.answer(data,data.activeSession.ids[data.activeSession.index],rating);

test('desktop markup never exposes the meaning or example before a rating in either mode',()=>{
  const {StudyPage}=loader()('src/App.tsx');
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const data=initial(),word=data.words[0],noop=()=>{};
  const props={date:'今天',session:data.activeSession,currentWord:word,todayStats:d.emptyDailyStats(),dailyGoal:10,freshCount:8,dueCount:0,progress:0,totalWords:8,speaking:false,
    onMode:noop,onPlay:noop,onAnswer:noop,onContinue:noop,onReveal:noop,onCorrect:noop,onStart:noop,onEdit:noop,onBrowse:noop,onSettings:noop,voiceReady:true};
  for(const mode of ['word-first','audio-first']){
    const html=renderToStaticMarkup(React.createElement(StudyPage,{...props,mode}));
    assert.ok(!html.includes(word.meaning));assert.ok(!html.includes(word.example));assert.ok(!html.includes(word.translation));
    assert.ok(html.includes('模糊'));
    if(mode==='audio-first')assert.ok(!html.includes(word.word));
  }
  const graded=grade(data,'fuzzy');
  const html=renderToStaticMarkup(React.createElement(StudyPage,{...props,session:graded.activeSession,mode:'word-first'}));
  assert.ok(html.includes(word.meaning));assert.ok(html.includes(word.example));assert.ok(html.includes('改为不认识'));
});

test('three ratings schedule distinct retries, neither fuzzy nor failure promotes mastery',()=>{
  for(const [rating,gap] of [['again',2],['fuzzy',4],['known',6]]){
    const original=initial(),result=grade(original,rating),id=original.words[0].id;
    assert.equal(result.activeSession.ids.indexOf(id,1),gap+1);
    assert.equal(result.words[0].status,'learning');
    assert.equal(original.words[0].repetitions,0);
    assert.equal(result.studyDays[d.todayKey()].answered,1);
  }
});
test('two spaced known ratings graduate, fuzzy cannot count as a known rating',()=>{
  let data=initial(1);data=grade(data,'known');data=d.continueSession(data);data=grade(data,'fuzzy');
  assert.equal(data.words[0].status,'learning');assert.equal(data.words[0].correctStreak,0);
  data=d.continueSession(data);data=grade(data,'known');
  assert.equal(data.words[0].status,'learning');
  data=d.continueSession(data);data=grade(data,'known');
  assert.equal(data.words[0].status,'mastered');assert.equal(data.words[0].reviewBox,1);
  assert.equal(data.words[0].reviewAtCount-data.reviewCount,12);
});
test('fuzzy backs off a mature word without resetting all progress',()=>{
  let data=initial(1);Object.assign(data.words[0],{status:'mastered',correctStreak:5,reviewBox:5});
  data=grade(data,'fuzzy');assert.equal(data.words[0].reviewBox,4);assert.equal(data.words[0].status,'learning');
  data=d.continueSession(data);data=grade(data,'known');
  data=d.continueSession(data);data=grade(data,'known');assert.equal(data.words[0].status,'mastered');assert.equal(data.words[0].reviewBox,4);
});
test('double taps do not double count; correcting a judgment rolls back schedule and statistics',()=>{
  const result=grade(initial(),'known');assert.equal(grade(result,'again'),result);
  const corrected=d.regradeAnswer(result,'again');
  const day=corrected.studyDays[d.todayKey()];assert.equal(day.answered,1);assert.equal(day.known,0);assert.equal(day.again,1);
  assert.equal(corrected.words[0].repetitions,1);assert.equal(corrected.activeSession.ids.filter(id=>id===corrected.words[0].id).length,2);
});
test('retries and restarting on the same date do not consume another daily word quota',()=>{
  let data=grade(initial(1),'again');data=d.continueSession(data);
  data.activeSession=d.createSession(data);data=grade(data,'known');
  const day=data.studyDays[d.todayKey()];assert.equal(day.newIntroduced,1);assert.equal(day.reviewIntroduced,0);assert.equal(day.answered,2);
});
test('a persisted difficult card ends this round after six tries and remains available',()=>{
  let data=initial(1);
  for(let i=0;i<6;i++){data=grade(data,'again');data=d.decodeAppData(JSON.stringify(data));data=d.continueSession(data);}
  assert.equal(data.activeSession.index,data.activeSession.ids.length);
  assert.deepEqual(data.activeSession.deferredIds,[data.words[0].id]);
  assert.equal(d.createSession(data).ids[0],data.words[0].id);
});
test('normal sessions do not prematurely recycle mature words; extra practice is explicit',()=>{
  const data=initial(1);Object.assign(data.words[0],{status:'mastered',reviewAtCount:100});
  assert.equal(d.createSession(data).ids.length,0);assert.equal(d.createSession(data,d.todayKey(),true).ids.length,1);
});
test('zero daily goals do not add new cards and full sixth review stage survives restore',()=>{
  const data=initial(1);data.settings.dailyGoal=0;assert.equal(d.createSession(data).ids.length,0);
  Object.assign(data.words[0],{status:'mastered',reviewBox:6});assert.equal(d.decodeAppData(JSON.stringify(data)).words[0].reviewBox,6);
});
test('legacy data receives fuzzy counters and imports missing fields without invented meanings',()=>{
  const data=d.decodeAppData({version:1,words:[{id:'a',word:'test'}],studyDays:{[d.todayKey()]:{answered:2,known:1,again:1}}});
  assert.equal(data.words[0].meaning,'');assert.equal(data.studyDays[d.todayKey()].fuzzy,0);
});
test('restoration drops duplicate IDs and preserves the cursor after a missing word',()=>{
  const data=d.decodeAppData({version:1,reviewCount:Infinity,words:[{id:'a',word:'hello'},{id:'a',word:'duplicate'}],activeSession:{date:d.todayKey(),ids:['missing','a'],index:1}});
  assert.equal(data.words.length,1);assert.equal(data.reviewCount,0);assert.equal(data.activeSession.ids[data.activeSession.index],'a');
});

const importer=loader()('miniprogram/shared/importer.js');
test('same importer handles BOM, quoted multiline CSV, TXT and JSON; malformed rows are visible',()=>{
  const csv=importer.parseVocabularyFile('words.csv','\uFEFFword,meaning,example\nhello,"你好, 您好","Hello\nthere"');
  assert.equal(csv.rows[0].meaning,'你好, 您好');assert.equal(csv.rows[0].example,'Hello\nthere');
  assert.equal(importer.parseVocabularyFile('words.txt','hello\t你好\n123\t错误').invalid.length,1);
  assert.equal(importer.parseVocabularyFile('words.json','["hello"]').rows.length,1);
});

function pageHarness() {
  const globalData={data:initial(),storageSafe:true,storageError:''};
  const app={globalData,saveData(data){globalData.data=data;return true;}};
  const audio={exists:()=>false,getStatus:()=>({busy:false,remaining:0,error:''}),prepare(){},stop(){},pause(){},resume(){},subscribe:()=>()=>{}};
  let definition;
  const wx={showModal(){},showToast(){}};
  const load=loader({wx,getApp:()=>app,Page:p=>definition=p},{[path.join(root,'miniprogram/services/audio.js')]:audio});
  load('miniprogram/pages/index/index.js');
  const page={...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch);}};
  page.refresh();return {page,app};
}
test('question remains hidden across background refreshes, and fuzzy reveals only after grading',()=>{
  const {page,app}=pageHarness();assert.equal(page.data.showAnswer,false);assert.equal(page.data.showWord,true);
  page.refresh();assert.equal(page.data.showAnswer,false);
  page.markFuzzy();assert.equal(page.data.showAnswer,true);assert.equal(page.data.feedback.rating,'fuzzy');
  assert.equal(app.globalData.data.studyDays[d.todayKey()].fuzzy,1);
  page.continueStudy();assert.equal(page.data.showAnswer,false);
});
test('audio-first mode hides spelling until judgment; search uses the newly entered query',()=>{
  const {page}=pageHarness();page.setAudioFirst();assert.equal(page.data.showWord,false);
  page.markAgain();assert.equal(page.data.showWord,true);assert.equal(page.data.showAnswer,true);
  page.search({detail:{value:'resilient'}});assert.equal(page.data.visibleWords.length,1);assert.equal(page.data.visibleWords[0].word,'resilient');
});
test('CSV and TXT are previewed without JSON parsing and are only written on confirmation',()=>{
  const {page,app}=pageHarness();const n=app.globalData.data.words.length;
  page.previewImport('words.txt','alpha\t首位\nbeta\t第二位');
  assert.equal(page.data.importPreview.count,2);assert.equal(app.globalData.data.words.length,n);
  page.confirmImport();assert.equal(app.globalData.data.words.length,n+2);
  page.previewImport('words.csv','word,meaning\nalpha,第一');assert.equal(page.data.importPreview.duplicateCount,1);
});
test('updating imported meaning preserves scheduling and new editor fields are always strings',()=>{
  const {page,app}=pageHarness();const original=app.globalData.data.words[0];
  page.previewImport('words.txt',original.word+'\t新释义');page.setDuplicatePolicy({currentTarget:{dataset:{policy:'update'}}});page.confirmImport();
  assert.equal(app.globalData.data.words[0].meaning,'新释义');assert.equal(app.globalData.data.words[0].reviewAtCount,original.reviewAtCount);
  page.addWord();page.changeDraft({currentTarget:{dataset:{field:'word'}},detail:{value:'testing'}});page.saveWord();
  assert.equal(app.globalData.data.words.at(-1).meaning,'');
});
test('corrupt storage is preserved and a failed write does not advance memory',()=>{
  let app;let writes=0;
  loader({wx:{getStorageSync:()=>'{bad',setStorageSync(){writes++;throw Error('quota');},showToast(){}},App:a=>app=a})('miniprogram/app.js');
  app.onLaunch();assert.equal(app.globalData.storageSafe,false);assert.equal(writes,0);
  const before=app.globalData.data;assert.equal(app.saveData(initial()),false);assert.equal(app.globalData.data,before);
  assert.equal(app.saveData(initial(),true),false);assert.equal(app.globalData.data,before);
});

test('audio generation is deduplicated, validates WAV bytes, and never autoplays from background preparation',async()=>{
  const data=initial(1),files=new Map();let requests=0,plays=0;
  const app={globalData:{data,storageSafe:true},saveData(next){this.globalData.data=next;return true;}};
  const wave=Buffer.alloc(46);wave.write('RIFF');wave.write('WAVE',8);
  const wx={env:{USER_DATA_PATH:'/local'},base64ToArrayBuffer:s=>{const b=Buffer.from(s,'base64');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);},
    getFileSystemManager:()=>({accessSync(p){if(!files.has(p))throw Error('missing');},writeFile(o){files.set(o.filePath,o.data);o.success();}}),
    request(o){requests++;setImmediate(()=>o.success({statusCode:200,data:{audio:wave.toString('base64'),contentType:'audio/mpeg'}}));},
    createInnerAudioContext:()=>({onError(){},stop(){},play(){plays++;}}),showToast(){}};
  const load=loader({wx,getApp:()=>app},{[path.join(root,'miniprogram/config.js')]:{ttsEndpoint:'https://tts.invalid/api/tts'}});
  const audio=load('miniprogram/services/audio.js');
  const [one,two]=await Promise.all([audio.ensure(data.words[0]),audio.ensure(data.words[0])]);
  assert.equal(one,two);assert.equal(requests,1);assert.ok(one.endsWith('.wav'));assert.equal(plays,0);
  assert.throws(()=>audio.extension(Buffer.from('not audio').toString('base64')));
  audio.resume();await audio.play(app.globalData.data.words[0]);assert.equal(plays,1);assert.equal(requests,1);audio.pause();
});
