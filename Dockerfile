FROM docker.huivip.com.cn:8580/node:20-alpine

WORKDIR /app

# 安装 Python 与 edge-tts（用于自定义句子语音生成，与本地脚本同一引擎）
RUN apk add --no-cache python3 py3-pip \
    && pip3 install --break-system-packages --no-cache-dir edge-tts

# 先装 Node 依赖（利用层缓存）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 复制后端与前端文件
COPY server.js db.js audio-gen.js ai-analyze.js ./
COPY index.html test.html app_audio.js auth.js auth-ui.js sentences_data.json favicon.svg ./
COPY audio ./audio/

# 数据库与用户音频目录（挂载卷可持久化）
RUN mkdir -p /app/data/audio

EXPOSE 3000

ENV PORT=3000 \
    DB_PATH=/app/data/app.db \
    TZ=Asia/Shanghai

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# --experimental-sqlite 兼容部分 Node 24.x 小版本（node:sqlite 未默认开启时也能启动）
CMD ["node", "--experimental-sqlite", "server.js"]
