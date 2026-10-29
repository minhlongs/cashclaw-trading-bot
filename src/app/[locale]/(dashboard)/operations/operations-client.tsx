'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';

type Department = 'finance' | 'operations' | 'marketing' | 'sales' | 'support';
type Status = 'open' | 'in_progress' | 'done' | 'cancelled';
type Item = {
  id: string; department: Department; title: string; description: string; status: Status;
  amountMinor: number | null; dueDate: string | null; createdAt: number; updatedAt: number; version: number;
};
type WorkEvent = {
  id: string; action: 'created' | 'status_changed'; fromStatus: Status | null; toStatus: Status;
  createdAt: number; version: number | null;
};
const departments: Department[] = ['finance', 'operations', 'marketing', 'sales', 'support'];

const labels = {
  en: {
    title: 'OPC Operations', subtitle: 'Owner-scoped internal work queue. Records are persisted in D1 with an append-only status history.',
    create: 'Add work item', department: 'Department', titleLabel: 'Title', description: 'Notes', amount: 'Amount (minor currency units, optional)', due: 'Due date', submit: 'Save record', loading: 'Loading records…',
    validation: 'Check the title, amount, and due date, then try again.', conflict: 'This item changed elsewhere. The list has been refreshed; review its current status before retrying.',
    empty: 'No saved work items yet.', noDb: 'BLOCKED — persistent database or authenticated session is unavailable. Sign in and configure the D1 binding/migration.', error: 'Could not complete request. Check sign-in and database status.',
    departments: { finance: 'Finance', operations: 'Operations', marketing: 'Marketing', sales: 'Sales', support: 'Customer support' },
    states: { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' },
    move: 'Mark in progress', finish: 'Complete', cancel: 'Cancel', history: 'View history', hideHistory: 'Hide history', historyLoading: 'Loading history…', historyEmpty: 'No history is available.', createdEvent: 'Created', changedEvent: 'Status changed', version: 'Version', areaNote: 'This is a durable internal task ledger, not a general ledger, CRM, marketing automation, or customer ticketing system.',

  },
  vi: {
    title: 'Vận hành OPC', subtitle: 'Hàng đợi công việc nội bộ theo chủ sở hữu. Dữ liệu lưu bền trong D1, lịch sử trạng thái chỉ ghi thêm.',
    create: 'Thêm công việc', department: 'Bộ phận', titleLabel: 'Tiêu đề', description: 'Ghi chú', amount: 'Số tiền (đơn vị tiền tệ nhỏ nhất, tùy chọn)', due: 'Hạn hoàn thành', submit: 'Lưu công việc', loading: 'Đang tải dữ liệu…',
    validation: 'Kiểm tra tiêu đề, số tiền và ngày hạn rồi thử lại.', conflict: 'Công việc đã được thay đổi ở nơi khác. Danh sách đã tải lại; hãy kiểm tra trạng thái trước khi thử lại.',
    empty: 'Chưa có công việc được lưu.', noDb: 'BLOCKED — chưa có cơ sở dữ liệu bền vững hoặc phiên đăng nhập hợp lệ. Hãy đăng nhập và cấu hình D1/migration.', error: 'Không thể hoàn tất. Kiểm tra phiên đăng nhập và trạng thái cơ sở dữ liệu.',
    departments: { finance: 'Tài chính', operations: 'Quản trị vận hành', marketing: 'Marketing', sales: 'Bán hàng', support: 'Hỗ trợ khách hàng' },
    states: { open: 'Mở', in_progress: 'Đang xử lý', done: 'Hoàn tất', cancelled: 'Đã hủy' },
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
  const [historyLoadingId, setHistoryLoadingId] = useState('');

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
      const data = await response.json() as { ok: boolean; events?: WorkEvent[] };
      if (!response.ok || !data.ok) throw new Error(String(response.status));
      setHistoryByItem((previous) => ({ ...previous, [itemId]: data.events ?? [] }));
    } catch { setError(t.error); }
    finally { setHistoryLoadingId(''); }
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
                    <p className="ops-item-meta">{t.states[item.status]}{item.dueDate ? ` · ${item.dueDate}` : ''}{item.amountMinor !== null ? ` · ${item.amountMinor.toLocaleString()} minor units` : ''} · {t.version} {item.version}</p>
                  </div>
                  {item.status !== 'done' && item.status !== 'cancelled' && <div className="ops-actions">
                    {item.status === 'open' && <button type="button" disabled={busyId === item.id} className="ops-action" onClick={() => void updateStatus(item, 'in_progress')}>{t.move}</button>}
                    <button type="button" disabled={busyId === item.id} className="ops-action" onClick={() => void updateStatus(item, 'done')}>{t.finish}</button>
                    <button type="button" disabled={busyId === item.id} className="ops-action" onClick={() => void updateStatus(item, 'cancelled')}>{t.cancel}</button>
                  </div>}
                </div>
                <button type="button" className="ops-history-toggle" aria-expanded={expandedHistoryId === item.id} aria-controls={`history-${item.id}`} onClick={() => void toggleHistory(item.id)}>
                  {expandedHistoryId === item.id ? t.hideHistory : t.history}
                </button>
                {expandedHistoryId === item.id && <div className="ops-history" id={`history-${item.id}`} aria-live="polite">
                  {historyLoadingId === item.id && <p className="meta">{t.historyLoading}</p>}
                  {historyByItem[item.id]?.length === 0 && <p className="meta">{t.historyEmpty}</p>}
                  {historyByItem[item.id]?.map((event) => <div className="ops-history-event" key={event.id}>
                    <span>{event.action === 'created' ? t.createdEvent : t.changedEvent}: {t.states[event.toStatus]}</span>
                    <span>{t.version} {event.version ?? '—'}</span>
                  </div>)}
                </div>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
