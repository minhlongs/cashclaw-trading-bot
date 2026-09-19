'use client';

import type { TradeEventRow } from './page-client-types';

interface BotDetailEventsTableProps {
  events: TradeEventRow[];
  title: string;
  timeHeader: string;
  eventTypeHeader: string;
  eventDetailsHeader: string;
}

export function BotDetailEventsTable({
  events,
  title,
  timeHeader,
  eventTypeHeader,
  eventDetailsHeader,
}: BotDetailEventsTableProps) {
  if (events.length === 0) return null;
  return (
    <div className="card mt-4">
      <h3 className="text-lg font-semibold mb-3">
        {title}
      </h3>
      <div className="overflow-auto">
        <table className="detail-table">
          <thead>
            <tr>
              <th className="detail-table th">{timeHeader}</th>
              <th className="detail-table th">{eventTypeHeader}</th>
              <th className="detail-table th">{eventDetailsHeader}</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 50).map((evt) => (
              <tr key={evt.id} className="detail-table tr">
                <td className="detail-table td time-cell">
                  {new Date(evt.timestamp).toLocaleString()}
                </td>
                <td className="detail-table td">
                  <span className={`badge ${
                    evt.eventType === 'fill' ? 'badge-success' :
                    evt.eventType === 'error' ? 'badge-error' :
                    'badge-neutral'
                  }`}>{evt.eventType}</span>
                </td>
                <td className="detail-table td mono-cell">
                  {JSON.stringify(evt.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
