FROM nginx:alpine

# 设置工作目录
WORKDIR /usr/share/nginx/html

# 删除nginx默认页面
RUN rm -rf /usr/share/nginx/html/*

# 复制网站文件
COPY index.html /usr/share/nginx/html/
COPY test.html /usr/share/nginx/html/
COPY app_audio.js /usr/share/nginx/html/
COPY sentences_data.json /usr/share/nginx/html/
COPY audio /usr/share/nginx/html/audio/

# 复制nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
