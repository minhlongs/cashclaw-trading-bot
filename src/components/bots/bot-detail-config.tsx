'use client';

interface BotDetailConfigProps {
  config: Record<string, number>;
}

export function BotDetailConfig({ config }: BotDetailConfigProps) {
  const configEntries = Object.entries(config);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
      {configEntries.map(([key, value]) => (
        <div key={key}>
          <label className="form-label">{key}</label>
          <input
            type="number"
            className="form-input"
            defaultValue={value}
            step="0.1"
          />
        </div>
      ))}
      <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
        <button className="btn btn-primary">Save Config</button>
      </div>
    </div>
  );
}
