const domain = require('../../shared/domain.js');
const {parseVocabularyFile} = require('../../shared/importer.js');
const audio = require('../../services/audio.js');
const config = require('../../config.js');
const app = () => getApp();
const fs = () => wx.getFileSystemManager();
const blank = () => ({word:'',meaning:'',partOfSpeech:'',phonetic:'',example:'',translation:''});
const toast = message => wx.showToast({title:message,icon:'none'});
const uid = () => `word-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const fields = ['word','meaning','partOfSpeech','phonetic','example','translation'];
const present = word => word ? Object.fromEntries(['id',...fields,'status','correctStreak','reviewBox'].map(k=>[k,word[k]||''])) : null;

Page({
  data:{tab:'study',wordCount:0,settings:{dailyGoal:10,dailyReviewGoal:30},todayAnswered:0,todayFuzzy:0,
    dueCount:0,progress:0,sessionTotal:0,sessionDone:0,currentWord:null,feedback:null,showWord:true,showAnswer:false,
    mode:'word-first',audioStatus:'',query:'',filter:'all',visibleWords:[],filteredCount:0,visibleLimit:50,
    audioCount:0,audioState:{busy:false,remaining:0,error:''},ttsReady:false,storageError:'',
    editorOpen:false,draft:blank(),importPreview:null,duplicatePolicy:'skip',deferredCount:0},

  onShow() {
    this.visible=true;
    this.unsubscribe?.();
    this.unsubscribe=audio.subscribe(()=>{if(this.visible)this.refresh();});
    const data=app().globalData.data;
    if(app().globalData.storageSafe && (!data.activeSession||data.activeSession.date!==domain.todayKey()))
      app().saveData({...data,activeSession:domain.createSession(data)});
    this.refresh();audio.resume();
  },
  onHide(){this.visible=false;this.playRequest=(this.playRequest||0)+1;audio.pause();this.unsubscribe?.();},
  onUnload(){this.onHide();},
  refresh() {
    const data=app().globalData.data,session=data.activeSession;
    const word=session&&data.words.find(w=>w.id===session.ids[session.index]);
    const stats=data.studyDays[domain.todayKey()]||domain.emptyDailyStats();
    const feedback=session?.feedback;
    const all=new Set(session?.ids||[]);
    const pending=new Set(session?.ids.slice(session.index+(feedback?1:0))||[]);
    const query=this.data.query.trim().toLowerCase();
    const filtered=data.words.filter(w=>(this.data.filter==='all'||(this.data.filter==='due'&&domain.isDue(w,data.reviewCount))||w.status===this.data.filter)
      && (!query||w.word.toLowerCase().includes(query)||w.meaning.toLowerCase().includes(query)));
    this.setData({
      wordCount:data.words.length,settings:data.settings,currentWord:present(word),
      feedback:feedback?{rating:feedback.rating,message:feedback.message||'学习进度已保存。',canCorrect:Boolean(feedback.undo)&&feedback.rating!=='again'}:null,
      showAnswer:Boolean(feedback),showWord:session?.mode!=='audio-first'||Boolean(feedback),mode:session?.mode||'word-first',
      todayAnswered:stats.answered,todayFuzzy:stats.fuzzy||0,todayNew:stats.newIntroduced,todayReview:stats.reviewIntroduced,
      dueCount:data.words.filter(w=>domain.isDue(w,data.reviewCount)).length,
      sessionTotal:all.size,sessionDone:all.size-pending.size,progress:all.size?Math.round((all.size-pending.size)/all.size*100):0,
      visibleWords:filtered.slice(0,this.data.visibleLimit).map(present),filteredCount:filtered.length,
      ttsReady:Boolean(config.ttsEndpoint),audioCount:data.words.filter(w=>audio.exists(w.audioPath)).length,
      audioState:audio.getStatus(),storageError:app().globalData.storageError,
      deferredCount:session?.deferredIds?.length||0,
    });
  },
  switchTab(e){audio.stop();this.playRequest=(this.playRequest||0)+1;this.setData({tab:e.currentTarget.dataset.tab,audioStatus:''});this.refresh();},
  markAgain(){this.rate('again');},markFuzzy(){this.rate('fuzzy');},markKnown(){this.rate('known');},
  rate(rating){
    if(!this.data.currentWord)return;
    audio.stop();this.playRequest=(this.playRequest||0)+1;
    app().saveData(domain.answer(app().globalData.data,this.data.currentWord.id,rating));
    this.setData({audioStatus:''});this.refresh();
  },
  reveal(){this.rate('again');},
  correctAnswer(){app().saveData(domain.regradeAnswer(app().globalData.data,'again'));this.refresh();},
  continueStudy(){
    audio.stop();app().saveData(domain.continueSession(app().globalData.data));this.refresh();this.autoPlay();
  },
  startSession(e){
    const data=app().globalData.data;
    const extra=Boolean(e?.currentTarget?.dataset?.extra);
    app().saveData({...data,activeSession:domain.createSession(data,domain.todayKey(),extra)});
    this.refresh();this.autoPlay();
  },
  setWordFirst(){this.setMode('word-first');},setAudioFirst(){this.setMode('audio-first');},
  setMode(mode){
    const data=app().globalData.data;
    if(data.activeSession?.feedback){toast('先核对答案，再继续下一题');return;}
    if(data.activeSession)app().saveData({...data,activeSession:{...data.activeSession,mode}});
    this.refresh();this.autoPlay();
  },
  autoPlay(){
    const word=app().globalData.data.words.find(w=>w.id===this.data.currentWord?.id);
    if(word&&(config.ttsEndpoint||word.audioData||audio.exists(word.audioPath)))void this.playWordById(word.id);
  },
  playCurrent(){if(this.data.currentWord)return this.playWordById(this.data.currentWord.id);},
  playWord(e){return this.playWordById(e.currentTarget.dataset.id);},
  async playWordById(id){
    const word=app().globalData.data.words.find(w=>w.id===id);if(!word)return;
    const ticket=this.playRequest=(this.playRequest||0)+1;
    this.setData({audioStatus:'准备发音…'});
    try{await audio.play(word);}catch(error){if(this.visible&&ticket===this.playRequest)toast(error.message);}
    finally{if(this.visible&&ticket===this.playRequest)this.setData({audioStatus:''});}
  },
  retryAudio(){audio.prepare();},
  search(e){this.setData({query:e.detail.value,visibleLimit:50});this.refresh();},
  setFilter(e){this.setData({filter:e.currentTarget.dataset.filter,visibleLimit:50});this.refresh();},
  loadMore(){this.setData({visibleLimit:this.data.visibleLimit+50});this.refresh();},
  addWord(){this.editingId=null;this.setData({editorOpen:true,draft:blank()});},
  editWord(e){const word=app().globalData.data.words.find(w=>w.id===e.currentTarget.dataset.id);if(!word)return;this.editingId=word.id;this.setData({editorOpen:true,draft:{...blank(),...Object.fromEntries(fields.map(k=>[k,word[k]||'']))}});},
  changeDraft(e){this.setData({draft:{...this.data.draft,[e.currentTarget.dataset.field]:e.detail.value}});},
  closeEditor(){this.setData({editorOpen:false});},
  saveWord(){
    const draft=this.data.draft;
    const parsed=parseVocabularyFile('word.json',JSON.stringify([draft]));
    if(!parsed.rows.length){toast(parsed.invalid[0]?.reason||'请输入英文单词');return;}
    const row=parsed.rows[0],data=app().globalData.data;
    if(data.words.some(w=>w.id!==this.editingId&&w.word.toLowerCase()===row.word.toLowerCase())){toast('词库中已有这个词');return;}
    let words;
    if(this.editingId) words=data.words.map(w=>w.id===this.editingId?{...w,...row,audioPath:w.word===row.word?w.audioPath:undefined,audioData:w.word===row.word?w.audioData:undefined}:w);
    else words=[...data.words,{...blank(),...domain.lookupStarterWord(row.word),...Object.fromEntries(fields.map(k=>[k,row[k]||domain.lookupStarterWord(row.word)?.[k]||''])),id:uid(),status:'new',createdAt:Date.now(),repetitions:0,correctStreak:0,reviewBox:0,reviewAtCount:0}];
    if(!app().saveData({...data,words}))return;
    this.setData({editorOpen:false});this.refresh();audio.prepare();
  },
  deleteWord(e){
    const id=e.currentTarget.dataset.id,word=app().globalData.data.words.find(w=>w.id===id);if(!word)return;
    wx.showModal({title:'删除词条？',content:`将删除 ${word.word} 及它的学习记录。`,success:r=>{
      if(!r.confirm)return;
      const data=app().globalData.data,words=data.words.filter(w=>w.id!==id),session=data.activeSession;
      const next=session?{...session,ids:session.ids.filter(x=>x!==id),index:session.ids.slice(0,session.index).filter(x=>x!==id).length,feedback:null}:null;
      if(app().saveData({...data,words,activeSession:next})){audio.stop();this.refresh();}
    }});
  },
  updateGoal(e){
    const key=e.currentTarget.dataset.key;if(!['dailyGoal','dailyReviewGoal'].includes(key))return;
    const value=Math.max(0,Math.min(500,Math.floor(Number(e.detail.value)||0))),data=app().globalData.data;
    const updated={...data,settings:{...data.settings,[key]:value}};
    const s=data.activeSession;
    if(!s||!s.ids.length||s.index>=s.ids.length||(s.index===0&&!s.seenIds.length))updated.activeSession=domain.createSession(updated);
    app().saveData(updated);this.refresh();
  },
  importFile(){
    wx.chooseMessageFile({count:1,type:'file',extension:['csv','txt','json'],success:r=>{
      const file=r.tempFiles[0];
      if(file.size>20*1024*1024){toast('文件超过 20 MB，请拆分后导入');return;}
      fs().readFile({filePath:file.path,encoding:'utf8',success:result=>this.previewImport(file.name,result.data),fail:()=>toast('文件读取失败，请重新选择')});
    }});
  },
  previewImport(name,source){
    try{
      if(name.toLowerCase().endsWith('.json')){
        const raw=JSON.parse(source.replace(/^\uFEFF/,''));
        if(raw?.version===1&&Array.isArray(raw.words)){
          const backup=domain.decodeAppData(raw);
          if(!backup||backup.words.length!==raw.words.length)throw new Error('备份中含有损坏词条，请检查文件。');
          wx.showModal({title:'恢复完整备份？',content:`将替换当前词库，恢复 ${backup.words.length} 个词条、学习记录和已有录音。`,success:r=>{if(r.confirm)void this.restoreBackup(backup);}});return;
        }
      }
      const result=parseVocabularyFile(name,source);if(result.error)throw new Error(result.error);
      if(result.rows.length>5000)throw new Error('单次最多导入 5000 个词，请拆分文件。');
      const unique=new Map();for(const row of result.rows)if(!unique.has(row.word.toLowerCase()))unique.set(row.word.toLowerCase(),row);
      this.importRows=[...unique.values()];
      const existing=new Set(app().globalData.data.words.map(w=>w.word.toLowerCase()));
      this.setData({tab:'settings',duplicatePolicy:'skip',importPreview:{name,count:unique.size,
        duplicateCount:this.importRows.filter(w=>existing.has(w.word.toLowerCase())).length,
        repeated:result.rows.length-unique.size,invalidCount:result.invalid.length,
        errors:result.invalid.slice(0,3).map(x=>`第 ${x.line} 行：${x.reason}`),rows:this.importRows.slice(0,5).map(present)}});
    }catch(error){wx.showModal({title:'导入失败',content:error.message,showCancel:false});}
  },
  setDuplicatePolicy(e){this.setData({duplicatePolicy:e.currentTarget.dataset.policy});},
  cancelImport(){this.importRows=null;this.setData({importPreview:null});},
  confirmImport(){
    if(!this.importRows?.length)return;
    const data=app().globalData.data,words=[...data.words];
    const indices=new Map(words.map((w,i)=>[w.word.toLowerCase(),i]));let added=0,updated=0;
    for(const row of this.importRows){
      const index=indices.get(row.word.toLowerCase());
      if(index!==undefined){if(this.data.duplicatePolicy==='update'){
        const changes=Object.fromEntries(fields.filter(k=>k!=='word'&&row[k]).map(k=>[k,row[k]]));
        words[index]={...words[index],...changes};updated++;
      }}else{indices.set(row.word.toLowerCase(),words.length);words.push({...blank(),...row,id:uid(),status:'new',createdAt:Date.now()+added,repetitions:0,correctStreak:0,reviewBox:0,reviewAtCount:0});added++;}
    }
    if(!app().saveData({...data,words}))return;
    this.cancelImport();this.refresh();audio.prepare();toast(`新增 ${added} 个，更新 ${updated} 个`);
  },
  async restoreBackup(backup){
    audio.pause();wx.showLoading({title:'恢复备份中'});
    try{
      const words=[];
      for(const item of backup.words){
        const word={...item,audioPath:undefined};
        if(word.audioData){word.audioPath=await audio.materialize(word);word.audioData=undefined;}
        words.push(word);
      }
      if(app().saveData({...backup,words},true)){this.refresh();toast(`已恢复 ${words.length} 个词条`);}
    }catch(error){wx.showModal({title:'恢复未完成',content:error.message+' 原词库仍保留。',showCancel:false});}
    finally{wx.hideLoading();if(this.visible)audio.resume();}
  },
  async shareText(name,text){
    const path=`${wx.env.USER_DATA_PATH}/${name}`;
    await new Promise((resolve,reject)=>fs().writeFile({filePath:path,data:text,encoding:'utf8',success:resolve,fail:()=>reject(new Error('文件创建失败，请检查设备空间。'))}));
    if(typeof wx.shareFileMessage!=='function'){toast('请在手机微信中分享备份文件');return;}
    wx.shareFileMessage({filePath:path,fileName:name,fail:r=>{if(!r.errMsg?.includes('cancel'))toast('分享未完成，请在手机微信中重试');}});
  },
  async exportBackup(){
    if(!app().globalData.storageSafe){toast('请先恢复原数据后再导出');return;}
    const snapshot=app().globalData.data,words=[];let missing=0;
    wx.showLoading({title:'准备备份中'});
    try{
      for(const item of snapshot.words){
        const word={...item,audioPath:undefined};
        if(item.audioPath){try{
          const base64=await new Promise((resolve,reject)=>fs().readFile({filePath:item.audioPath,encoding:'base64',success:r=>resolve(r.data),fail:reject}));
          const ext=audio.extension(base64);word.audioData=`data:audio/${ext==='wav'?'wav':'mpeg'};base64,${base64}`;
        }catch(_){missing++;}}
        words.push(word);
      }
      const snapshotSession=snapshot.activeSession;
      const activeSession=snapshotSession?{...snapshotSession,feedback:snapshotSession.feedback?{...snapshotSession.feedback,undo:undefined}:null}:null;
      await this.shareText(`cichang-backup-${domain.todayKey()}.json`,JSON.stringify({...snapshot,activeSession,words},null,2));
      if(missing)toast(`${missing} 条缓存缺失；词条和进度仍已备份`);
    }catch(error){toast(error.message);}finally{wx.hideLoading();}
  },
  async exportWords(){
    const quote=s=>'"'+String(s||'').replace(/"/g,'""')+'"';
    const rows=app().globalData.data.words.map(w=>fields.map(k=>quote(w[k])).join(','));
    try{await this.shareText('cichang-words.csv','\uFEFF'+fields.join(',')+'\n'+rows.join('\n'));}catch(error){toast(error.message);}
  },
});
