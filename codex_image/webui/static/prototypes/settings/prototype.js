/*
 * PROTOTYPE — throwaway, never ship.
 * Three variants of unified role-aware settings, switchable via ?variant=A|B|C.
 */

const VARIANTS = [
  { key: "A", name: "Codex 经典双栏" },
  { key: "B", name: "管理三栏控制台" },
  { key: "C", name: "搜索优先工作台" },
];

const SECTIONS = [
  { key: "account", group: "personal", label: "账户与安全", icon: "◎", desc: "身份、密码与浏览器会话", keywords: "用户 登录 退出 密码 会话 安全" },
  { key: "appearance", group: "personal", label: "外观与语言", icon: "◐", desc: "主题和界面语言", keywords: "主题 深色 浅色 语言" },
  { key: "providers", group: "personal", label: "API 供应商", icon: "◇", desc: "个人凭据与部门通道", keywords: "API Key 模型 供应商 部门" },
  { key: "notifications", group: "personal", label: "通知", icon: "◌", desc: "站内与系统通知", keywords: "任务 完成 失败 系统 提醒" },
  { key: "usage", group: "personal", label: "存储与用量", icon: "◒", desc: "个人额度和资源使用", keywords: "容量 存储 额度 空间 用量" },
  { key: "users", group: "admin", label: "用户管理", icon: "♙", desc: "创建、停用和恢复账号", keywords: "账号 用户 临时密码 角色" },
  { key: "catalog", group: "admin", label: "供应商目录", icon: "▦", desc: "接口、模型和版本白名单", keywords: "模型 Base URL 版本 白名单" },
  { key: "department", group: "admin", label: "部门供应商与额度", icon: "⌁", desc: "部门凭据、并发与配额", keywords: "部门 API Key 并发 配额" },
  { key: "shared", group: "admin", label: "共享资产与存储", icon: "▧", desc: "共享素材与存储池", keywords: "素材 图库 模板 共享 存储" },
  { key: "scheduler", group: "admin", label: "任务调度", icon: "↻", desc: "公平队列与用户并发", keywords: "队列 调度 并发 Worker 任务" },
  { key: "content", group: "admin", label: "用户内容只读查看", icon: "◉", desc: "任务、资产和用量审阅", keywords: "审阅 任务 图片 资产 用量" },
  { key: "audit", group: "admin", label: "审计日志", icon: "≡", desc: "管理员操作和访问记录", keywords: "日志 操作 访问 安全 审计" },
];

const params = new URLSearchParams(window.location.search);
const initialVariant = String(params.get("variant") || "A").toUpperCase();
const initialRole = params.get("role") === "user" ? "user" : "admin";
const initialSection = params.get("section") || (initialVariant === "C" ? "home" : "account");

const state = {
  variant: VARIANTS.some((item) => item.key === initialVariant) ? initialVariant : "A",
  role: initialRole,
  section: initialSection,
  screen: params.get("screen") === "workspace" ? "workspace" : "settings",
  query: "",
  dirty: false,
  accountOpen: false,
  theme: "light",
  status: "原型已加载",
  selectedUser: "林小满",
};

const root = document.querySelector("#prototypeRoot");

function visibleSections() {
  return SECTIONS.filter((item) => state.role === "admin" || item.group === "personal");
}

function currentSection() {
  return SECTIONS.find((item) => item.key === state.section) || SECTIONS[0];
}

function filteredSections(group) {
  const query = state.query.trim().toLowerCase();
  return visibleSections().filter((item) => {
    if (group && item.group !== group) return false;
    if (!query) return true;
    return `${item.label} ${item.desc} ${item.keywords}`.toLowerCase().includes(query);
  });
}

function updateUrl() {
  const next = new URL(window.location.href);
  next.searchParams.set("variant", state.variant);
  next.searchParams.set("role", state.role);
  next.searchParams.set("section", state.section);
  next.searchParams.set("screen", state.screen);
  window.history.replaceState({}, "", next);
}

