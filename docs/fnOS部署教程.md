# 飞牛 OS 部署泡泡堂 BnB：手机触控版

更新日期：2026-11-23。

**来源仓库：[tpoisonooo/BnB](https://github.com/tpoisonooo/BnB)。当前手机版及部署适配仓库：[onlytoy/BnB](https://github.com/onlytoy/BnB)，分支 `mobile-fnos`。本文与部署包均基于原项目，原游戏、代码及素材贡献归对应作者和权利人所有。**

本教程推荐“下载部署包 → 文件管理上传 → Docker Compose 新增项目”。这条路线不需要 SSH，也不需要在 NAS 上构建前端或安装 npm 依赖。需要 Docker 的 x86-64 或 ARM64 飞牛设备；首次启动要能拉取官方 `node:24-alpine` 镜像。运行依赖只有纯 JavaScript 的 `ws`。

## 一、安装前准备

1. 在飞牛应用中心安装并启动 **Docker**。
2. 记下 NAS 的局域网 IP。本文使用示例 `192.168.1.100`，实际访问时换成自己的地址。
3. 确认 NAS 的 `3001/TCP` 没被其他容器占用。若被占用，按后文改成 `8089:3001`。
4. 打开[发布页面](https://github.com/onlytoy/BnB/releases/tag/v1.1.0-mobile)，下载附件 **bnb-fnos.zip**。

请下载发布附件里的 `bnb-fnos.zip`。GitHub 自动生成的 `Source code (zip)` 是源码压缩包，不含 `app/node_modules/ws`；源码部署方式见第八节。

## 二、解压并上传游戏

在电脑解压 `bnb-fnos.zip`，得到以下文件夹：

```text
bnb-fnos/
├── docker-compose.yml
├── README.md
├── fnOS部署教程.md
├── 来源说明.md
├── 版本信息.json
└── app/
    ├── package.json
    ├── package-lock.json
    ├── server/
    │   └── index.js
    ├── client/
    │   ├── index.html
    │   ├── main.js
    │   ├── mobile.css
    │   ├── touch-controls.js
    │   └── assets/
    └── node_modules/
        └── ws/
```

1. 在飞牛桌面打开 **文件管理 → 我的文件 → docker**。没有 `docker` 文件夹时新建一个。
2. 点击 **上传文件夹**，上传电脑上解压得到的整个 `bnb-fnos`。
3. 进入 NAS 的 `docker/bnb-fnos`，确认这一层直接有 `docker-compose.yml` 和 `app`。
4. 检查 `app/server/index.js`、`app/client/index.html`、`app/node_modules/ws/package.json` 是否存在。素材目录 `app/client/assets` 也要完整上传。

项目“路径”要选择同时包含 `app` 和 `docker-compose.yml` 的那层目录。如果上传时多套了一层文件夹，要选里面真正包含这两个项目的那层。

## 三、在飞牛 Docker 中创建项目

打开 **Docker → Compose → 新增项目**，填写：

| 界面字段 | 填写内容 |
| --- | --- |
| 项目名称 | `bnb-fnos` |
| 路径 | 进入“我的文件 → docker → bnb-fnos”，选择该文件夹 |
| 来源 | 选择 **创建docker-compose.yml** |
| YAML 编辑框 | 粘贴下面完整配置 |
| 创建项目后立即启动 | 勾选 |

当前版本若支持直接选择已上传的 Compose 文件，也可选择该目录的 `docker-compose.yml`，两种方式只用一种，避免重复创建项目。

```yaml
services:
  bnb:
    image: node:24-alpine
    restart: unless-stopped
    init: true
    user: "1000:1000"
    working_dir: /app
    command: ["node", "server/index.js"]
    environment:
      NODE_ENV: production
      PORT: "3001"
    ports:
      - "3001:3001"
    volumes:
      - ./app:/app:ro
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

点击 **确认**，等待镜像下载。项目显示正在运行、容器数为 1，稍后健康状态应变成“健康”。

该配置通过 `./app` 挂载已经准备好的游戏，NAS 不执行 `npm install`。容器使用 UID 1000 读取文件；若实际上传账号 UID 不同，须保证该 UID 能进入 `app` 目录并读取文件，具体见排障章节。

服务日志应出现：

```text
泡泡堂服务已启动: http://localhost:3001
```

日志中的 `localhost` 是程序打印的地址，其他设备使用 NAS 局域网 IP 访问。

## 四、验证网页和多人联机

1. 电脑打开 `http://192.168.1.100:3001/healthz`，应显示 `ok`。
2. 打开 `http://192.168.1.100:3001/`，应显示泡泡堂登录页面。把示例 IP 换成自己的 NAS IP。
3. 输入昵称进入大厅。单人体验可点 **练习模式**，系统补 Bot 后直接开战。
4. 联机时，一个人点 **开设房间**；其他设备打开同一个网址，用不同昵称进入并加入同一房间。
5. 加入默认准备，房主点 **开始**。有人取消准备时，需要其重新准备。

网页与 WebSocket 共用 3001 端口，不需要另外开联机端口。所有设备必须访问同一个后端，才能看到同一个大厅。多开电脑标签页也可以测试联机。

## 五、手机操作与 Safari 注意事项

手机和平板连到同一局域网，用现代 Safari / Chrome 打开相同网址，推荐横屏。

| 动作 | 手机触屏 | 电脑键盘 |
| --- | --- | --- |
| 移动 | 左半屏任意位置按住，向上下左右拖动 | 方向键 / WASD |
| 停止 | 松手或拖回最初落点 | 松开方向键 |
| 推花纹木箱 | 持续朝木箱方向拖动，前方须能通行 | 长按方向键 |
| 放水泡 | 点击右侧“放泡” | 空格 |
| 放遥控泡 | 拾取遥控器后点“道具” | Ctrl / Shift |
| 引爆遥控泡 | 有自己的遥控泡时，“放泡”自动变成“引爆” | 空格 |
| 针自救 | 被困且有针时，点“自救” | Ctrl / Shift |

左半屏包括地图左侧，不必按中固定圆圈。摇杆随手指落点出现，靠近屏幕边缘时向内收，松手回到左下待机位置。已经按住的手指拖到右半屏时仍会保持控制；从右半屏开始触摸则不会启动移动。

左手移动时，右手可以同时放泡或使用道具。放泡按钮每次按下放一颗，长按不自动连放。没有道具、尚在倒计时或已阵亡时，相关按钮变灰。

地图居中按比例尽量放大，状态在左侧、操作提示在右侧。切后台、页面失焦、系统取消触摸或旋转窗口时会清空输入，避免角色继续走。

页面被浏览器放大后，移动区会暂时让出触控，显示“双指收拢恢复视图”，此时在地图上双指收拢即可恢复。正常对局时左半屏手势由游戏接管，避免边走边放泡误触缩放。Safari 若保留了旧页状态，可关闭旧标签页后重新打开，并把浏览器“页面缩放”设为 100%。这不控制 iPhone 系统设置里的辅助缩放。

登录和聊天输入框已使用不小于 16px 的字号，并固定文字缩放比例，减少 Safari 输入和横竖屏切换时的文字放大。已有自动化触控模拟验证；不同实体手机仍以实际浏览器表现为准。

触控不需要 HTTPS 或传感器权限。背景音乐通常在首次点击后才能播放，首页 ♪ 可切换静音。手机切后台可能按原规则断线，需要重新加入。

## 六、Lucky 域名反向代理

先验证局域网能玩，再配置域名。以下使用示例域名 `game.example.com`，需要自行替换：

| Lucky 字段 | 示例 |
| --- | --- |
| Web 服务监听端口 | `9080`，或自己已放行的 HTTPS 端口 |
| TLS | 开启，配置与域名匹配的有效证书 |
| 子规则类型 | 反向代理 |
| 前端域名 | `game.example.com`，不含 `https://` |
| 后端地址 | `http://192.168.1.100:3001`，替换 NAS IP |

然后用 `https://game.example.com:9080/` 访问。域名 DNS 要指向可达的公网入口，路由器端口转发或 IPv6 防火墙也要放行对应端口。CNAME 可以指向已有 DDNS 域名，避免手工维护变化的 IP。

**Lucky 默认支持 WebSocket，无需寻找额外开启按钮。** 前端可以是 HTTPS，但此游戏后端是 HTTP，所以后端地址仍填 `http://...:3001`。客户端会自动按网页协议连接 `ws` / `wss`。

使用独立域名的根路径，不要直接挂在 `/bnb/` 等子路径下，当前资源使用 `/assets/...` 等绝对路径。其他反向代理软件需正确转发 WebSocket Upgrade，并允许长连接。

如果整个站点打不开，先检查 DNS 与入口端口；如果网页能打开但反复提示断线，再检查 WebSocket。健康接口是 `https://自己的域名:端口/healthz`。

Lucky 参数与默认 WebSocket 行为参考[官方 Web 服务文档](https://www.lucky666.cn/docs/modules/web/)。

## 七、改端口、更新和排障

### 改访问端口

只改映射左侧：

```yaml
ports:
  - "8089:3001"
```

保存并使用飞牛的重新创建 / 应用配置功能使其生效，随后访问 NAS 的 8089 端口。右侧 3001 和环境变量 `PORT` 保持不变。普通重启不会更换端口映射。

### 日后更新部署包

1. 先停止游戏项目，备份原来的 `app` 和 Compose 配置。
2. 上传新版完整 `app` 替换，保留自己修改过的端口等设置。
3. 启动项目，检查 `/healthz`。修改了 Compose 参数时要重新创建 / 应用配置。
4. 手机关闭旧标签页重新打开，必要时清理该站点缓存。

房间和对局保存在进程内存中，服务重启会清空，无需数据库卷。`restart: unless-stopped` 会在 Docker 恢复后启动容器；手动停止过的需要手动启动。健康检查显示状态，本身不会重启一个还在运行的异常进程。

### 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 下载镜像超时 | 在 Docker 镜像管理里尝试拉取 `node:24-alpine`，排查现有网络 / 镜像源后再启动 |
| 找不到 `/app/server/index.js` | 路径层级错误；项目目录里应直接有 `app/server/index.js` |
| 找不到包 `ws` | 上传包不完整，补齐 `app/node_modules/ws`；不要误用 GitHub 自动生成的源码 ZIP |
| 健康接口正常，首页或素材 404 | 健康接口不读静态文件，继续检查 `app/client/index.html` 和整个素材目录 |
| 文件存在仍 404 | Node 静态服务也把读取权限错误返回为 404，检查目录进入和文件读取权限 |
| 手机没有摇杆 | 确认新版 `index.html`、`main.js`、`mobile.css`、`touch-controls.js` 配套；刷新 / 清理站点缓存 |
| 电脑能访问、手机不能 | 检查同一局域网、访客 Wi-Fi 隔离、实际端口和防火墙 |
| 域名访问失败但内网正常 | 检查 DNS 是否生效、入口端口、路由转发与 Lucky 规则匹配 |
| 域名页面能打开但不能进大厅 | 检查 WebSocket Upgrade 是否经过反代，后端是否仍指向同一端口 |
| Safari 放大后缩不回 | 更新完整前端，关闭旧标签页重开；放大状态下在地图双指收拢 |
| 道具按钮灰色 | 先拾取遥控器；被困自救需要有针；倒计时或阵亡也会禁用 |
| 重启后房间消失 | 当前游戏使用内存房间机制，重新建房即可 |

### 文件权限

先在飞牛文件管理中给容器使用的 UID 对应账号读取权限，目录还须能进入，并应用到子文件。模板 UID 为 1000；上传账号 UID 不同时，按实际情况修改 Compose 的 `user` 或文件读取权限。

需要 SSH 定点排障时，将路径换成容器“存储”中映射到 `/app` 的实际 NAS 路径：

```sh
appdir=/替换为实际路径/docker/bnb-fnos/app
if test -f "$appdir/server/index.js" && test -f "$appdir/client/index.html"; then
  sudo find "$appdir" -xdev -type d -exec chmod o+rx {} +
  sudo find "$appdir" -xdev -type f -exec chmod o+r {} +
fi
```

仅修复该游戏目录的访问和读取权限，不授予写权限。不要把路径填写成整个磁盘或共享根目录。

## 八、可选：直接从 GitHub 源码构建

不使用发布包时，下载当前仓库 `mobile-fnos` 分支源码并上传整个源码文件夹。它的结构是 `client/`、`server/`、`Dockerfile`、`compose.yaml`，没有外层 `app/`。

在飞牛 Compose 里选择源码文件夹，并使用仓库根目录的 `compose.yaml`。它通过 `build: .` 在 NAS 构建镜像，网络必须能下载 `node:24-alpine` 及 npm 依赖。不要把前文预打包方案的 `./app` 挂载配置混用到源码目录。

有 SSH 时，也可执行：

```sh
git clone --branch mobile-fnos https://github.com/onlytoy/BnB.git
cd BnB
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=50
```

只有根目录下的 `client`、`server` 与生产依赖会进入镜像，浏览器测试库不进入运行镜像。

## 九、维护者：重新打包

在开发电脑安装 Node.js 24 和 Python 3，进入仓库目录：

```sh
npm ci --omit=dev --ignore-scripts
python3 scripts/package-nas.py
```

生成 `dist/bnb-fnos.zip` 和 `dist/bnb-fnos.zip.sha256`，上传到对应 GitHub Release。脚本只复制生产依赖 `ws`，拒绝包含原生 `.node` 二进制的运行依赖；不复制 `.git`、测试产物或本地环境文件。运行浏览器验证时重新执行 `npm ci` 安装开发依赖。

## 来源与版权

原始项目：[tpoisonooo/BnB](https://github.com/tpoisonooo/BnB)。上游基线提交：[5c108e8](https://github.com/tpoisonooo/BnB/commit/5c108e8ad3ea07684d4666f60e6eec6c2f3e569e)。[原始玩法、素材来源与致谢](上游项目说明.md)随仓库保留。

《泡泡堂》原作素材版权归盛趣游戏（原盛大网络）/ Nexon。沿用上游学习和研究用途说明，本次适配与部署教程不改变原代码或素材的权利归属。
