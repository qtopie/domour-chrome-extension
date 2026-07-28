# Domour Chrome Extension 本地部署与运行指南 🚀

包含完整的 Go 后台守护进程编译、前端 Side Panel 编译、Chrome 原生宿主注册以及 AI Agent (MCP) 接入步骤。

---

## 🛠️ 第一步：一键编译（Build）

在项目根目录下使用 `task` 指令或直接命令行编译后端与前端：

### 方式 A：使用 Task 工具（推荐）
```bash
task
```
*这会自动执行后端 Go 编译和前端 React Vite 打包。*

### 方式 B：手动命令行编译

```bash
# 1. 编译后端 Go 守护进程与 CLI 工具
go mod tidy
mkdir -p bin
go build -o bin/domour-chrome-bridge main.go
go build -o bin/domour-chrome-cli cmd/main.go

# 2. 编译前端 React 扩展侧边栏
cd frontend
npm install
npm run build
cd ..
```
*编译产物说明*：
- 前端扩展目录：`frontend/dist/`
- 后端守护进程：`bin/domour-chrome-bridge`
- 本地 CLI 工具：`bin/domour-chrome-cli`

---

## 🧩 第二步：在 Chrome / Edge 中加载扩展

1. 打开 Chrome 或 Edge 浏览器，导航至扩展管理页面：
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
2. 开启右上角/左下角 **“开发者模式” (Developer mode)** 开关。
3. 点击 **“加载已解压的扩展程序” (Load unpacked)** 按钮。
4. 选择本项目中的 `frontend/dist` 文件夹。
5. 加载成功后，复制浏览器赋予的 **Extension ID**（32位的字符串，例如：`ijffcnffoapdjfkmphkonddmmagcllok`）。

---

## 🔒 第三步：注册 Native Messaging 原生通信宿主

为了让 Chrome / Edge 允许后台 `domour-chrome-bridge` 进程与扩展直连，运行注册脚本并传入你的 Extension ID：

```bash
./register_host.sh <YOUR_EXTENSION_ID>
```

*示例*：
```bash
./register_host.sh ijffcnffoapdjfkmphkonddmmagcllok
```
*运行后脚本会自动将清单写入 macOS / Linux 的标准原生宿主目录（如 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`）。*

---

## 🌐 第四步：启动与体验

### 1. 启动侧边栏 (Side Panel)
- 在浏览器右侧工具栏点击 **Domour Chrome Extension** 图标打开侧边栏。
- 侧边栏打开时会自动拉起 `bin/domour-chrome-bridge` 守护进程，顶部状态显示 **READY** / **ATTACHED**。

### 2. Streamable HTTP MCP 服务 (Port 6888)
后台守护进程启动后，会自动在本地提供双重服务：
- 🤖 **MCP 协议接口**：`http://localhost:6888/mcp`
- 📄 **动态 PAC 代理服务**：`http://localhost:6888/proxy.pac`

### 3. 配置到 AI Agent
在你的 Agent / IDE 配置文件（如 `.agents/mcp_config.json` 或 Cursor / Claude Desktop）中配置：

```json
{
  "mcpServers": {
    "domour-chrome-mcp": {
      "url": "http://localhost:6888/mcp"
    }
  }
}
```

---

## 🧪 第五步：本地测试验证

### 1. 测试浏览器导航 MCP 工具
```bash
curl -X POST http://localhost:6888/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": { "url": "https://qtopie.space" }
    }
  }'
```

### 2. 测试零 Token 损耗网页截图
```bash
curl -X POST http://localhost:6888/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "browser_take_screenshot",
      "arguments": { "url": "https://qtopie.space" }
    }
  }'
```

### 3. 测试动态 PAC 规则
```bash
curl -i http://localhost:6888/proxy.pac
```