function variantMeta() {
  return VARIANTS.find((item) => item.key === state.variant) || VARIANTS[0];
}

function initials() {
  return state.role === "admin" ? "AD" : "LX";
}

function identityName() {
  return state.role === "admin" ? "admin" : "linxiaoman";
}

function roleName() {
  return state.role === "admin" ? "系统管理员" : "普通用户";
}

function prototypeChrome() {
  const meta = variantMeta();
  return `
    <div class="prototype-badge">PROTOTYPE · THROWAWAY</div>
    <div class="prototype-controls" aria-label="原型控制">
      <button type="button" data-role="user" class="${state.role === "user" ? "active" : ""}">普通用户</button>
      <button type="button" data-role="admin" class="${state.role === "admin" ? "active" : ""}">管理员</button>
    </div>
    <div class="prototype-switcher" aria-label="原型方案切换器">
      <button type="button" data-action="previous-variant" aria-label="上一个方案">←</button>
      <div class="switcher-label">${meta.key} — ${meta.name}<small>键盘 ← / → 切换</small></div>
      <button type="button" data-action="next-variant" aria-label="下一个方案">→</button>
    </div>
    <div class="prototype-state" aria-live="polite">
      <strong>PROTOTYPE STATE</strong>
      variant: ${state.variant}<br>
      role: ${state.role}<br>
      screen: ${state.screen}<br>
      section: ${state.section}<br>
      dirty: ${state.dirty}<br>
      query: ${escapeHtml(state.query || "-")}<br>
      status: ${escapeHtml(state.status)}
    </div>
  `;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  if (state.role === "user" && currentSection().group === "admin") state.section = "account";
  root.innerHTML = `${state.screen === "workspace" ? renderWorkspace() : renderSettings()}${prototypeChrome()}`;
  updateUrl();
}

function renderWorkspace() {
  return `
    <main class="workspace-mock">
      <aside class="workspace-sidebar">
        <div class="brand-lockup">
          <div class="brand-mark">✦</div>
          <div class="brand-copy"><strong>iLab GPT</strong><span>CONJURE</span></div>
        </div>
        <div class="workspace-tools">
          <button class="button primary new-task" type="button">＋ 新建任务</button>
          <label class="search-field"><span>⌕</span><input placeholder="搜索任务"></label>
        </div>
        <div class="task-mock-list">
          <div class="task-mock-label">今天</div>
          <div class="task-mock active">夏日新品海报</div>
          <div class="task-mock">品牌主视觉延展</div>
          <div class="task-mock">产品白底图优化</div>
          <div class="task-mock-label">昨天</div>
          <div class="task-mock">618 直播间封面</div>
          <div class="task-mock">代温灸膏场景图</div>
        </div>
        <div class="workspace-account-wrap">
          ${state.accountOpen ? renderAccountPopover() : ""}
          <button class="workspace-account" type="button" data-action="toggle-account" aria-expanded="${state.accountOpen}">
            <span class="avatar">${initials()}</span>
            <span class="account-copy"><strong>${identityName()}</strong><span>${roleName()}</span></span>
            <span class="account-chevron">⌃</span>
          </button>
        </div>
      </aside>
      <section class="workspace-main">
        <header class="workspace-top">
          <div><h1>图片工作区</h1><span style="color:var(--muted);font-size:13px">原有工作流保持不变</span></div>
          <div class="workspace-actions"><button class="button">暂无排队</button><button class="button">◐</button><button class="button" data-action="open-settings">⚙</button></div>
        </header>
        <div class="workspace-grid">
          <article class="workspace-panel"><h2>参考输入</h2><div class="placeholder-lines"><i></i><i></i><i></i></div></article>
          <article class="workspace-panel"><h2>提示词与生成设置</h2><div class="placeholder-lines"><i></i><i></i><i></i></div></article>
          <article class="workspace-panel"><h2>参数</h2><div class="placeholder-lines"><i></i><i></i><i></i></div></article>
          <article class="workspace-panel"><h2>生成结果</h2><div class="placeholder-lines"><i></i><i></i><i></i></div></article>
        </div>
      </section>
    </main>`;
}

