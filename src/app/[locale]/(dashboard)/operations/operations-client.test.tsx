import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
import OperationsClient from './operations-client';

describe('OperationsClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads persisted items and submits a new department work item through the API', async () => {
    const saved = {
      id: 'item-1', department: 'sales', title: 'Follow up', description: 'Call lead', status: 'open',
      amountMinor: null, dueDate: null, createdAt: 123, updatedAt: 123, version: 0,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, items: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ ok: true, item: saved }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OperationsClient />);
    await screen.findByText('No saved work items yet.');

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'sales' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Follow up' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Call lead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }));

    expect(await screen.findByText('Follow up')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ops/work-items');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ department: 'sales', title: 'Follow up', description: 'Call lead' });
  });

  it('refreshes after a 409 status conflict and shows an actionable message', async () => {
    const original = {
      id: 'item-race', department: 'operations', title: 'Race test', description: '', status: 'open',
      amountMinor: null, dueDate: null, createdAt: 123, updatedAt: 123, version: 0,
    };
    const refreshed = { ...original, status: 'in_progress', updatedAt: 124, version: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, items: [original] }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ ok: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, items: [refreshed] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OperationsClient />);
    await screen.findByText('Race test');
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(await screen.findByText('This item changed elsewhere. The list has been refreshed; review its current status before retrying.')).toBeInTheDocument();
    expect(await screen.findByText(/In progress/)).toBeInTheDocument();
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('loads and displays the append-only item history with its version', async () => {
    const item = {
      id: 'item-history', department: 'operations', title: 'History fixture', description: '', status: 'in_progress',
      amountMinor: null, dueDate: null, createdAt: 123, updatedAt: 124, version: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, items: [item] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, events: [
        { id: 'event-create', action: 'created', fromStatus: null, toStatus: 'open', createdAt: 123, version: 0 },
        { id: 'event-status', action: 'status_changed', fromStatus: 'open', toStatus: 'in_progress', createdAt: 124, version: 1 },
      ] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OperationsClient />);
    await screen.findByText('History fixture');
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View history' }));
    expect(await screen.findByText('Created: Open')).toBeInTheDocument();
    expect(await screen.findByText('Status changed: In progress')).toBeInTheDocument();
    expect(screen.getByText('Version 0')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ops/work-items/item-history');
  });

  it('rejects invalid amount input before sending a mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, items: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OperationsClient />);
    await screen.findByText('No saved work items yet.');
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'finance' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Invalid amount' } });
    fireEvent.change(screen.getByLabelText('Amount (minor currency units, optional)'), { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
    expect(await screen.findByText('Check the title, amount, and due date, then try again.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
