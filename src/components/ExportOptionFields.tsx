import { useState } from "react";
import { AlertCircle, Info, X } from "lucide-react";

import type { ConversationCandidate, ExportConfig } from "../types";

const defaultConversationLimit = 250;
const searchedConversationLimit = 500;

export function DateRangeField({ config, onChange }: { config: ExportConfig; onChange: (patch: Partial<ExportConfig>) => void }) {
  const hasDateRange = Boolean(config.startDate || config.endDate);

  return (
    <fieldset className="date-range-field">
      <legend>日期范围</legend>
      <label>
        <span>开始日期</span>
        <input
          type="date"
          value={config.startDate ?? ""}
          max={config.endDate || undefined}
          onChange={(event) => onChange({ startDate: event.target.value })}
        />
      </label>
      <label>
        <span>结束日期</span>
        <input
          type="date"
          value={config.endDate ?? ""}
          min={config.startDate || undefined}
          onChange={(event) => onChange({ endDate: event.target.value })}
        />
      </label>
      <button className="ghost-button compact-field-action" type="button" onClick={() => onChange({ startDate: "", endDate: "" })} disabled={!hasDateRange}>
        <X size={14} />
        清除日期
      </button>
    </fieldset>
  );
}

export function ConversationPicker({
  value,
  selectedId,
  conversations,
  loading,
  error,
  onChange,
}: {
  value: string;
  selectedId?: number;
  conversations: ConversationCandidate[];
  loading: boolean;
  error?: string;
  onChange: (value: string, selectedId?: number, selectedIds?: number[]) => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"messages" | "recent">("messages");
  const selected = conversations.find((conversation) => Number(conversation.id) === selectedId) ?? conversations.find((conversation) => conversation.filterValue === value);
  const manualVisible = manualOpen || (!selected && Boolean(value)) || Boolean(error);
  const selectedValue = manualVisible ? "__manual__" : selected ? selected.id : "";
  const hasScannedConversations = conversations.length > 0;
  const filteredConversations = filterAndSortConversations(conversations, query, sortMode);
  const visibleConversations = includeSelectedConversation(
    filteredConversations.slice(0, query.trim() ? searchedConversationLimit : defaultConversationLimit),
    selected,
  );
  const helperText = conversationPickerHelperText({
    loading,
    error,
    selected,
    hasScannedConversations,
    visibleCount: filteredConversations.length,
    totalCount: conversations.length,
    manualVisible,
    query,
    value,
  });

  return (
    <div className="conversation-picker">
      <label>
        <span>会话筛选</span>
        <select
          value={selectedValue}
          onChange={(event) => {
            if (event.target.value === "__manual__") {
              setManualOpen(true);
            } else {
              setManualOpen(false);
              const conversation = conversations.find((item) => item.id === event.target.value);
              onChange(conversation?.filterValue ?? "", conversation ? Number(conversation.id) : undefined, conversation?.chatIds);
            }
          }}
          disabled={loading}
        >
          <option value="">{loading ? "正在读取会话..." : "全部会话"}</option>
          {visibleConversations.map((conversation) => (
            <option value={conversation.id} key={conversation.id}>
              {conversationOptionLabel(conversation)}
            </option>
          ))}
          <option value="__manual__">手动输入...</option>
        </select>
      </label>
      {hasScannedConversations ? (
        <div className="conversation-picker-tools">
          <label>
            <span>搜索会话</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、手机号、邮箱或群聊" />
          </label>
          <label>
            <span>排序</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "messages" | "recent")}>
              <option value="messages">消息最多</option>
              <option value="recent">最近消息</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="conversation-picker-actions">
        <small>{helperText}</small>
        <button className="ghost-button compact-field-action" type="button" onClick={() => onChange("", undefined, undefined)} disabled={!value && !selectedId}>
          <X size={14} />
          清除会话
        </button>
      </div>
      {error ? (
        <p className="mini-warning conversation-picker-warning" role="status">
          <AlertCircle size={15} />
          <span>无法读取会话列表：{error}。这只影响下拉选择；仍可手动输入联系人、手机号或聊天标识来筛选导出。</span>
        </p>
      ) : null}
      {!loading && !error && !hasScannedConversations ? (
        <p className="mini-warning conversation-picker-warning" role="status">
          <Info size={15} />
          <span>这个备份暂时没有可选择的会话；需要筛选单个会话时，可以手动输入。</span>
        </p>
      ) : null}
      {manualVisible ? (
        <label className="manual-conversation-filter">
          <span>手动筛选值</span>
          <input value={value} onChange={(event) => onChange(event.target.value, undefined, undefined)} placeholder="联系人、手机号或聊天标识" />
        </label>
      ) : null}
      {!manualVisible ? (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setManualOpen(true);
            if (selected) onChange("", undefined, undefined);
          }}
        >
          手动输入筛选值
        </button>
      ) : null}
    </div>
  );
}