function renderAccountPopover() {
  return `
    <div class="account-popover">
      <div class="account-popover-header">
        <span class="avatar">${initials()}</span>
        <span class="account-copy"><strong>${identityName()}</strong><span>${roleName()}</span></span>
      </div>
      <button type="button" data-action="open-settings"><span class="icon">⚙</span>系统设置</button>
      <button type="button" class="logout" data-action="prototype-logout"><span class="icon">↪</span>退出登录</button>
    </div>`;
}

function renderSettings() {
  if (state.variant === "B") return renderVariantB();
  if (state.variant === "C") return renderVariantC();
  return renderVariantA();
}

function searchField(placeholder = "搜索设置…") {
  return `<label class="search-field settings-search"><span>⌕</span><input data-search-settings value="${escapeHtml(state.query)}" placeholder="${placeholder}" aria-label="${placeholder}"></label>`;
}

function renderMenu(group) {
  const items = filteredSections(group);
  if (!items.length) return `<div class="empty-results">没有匹配的设置</div>`;
  return items.map((item) => `
    <button type="button" class="settings-nav-button ${state.section === item.key ? "active" : ""}" data-section="${item.key}">
      <span class="icon">${item.icon}</span><span>${item.label}</span>
    </button>`).join("");
}

function renderVariantA() {
  return `
    <main class="settings-root variant-a">
      <aside class="settings-sidebar">
        <button class="settings-nav-button back-button" type="button" data-action="return-app"><span class="icon">←</span>返回应用</button>
        ${searchField()}
        <nav class="settings-menu" aria-label="系统设置菜单">
          <div class="settings-group-title">个人</div>
          ${renderMenu("personal")}
          ${state.role === "admin" ? `<div class="settings-group-title">系统管理</div>${renderMenu("admin")}` : ""}
        </nav>
        <div class="sidebar-identity"><span class="avatar">${initials()}</span><span class="account-copy"><strong>${identityName()}</strong><span>${roleName()}</span></span></div>
      </aside>
      <section class="settings-content">${renderContent()}</section>
    </main>`;
}

function renderVariantB() {
  const active = currentSection();
  const group = active.group === "admin" && state.role === "admin" ? "admin" : "personal";
  return `
    <main class="settings-root variant-b">
      <aside class="icon-rail" aria-label="设置分区">
        <div class="rail-brand">✦</div>
        <button class="rail-button" type="button" data-action="return-app" title="返回应用">←<span>返回</span></button>
        <button class="rail-button ${group === "personal" ? "active" : ""}" type="button" data-group="personal">◎<span>个人</span></button>
        ${state.role === "admin" ? `<button class="rail-button ${group === "admin" ? "active" : ""}" type="button" data-group="admin">▦<span>管理</span></button>` : ""}
        <div class="rail-spacer"></div>
        <div class="rail-avatar">${initials()}</div>
      </aside>
      <aside class="section-pane">
        <h2>${group === "admin" ? "系统管理" : "个人设置"}</h2>
        ${searchField("筛选当前分区…")}
        <nav>${renderMenu(group)}</nav>
      </aside>
      <section class="settings-content">${renderContent()}</section>
    </main>`;
}

function renderVariantC() {
  const isHome = state.section === "home";
  return `
    <main class="settings-root variant-c">
      <header class="settings-topbar">
        <div class="topbar-brand"><button class="button ghost compact" type="button" data-action="return-app">←</button><button class="button ghost compact" type="button" data-section="home">系统设置</button></div>
        ${searchField("搜索并直达任何设置…")}
        <div class="topbar-account"><span class="avatar">${initials()}</span><span class="account-copy"><strong>${identityName()}</strong><span>${roleName()}</span></span></div>
      </header>
      ${isHome ? renderDirectory() : `<section class="settings-content"><div class="content-inner"><button class="button ghost compact content-back" type="button" data-section="home">← 全部设置</button>${renderContent(true)}</div></section>`}
    </main>`;
}

