const { createInitialData, decodeAppData } = require("./shared/domain.js");
const STORE_KEY = "cichang-local-study-v1";
App({
  globalData: { data: null, ready: false, storageSafe: true, storageError: '' },
  onLaunch() {
    try {
      const saved = wx.getStorageSync(STORE_KEY);
      const decoded = saved ? decodeAppData(saved) : null;
      if (saved && !decoded) throw new Error('本地数据无法读取，原数据已保留，请从备份恢复。');
      this.globalData.data = decoded || createInitialData();
    } catch (error) {
      this.globalData.data = createInitialData();
      this.globalData.data.words = [];
      this.globalData.storageSafe = false;
      this.globalData.storageError = error.message || '读取失败，请从备份恢复。';
    }
    this.globalData.ready = true;
  },
  saveData(data, replace = false) {
    if (!this.globalData.storageSafe && !replace) {
      wx.showToast({title:'请先恢复备份，原数据已保留',icon:'none'});
      return false;
    }
    try {
      wx.setStorageSync(STORE_KEY, data);
      this.globalData.data = data;
      this.globalData.storageSafe = true;
      this.globalData.storageError = '';
      return true;
    } catch (_) {
      wx.showToast({title:'保存失败，本次操作未生效',icon:'none'});
      return false;
    }
  },
});
