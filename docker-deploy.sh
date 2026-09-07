#!/bin/bash

# 英语900句听力练习网站 - Docker部署脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

IMAGE_NAME="english-listening:v3.0"
CONTAINER_NAME="english-listening-practice"

print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}     🐳 Docker部署工具 - 英语900句听力练习网站${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
}

print_menu() {
    echo ""
    echo "请选择操作:"
    echo ""
    echo "[1] 构建Docker镜像"
    echo "[2] 启动容器 (使用Docker Compose)"
    echo "[3] 停止容器"
    echo "[4] 查看容器状态"
    echo "[5] 查看日志"
    echo "[6] 重新构建并启动"
    echo "[7] 完全清理 (删除容器和镜像)"
    echo "[8] 测试访问"
    echo "[9] 进入容器"
    echo "[0] 退出"
    echo ""
}

build_image() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}正在构建Docker镜像...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    if docker build -t $IMAGE_NAME .; then
        echo ""
        echo -e "${GREEN}✓ 镜像构建成功！${NC}"
    else
        echo ""
        echo -e "${RED}❌ 构建失败！${NC}"
    fi
}

start_container() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}正在启动容器...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    if docker-compose up -d; then
        echo ""
        echo -e "${GREEN}✓ 容器已启动！${NC}"
        echo ""
        echo -e "${GREEN}访问地址: http://localhost:8080${NC}"
    else
        echo ""
        echo -e "${RED}❌ 启动失败！${NC}"
    fi
}

stop_container() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}正在停止容器...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    if docker-compose stop; then
        echo ""
        echo -e "${GREEN}✓ 容器已停止${NC}"
    else
        echo ""
        echo -e "${RED}❌ 停止失败！${NC}"
    fi
}

check_status() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}容器状态:${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    docker-compose ps
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}镜像列表:${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    docker images | grep english-listening || echo "未找到镜像"
}

view_logs() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}容器日志 (按Ctrl+C退出):${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    docker-compose logs -f
}

rebuild() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}正在重新构建并启动...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    docker-compose down
    if docker-compose up -d --build; then
        echo ""
        echo -e "${GREEN}✓ 重新部署成功！${NC}"
        echo ""
        echo -e "${GREEN}访问地址: http://localhost:8080${NC}"
    else
        echo ""
        echo -e "${RED}❌ 操作失败！${NC}"
    fi
}

clean_all() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${RED}⚠️  警告：这将删除所有容器和镜像！${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    read -p "确认清理? (y/n): " confirm

    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo ""
        echo -e "${YELLOW}正在清理...${NC}"
        docker-compose down
        docker rmi $IMAGE_NAME 2>/dev/null || true
        echo ""
        echo -e "${GREEN}✓ 清理完成${NC}"
    else
        echo ""
        echo -e "${YELLOW}已取消${NC}"
    fi
}

test_access() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}测试网站访问...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ 网站可访问 (HTTP状态码: $HTTP_CODE)${NC}"
    else
        echo -e "${RED}❌ 网站无法访问 (HTTP状态码: $HTTP_CODE)${NC}"
    fi

    echo ""
    echo -e "${GREEN}访问地址: http://localhost:8080${NC}"

    # 尝试在浏览器中打开
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:8080
    elif command -v open &> /dev/null; then
        open http://localhost:8080
    fi
}

enter_container() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}进入容器...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

    docker-compose exec english-listening sh
}

# 主循环
while true; do
    clear
    print_header
    print_menu

    read -p "请输入选项 (0-9): " choice

    case $choice in
        1)
            build_image
            ;;
        2)
            start_container
            ;;
        3)
            stop_container
            ;;
        4)
            check_status
            ;;
        5)
            view_logs
            ;;
        6)
            rebuild
            ;;
        7)
            clean_all
            ;;
        8)
            test_access
            ;;
        9)
            enter_container
            ;;
        0)
            echo ""
            echo -e "${GREEN}感谢使用！${NC}"
            echo ""
            exit 0
            ;;
        *)
            echo ""
            echo -e "${RED}无效选项，请重新选择${NC}"
            ;;
    esac

    echo ""
    read -p "按回车键继续..."
done