function renderDirectory() {
  const items = filteredSections();
  return `
    <section class="settings-directory">
      <div class="directory-kicker">统一设置 · ${roleName()}</div>
      <h1 class="directory-heading">搜索、浏览并管理你的工作空间。</h1>
      <div class="directory-list">
        ${items.length ? items.map((item) => `
          <button class="directory-row" type="button" data-section="${item.key}">
            <strong>${item.label}</strong><small>${item.desc}</small><span>↗</span>
          </button>`).join("") : `<div class="empty-results">没有匹配的设置</div>`}
      </div>
    </section>`;
}

function renderContent(withoutWrapper = false) {
  const section = currentSection();
  const body = `
    <header class="content-heading">
      <div><h1>${section.label}</h1><p>${section.desc}</p></div>
      ${section.group === "admin" ? `<span class="role-chip">仅系统管理员</span>` : ""}
    </header>
    <div class="section-stack">${sectionBody(section.key)}</div>`;
  return withoutWrapper ? body : `<div class="content-inner">${body}</div>`;
}

function sectionBody(key) {
  switch (key) {
    case "account": return accountSection();
    case "appearance": return appearanceSection();
    case "providers": return providersSection();
    case "notifications": return notificationsSection();
    case "usage": return usageSection();
    case "users": return usersSection();
    case "catalog": return catalogSection();
    case "department": return departmentSection();
    case "shared": return sharedSection();
    case "scheduler": return schedulerSection();
    case "content": return contentSection();
    case "audit": return auditSection();
    default: return accountSection();
  }
}

function accountSection() {
  return `
    <section class="section-block"><h2>账户</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>用户名</strong><span>账号由系统管理员创建，不支持自助修改</span></div><strong>${identityName()}</strong></div>
      <div class="settings-row"><div class="row-copy"><strong>账户角色</strong><span>决定可见菜单和操作权限</span></div><span class="role-chip">${roleName()}</span></div>
    </div></section>
    <section class="section-block"><h2>修改密码</h2><div class="settings-card">
      <div class="settings-form-grid"><label class="full">当前密码<input class="field" type="password" value="prototype"></label><label>新密码<input class="field" type="password" value="prototype-new"></label><label>确认新密码<input class="field" type="password" value="prototype-new"></label></div>
      <div class="form-actions"><button class="button primary" type="button" data-action="save">更新密码</button></div>
    </div></section>
    <section class="section-block"><h2>浏览器会话</h2><div class="settings-card">
      <table class="data-table"><thead><tr><th>设备</th><th>最近活动</th><th>状态</th><th></th></tr></thead><tbody>
        <tr><td>Chrome · macOS</td><td>刚刚</td><td><span class="status-dot">当前会话</span></td><td></td></tr>
        <tr><td>Edge · Windows</td><td>2 小时前</td><td>有效</td><td><button class="button compact danger" type="button" data-high-impact="退出该设备？">退出</button></td></tr>
      </tbody></table>
      <div class="form-actions"><button class="button" type="button" data-high-impact="退出其他所有设备？">退出其他设备</button><button class="button danger" type="button" data-high-impact="退出全部设备？当前设备也会返回登录页。">退出全部设备</button></div>
    </div></section>`;
}

function appearanceSection() {
  return `
    <section class="section-block"><h2>外观</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>主题</strong><span>立即应用到图片工作区和系统设置</span></div><div class="segmented"><button type="button" data-theme="light" class="${state.theme === "light" ? "active" : ""}">浅色</button><button type="button" data-theme="dark" class="${state.theme === "dark" ? "active" : ""}">深色</button></div></div>
      <div class="settings-row"><div class="row-copy"><strong>界面密度</strong><span>控制列表行高与内容留白</span></div><select class="field"><option>舒适</option><option>紧凑</option></select></div>
    </div></section>
    <section class="section-block"><h2>语言</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>界面语言</strong><span>切换后立即生效</span></div><select class="field"><option>简体中文</option><option>English</option><option>日本語</option></select></div>
    </div></section>`;
}

