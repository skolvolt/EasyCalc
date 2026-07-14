import { useProject, fmtMoney } from '../state';
import { settingsOf, procurement } from '@shared/engine';

export default function Procurement() {
  const { state } = useProject();
  if (!state) return null;
  const s = settingsOf(state);
  const lines = procurement(state, s); // already sorted by supplier A→Z

  const totalCost = lines.reduce((a, l) => a + l.unitCost * l.qty, 0);
  const totalSell = lines.reduce((a, l) => a + l.unitSell * l.qty, 0);

  // Per-supplier totals — kept in their OWN table below the item list so they
  // don't get swept up when you select/copy all the item rows in one go.
  const supplierList: { supplier: string; cost: number; sell: number }[] = [];
  for (const l of lines) {
    const k = l.supplier || '—';
    let e = supplierList.find((x) => x.supplier === k);
    if (!e) { e = { supplier: k, cost: 0, sell: 0 }; supplierList.push(e); }
    e.cost += l.unitCost * l.qty;
    e.sell += l.unitSell * l.qty;
  }

  return (
    <>
      <h1>Procurement</h1>
      <div className="subtitle">
        Every item with quantity &gt; 0, sorted alphabetically by supplier.
      </div>

      {lines.length === 0 ? (
        <div className="panel">
          No items allocated yet — assign quantities in the Equipment Schedule.
        </div>
      ) : (
        <>
          <div className="panel scroll-x">
            <table className="grid nowrap">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Manufacturer</th>
                  <th className="num">Quantity</th>
                  <th>Part #</th>
                  <th>Description</th>
                  <th className="num">Cost</th>
                  <th className="num">Sell price</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.supplier}</td>
                    <td>{l.manufacturer}</td>
                    <td className="num">{l.qty}</td>
                    <td>{l.partNumber}</td>
                    <td>{l.description}</td>
                    <td className="num">{fmtMoney(l.unitCost)}</td>
                    <td className="num">{fmtMoney(l.unitSell)}</td>
                  </tr>
                ))}
                <tr className="totals head-row">
                  <td colSpan={5}>Total (Quantity × unit)</td>
                  <td className="num">{fmtMoney(totalCost)}</td>
                  <td className="num">{fmtMoney(totalSell)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Separate table so supplier totals stay out of the item selection. */}
          <div className="panel">
            <h2>Per-supplier totals</h2>
            <table className="grid">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="num">Total Cost</th>
                  <th className="num">Total Sell</th>
                </tr>
              </thead>
              <tbody>
                {supplierList.map((x) => (
                  <tr key={x.supplier}>
                    <td>{x.supplier}</td>
                    <td className="num">{fmtMoney(x.cost)}</td>
                    <td className="num">{fmtMoney(x.sell)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
