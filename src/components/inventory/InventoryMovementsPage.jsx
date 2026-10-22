import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import AdminPage from "../admin/AdminPage";
import AdminPanel from "../admin/AdminPanel";
import EmployeePage from "../employee/EmployeePage";
import DataTable from "../employee/DataTable";
import { AtelierButton } from "../../design-system";
import InventoryNav from "./InventoryNav";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { ROLES } from "../../config/employeeRoles";
import { formatEmployeeDateTime } from "../../utils/employee";
import { apiListMovements } from "../../services/api/inventoryApi";

const fieldClass = "mt-2 h-10 w-full border border-mist bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent";

const quantityText = (movement) =>
  `${(movement.quantity ?? movement.quantity_change ?? 0) > 0 ? "+" : ""}${movement.quantity ?? movement.quantity_change ?? 0}`;

/**
 * Normalise a raw backend movement to the shape the table expects.
 */
function normaliseMovement(item) {
  return {
    id:          item.id,
    type:        item.movement_type ?? item.type ?? "ADJUST",
    quantity:    item.quantity_change ?? item.quantity ?? 0,
    productName: item.product_name ?? `Stock #${(item.stock_id ?? "").slice(0, 8)}`,
    variantLabel: item.variant_label ?? "",
    product:     { sku: item.sku ?? "" },
    location:    item.location ?? null,
    locationId:  item.location_id ?? item.locationId ?? null,
    employeeName: item.actor_name ?? item.employeeName ?? "System",
    timestamp:   item.created_at ?? item.timestamp ?? null,
    reference:   item.reference ?? "",
    reason:      item.reason ?? "",
    notes:       item.notes ?? "",
    before:      item.before ?? {},
    after:       item.after  ?? {},
  };
}

