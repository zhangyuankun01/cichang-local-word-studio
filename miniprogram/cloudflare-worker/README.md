# 词场小程序 TTS Worker

生产 Worker 已部署为 `black-rain-e57e`：

- 健康检查：<https://black-rain-e57e.zhangyuankun0.workers.dev/health>
- 发音接口：<https://black-rain-e57e.zhangyuankun0.workers.dev/api/tts>
- Workers AI 模型：`@cf/myshell-ai/melotts`

## 接口

`POST /api/tts`，请求 JSON：`{"text":"hello"}`；响应 JSON：`{"audio":"<base64>","contentType":"audio/wav"}`。实现根据音频字节头识别实测返回的 WAV，其他情况按 MP3 处理。`GET /health` 返回服务与模型状态。

接口只接受不超过 64 个字符的英文单词或短语。相同文本会使用边缘缓存，未命中的语音生成限制为每个 Cloudflare 节点每分钟 30 次。接口不接收用户资料；若以后面向多用户正式发布，仍应加入微信登录身份校验。

## 本地试运行

在本目录执行 `npm install`，然后可使用：

- `npm run check`：只检查打包和绑定，不发布。
- `npm run dev`：本地开发预览；Workers AI 推理仍会计入账户用量。
- `npm run deploy`：更新生产 Worker。

小程序代码中不放 Cloudflare API Token、AppSecret 或 Worker 私钥。正式发布小程序前，还要在微信公众平台配置 request 合法域名；开发者工具本地测试可暂时关闭域名校验。
