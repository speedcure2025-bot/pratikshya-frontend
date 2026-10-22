import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import AdminPage from "../admin/AdminPage";
import AdminPanel from "../admin/AdminPanel";
import EmployeePage from "../employee/EmployeePage";
import DataTable from "../employee/DataTable";
import { AtelierButton } from "../../design-system";
import InventoryNav from "./InventoryNav";
import InventoryStatusBadge from "./InventoryStatusBadge";
import { useInventory } from "../../context/InventoryContext";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { PERMISSIONS } from "../../config/employeePermissions";
import { ROLES } from "../../config/employeeRoles";
import { STOCK_STATUS, calculateStockStatus } from "../../services/inventory/inventoryRepository";
import { apiListLowStock } from "../../services/api/inventoryApi";

/**
 * Maps a raw backend stock item to the shape the DataTable rows expect.
 */
function mapLowStockItem(item) {
  const onHand    = item.quantity_on_hand    ?? 0;
  const reserved  = item.quantity_reserved   ?? 0;
  const available = item.quantity_available  ?? Math.max(0, onHand - reserved);
  const threshold = item.low_threshold       ?? 5;
  return {
    id:               item.id,
    backendId:        item.id,
    productId:        item.product_id  ?? "",
    variantId:        item.variant_id  ?? null,
    locationId:       item.warehouse_id ?? "loc-main-store",
    sku:              item.sku ?? "—",
    productName:      item.product_name ?? item.sku ?? item.product_id ?? "—",
    variantLabel:     item.variant_id ? `variant: ${item.variant_id}` : "",
    location: {
      id:   item.warehouse_id ?? "loc-main-store",
      name: item.warehouse_id ? "Main Warehouse" : "Main Store",
      type: item.warehouse_id ? "WAREHOUSE" : "STORE",
    },
    placement:      { department: "" },
    placementLabel: "",
    quantity:       { available, onHand, reserved, sold: 0, returned: 0, damaged: 0 },
    lowStockThreshold: threshold,
    status: calculateStockStatus({ available, lowStockThreshold: threshold }),
  };
}