function conversationPickerHelperText({
  loading,
  error,
  selected,
  hasScannedConversations,
  visibleCount,
  totalCount,
  manualVisible,
  query,
  value,
}: {
  loading: boolean;
  error?: string;
  selected?: ConversationCandidate;
  hasScannedConversations: boolean;
  visibleCount: number;
  totalCount: number;
  manualVisible: boolean;
  query: string;
  value: string;
}): string {
  if (!loading && !error && !selected && !manualVisible && hasScannedConversations && !query.trim() && totalCount > defaultConversationLimit) {
    return `已读取 ${totalCount} 个会话；默认显示前 ${defaultConversationLimit} 个，搜索会查全部。`;
  }
  if (selected) return conversationSummary(selected);
  if (loading) return "正在从备份读取会话列表。";
  if (error) return "会话列表不可用；仍可手动输入筛选值来导出指定会话。";
  if (manualVisible) return value.trim() ? "将使用手动筛选值导出指定会话。" : "输入联系人、手机号或聊天标识来筛选单个会话。";
  if (!hasScannedConversations) return "没有读取到可选择的会话；默认导出全部会话。";
  if (query.trim()) return visibleCount ? `已筛出 ${visibleCount} 个会话。` : "没有匹配的会话；可以换个关键词或手动输入。";
  return "选择一个会话，导出时会自动传入对应筛选值。";
}

function includeSelectedConversation(conversations: ConversationCandidate[], selected?: ConversationCandidate): ConversationCandidate[] {
  if (!selected || conversations.some((conversation) => conversation.id === selected.id)) return conversations;
  return [selected, ...conversations];
}

function filterAndSortConversations(conversations: ConversationCandidate[], query: string, sortMode: "messages" | "recent"): ConversationCandidate[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? conversations.filter((conversation) =>
        [conversation.title, conversation.subtitle, conversation.filterValue, conversation.service]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(needle)),
      )
    : conversations;

  return [...filtered].sort((left, right) => {
    if (sortMode === "recent") {
      const byRecent = conversationLastMessageMs(right) - conversationLastMessageMs(left);
      if (byRecent !== 0) return byRecent;
    }
    const byMessages = right.messageCount - left.messageCount;
    if (byMessages !== 0) return byMessages;
    return left.title.localeCompare(right.title);
  });
}

function conversationOptionLabel(conversation: ConversationCandidate): string {
  const count = `${conversation.messageCount} 条消息`;
  const service = conversation.service ? ` · ${conversation.service}` : "";
  const lastMessage = formatConversationLastMessage(conversation.lastMessageAt);
  return `${conversation.title} · ${count}${service}${lastMessage ? ` · ${lastMessage}` : ""}`;
}

function conversationSummary(conversation: ConversationCandidate): string {
  const parts = [conversation.isGroup ? "群聊" : "单聊", `${conversation.messageCount} 条消息`];
  if (conversation.subtitle) parts.push(conversation.subtitle);
  const lastMessage = formatConversationLastMessage(conversation.lastMessageAt);
  if (lastMessage) parts.push(`最近 ${lastMessage}`);
  return parts.join(" · ");
}

function formatConversationLastMessage(value?: string): string | undefined {
  const date = conversationLastMessageDate(value);
  if (!date) return undefined;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function conversationLastMessageMs(conversation: ConversationCandidate): number {
  return conversationLastMessageDate(conversation.lastMessageAt)?.getTime() ?? 0;
}

function conversationLastMessageDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const appleEpochMs = Date.UTC(2001, 0, 1);
    const offsetMs = numeric > 10_000_000_000 ? numeric / 1_000_000 : numeric * 1000;
    const date = new Date(appleEpochMs + offsetMs);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
