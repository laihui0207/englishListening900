FROM docker.huivip.com.cn:8580/node:24-alpine

WORKDIR /app

# 安装 Python 与 edge-tts（用于自定义句子语音生成，与本地脚本同一引擎）
RUN apk add --no-cache python3 py3-pip unzip \
    && pip3 install --break-system-packages --no-cache-dir edge-tts

# 先装 Node 依赖（利用层缓存）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 后端
COPY server.js ./
COPY src ./src/

# 前端静态文件
COPY public ./public/

# 分级数据与音频（zip 解压后删除，减小镜像层）
COPY levels ./levels/
RUN cd /app/levels/general && unzip -q audio.zip -d audio && rm audio.zip \
 && cd /app/levels/primary && unzip -q audio.zip -d audio && rm audio.zip

# 数据库与用户音频目录（挂载卷可持久化）
RUN mkdir -p /app/data/audio

EXPOSE 3000

ENV PORT=3000 \
    DB_PATH=/app/data/app.db \
    TZ=Asia/Shanghai

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# node:sqlite 在 Node 22.5+ 默认可用，无需 --experimental-sqlite
CMD ["node", "server.js"]