export default function InventoryMovementsPage({ portal = "admin" }) {
  const { employee } = useEmployeeAuth();
  const [filters, setFilters] = useState({ search: "", type: "" });
  const [selected, setSelected] = useState(null);

  // ── Direct backend fetch ─────────────────────────────────────────────────
  const [allMovements, setAllMovements] = useState(null); // null = loading
  const [fetchError, setFetchError] = useState(null);

  const loadMovements = useCallback(async () => {
    setAllMovements(null);
    setFetchError(null);
    const apiPortal = portal === "employee" ? "employee" : "admin";
    const result = await apiListMovements({ pageSize: 200, portal: apiPortal });
    if (result.ok) {
      setAllMovements((result.movements ?? []).map(normaliseMovement));
    } else {
      setFetchError(result.error ?? "Failed to load movements.");
      setAllMovements([]);
    }
  }, [portal]);

  useEffect(() => { loadMovements(); }, [loadMovements]);

  const Page = portal === "employee" ? EmployeePage : AdminPage;
  const root = portal === "super-admin" ? "/super-admin/inventory" : portal === "admin" ? "/admin/inventory" : "/employee/inventory";
  const warehouseOnly = portal === "employee" && employee?.role === ROLES.WAREHOUSE_STAFF;

  const source = allMovements ?? [];
  const types = useMemo(() => [...new Set(source.map((m) => m.type))].sort(), [source]);

  const movements = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return source
      .filter((movement) => !warehouseOnly || movement.location?.type === "WAREHOUSE")
      .filter((movement) => {
        const haystack = [movement.productName, movement.product?.sku, movement.variantLabel, movement.reference, movement.reason, movement.employeeName]
          .join(" ").toLowerCase();
        return (!term || haystack.includes(term)) &&
          (!filters.type || movement.type === filters.type);
      });
  }, [source, filters, warehouseOnly]);

  return (
    <Page
      eyebrow={`${portal === "employee" ? "Retail operations" : "Business"} / Inventory`}
      title="Stock Movement History"
      description="The dedicated quantity ledger for receiving, adjustments, transfers, reservations, sales, returns and damage."
      actions={<AtelierButton as={Link} to={root} variant="outline" size="chip">Back to inventory</AtelierButton>}
    >
      <InventoryNav portal={portal} />
      {fetchError && (
        <p role="alert" className="mb-5 border border-accent/30 bg-accent/5 p-3 font-ui text-sm text-accent">{fetchError}</p>
      )}
      <AdminPanel
        eyebrow="Inventory audit"
        title="Movement ledger"
        bodyClassName="px-0 py-0 sm:px-0"
        action={
          <button type="button" onClick={loadMovements} className="inline-flex items-center gap-1 font-ui text-[10px] uppercase tracking-[.13em] text-taupe hover:text-ink">
            <RefreshCw size={11} /> Refresh
          </button>
        }
      >
        <form className="grid gap-3 border-b border-mist/70 bg-canvas/60 p-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Search
            <input type="search" className={fieldClass} placeholder="Product, SKU, employee or reference" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </label>
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Movement type
            <select className={fieldClass} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
              <option value="">All movements</option>
              {types.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </form>

        {allMovements === null ? (
          <p role="status" aria-busy="true" className="px-4 py-6 font-ui text-sm text-taupe">Loading movements…</p>
        ) : (
          <>
            <DataTable
              className="border-0"
              rows={movements}
              empty="No movement records match these filters."
              columns={[
                { id: "date",      label: "Date",     render: (row) => <span className="whitespace-nowrap text-[11px] text-taupe">{formatEmployeeDateTime(row.timestamp)}</span> },
                { id: "product",   label: "Product",  render: (row) => <div className="min-w-40"><p>{row.productName}</p><p className="mt-1 font-mono text-[10px] text-taupe">{row.product?.sku || "—"}</p></div> },
                { id: "location",  label: "Location", render: (row) => row.location?.name || "—" },
                { id: "type",      label: "Movement", render: (row) => <span className="border border-mist bg-canvas px-2 py-1 text-[9px] uppercase tracking-[.12em]">{row.type.replaceAll("_", " ")}</span> },
                { id: "quantity",  label: "Quantity", render: (row) => <strong className={(row.quantity ?? 0) < 0 ? "text-accent" : "text-cocoa"}>{quantityText(row)}</strong> },
                { id: "employee",  label: "Employee", render: (row) => <span className="text-[11px] text-taupe">{row.employeeName || "System"}</span> },
                { id: "reference", label: "Reference",render: (row) => <div><p className="font-mono text-[10px]">{row.reference || "—"}</p><p className="mt-1 max-w-44 text-[10px] text-taupe">{row.reason || "—"}</p></div> },
                { id: "action",    label: "Detail",   render: (row) => <button type="button" onClick={() => setSelected(row)} className="font-ui text-[11px] text-brass underline-offset-4 hover:text-accent hover:underline">View</button> },
              ]}
            />
            <p className="border-t border-mist/60 px-5 py-3 font-ui text-[10px] text-taupe">{movements.length} movement{movements.length === 1 ? "" : "s"} shown · newest first</p>
          </>
        )}
      </AdminPanel>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="movement-title" onKeyDown={(e) => { if (e.key === "Escape") setSelected(null); }} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-mist bg-ivory p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">Movement detail</p>
                <h2 id="movement-title" className="mt-2 font-display text-3xl font-light text-ink">{selected.type.replaceAll("_", " ")}</h2>
                <p className="mt-2 font-ui text-sm text-taupe">{selected.productName}</p>
              </div>
              <button autoFocus type="button" aria-label="Close" onClick={() => setSelected(null)} className="p-2 text-taupe hover:text-ink"><X size={18} /></button>
            </div>
            <dl className="mt-7 grid gap-x-6 gap-y-5 border-y border-mist/70 py-6 sm:grid-cols-2">
              {[
                ["Location",       selected.location?.name || "—"],
                ["Quantity",       quantityText(selected)],
                ["Before available", selected.before?.available ?? "—"],
                ["After available",  selected.after?.available  ?? "—"],
                ["Before on hand",   selected.before?.onHand    ?? "—"],
                ["After on hand",    selected.after?.onHand     ?? "—"],
                ["Employee",       selected.employeeName || "System"],
                ["Date",           formatEmployeeDateTime(selected.timestamp)],
                ["Reference",      selected.reference || "—"],
                ["Reason",         selected.reason    || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-ui text-[9px] uppercase tracking-[.15em] text-taupe">{label}</dt>
                  <dd className="mt-1 font-ui text-sm text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.notes ? <p className="mt-5 font-ui text-xs leading-relaxed text-taupe">Notes: {selected.notes}</p> : null}
            <AtelierButton className="mt-6" variant="outline" onClick={() => setSelected(null)}>Close</AtelierButton>
          </div>
        </div>
      )}
    </Page>
  );
}
