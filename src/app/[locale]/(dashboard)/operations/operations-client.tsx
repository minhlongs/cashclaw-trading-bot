'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';

type Department = 'finance' | 'operations' | 'marketing' | 'sales' | 'support';
type Status = 'open' | 'in_progress' | 'done' | 'cancelled';
type ApprovalState = 'none' | 'draft' | 'pending_approval' | 'approved' | 'rejected';
type ExecutionState = 'executed' | 'failed';
type Item = {
  id: string; department: Department; title: string; description: string; status: Status;
  amountMinor: number | null; dueDate: string | null; createdAt: number; updatedAt: number; version: number;
  actionType?: string | null; approvalState?: ApprovalState; executionState?: ExecutionState | null; decisionReason?: string | null;
};
type WorkEvent = {
  id: string; action: 'created' | 'status_changed'; fromStatus: Status | null; toStatus: Status;
  createdAt: number; version: number | null;
};
type ApprovalEvent = {
  id: number; actor: string; fromState: string; toState: string; reason: string | null;
  version: number; createdAt: number;
};
const departments: Department[] = ['finance', 'operations', 'marketing', 'sales', 'support'];

type Labels = typeof labels.en | typeof labels.vi;

function ApprovalControls(props: {
  item: Item;
  t: Labels;
  busy: boolean;
  reason: string;
  onReason: (value: string) => void;
  onAction: (action: 'submit' | 'approve' | 'reject' | 'execute') => void;
}) {
  const { item, t } = props;
  const needsReason = item.approvalState === 'draft' || item.approvalState === 'pending_approval'
    || (item.approvalState === 'approved' && item.executionState !== 'executed');
  return (
    <div className="ops-approval">
      {needsReason && (
        <label className="ops-field"><span>{t.approvalReason}</span>
          <input className="ops-control" maxLength={500} value={props.reason}
            onChange={(e) => props.onReason(e.target.value)} />
        </label>
      )}
      <div className="ops-actions">
        {item.approvalState === 'draft' && <button type="button" disabled={props.busy} className="ops-action" onClick={() => props.onAction('submit')}>{t.submitForApproval}</button>}
        {item.approvalState === 'pending_approval' && <button type="button" disabled={props.busy} className="ops-action" onClick={() => props.onAction('approve')}>{t.approve}</button>}
        {item.approvalState === 'pending_approval' && <button type="button" disabled={props.busy} className="ops-action" onClick={() => props.onAction('reject')}>{t.reject}</button>}
        {item.approvalState === 'approved' && item.executionState !== 'executed' && (
          <button type="button" disabled={props.busy} className="ops-action" onClick={() => props.onAction('execute')}>
            {item.executionState === 'failed' ? t.retryExecution : t.execute}
          </button>
        )}
      </div>
    </div>
  );
}

function ApprovalHistory(props: { events: ApprovalEvent[]; t: Labels; versionLabel: string }) {
  if (props.events.length === 0) return null;
  return (
    <div className="ops-approval-history">
      <p className="meta">{props.t.approvalHistory}</p>
      {props.events.map((event) => <div className="ops-history-event" key={`approval-${event.id}`}>
        <span>{event.fromState} → {event.toState}{event.reason ? ` · ${event.reason}` : ''}</span>
        <span>{props.versionLabel} {event.version}</span>
      </div>)}
    </div>
  );
}

function itemMetaLine(item: Item, t: Labels): string {
  const approval = item.actionType ? ` · ${t.approvalStates[item.approvalState ?? 'draft']}${item.executionState ? ` · ${t.executionStates[item.executionState]}` : ''}` : '';
  return `${t.states[item.status]}${item.dueDate ? ` · ${item.dueDate}` : ''}${item.amountMinor !== null ? ` · ${item.amountMinor.toLocaleString()} minor units` : ''} · ${t.version} ${item.version}${approval}`;
}

function HistoryPanel(props: {
  item: Item;
  events: WorkEvent[] | undefined;
  approvalEvents: ApprovalEvent[] | undefined;
  loading: boolean;
  t: Labels;
}) {
  return (
    <div className="ops-history" id={`history-${props.item.id}`} aria-live="polite">
      {props.loading && <p className="meta">{props.t.historyLoading}</p>}
      {props.events?.length === 0 && <p className="meta">{props.t.historyEmpty}</p>}
      {props.events?.map((event) => <div className="ops-history-event" key={event.id}>
        <span>{event.action === 'created' ? props.t.createdEvent : props.t.changedEvent}: {props.t.states[event.toStatus]}</span>
        <span>{props.t.version} {event.version ?? '—'}</span>
      </div>)}
      {props.item.actionType && (
        <ApprovalHistory events={props.approvalEvents ?? []} t={props.t} versionLabel={props.t.version} />
      )}
    </div>
  );
}

