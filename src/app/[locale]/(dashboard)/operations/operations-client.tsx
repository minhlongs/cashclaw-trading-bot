'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';

type Department = 'finance' | 'operations' | 'marketing' | 'sales' | 'support';
type Status = 'open' | 'in_progress' | 'done' | 'cancelled';
type Item = {
  id: string; department: Department; title: string; description: string; status: Status;
  amountMinor: number | null; dueDate: string | null; createdAt: number; updatedAt: number;
};
const departments: Department[] = ['finance', 'operations', 'marketing', 'sales', 'support'];

const labels = {
  en: {
    title: 'OPC Operations', subtitle: 'Owner-scoped internal work queue. Records are persisted in D1 with an append-only status history.',
    create: 'Add work item', department: 'Department', titleLabel: 'Title', description: 'Notes', amount: 'Amount (minor currency units, optional)', due: 'Due date', submit: 'Save record', loading: 'Loading records…',
    empty: 'No saved work items yet.', noDb: 'BLOCKED — persistent database or authenticated session is unavailable. Sign in and configure the D1 binding/migration.', error: 'Could not complete request. Check sign-in and database status.',
    departments: { finance: 'Finance', operations: 'Operations', marketing: 'Marketing', sales: 'Sales', support: 'Customer support' },
    states: { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' },
    move: 'Mark in progress', finish: 'Complete', cancel: 'Cancel', areaNote: 'This is a durable internal task ledger, not a general ledger, CRM, marketing automation, or customer ticketing system.',
  },
  vi: {
    title: 'Vận hành OPC', subtitle: 'Hàng đợi công việc nội bộ theo chủ sở hữu. Dữ liệu lưu bền trong D1, lịch sử trạng thái chỉ ghi thêm.',
    create: 'Thêm công việc', department: 'Bộ phận', titleLabel: 'Tiêu đề', description: 'Ghi chú', amount: 'Số tiền (đơn vị tiền tệ nhỏ nhất, tùy chọn)', due: 'Hạn hoàn thành', submit: 'Lưu công việc', loading: 'Đang tải dữ liệu…',
    empty: 'Chưa có công việc được lưu.', noDb: 'BLOCKED — chưa có cơ sở dữ liệu bền vững hoặc phiên đăng nhập hợp lệ. Hãy đăng nhập và cấu hình D1/migration.', error: 'Không thể hoàn tất. Kiểm tra phiên đăng nhập và trạng thái cơ sở dữ liệu.',
    departments: { finance: 'Tài chính', operations: 'Quản trị vận hành', marketing: 'Marketing', sales: 'Bán hàng', support: 'Hỗ trợ khách hàng' },
    states: { open: 'Mở', in_progress: 'Đang xử lý', done: 'Hoàn tất', cancelled: 'Đã hủy' },
    move: 'Bắt đầu xử lý', finish: 'Hoàn tất', cancel: 'Hủy', areaNote: 'Đây là sổ công việc nội bộ có lưu bền, chưa phải sổ cái kế toán, CRM, hệ thống tự động hóa marketing hay ticket hỗ trợ khách hàng.',
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
    if (minor !== null && (!Number.isSafeInteger(minor) || minor < 0)) { setError(t.error); return; }
    try {
      const response = await fetch('/api/ops/work-items', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ department, title, description, amountMinor: minor, dueDate: dueDate || null }),
      });
      const data = await response.json() as { ok: boolean; item?: Item };
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
      if (!response.ok || !data.ok) throw new Error(String(response.status));
      await refresh();
    } catch { setError(t.error); }
    finally { setBusyId(''); }
  }

  return (
    <section className="space-y-6" aria-labelledby="operations-title">
      <header className="space-y-1">
        <h1 id="operations-title" className="text-2xl font-bold">{t.title}</h1>
        <p className="meta text-sm">{t.subtitle}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {departments.map((key) => (
          <button key={key} type="button" onClick={() => setDepartment(key)} aria-pressed={department === key}
            className={`rounded-xl border p-4 text-left ${department === key ? 'border-blue-500 bg-blue-500/10' : 'border-[var(--border)]'}`}>
            <span className="block text-sm font-semibold">{t.departments[key]}</span>
            <span className="meta text-xs">{counts[key]} {locale === 'vi' ? 'việc' : 'items'}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border border-[var(--border)] p-5" aria-label={t.create}>
          <h2 className="mb-4 text-lg font-semibold">{t.create}</h2>
          <form onSubmit={createItem} className="space-y-3">
            <label className="block text-sm">{t.department}
              <select className="mt-1 w-full rounded-lg border p-2" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                {departments.map((d) => <option key={d} value={d}>{t.departments[d]}</option>)}
              </select>
            </label>
            <label className="block text-sm">{t.titleLabel}
              <input className="mt-1 w-full rounded-lg border p-2" maxLength={160} required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-sm">{t.description}
              <textarea className="mt-1 w-full rounded-lg border p-2" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            {department === 'finance' && <label className="block text-sm">{t.amount}
              <input inputMode="numeric" className="mt-1 w-full rounded-lg border p-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>}
            <label className="block text-sm">{t.due}
              <input type="date" className="mt-1 w-full rounded-lg border p-2" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <button className="button-primary rounded-lg px-4 py-2" type="submit" disabled={loading}>{t.submit}</button>
          </form>
          <p className="meta mt-4 text-xs">{t.areaNote}</p>
        </section>

        <section className="rounded-xl border border-[var(--border)] p-5" aria-live="polite">
          <h2 className="mb-4 text-lg font-semibold">{t.departments[department]}</h2>
          {loading && <p className="meta">{t.loading}</p>}
          {blocked && <p role="status" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t.noDb}</p>}
          {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
          {!loading && !blocked && items.filter((item) => item.department === department).length === 0 && <p className="meta">{t.empty}</p>}
          <ul className="space-y-3">
            {items.filter((item) => item.department === department).map((item) => (
              <li key={item.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    {item.description && <p className="meta mt-1 whitespace-pre-wrap text-sm">{item.description}</p>}
                    <p className="meta mt-2 text-xs">{t.states[item.status]}{item.dueDate ? ` · ${item.dueDate}` : ''}{item.amountMinor !== null ? ` · ${item.amountMinor.toLocaleString()} minor units` : ''}</p>
                  </div>
                  {item.status !== 'done' && item.status !== 'cancelled' && <div className="flex shrink-0 flex-col gap-2">
                    {item.status === 'open' && <button disabled={busyId === item.id} className="rounded border px-2 py-1 text-xs" onClick={() => void updateStatus(item, 'in_progress')}>{t.move}</button>}
                    <button disabled={busyId === item.id} className="rounded border px-2 py-1 text-xs" onClick={() => void updateStatus(item, 'done')}>{t.finish}</button>
                    <button disabled={busyId === item.id} className="rounded border px-2 py-1 text-xs" onClick={() => void updateStatus(item, 'cancelled')}>{t.cancel}</button>
                  </div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
