# 工作日历日志（PWA 版）

可安装到手机桌面的工作日历 + 每日备注工具，支持离线访问。

---

## 功能概览

- **月视图日历**：移动端友好网格，可翻年 / 翻月 / 回到今天
- **工作日颜色**：蓝 / 黄 / 绿按中周期轮换，非工作日灰色
- **周期标签**：每个工作日格子显示 `中-小-天` 编号（如 `1-2-3`）
- **每日日志**：点击日期，底部弹出编辑面板，记录并保存当日备注
- **法定假日**：联网自动获取中国节假日；离线时使用缓存或降级为周六日规则
- **PWA 安装**：可添加到 Android / iOS 主屏幕，像原生应用一样使用
- **离线访问**：Service Worker 缓存核心资源，断网仍可正常打开

---

## 颜色说明

| 颜色 | 含义 |
|------|------|
| 🔵 蓝 | 中周期 1 的工作日 |
| 🟡 黄 | 中周期 2 的工作日 |
| 🟢 绿 | 中周期 3 的工作日 |
| ⬜ 灰 | 非工作日（周末 / 法定假日 / 调休上班日） |

> 调休上班日（即法定安排的周六/日补班）同样显示为灰色。

---

## 文件结构

```
calendar_pwa/
├── index.html               主页面
├── manifest.json            PWA 清单（图标、名称、主题色）
├── sw.js                    Service Worker（离线缓存）
├── icon.svg                 应用图标
├── css/
│   └── style.css            样式
├── js/
│   ├── app.js               主逻辑（日历渲染、日志面板）
│   ├── color-service.js     颜色 / 周期计算
│   ├── holiday-service.js   假日数据获取与缓存
│   └── log-repo.js          日志读写（localStorage）
└── test-color-service.html  浏览器端单元测试
```

---

## 安装到手机

### Android（Chrome）

1. 用 Chrome 打开部署地址（如 `https://your-name.github.io/calendar_pwa/`）
2. 点击右上角菜单（⋮）→ **「添加到主屏幕」**
3. 确认后图标出现在桌面，点击即可全屏启动

### iOS（Safari）

1. 用 Safari 打开部署地址
2. 点击底部工具栏的 **分享按钮**（方框加箭头图标）
3. 滚动菜单，选择 **「添加到主屏幕」**
4. 确认名称后点击「添加」

> iOS 仅 Safari 支持 PWA 安装；Chrome for iOS 无法添加到主屏幕。

---

## 本地开发预览

Service Worker 仅在 **HTTPS** 或 **localhost** 下生效。推荐用 Python 内置服务器：

```bash
cd calendar_pwa
python -m http.server 8080
```

打开浏览器访问 `http://localhost:8080`，即可在本地调试完整 PWA 功能（包括 Service Worker）。

颜色计算单元测试：直接在浏览器打开 `test-color-service.html`，查看控制台输出。

---

## GitHub Pages 部署

```bash
# 1. 在 GitHub 新建仓库（如 calendar_pwa），将本目录内容推送到 main 分支
git init
git add .
git commit -m "init pwa"
git remote add origin https://github.com/<your-name>/calendar_pwa.git
git push -u origin main

# 2. 在仓库页面：Settings → Pages → Source 选 "main / (root)" → Save
# 3. 约 1 分钟后访问：https://<your-name>.github.io/calendar_pwa/
```

GitHub Pages 免费托管静态文件，天然支持 HTTPS，无需额外配置。

---

## 数据存储

| localStorage 键 | 内容 |
|----------------|------|
| `workcal_log_yyyy-MM-dd` | 对应日期的日志文本 |
| `workcal_holiday_{year}` | 当年节假日数据（JSON，网络获取后缓存） |

**迁移注意事项**：数据存储在浏览器本地，更换设备或清除浏览器缓存后数据会丢失。如需备份，可通过浏览器开发者工具（Application → Local Storage）手动导出。

---

## 假日数据（三层降级）

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1（主源） | `holiday-cn`（GitHub raw JSON） | 实时联网获取，最准确 |
| 2（备源） | `timor.tech` API | 主源失败时自动切换 |
| 3（降级） | 周六/日规则 | 网络完全不可用时，仅以周末判断非工作日 |

获取成功后数据缓存至 localStorage，下次离线打开时直接使用缓存，无需再次联网。

---

## 浏览器兼容性

| 平台 | 支持情况 |
|------|---------|
| Android Chrome 80+ | ✅ 完整支持（含 PWA 安装） |
| iOS Safari 14+ | ✅ 支持（含添加到主屏幕） |
| 桌面 Chrome / Edge | ✅ 支持 |
| Firefox（桌面） | ✅ 功能正常（PWA 安装支持有限） |
| IE / 旧版浏览器 | ❌ 不支持 |