const labels = {
  en: {
    title: 'OPC Operations', subtitle: 'Owner-scoped internal work queue. Records are persisted in D1 with an append-only status history.',
    create: 'Add work item', department: 'Department', titleLabel: 'Title', description: 'Notes', amount: 'Amount (minor currency units, optional)', due: 'Due date', submit: 'Save record', loading: 'Loading records…',
    validation: 'Check the title, amount, and due date, then try again.', conflict: 'This item changed elsewhere. The list has been refreshed; review its current status before retrying.',
    empty: 'No saved work items yet.', noDb: 'BLOCKED — persistent database or authenticated session is unavailable. Sign in and configure the D1 binding/migration.', error: 'Could not complete request. Check sign-in and database status.',
    departments: { finance: 'Finance', operations: 'Operations', marketing: 'Marketing', sales: 'Sales', support: 'Customer support' },
    states: { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' },
    approvalStates: { none: 'No approval needed', draft: 'Draft — awaiting submission', pending_approval: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected' },
    executionStates: { executed: 'Executed', failed: 'Execution failed' },
    submitForApproval: 'Submit for approval', approve: 'Approve', reject: 'Reject', execute: 'Execute', retryExecution: 'Retry execution',
    approvalReason: 'Decision reason (required to reject)', approvalHistory: 'Approval audit', approvalHistoryEmpty: 'No approval events yet.',
    move: 'Mark in progress', finish: 'Complete', cancel: 'Cancel', history: 'View history', hideHistory: 'Hide history', historyLoading: 'Loading history…', historyEmpty: 'No history is available.', createdEvent: 'Created', changedEvent: 'Status changed', version: 'Version', areaNote: 'This is a durable internal task ledger, not a general ledger, CRM, marketing automation, or customer ticketing system.',

  },
  vi: {
    title: 'Vận hành OPC', subtitle: 'Hàng đợi công việc nội bộ theo chủ sở hữu. Dữ liệu lưu bền trong D1, lịch sử trạng thái chỉ ghi thêm.',
    create: 'Thêm công việc', department: 'Bộ phận', titleLabel: 'Tiêu đề', description: 'Ghi chú', amount: 'Số tiền (đơn vị tiền tệ nhỏ nhất, tùy chọn)', due: 'Hạn hoàn thành', submit: 'Lưu công việc', loading: 'Đang tải dữ liệu…',
    validation: 'Kiểm tra tiêu đề, số tiền và ngày hạn rồi thử lại.', conflict: 'Công việc đã được thay đổi ở nơi khác. Danh sách đã tải lại; hãy kiểm tra trạng thái trước khi thử lại.',
    empty: 'Chưa có công việc được lưu.', noDb: 'BLOCKED — chưa có cơ sở dữ liệu bền vững hoặc phiên đăng nhập hợp lệ. Hãy đăng nhập và cấu hình D1/migration.', error: 'Không thể hoàn tất. Kiểm tra phiên đăng nhập và trạng thái cơ sở dữ liệu.',
    departments: { finance: 'Tài chính', operations: 'Quản trị vận hành', marketing: 'Marketing', sales: 'Bán hàng', support: 'Hỗ trợ khách hàng' },
    states: { open: 'Mở', in_progress: 'Đang xử lý', done: 'Hoàn tất', cancelled: 'Đã hủy' },
    approvalStates: { none: 'Không cần duyệt', draft: 'Bản nháp — chờ gửi duyệt', pending_approval: 'Chờ phê duyệt', approved: 'Đã phê duyệt', rejected: 'Đã từ chối' },
    executionStates: { executed: 'Đã thực thi', failed: 'Thực thi thất bại' },
    submitForApproval: 'Gửi duyệt', approve: 'Phê duyệt', reject: 'Từ chối', execute: 'Thực thi', retryExecution: 'Thực thi lại',
    approvalReason: 'Lý do quyết định (bắt buộc khi từ chối)', approvalHistory: 'Nhật ký phê duyệt', approvalHistoryEmpty: 'Chưa có sự kiện phê duyệt.',
    move: 'Bắt đầu xử lý', finish: 'Hoàn tất', cancel: 'Hủy', history: 'Xem lịch sử', hideHistory: 'Ẩn lịch sử', historyLoading: 'Đang tải lịch sử…', historyEmpty: 'Chưa có lịch sử.', createdEvent: 'Đã tạo', changedEvent: 'Đã đổi trạng thái', version: 'Phiên bản', areaNote: 'Đây là sổ công việc nội bộ có lưu bền, chưa phải sổ cái kế toán, CRM, hệ thống tự động hóa marketing hay ticket hỗ trợ khách hàng.',

  },
} as const;

export default function OperationsClient() {
  const locale = useLocale();
  const t = locale === 'vi' ? labels.vi : labels.en;
  const [items, setItems] = useState<Item[]>([]);
  const [department, setDepartment] = useState<Department>('operations');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState('');
  const [historyByItem, setHistoryByItem] = useState<Record<string, WorkEvent[]>>({});
  const [approvalByItem, setApprovalByItem] = useState<Record<string, ApprovalEvent[]>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState('');
  const [approvalReason, setApprovalReason] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ops/work-items', { cache: 'no-store' });
      const data = await response.json() as { ok: boolean; items?: Item[] };
      if (!response.ok || !data.ok) throw new Error(String(response.status));
      setItems(data.items ?? []);
      setBlocked(false);
      setError('');
    } catch {
      setBlocked(true);
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const counts = useMemo(() => Object.fromEntries(departments.map((d) => [d, items.filter((item) => item.department === d).length])) as Record<Department, number>, [items]);

  async function createItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const minor = amount.trim() ? Number(amount) : null;
    if (minor !== null && (!Number.isSafeInteger(minor) || minor < 0)) { setError(t.validation); return; }
    try {
      const response = await fetch('/api/ops/work-items', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ department, title, description, amountMinor: minor, dueDate: dueDate || null }),
      });
      const data = await response.json() as { ok: boolean; item?: Item };
      if (response.status === 400) { setBlocked(false); setError(t.validation); return; }
      if (!response.ok || !data.ok || !data.item) throw new Error(String(response.status));
      setItems((previous) => [data.item!, ...previous]);
      setTitle(''); setDescription(''); setAmount(''); setDueDate(''); setBlocked(false);
    } catch {
      setBlocked(true); setError(t.error);
    }
  }

  async function updateStatus(item: Item, status: Status) {
    setBusyId(item.id); setError('');
    try {
      const response = await fetch(`/api/ops/work-items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await response.json() as { ok: boolean };
      if (response.status === 409) {
        setHistoryByItem((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
        await refresh();
        setError(t.conflict);
        return;
      }
      if (!response.ok || !data.ok) throw new Error(String(response.status));
      setHistoryByItem((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      await refresh();
    } catch { setError(t.error); }
    finally { setBusyId(''); }
  }

  async function toggleHistory(itemId: string) {
    if (expandedHistoryId === itemId) { setExpandedHistoryId(''); return; }
    setExpandedHistoryId(itemId);
    if (historyByItem[itemId]) return;
    setHistoryLoadingId(itemId);
    try {
      const response = await fetch(`/api/ops/work-items/${encodeURIComponent(itemId)}`, { cache: 'no-store' });
      const data = await response.json() as { ok: boolean; events?: WorkEvent[]; approvalEvents?: ApprovalEvent[] };
      if (!response.ok || !data.ok) throw new Error(String(response.status));
      setHistoryByItem((previous) => ({ ...previous, [itemId]: data.events ?? [] }));
      setApprovalByItem((previous) => ({ ...previous, [itemId]: data.approvalEvents ?? [] }));
    } catch { setError(t.error); }
    finally { setHistoryLoadingId(''); }
  }

  async function runApprovalAction(item: Item, action: 'submit' | 'approve' | 'reject' | 'execute') {
    setBusyId(item.id); setError('');
    try {
      const reason = (approvalReason[item.id] ?? '').trim();
      const response = await fetch('/api/ops/work-items/approvals', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, itemId: item.id, reason: reason || undefined }),
      });
      const data = await response.json() as { ok: boolean; results?: Array<{ itemId: string; ok: boolean; error?: string }> };
      if (!response.ok || !data.ok) throw new Error(String(response.status));
      const outcome = data.results?.[0];
      if (outcome && !outcome.ok) { setError(outcome.error ?? t.error); return; }
      setHistoryByItem((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      setApprovalByItem((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      await refresh();
    } catch { setError(t.error); }
    finally { setBusyId(''); }
  }

  return (
    <section className="ops-page" aria-labelledby="operations-title">
      <header className="ops-header">
        <h1 id="operations-title" className="ops-title">{t.title}</h1>
        <p className="meta">{t.subtitle}</p>
      </header>

      <div className="ops-departments">
        {departments.map((key) => (
          <button key={key} type="button" onClick={() => setDepartment(key)} aria-pressed={department === key}
            className="ops-department-card">
            <span className="ops-department-name">{t.departments[key]}</span>
            <span className="ops-department-count">{counts[key]} {locale === 'vi' ? 'việc' : 'items'}</span>
          </button>
        ))}
      </div>

      <div className="ops-layout">
        <section className="ops-panel" aria-label={t.create}>
          <h2 className="ops-panel-title">{t.create}</h2>
          <form onSubmit={createItem} className="ops-form">
            <label className="ops-field"><span>{t.department}</span>
              <select className="ops-control" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                {departments.map((d) => <option key={d} value={d}>{t.departments[d]}</option>)}
              </select>
            </label>
            <label className="ops-field"><span>{t.titleLabel}</span>
              <input className="ops-control" maxLength={160} required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="ops-field"><span>{t.description}</span>
              <textarea className="ops-control" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            {department === 'finance' && <label className="ops-field"><span>{t.amount}</span>
              <input inputMode="numeric" className="ops-control" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>}
            <label className="ops-field"><span>{t.due}</span>
              <input type="date" className="ops-control" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <button className="ops-submit" type="submit" disabled={loading}>{t.submit}</button>
          </form>
          <p className="ops-note">{t.areaNote}</p>
        </section>

        <section className="ops-panel" aria-live="polite">
          <h2 className="ops-panel-title">{t.departments[department]}</h2>
          {loading && <p className="meta">{t.loading}</p>}
          {blocked && <p role="status" className="ops-blocked">{t.noDb}</p>}
          {error && <p role="alert" className="ops-error">{error}</p>}
          {!loading && !blocked && items.filter((item) => item.department === department).length === 0 && <p className="meta">{t.empty}</p>}
          <ul className="ops-item-list">
            {items.filter((item) => item.department === department).map((item) => (
              <li key={item.id} className="ops-item">
                <div className="ops-item-row">
                  <div className="ops-item-content">
                    <h3 className="ops-item-title">{item.title}</h3>
                    {item.description && <p className="ops-item-description">{item.description}</p>}
                    <p className="ops-item-meta">{itemMetaLine(item, t)}</p>
                  </div>
                  {item.status !== 'done' && item.status !== 'cancelled' && <div className="ops-actions">
                    {item.status === 'open' && <button type="button" disabled={busyId === item.id} className="ops-action" onClick={() => void updateStatus(item, 'in_progress')}>{t.move}</button>}
                    <button type="button" disabled={busyId === item.id} className="ops-action" onClick={() => void updateStatus(item, 'done')}>{t.finish}</button>
                    <button type="button" disabled={busyId === item.id} className="ops-action" onClick={() => void updateStatus(item, 'cancelled')}>{t.cancel}</button>
                  </div>}
                  {item.actionType && <ApprovalControls
                    item={item}
                    t={t}
                    busy={busyId === item.id}
                    reason={approvalReason[item.id] ?? ''}
                    onReason={(value) => setApprovalReason((previous) => ({ ...previous, [item.id]: value }))}
                    onAction={(action) => void runApprovalAction(item, action)}
                  />}
                </div>
                <button type="button" className="ops-history-toggle" aria-expanded={expandedHistoryId === item.id} aria-controls={`history-${item.id}`} onClick={() => void toggleHistory(item.id)}>
                  {expandedHistoryId === item.id ? t.hideHistory : t.history}
                </button>
                {expandedHistoryId === item.id && (
                  <HistoryPanel
                    item={item}
                    events={historyByItem[item.id]}
                    approvalEvents={approvalByItem[item.id]}
                    loading={historyLoadingId === item.id}
                    t={t}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
