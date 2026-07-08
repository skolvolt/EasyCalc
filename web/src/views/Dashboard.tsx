import { useEffect, useState } from 'react';
import { useProject, fmtMoney, fmtPct, pctIn, pctOut, BASE_CURRENCY, isEmbedded } from '../state';
import { settingsOf, projectTotals, categoryBreakdown, roomTypeCounts, EQUIPMENT_CATEGORY } from '@shared/engine';
import NumInput from '../components/NumInput';

const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD', 'HKD', 'JPY', 'AED'];

const readFileAsDataUrl = (f: File, cb: (dataUrl: string) => void) => {
  const reader = new FileReader();
  reader.onload = () => cb(String(reader.result));
  reader.readAsDataURL(f);
};

export default function Dashboard() {
  const { state, update } = useProject();
  const [defaultOn, setDefaultOn] = useState(false);

  useEffect(() => {
    if (isEmbedded) return;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setDefaultOn(!!s.company_logo_default))
      .catch(() => {});
  }, []);

  if (!state) return null;
  const s = settingsOf(state);
  const totals = projectTotals(state, s);
  const cats = categoryBreakdown(state, s);
  const roomCount = roomTypeCounts(state).reduce((a, b) => a + b, 0);
  const d = state.details;
  const currency = d.currency || BASE_CURRENCY;

  const putSettings = (patch: Record<string, unknown>) =>
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

  // Edit a company letterhead field; mirror to defaults if "add by default" is on.
  const setCompany = (key: 'company_name' | 'company_phone' | 'company_address' | 'company_website', val: string) => {
    update((dr) => ((dr.details as any)[key] = val));
    if (defaultOn && !isEmbedded) putSettings({ [key]: val, company_logo_default: true });
  };

  const field = (key: keyof typeof d, label: string, textarea = false) => (
    <div>
      <label>{label}</label>
      {textarea ? (
        <textarea
          rows={2}
          value={(d[key] as string) ?? ''}
          onChange={(e) => update((dr) => ((dr.details as any)[key] = e.target.value))}
        />
      ) : (
        <input
          value={(d[key] as string) ?? ''}
          onChange={(e) => update((dr) => ((dr.details as any)[key] = e.target.value))}
        />
      )}
    </div>
  );

  return (
    <>
      <h1>Project Dashboard</h1>
      <div className="subtitle" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{d.client_name || 'No client set'} · {roomCount} rooms · GST {fmtPct(d.gst)}</span>
        <span className="currency-pick">
          <label htmlFor="cur">Currency</label>
          <select
            id="cur"
            value={currency}
            onChange={(e) => update((dr) => (dr.details.currency = e.target.value))}
          >
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          {currency !== BASE_CURRENCY && (
            <span className="fx-note">converted from {BASE_CURRENCY} at today's rate</span>
          )}
        </span>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Revenue (ex GST)</div>
          <div className="value">{fmtMoney(totals.revenue)}</div>
        </div>
        <div className="card">
          <div className="label">Cost</div>
          <div className="value">{fmtMoney(totals.cost)}</div>
        </div>
        <div className="card">
          <div className="label">Gross Profit</div>
          <div className={'value ' + (totals.grossProfit >= 0 ? 'good' : 'bad')}>
            {fmtMoney(totals.grossProfit)}
          </div>
        </div>
        <div className="card">
          <div className="label">Margin</div>
          <div className="value">{fmtPct(totals.margin)}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Category Breakdown</h2>
        <table className="grid">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Contingency %</th>
              <th className="num">Revenue</th>
              <th className="num">Hours</th>
              <th className="num">Cost</th>
              <th className="num">Gross Profit</th>
              <th className="num">Margin</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c, i) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="num">
                  <NumInput
                    value={c.contingency}
                    format={pctIn}
                    parse={pctOut}
                    onValue={(n) => update((dr) => (dr.categories[i].contingency = n ?? 0))}
                    histKey={`cont:${c.name}`}
                    title="Contingency added to this category's mark-up, as a percentage"
                  />
                </td>
                <td className="num">{fmtMoney(c.revenue)}</td>
                <td className="num">{c.name === EQUIPMENT_CATEGORY ? '—' : c.hours || ''}</td>
                <td className="num">{fmtMoney(c.cost)}</td>
                <td className="num">{fmtMoney(c.grossProfit)}</td>
                <td className="num">{fmtPct(c.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Project Details</h2>
        <div className="detail-form">
          {field('project_name', 'Project name')}
          {field('project_number', 'Project number')}
          {field('version', 'Version')}
          <div>
            <label>GST %</label>
            <NumInput
              value={d.gst ?? 0.1}
              format={pctIn}
              parse={pctOut}
              onValue={(n) => update((dr) => (dr.details.gst = n ?? 0.1))}
              title="GST rate applied to this project's totals and invoices"
            />
          </div>
          {field('quoted_by', 'Quoted by')}
          {field('client_name', 'Client name')}
          {field('client_site', 'Client site')}
          {field('client_address', 'Street / postal address')}
          {field('client_city', 'City and postcode')}
          {field('summary', 'Project summary', true)}
        </div>
      </div>

      <div className="panel">
        <h2>Branding</h2>

        <div className="brand-block">
          <h3>Client logo</h3>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            {d.client_logo && (
              <span className="brand-preview"><img src={d.client_logo} alt="client logo" /></span>
            )}
            <label className="btn-outline" style={{ cursor: 'pointer' }}>
              {d.client_logo ? 'Replace Client Logo' : 'Upload Client Logo'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFileAsDataUrl(f, (url) => update((dr) => (dr.details.client_logo = url)));
                }}
              />
            </label>
            {d.client_logo && (
              <button className="btn-outline" onClick={() => update((dr) => (dr.details.client_logo = null))}>
                Remove
              </button>
            )}
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Display-only — shows beside the project title so you know whose project you're in.
              Never printed on PDFs.
            </span>
          </div>
        </div>

        <div className="brand-block">
          <h3>Your company letterhead (logo + details)</h3>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            {d.company_logo && (
              <span className="brand-preview"><img src={d.company_logo} alt="company logo" /></span>
            )}
            <label className="btn-outline" style={{ cursor: 'pointer' }}>
              {d.company_logo ? 'Replace your company logo' : 'Upload your company logo'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  readFileAsDataUrl(f, (url) => {
                    update((dr) => (dr.details.company_logo = url));
                    if (defaultOn && !isEmbedded) putSettings({ company_logo: url, company_logo_default: true });
                  });
                }}
              />
            </label>
            {d.company_logo && (
              <button className="btn-outline" onClick={() => update((dr) => (dr.details.company_logo = null))}>
                Remove
              </button>
            )}
            {!isEmbedded && (
              <label className="default-toggle" title="Automatically add this logo to the letterhead of every new project">
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={defaultOn}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setDefaultOn(on);
                      putSettings(
                        on
                          ? {
                            company_logo: d.company_logo ?? null,
                            company_name: d.company_name ?? null,
                            company_phone: d.company_phone ?? null,
                            company_address: d.company_address ?? null,
                            company_website: d.company_website ?? null,
                            company_logo_default: true,
                          }
                          : { company_logo_default: false },
                      );
                    }}
                  />
                  <span className="slider" />
                </span>
                Add by default to new projects
              </label>
            )}
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Printed as the letterhead on exported PDFs and Excels.
            </span>
          </div>

          <div className="detail-form" style={{ marginTop: 14 }}>
            <div>
              <label>Company name</label>
              <input value={d.company_name ?? ''} onChange={(e) => setCompany('company_name', e.target.value)} />
            </div>
            <div>
              <label>Phone</label>
              <input value={d.company_phone ?? ''} onChange={(e) => setCompany('company_phone', e.target.value)} />
            </div>
            <div>
              <label>Address</label>
              <input value={d.company_address ?? ''} onChange={(e) => setCompany('company_address', e.target.value)} />
            </div>
            <div>
              <label>Website</label>
              <input value={d.company_website ?? ''} onChange={(e) => setCompany('company_website', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