function providersSection() {
  return `
    <section class="section-block"><h2>可用供应商</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>九典统一生图 API</strong><span>部门供应商 · gpt-image-2 · 凭据由管理员维护</span></div><span class="status-dot">可用</span></div>
      <div class="settings-row"><div class="row-copy"><strong>我的云雾 API</strong><span>个人供应商 · API Key 已配置</span></div><button class="button compact" type="button">编辑</button></div>
    </div></section>
    <section class="section-block"><h2>个人凭据</h2><div class="settings-card">
      <div class="settings-form-grid"><label>供应商<select class="field"><option>云雾 API</option></select></label><label>模型<select class="field"><option>gpt-image-2</option></select></label><label class="full">API Key<input class="field" type="password" value="sk-prototype-only"></label></div>
      <div class="form-actions"><button class="button" type="button">测试连接</button><button class="button primary" type="button" data-action="save">保存凭据</button></div>
    </div></section>`;
}

function notificationsSection() {
  return `
    <section class="section-block"><h2>任务通知</h2><div class="settings-card">
      ${toggleRow("站内通知", "任务完成或失败时在工作区通知中心提醒", true)}
      ${toggleRow("系统通知", "浏览器允许通知时在桌面显示提醒", false)}
      ${toggleRow("失败重试提醒", "任务中断或供应商失败时单独提醒", true)}
    </div></section>`;
}

function usageSection() {
  return `
    <section class="section-block"><h2>个人存储</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>已使用 3.8 GB</strong><span>个人图库、参考图、生成结果和回收站</span><div class="progress"><i></i></div></div><div class="metric"><strong>10 GB</strong><span>个人额度</span></div></div>
      <div class="settings-row"><div class="row-copy"><strong>回收站</strong><span>占用 420 MB，图片文件默认保留 30 天</span></div><button class="button compact" type="button">查看回收站</button></div>
    </div></section>
    <section class="section-block"><h2>本月用量</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>生成任务</strong><span>7 月 1 日至今</span></div><div class="metric"><strong>186</strong><span>个任务</span></div></div>
      <div class="settings-row"><div class="row-copy"><strong>部门额度</strong><span>统一供应商调用单位</span></div><div class="metric"><strong>42%</strong><span>剩余 5,800</span></div></div>
    </div></section>`;
}

function usersSection() {
  return `
    <section class="section-block"><div class="settings-card">
      <div class="toolbar"><strong>部门用户 · 12</strong><button class="button primary compact" type="button" data-action="mark-dirty">＋ 创建用户</button></div>
      <table class="data-table"><thead><tr><th>用户</th><th>状态</th><th>存储</th><th>最近登录</th><th></th></tr></thead><tbody>
        ${userRow("林小满", "linxiaoman", "正常", "3.8 / 10 GB", "8 分钟前")}
        ${userRow("周景行", "zhoujinghang", "正常", "6.1 / 10 GB", "昨天")}
        ${userRow("唐可", "tangke", "已停用", "1.2 / 5 GB", "12 天前")}
      </tbody></table>
    </div></section>
    <section class="section-block"><h2>创建用户</h2><div class="settings-card">
      <div class="settings-form-grid"><label>用户名<input class="field" value="new-user"></label><label>初始存储额度<select class="field"><option>10 GB</option><option>5 GB</option></select></label></div>
      <div class="form-actions"><button class="button primary" type="button" data-action="save">创建并生成临时密码</button></div>
    </div></section>`;
}

