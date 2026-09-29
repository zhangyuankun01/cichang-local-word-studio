const config = require('../config.js');
const pending = new Map();
const listeners = new Set();
let active = false, pumping = false, player = null, playToken = 0, playingWordId = null;
let queue = [];
let status = {busy:false,remaining:0,error:''};
const app = () => getApp();
const fs = () => wx.getFileSystemManager();
const endpoint = () => config.ttsEndpoint;
const notify = () => { status = {...status,busy:pumping,remaining:queue.length}; listeners.forEach(fn=>fn(status)); };
function exists(path) { if(!path)return false; try {fs().accessSync(path);return true;} catch(_){return false;} }
function key(text) {
  let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return (a>>>0).toString(16)+(b>>>0).toString(16);
}
function extension(base64) {
  const bytes = new Uint8Array(wx.base64ToArrayBuffer(base64));
  const magic = String.fromCharCode(...bytes.slice(0,12));
  if(bytes.length>44 && magic.startsWith('RIFF') && magic.slice(8,12)==='WAVE') return 'wav';
  if(bytes.length>16 && (magic.startsWith('ID3') || (bytes[0]===255 && (bytes[1]&224)===224))) return 'mp3';
  throw new Error('收到的发音格式无法播放，请稍后重试。');
}
async function materialize(word) {
  if (exists(word.audioPath)) return word.audioPath;
  let base64;
  const embedded = word.audioData && word.audioData.match(/^data:audio\/[^;]+;base64,([\s\S]+)$/);
  if(embedded) base64=embedded[1];
  else {
    if(!endpoint()) throw new Error('在线发音尚未启用，可先导入桌面版含录音的备份。');
    const response=await new Promise((resolve,reject)=>wx.request({
      url:endpoint(),method:'POST',header:{'content-type':'application/json'},data:{text:word.word},timeout:60000,
      success:r=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error('发音服务暂时不可用，请稍后重试。')),
      fail:()=>reject(new Error('网络未连接，已有发音仍可离线播放。')),
    }));
    base64=response && response.audio;
  }
  if(typeof base64!=='string'||!base64.length||base64.length>8*1024*1024) throw new Error('发音数据不完整，请重试。');
  const ext=extension(base64);
  const path=`${wx.env.USER_DATA_PATH}/cichang-${key(word.word+'|'+base64.slice(0,64))}.${ext}`;
  await new Promise((resolve,reject)=>fs().writeFile({filePath:path,data:base64,encoding:'base64',success:resolve,fail:()=>reject(new Error('音频保存失败，请检查设备空间。'))}));
  return path;
}
function ensure(word) {
  const id=word.id+'|'+word.word;
  if(pending.has(id)) return pending.get(id);
  const promise=materialize(word).then(path=>{
    const data=app().globalData.data;
    const current=data.words.find(w=>w.id===word.id&&w.word===word.word);
    if(current && current.audioPath!==path) {
      if(!app().saveData({...data,words:data.words.map(w=>w===current?{...w,audioPath:path,audioData:undefined}:w)})) throw new Error('发音缓存记录保存失败。');
    }
    notify(); return path;
  }).finally(()=>pending.delete(id));
  pending.set(id,promise); return promise;
}
async function pump() {
  if(pumping || !active || !app().globalData.storageSafe) return;
  pumping=true;status.error='';notify();
  try {
    while(active && queue.length){
      const id=queue[0],word=app().globalData.data.words.find(w=>w.id===id);
      if(!word){queue.shift();continue;}
      try {await ensure(word);if(queue[0]===id)queue.shift();notify();}
      catch(error){status.error=error.message;break;}
    }
  } finally {pumping=false;notify();}
}
function prepare() {
  queue=app().globalData.data.words.filter(w=>!exists(w.audioPath)&&(w.audioData||endpoint())).map(w=>w.id);
  void pump();
}
function stop(){playToken++; if(player)player.stop();}
async function play(word) {
  stop(); const token=playToken;
  const path=await ensure(word);
  if(token!==playToken||!active)return;
  if(!player){player=wx.createInnerAudioContext();player.onError(()=>{
    const data=app().globalData.data;
    app().saveData({...data,words:data.words.map(w=>w.id===playingWordId?{...w,audioPath:undefined}:w)});
    notify();
    wx.showToast({title:'播放失败，请重试发音',icon:'none'});
  });}
  playingWordId=word.id;player.src=path;player.play();
}
module.exports={ensure,materialize,exists,extension,prepare,stop,play,
  resume(){active=true;prepare();},pause(){active=false;stop();},
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  getStatus:()=>status,
};
