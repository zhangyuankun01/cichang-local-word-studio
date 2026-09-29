# 词场小程序 TTS Worker（本地模板）

这个目录只包含待部署模板，不会自动连接或修改账户内的 Worker。

## 接口

`POST /api/tts`，请求 JSON：`{"text":"hello"}`；响应 JSON：`{"audio":"<base64>","contentType":"audio/wav"}`。实现根据音频字节头保留实测返回的 WAV，其他情况按 MP3 处理。`GET /health` 只返回健康状态。

## 本地试运行

安装 Wrangler 后，在此目录使用 `npx wrangler dev`；首次本地启动前按 Cloudflare 官方流程登录 Wrangler 并连接 Workers AI。开发者工具测试域名需要能从手机访问，不能使用电脑的 `localhost`。

部署之前须先确定生产 HTTPS 域名、微信 request 合法域名，并为公开接口加入微信登录态校验与限流/滥用防护。当前模板不含账户认证，不能直接作为正式公开接口。小程序代码中不放 Cloudflare API Token、AppSecret 或 Worker 私钥。