function catalogSection() {
  return `
    <section class="section-block"><div class="settings-card">
      <div class="toolbar"><strong>供应商目录 · 3 个版本</strong><button class="button primary compact" type="button" data-action="mark-dirty">发布新版本</button></div>
      <table class="data-table"><thead><tr><th>供应商</th><th>调用方式</th><th>模型</th><th>版本</th><th>状态</th><th></th></tr></thead><tbody>
        <tr><td>OpenAI Compatible</td><td>Images</td><td>gpt-image-2</td><td>v3</td><td><span class="status-dot">启用</span></td><td><button class="button compact danger" data-high-impact="停用该供应商版本？历史任务仍保留。">停用</button></td></tr>
        <tr><td>Volcengine Ark</td><td>Images</td><td>doubao-seedream</td><td>v1</td><td><span class="status-dot">启用</span></td><td><button class="button compact">查看</button></td></tr>
      </tbody></table>
    </div></section>
    <section class="section-block"><h2>发布不可覆盖的新版本</h2><div class="settings-card">
      <div class="settings-form-grid"><label>显示名称<input class="field" value="OpenAI Compatible"></label><label>调用方式<select class="field"><option>Images API</option><option>Responses API</option></select></label><label class="full">Base URL<input class="field" value="https://api.example.com/v1"></label><label class="full">模型白名单<input class="field" value="gpt-image-2"></label></div>
      <div class="form-actions"><button class="button primary" data-action="save">发布版本</button></div>
    </div></section>`;
}

function departmentSection() {
  return `
    <section class="section-block"><h2>部门供应商</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>九典统一生图 API</strong><span>全局并发 8 · API Key 已加密保存</span></div><span class="status-dot">启用</span></div>
      <div class="settings-form-grid"><label>部门总额度<input class="field" type="number" value="100000"></label><label>全局并发上限<input class="field" type="number" value="8"></label><label class="full">更新 API Key<input class="field" type="password" value="department-prototype-key"></label></div>
      <div class="form-actions"><button class="button primary" data-action="save">保存部门配置</button></div>
    </div></section>
    <section class="section-block"><h2>按用户额度</h2><div class="settings-card"><table class="data-table"><thead><tr><th>用户</th><th>额度</th><th>已使用</th><th>并发</th></tr></thead><tbody><tr><td>林小满</td><td><input class="field" value="12000"></td><td>6,200</td><td>2</td></tr><tr><td>周景行</td><td><input class="field" value="10000"></td><td>8,900</td><td>2</td></tr></tbody></table><div class="form-actions"><button class="button primary" data-action="save">保存额度</button></div></div></section>`;
}

function sharedSection() {
  return `
    <section class="section-block"><h2>共享存储池</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>已使用 82 GB</strong><span>共享图库、模板和提示词片段</span><div class="progress"><i style="width:68%"></i></div></div><div class="metric"><strong>120 GB</strong><span>总额度</span></div></div>
      <div class="settings-form-grid"><label class="full">共享存储总额度（GB）<input class="field" type="number" value="120"></label></div><div class="form-actions"><button class="button primary" data-action="save">保存额度</button></div>
    </div></section>
    <section class="section-block"><h2>共享资产</h2><div class="settings-card"><table class="data-table"><thead><tr><th>名称</th><th>类型</th><th>发布者</th><th>版本</th><th></th></tr></thead><tbody><tr><td>九典品牌 Logo</td><td>图片</td><td>admin</td><td>v4</td><td><button class="button compact">查看</button></td></tr><tr><td>代温灸膏产品图</td><td>参考素材</td><td>linxiaoman</td><td>v2</td><td><button class="button compact danger" data-high-impact="停用该共享资产？历史任务引用不受影响。">停用</button></td></tr></tbody></table></div></section>`;
}

function schedulerSection() {
  return `
    <section class="section-block"><h2>调度状态</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>公平队列运行中</strong><span>按用户轮转选择下一项任务</span></div><span class="status-dot">健康</span></div>
      <div class="settings-form-grid"><label>默认用户并发<input class="field" type="number" value="2"></label><label>Worker 租约（秒）<input class="field" type="number" value="60"></label></div><div class="form-actions"><button class="button primary" data-action="save">保存调度配置</button></div>
    </div></section>
    <section class="section-block"><h2>当前队列</h2><div class="settings-card"><table class="data-table"><thead><tr><th>用户</th><th>等待</th><th>运行中</th><th>可调度</th></tr></thead><tbody><tr><td>林小满</td><td>3</td><td>2</td><td>否，达到并发</td></tr><tr><td>周景行</td><td>2</td><td>1</td><td><span class="status-dot">是</span></td></tr></tbody></table></div></section>`;
}