export default function InventoryLowStockPage({ portal = "admin" }) {
  const inventory = useInventory();
  const { admin } = useAdminAuth();
  const { employee, hasPermission } = useEmployeeAuth();
  const [thresholds, setThresholds] = useState({});
  const [feedback, setFeedback] = useState("");
  const [showOut, setShowOut] = useState(true);

  // ── Direct backend fetch (bypasses InventoryContext timing issues) ────────
  const [backendRows, setBackendRows] = useState(null); // null = loading
  const [fetchError, setFetchError] = useState(null);

  const loadFromBackend = useCallback(async () => {
    setBackendRows(null);
    setFetchError(null);
    // Fetch all stock where available <= low_threshold
    const apiPortal = portal === "employee" ? "employee" : "admin";
    const result = await apiListLowStock({ pageSize: 200, portal: apiPortal });
    if (result.ok) {
      setBackendRows(result.items.map(mapLowStockItem));
    } else {
      setFetchError(result.error ?? "Failed to load low-stock items.");
      setBackendRows([]);
    }
  }, [portal]);

  useEffect(() => { loadFromBackend(); }, [loadFromBackend]);

  const Page = portal === "employee" ? EmployeePage : AdminPage;
  const root = portal === "super-admin" ? "/super-admin/inventory" : portal === "admin" ? "/admin/inventory" : "/employee/inventory";
  const actor = portal !== "employee" ? { adminId: admin?.adminId, name: admin?.name || "Administrator" } : employee;
  const warehouseOnly = portal === "employee" && employee?.role === ROLES.WAREHOUSE_STAFF;
  const availabilityOnly = portal === "employee" && [ROLES.SALES_EXECUTIVE, ROLES.FASHION_STYLIST, ROLES.CUSTOMER_SUPPORT].includes(employee?.role);
  const canReceive = portal !== "employee" || hasPermission(PERMISSIONS.INVENTORY_RECEIVE);
  const canTransfer = portal !== "employee" || hasPermission(PERMISSIONS.INVENTORY_TRANSFER);
  const canManage = portal !== "employee" || hasPermission(PERMISSIONS.INVENTORY_MANAGE);

  // Use direct backend rows when available; fall back to context records
  const sourceRows = backendRows ?? inventory.records;

  const rows = useMemo(() => sourceRows.filter((row) =>
    [STOCK_STATUS.LOW_STOCK, STOCK_STATUS.OUT_OF_STOCK].includes(row.status) &&
    (showOut || row.status !== STOCK_STATUS.OUT_OF_STOCK) &&
    (!warehouseOnly || row.location?.type === "WAREHOUSE")
  ), [sourceRows, warehouseOnly, showOut]);

  const saveThreshold = (row) => {
    const result = inventory.updateThreshold({
      inventoryId: row.id,
      threshold: thresholds[row.id] ?? row.lowStockThreshold,
      actor,
    });
    setFeedback(result.ok ? `Threshold updated for ${row.productName}.` : result.error);
  };

  if (availabilityOnly) {
    return (
      <Page
        eyebrow="Retail operations / Availability"
        title="Availability Access"
        description="Your role can share customer-safe availability, but internal thresholds, locations and unit counts remain restricted."
        actions={<AtelierButton as={Link} to={root} size="chip">Open availability</AtelierButton>}
      >
        <InventoryNav portal={portal} />
        <AdminPanel eyebrow="Permission boundary" title="Stock alerts are operational">
          <p className="font-ui text-sm leading-relaxed text-taupe">
            Ask a Store Manager or Inventory Manager to review low-stock actions. Product availability remains visible on your Inventory page.
          </p>
        </AdminPanel>
      </Page>
    );
  }

  return (
    <Page
      eyebrow={`${portal === "employee" ? "Retail operations" : "Business"} / Inventory`}
      title="Low & Out of Stock"
      description="Prioritised stock alerts calculated centrally from available units and each product's existing low-stock threshold."
      actions={<AtelierButton as={Link} to={root} variant="outline" size="chip">Back to inventory</AtelierButton>}
    >
      <InventoryNav portal={portal} />
      {feedback ? <p role="status" className="mb-5 border border-mist bg-canvas p-3 font-ui text-sm text-ink">{feedback}</p> : null}
      {fetchError ? (
        <p role="alert" className="mb-5 border border-accent/30 bg-accent/5 p-3 font-ui text-sm text-accent">{fetchError}</p>
      ) : null}
      <AdminPanel
        eyebrow="Action queue"
        title={backendRows === null ? "Loading…" : `${rows.length} stock alert${rows.length === 1 ? "" : "s"}`}
        bodyClassName="px-0 py-0 sm:px-0"
        action={
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 font-ui text-[10px] uppercase tracking-[.13em] text-taupe">
              <input type="checkbox" checked={showOut} onChange={(event) => setShowOut(event.target.checked)} className="accent-[var(--color-accent)]" />
              Include out of stock
            </label>
            <button
              type="button"
              onClick={loadFromBackend}
              className="inline-flex items-center gap-1 font-ui text-[10px] uppercase tracking-[.13em] text-taupe hover:text-ink"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        }
      >
        {backendRows === null ? (
          <p role="status" aria-busy="true" className="px-4 py-6 font-ui text-sm text-taupe">Loading stock alerts…</p>
        ) : (
          <DataTable
            className="border-0"
            rows={rows}
            empty="No visible products are low or out of stock."
            columns={[
              { id: "product", label: "Product", render: (row) => <div className="min-w-40"><p>{row.productName}</p><p className="mt-1 font-mono text-[10px] text-taupe">{row.sku} · {row.variantLabel}</p></div> },
              { id: "location", label: "Location", render: (row) => <div><p>{row.location?.name}</p><p className="mt-1 text-[10px] text-taupe">{row.placementLabel}</p></div> },
              { id: "available", label: "Available", render: (row) => <strong className="text-accent">{row.quantity.available}</strong> },
              { id: "threshold", label: "Threshold", render: (row) => row.lowStockThreshold },
              { id: "status", label: "Status", render: (row) => <InventoryStatusBadge status={row.status} /> },
              { id: "recommended", label: "Recommended action", render: (row) => row.status === STOCK_STATUS.OUT_OF_STOCK ? "Receive or transfer immediately" : row.location?.type === "STORE" ? "Transfer from warehouse" : "Receive supplier stock" },
              {
                id: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="flex min-w-36 flex-col gap-1.5">
                    {canReceive ? <Link to={`${root}/receive?productId=${encodeURIComponent(row.productId)}&locationId=${encodeURIComponent(row.locationId)}`} className="text-[11px] text-brass hover:text-accent">Receive stock</Link> : null}
                    {canTransfer ? <Link to={`${root}/transfers?inventoryId=${encodeURIComponent(row.id)}`} className="text-[11px] text-brass hover:text-accent">Transfer stock</Link> : null}
                    {canManage ? (
                      <div className="mt-1 flex items-center gap-1">
                        <label className="sr-only" htmlFor={`threshold-${row.id}`}>Threshold for {row.productName}</label>
                        <input id={`threshold-${row.id}`} type="number" min="0" className="h-8 w-14 border border-mist bg-canvas px-2 text-xs outline-none focus:border-accent" value={thresholds[row.id] ?? row.lowStockThreshold} onChange={(event) => setThresholds((current) => ({ ...current, [row.id]: event.target.value }))} />
                        <button type="button" onClick={() => saveThreshold(row)} className="h-8 border border-mist px-2 font-ui text-[9px] uppercase tracking-wider text-ink hover:border-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent">Save</button>
                      </div>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        )}
      </AdminPanel>
    </Page>
  );
}
