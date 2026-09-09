# 🎧 英语900句听力练习网站 - Docker部署

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node-24--alpine-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

完整的英语听力学习系统，支持Docker一键部署。

## ✨ 特性

- 🎵 **900个高质量音频** - Edge-TTS生成，接近真人发音
- 📖 **中英文对照** - 430句完整翻译
- 💾 **自动保存进度** - 学习进度自动记录
- ⚡ **快速部署** - Docker一键启动
- 📱 **响应式设计** - 支持手机/平板/电脑
- 🔧 **完全本地化** - 无需联网使用

## 🚀 快速开始

### 方法1：Docker Compose（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd demo

# 启动服务
docker-compose up -d

# 访问网站
# http://localhost:8080
```

### 方法2：Docker命令

```bash
# 构建镜像
docker build -t english-listening:v3.0 .

# 运行容器
docker run -d -p 8080:80 --name english-listening english-listening:v3.0

# 访问网站
# http://localhost:8080
```

### 方法3：使用部署脚本

**Windows:**
```cmd
docker-deploy.bat
```

**Linux/Mac:**
```bash
chmod +x docker-deploy.sh
./docker-deploy.sh
```

## 📦 部署要求

- Docker 20.10+
- Docker Compose 1.29+ (可选)
- 50MB 磁盘空间

## 🎯 功能特点

### 核心功能

- ✅ 高质量音频播放
- ✅ 中英文对照显示
- ✅ 自动播放上一句/下一句
- ✅ 跳转到指定句子
- ✅ 自动保存学习进度
- ✅ 播放速度调节（0.5x-1.5x）
- ✅ 音量控制

### 快捷键

- `空格` - 播放/暂停
- `R` - 重播
- `S` - 显示/隐藏原文
- `←` - 上一句
- `→` - 下一句

## 📊 数据统计

- **句子总数**: 900句
- **中文翻译**: 430句
- **音频文件**: 900个MP3（20MB）
- **覆盖场景**: 30+个日常场景

## 🐳 Docker相关

### 镜像信息

- **基础镜像**: node:24-alpine
- **服务方式**: Express 托管静态前端 + REST API
- **暴露端口**: 80
- **健康检查**: 已配置

### 常用命令

```bash
# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps

# 重启服务
docker-compose restart

# 停止服务
docker-compose stop

# 删除服务
docker-compose down
```

## 🔧 配置说明

### 端口配置

默认端口为8080，可在`docker-compose.yml`中修改：

```yaml
ports:
  - "8080:80"  # 改为其他端口，如 "9999:80"
```

### 特性

- ✅ 用户注册/登录（scrypt 哈希 + 会话令牌）
- ✅ 学习进度云同步
- ✅ 自定义句子入库，后台异步生成语音（edge-tts）
- ✅ 健康检查

## 📁 文件结构

```
demo/
├── Dockerfile              # Docker镜像构建文件（Node）
├── docker-compose.yml      # Docker Compose配置
├── .dockerignore           # 排除文件列表
├── docker-deploy.bat       # Windows部署脚本
├── docker-deploy.sh        # Linux/Mac部署脚本
├── index.html              # 听力练习主页
├── test.html               # 词汇量测试页
├── app_audio.js            # 听力练习逻辑
├── auth.js / auth-ui.js    # 登录/注册与进度同步
├── server.js               # 后端服务（Express）
├── db.js                   # 数据库层（SQLite）
├── audio-gen.js            # 自定义句子语音生成
├── sentences_data.json     # 句子数据
├── favicon.svg             # 站点图标
└── audio/                  # 音频文件夹
    ├── sentence_001.mp3
    └── ...
```

## 🌐 生产环境部署

### 使用反向代理

```nginx
server {
    listen 80;
    server_name english.example.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 配置SSL证书

```bash
# 使用Let's Encrypt
certbot --nginx -d english.example.com
```

## 📝 故障排除

### 端口被占用

```bash
# 修改docker-compose.yml中的端口
ports:
  - "8081:80"  # 使用其他端口
```

### 查看错误日志

```bash
docker logs english-listening-practice
```

### 重新构建

```bash
docker-compose up -d --build
```

## 🔗 相关链接

- [完整部署文档](Docker部署指南.txt)
- [功能说明](完整版项目总结.txt)
- [Docker官方文档](https://docs.docker.com/)

## 📄 License

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📮 联系方式

如有问题，请提交Issue或联系维护者。

---

**立即开始你的英语学习之旅！** 🚀