function contentSection() {
  return `
    <section class="section-block"><h2>选择用户</h2><div class="settings-card"><div class="settings-row"><div class="row-copy"><strong>${state.selectedUser}</strong><span>管理员查看行为会写入审计日志</span></div><select class="field" data-selected-user><option>林小满</option><option>周景行</option><option>唐可</option></select></div></div></section>
    <section class="section-block"><h2>只读摘要</h2><div class="settings-card">
      <div class="settings-row"><div class="row-copy"><strong>任务与结果</strong><span>186 个任务 · 420 张图片</span></div><button class="button compact" type="button" data-action="audit-view">查看</button></div>
      <div class="settings-row"><div class="row-copy"><strong>个人资产</strong><span>54 项 · 2.1 GB</span></div><button class="button compact" type="button" data-action="audit-view">查看</button></div>
      <div class="settings-row"><div class="row-copy"><strong>供应商用量</strong><span>本月 6,200 调用单位</span></div><button class="button compact" type="button" data-action="audit-view">查看</button></div>
    </div></section>`;
}

function auditSection() {
  return `
    <section class="section-block"><div class="settings-card">
      <div class="toolbar"><strong>最近审计事件</strong><div style="display:flex;gap:8px"><select class="field"><option>全部操作</option><option>用户管理</option><option>内容访问</option></select><button class="button compact">导出</button></div></div>
      <table class="data-table"><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>结果</th></tr></thead><tbody>
        <tr><td>10:42:16</td><td>admin</td><td>查看用户任务</td><td>林小满</td><td>成功</td></tr>
        <tr><td>09:18:02</td><td>admin</td><td>更新部门额度</td><td>九典统一生图 API</td><td>成功</td></tr>
        <tr><td>昨天 17:26</td><td>admin</td><td>重置临时密码</td><td>周景行</td><td>成功</td></tr>
      </tbody></table>
    </div></section>`;
}

function toggleRow(title, copy, on) {
  return `<div class="settings-row"><div class="row-copy"><strong>${title}</strong><span>${copy}</span></div><button type="button" class="switch ${on ? "on" : ""}" data-action="toggle" aria-pressed="${on}"></button></div>`;
}

function userRow(name, username, status, storage, login) {
  return `<tr data-user="${name}"><td><strong>${name}</strong><br><small style="color:var(--muted)">${username}</small></td><td>${status === "正常" ? `<span class="status-dot">${status}</span>` : status}</td><td>${storage}</td><td>${login}</td><td><button class="button compact" type="button">详情</button> <button class="button compact danger" type="button" data-high-impact="${status === "正常" ? "停用" : "恢复"}${name}的账号？">${status === "正常" ? "停用" : "恢复"}</button></td></tr>`;
}

function setVariant(offset) {
  const index = VARIANTS.findIndex((item) => item.key === state.variant);
  state.variant = VARIANTS[(index + offset + VARIANTS.length) % VARIANTS.length].key;
  state.section = state.variant === "C" ? "home" : (state.role === "admin" ? "users" : "account");
  state.query = "";
  state.status = `已切换到方案 ${state.variant}`;
  render();
}

function leaveCurrentScreen(next) {
  if (state.dirty && !window.confirm("有尚未保存的修改。放弃修改并继续吗？")) return;
  state.dirty = false;
  state.screen = next;
  state.accountOpen = false;
  state.status = next === "settings" ? "已进入系统设置" : "已返回图片工作区";
  render();
}

function toast(message) {
  state.status = message;
  const old = document.querySelector(".toast");
  old?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 1600);
  const inspector = document.querySelector(".prototype-state");
  if (inspector) inspector.innerHTML = `<strong>PROTOTYPE STATE</strong>variant: ${state.variant}<br>role: ${state.role}<br>screen: ${state.screen}<br>section: ${state.section}<br>dirty: ${state.dirty}<br>query: ${escapeHtml(state.query || "-")}<br>status: ${escapeHtml(state.status)}`;
}

