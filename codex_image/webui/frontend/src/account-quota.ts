// @ts-nocheck
import { getLegacyBridge } from "./state";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

let accountQuotaFeatureInitialized = false;

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") {
    throw new Error("Legacy method " + name + " is not initialized");
  }
  return method(...args);
}

function setStatus(message: any, type?: any): void { legacyMethod("setStatus", message, type); }
function escapeHtml(value: any): string { return legacyMethod("escapeHtml", value); }

async function refreshAccountQuota(refresh: any = false) {
  try {
    const response = await fetch(`/api/accounts${refresh ? "?refresh=true" : ""}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "额度读取失败");
    state.accountQuota = {
      items: Array.isArray(data.items) ? data.items : [],
      summary: data.summary || {},
      message: data.message || "",
    };
    renderAccountQuota();
    if (refresh) setStatus("账号额度已刷新", "ok");
  } catch (error: any) {
    if (els.accountQuotaSummary) els.accountQuotaSummary.textContent = error.message || "额度读取失败";
    setStatus(error.message || "额度读取失败", "error");
  }
}

function renderAccountQuota() {
  const items = state.accountQuota.items || [];
  const summary = state.accountQuota.summary || {};
  const count = Number(summary.count || items.length || 0);
  if (els.accountQuotaBadge) {
    els.accountQuotaBadge.textContent = String(count);
    els.accountQuotaBadge.classList.toggle("hidden", count === 0);
  }
  if (els.accountQuotaSummary) {
    if (state.accountQuota.message) {
      els.accountQuotaSummary.textContent = state.accountQuota.message;
    } else if (count) {
      const limited = Number(summary.limited_count || 0);
      const unknown = Number(summary.unknown_count || 0);
      const disabled = Number(summary.disabled_count || 0);
      const usableChannels = Number(summary.usable_channel_count ?? Math.max(0, count - disabled));
      els.accountQuotaSummary.textContent = `账号 ${count} · 参与轮询 ${usableChannels} · 停用 ${disabled} · 限额 ${limited} · 未知 ${unknown}`;
    } else {
      els.accountQuotaSummary.textContent = "暂无可用本地账号";
    }
  }
  if (!els.accountQuotaList) return;
  if (!items.length) {
    els.accountQuotaList.innerHTML = `<div class="queue-empty">${escapeHtml(state.accountQuota.message || "暂无额度缓存，点击刷新额度")}</div>`;
    return;
  }
  els.accountQuotaList.innerHTML = items.map((item) => accountQuotaCardHtml(item)).join("");
}

function accountQuotaCardHtml(item: any) {
  const status = String(item.status || "unknown");
  const manualDisabled = Boolean(item.manual_disabled);
  const displayStatus = manualDisabled ? "disabled" : status;
  const queueEnabled = item.queue_enabled !== false && !manualDisabled;
  const plan = item.plan && item.plan !== "unknown" ? item.plan : "未知套餐";
  const identity = item.email || item.user_id || item.account_id || item.account_key || "";
  const error = item.refresh_error ? `<div class="account-quota-error">${escapeHtml(item.refresh_error)}</div>` : "";
  const canToggle = String(item.account_key || "").startsWith("cockpit:");
  const toggle = canToggle ? `
    <button
      class="account-quota-toggle${queueEnabled ? " active" : ""}"
      type="button"
      role="switch"
      aria-checked="${queueEnabled ? "true" : "false"}"
      aria-label="参与轮询：${queueEnabled ? "开" : "关"}"
      title="参与轮询：${queueEnabled ? "开" : "关"}"
      data-account-manual-disabled-key="${escapeHtml(item.account_key || "")}"
      data-account-manual-disabled-value="${manualDisabled ? "true" : "false"}"
    >
      <span class="account-quota-switch-track" aria-hidden="true"></span>
    </button>
  ` : "";
  return `
    <article class="account-quota-card ${accountQuotaStatusClass(displayStatus)}">
      <div class="account-quota-card-head">
        <div>
          <div class="account-quota-name">${escapeHtml(item.label || item.account_key || "账号")}</div>
          <div class="account-quota-meta">${escapeHtml([plan, identity].filter(Boolean).join(" · "))}</div>
        </div>
        <span class="account-quota-status">${escapeHtml(accountQuotaStatusText(displayStatus))}</span>
      </div>
      <div class="account-quota-limit-head">
        <div class="account-quota-limit-title">Codex 额度</div>
        ${toggle}
      </div>
      ${accountQuotaLimitRowsHtml(item)}
      ${error}
    </article>
  `;
}

function accountQuotaLimitRowsHtml(item: any) {
  const rows = [
    ["5 小时", item.codex_5h_percent, item.codex_limits?.five_hour?.reset_after],
    ["本周", item.codex_week_percent, item.codex_limits?.week?.reset_after],
  ];
  return `
    <div class="account-quota-limits">
      ${rows.map(([label, percent, resetAfter]) => accountQuotaLimitRowHtml(label, percent, resetAfter)).join("")}
    </div>
  `;
}

function accountQuotaLimitRowHtml(label: any, percent: any, resetAfter: any) {
  const normalized = accountQuotaPercentValue(percent);
  const percentText = normalized === null ? "未知" : `${normalized}%`;
  const resetText = resetAfter ? `重置 ${resetAfter}` : "重置时间未知";
  const style = normalized === null ? "--quota-percent: 0%" : `--quota-percent: ${normalized}%`;
  return `
    <div class="account-quota-limit-row">
      <div class="account-quota-limit-label">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(percentText)}</strong>
      </div>
      <div class="account-quota-limit-bar" style="${style}"><span></span></div>
      <div class="account-quota-reset">${escapeHtml(resetText)}</div>
    </div>
  `;
}

function accountQuotaPercentValue(percent: any) {
  if (percent === null || percent === undefined || percent === "") return null;
  const value = Number(percent);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function accountQuotaStatusClass(status: any) {
  if (status === "ok") return "ok";
  if (status === "limited") return "limited";
  if (status === "disabled") return "disabled";
  if (status === "error" || status === "disabled") return "error";
  return "unknown";
}

function accountQuotaStatusText(status: any) {
  if (status === "ok") return "可用";
  if (status === "limited") return "已限额";
  if (status === "error") return "刷新失败";
  if (status === "disabled") return "已停用";
  return "未知";
}

async function toggleAccountQueueEnabled(accountKey: any, manualDisabled: any, button: any = null) {
  if (!accountKey) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/accounts/${encodeURIComponent(accountKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "manual_disabled": Boolean(manualDisabled) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "账号设置更新失败");
    state.accountQuota = {
      items: Array.isArray(data.items) ? data.items : [],
      summary: data.summary || {},
      message: data.message || "",
    };
    renderAccountQuota();
    await window.refreshQueue?.();
    setStatus(manualDisabled ? "账号已停用，不参与轮询" : "账号已启用，参与轮询", "ok");
  } catch (error: any) {
    setStatus(error.message || "账号设置更新失败", "error");
    if (button) button.disabled = false;
  }
}

function openAccountQuotaDrawer() {
  els.accountQuotaDrawer?.classList.add("open");
  els.accountQuotaDrawer?.setAttribute("aria-hidden", "false");
  els.accountQuotaButton?.setAttribute("aria-expanded", "true");
  els.accountQuotaDrawerBackdrop?.classList.remove("hidden");
  refreshAccountQuota(false);
}

function closeAccountQuotaDrawer() {
  els.accountQuotaDrawer?.classList.remove("open");
  els.accountQuotaDrawer?.setAttribute("aria-hidden", "true");
  els.accountQuotaButton?.setAttribute("aria-expanded", "false");
  els.accountQuotaDrawerBackdrop?.classList.add("hidden");
}

export function initAccountQuotaFeature() {
  if (accountQuotaFeatureInitialized) return;
  accountQuotaFeatureInitialized = true;
  Object.assign(getLegacyBridge().methods, {
    refreshAccountQuota,
    renderAccountQuota,
    accountQuotaCardHtml,
    accountQuotaLimitRowsHtml,
    accountQuotaLimitRowHtml,
    accountQuotaPercentValue,
    accountQuotaStatusClass,
    accountQuotaStatusText,
    toggleAccountQueueEnabled,
    openAccountQuotaDrawer,
    closeAccountQuotaDrawer,
  });
}
