import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
import OperationsClient from './operations-client';

describe('OperationsClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads persisted items and submits a new department work item through the API', async () => {
    const saved = {
      id: 'item-1', department: 'sales', title: 'Follow up', description: 'Call lead', status: 'open',
      amountMinor: null, dueDate: null, createdAt: 123, updatedAt: 123,
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
});