root.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-section], [data-group], [data-user]");
  if (!target) return;
  if (target.dataset.action === "previous-variant") return setVariant(-1);
  if (target.dataset.action === "next-variant") return setVariant(1);
  if (target.dataset.action === "return-app") return leaveCurrentScreen("workspace");
  if (target.dataset.action === "open-settings") return leaveCurrentScreen("settings");
  if (target.dataset.action === "toggle-account") { state.accountOpen = !state.accountOpen; return render(); }
  if (target.dataset.action === "prototype-logout") return toast("原型：将退出当前会话并返回登录页");
  if (target.dataset.action === "mark-dirty") { state.dirty = true; return toast("已进入编辑状态（原型不保存）"); }
  if (target.dataset.action === "save") { state.dirty = false; return toast("原型：修改已保存"); }
  if (target.dataset.action === "toggle") {
    target.classList.toggle("on");
    target.setAttribute("aria-pressed", target.classList.contains("on") ? "true" : "false");
    state.dirty = false;
    return toast("个人偏好已即时保存（原型）");
  }
  if (target.dataset.action === "audit-view") return toast("原型：已记录管理员只读查看事件");
  if (target.dataset.highImpact) {
    if (window.confirm(`${target.dataset.highImpact}\n\n这是原型，不会修改真实数据。`)) toast("原型：操作已确认，真实数据未改变");
    return;
  }
  if (target.dataset.theme) {
    state.theme = target.dataset.theme;
    state.dirty = false;
    state.status = `主题已切换为${state.theme === "dark" ? "深色" : "浅色"}`;
    return render();
  }
  if (target.dataset.role) {
    state.role = target.dataset.role;
    if (state.role === "user" && currentSection().group === "admin") state.section = state.variant === "C" ? "home" : "account";
    state.status = `正在预览${roleName()}界面`;
    return render();
  }
  if (target.dataset.group) {
    state.section = target.dataset.group === "admin" ? "users" : "account";
    state.query = "";
    return render();
  }
  if (target.dataset.section) {
    if (state.dirty && !window.confirm("有尚未保存的修改。放弃修改并切换页面吗？")) return;
    state.dirty = false;
    state.section = target.dataset.section;
    state.query = "";
    state.status = state.section === "home" ? "已返回设置目录" : `已打开${currentSection().label}`;
    return render();
  }
  if (target.dataset.user) {
    state.selectedUser = target.dataset.user;
    state.status = `已选择用户 ${state.selectedUser}`;
    return toast(state.status);
  }
});

root.addEventListener("input", (event) => {
  const input = event.target;
  if (input.matches("[data-search-settings]")) {
    state.query = input.value;
    const position = input.selectionStart;
    render();
    const next = document.querySelector("[data-search-settings]");
    next?.focus();
    next?.setSelectionRange(position, position);
    return;
  }
  if (input.matches("input, select, textarea")) {
    state.dirty = true;
    state.status = "存在未保存的修改";
    const inspector = document.querySelector(".prototype-state");
    if (inspector) inspector.innerHTML = `<strong>PROTOTYPE STATE</strong>variant: ${state.variant}<br>role: ${state.role}<br>screen: ${state.screen}<br>section: ${state.section}<br>dirty: true<br>query: ${escapeHtml(state.query || "-")}<br>status: 存在未保存的修改`;
  }
});

root.addEventListener("change", (event) => {
  const select = event.target.closest("[data-selected-user]");
  if (!select) return;
  state.selectedUser = select.value;
  state.dirty = false;
  toast(`已切换只读查看对象：${state.selectedUser}`);
});

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select, [contenteditable]")) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); setVariant(-1); }
  if (event.key === "ArrowRight") { event.preventDefault(); setVariant(1); }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

render();
