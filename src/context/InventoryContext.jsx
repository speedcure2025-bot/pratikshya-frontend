import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import inventoryRepository, {
  INVENTORY_CHANGED_EVENT,
  LOCATION_TYPES,
  calculateStockStatus,
  getInventoryMetrics,
} from "../services/inventory/inventoryRepository";
import { PRODUCTS_CHANGED_EVENT } from "../services/catalogRepository";
import {
  apiListStock,
  apiAdjustStock,
  apiCreateTransfer,
  apiCompleteTransfer,
  apiCancelTransfer,
  apiRequestTransfer,
  apiApproveTransfer,
  apiDispatchTransfer,
  apiListTransfers,
  apiListMovements,
} from "../services/api/inventoryApi";

const InventoryContext = createContext(null);

/**
 * Maps a backend stock item (from /admin/inventory/stock) to the shape that
 * getInventoryMetrics() and the dashboard tiles expect.
 */
function mapBackendItem(item) {
  const onHand     = item.quantity_on_hand  ?? 0;
  const reserved   = item.quantity_reserved ?? 0;
  const available  = item.quantity_available ?? Math.max(0, onHand - reserved);
  const threshold  = item.low_threshold ?? 5;
  const locationType = item.warehouse_id ? LOCATION_TYPES.WAREHOUSE : LOCATION_TYPES.STORE;

  return {
    id: `backend::${item.id}`,
    backendId: item.id,
    productId:  item.product_id  ?? "",
    variantId:  item.variant_id  ?? null,
    locationId: item.warehouse_id ?? "loc-main-store",
    placement:  { department: "" },
    location:   {
      id: item.warehouse_id ?? "loc-main-store",
      name: locationType === LOCATION_TYPES.WAREHOUSE ? "Main Warehouse" : "Main Store",
      type: locationType,
    },
    product:    null,
    quantity:   { onHand, available, reserved, sold: 0, returned: 0, damaged: 0 },
    lowStockThreshold: threshold,
    maximumStock:      null,
    active:     true,
    estimatedValue: 0,
    status: calculateStockStatus({ available, lowStockThreshold: threshold }),
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
    lastMovementAt: null,
  };
}

/**
 * Maps a backend movement (from /admin/inventory/movements) to the shape the
 * InventoryMovementsPage table expects.
 */
function mapBackendMovement(item) {
  return {
    id: item.id,
    productId: null,
    variantId: null,
    locationId: null,
    type: item.movement_type ?? "ADJUST",
    quantity: item.quantity_change ?? 0,
    before: {},
    after: {},
    employeeId: item.actor_id ?? null,
    employeeName: item.actor_name ?? "System",
    timestamp: item.created_at ?? null,
    reference: "",
    reason: item.reason ?? "",
    notes: "",
    // Resolved fields expected by the table
    productName: `Stock #${(item.stock_id ?? "").slice(0, 8)}`,
    variantLabel: "",
    product: null,
    location: null,
  };
}

/**
 * Maps a backend transfer (from /admin/stock-transfers) to the shape the
 * InventoryTransfersPage table expects.
 */
function mapBackendTransfer(item) {
  return {
    id: item.id,
    sourceLocationId: item.from_warehouse_id ?? "",
    destinationLocationId: item.to_warehouse_id ?? "",
    productId: null,
    variantId: null,
    quantity: (item.lines ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0),
    reason: item.notes ?? "",
    notes: item.notes ?? "",
    status: item.status ?? "DRAFT",
    requestedBy: item.created_by ?? "System",
    requestedById: item.created_by ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
    history: [],
    // Resolved fields expected by the table
    productName: item.lines?.length ? `${item.lines.length} line(s)` : "Transfer",
    variantLabel: "",
    source: { id: item.from_warehouse_id, name: item.from_warehouse_id ?? "—", type: "WAREHOUSE" },
    destination: { id: item.to_warehouse_id, name: item.to_warehouse_id ?? "—", type: "WAREHOUSE" },
    transferNumber: item.transfer_number ?? item.id,
  };
}

export function InventoryProvider({ children }) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);

  const [backendRecords, setBackendRecords]   = useState([]);
  const [backendMovements, setBackendMovements] = useState([]);
  const [backendTransfers, setBackendTransfers] = useState([]);

  // ── Listen for in-memory announces ──────────────────────────────────────
  useEffect(() => {
    window.addEventListener(INVENTORY_CHANGED_EVENT, refresh);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(INVENTORY_CHANGED_EVENT, refresh);
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  useEffect(() => {
    inventoryRepository.releaseExpiredReservations();
  }, []);

  // ── Backend fetches ──────────────────────────────────────────────────────
  // Re-fetch whenever revision changes OR when the admin/employee token appears.
  // InventoryProvider sits above AdminAuthProvider in the tree so we cannot
  // use useAdminAuth() here. Instead we poll localStorage for either token.
  const [staffReady, setStaffReady] = useState(() =>
    Boolean(typeof window !== "undefined" && (
      window.localStorage.getItem("pf_admin_access_token") ||
      window.localStorage.getItem("pf_employee_access_token")
    ))
  );

  // The portal hint lets us know which scope to use for API calls.
  // We detect it from which token is present.
  const staffPortal = useMemo(() => {
    if (typeof window === "undefined") return "admin";
    if (window.localStorage.getItem("pf_employee_access_token")) return "employee";
    return "admin";
  }, [staffReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (staffReady) return;
    const id = setInterval(() => {
      if (
        window.localStorage.getItem("pf_admin_access_token") ||
        window.localStorage.getItem("pf_employee_access_token")
      ) {
        setStaffReady(true);
      }
    }, 800);
    return () => clearInterval(id);
  }, [staffReady]);

  useEffect(() => {
    if (!staffReady) return;
    let cancelled = false;
    apiListStock({ pageSize: 500, portal: staffPortal }).then((result) => {
      if (!cancelled && result.ok) setBackendRecords(result.items.map(mapBackendItem));
    });
    return () => { cancelled = true; };
  }, [revision, staffReady, staffPortal]);

  useEffect(() => {
    if (!staffReady) return;
    let cancelled = false;
    apiListMovements({ pageSize: 100, portal: staffPortal }).then((result) => {
      if (!cancelled && result.ok) setBackendMovements(result.movements.map(mapBackendMovement));
    });
    return () => { cancelled = true; };
  }, [revision, staffReady, staffPortal]);

  useEffect(() => {
    if (!staffReady) return;
    let cancelled = false;
    apiListTransfers({ pageSize: 100 }).then((result) => {
      if (!cancelled && result.ok) setBackendTransfers(result.transfers.map(mapBackendTransfer));
    });
    return () => { cancelled = true; };
  }, [revision, staffReady]);

  // ── Snapshot ─────────────────────────────────────────────────────────────
  const snapshot = useMemo(() => {
    const memoryRecords = inventoryRepository.query();
    const memoryProductIds = new Set(memoryRecords.map((r) => r.productId));
    const merged = [
      ...memoryRecords,
      ...backendRecords.filter((r) => !memoryProductIds.has(r.productId)),
    ];

    // Prefer backend movements (real) over in-memory (session-only).
    const movements = backendMovements.length
      ? backendMovements
      : inventoryRepository.loadMovements().map(inventoryRepository.resolveMovement);

    // Prefer backend transfers over in-memory.
    const transfers = backendTransfers.length
      ? backendTransfers
      : inventoryRepository.loadTransfers().map(inventoryRepository.resolveTransfer);

    return {
      records: merged,
      locations: inventoryRepository.loadLocations(),
      movements,
      transfers,
      metrics: getInventoryMetrics(merged),
      reports: inventoryRepository.reports(merged),
    };
  }, [revision, backendRecords, backendMovements, backendTransfers]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * receiveStock — finds the backend stock id for the record, then calls
   * POST /admin/inventory/stock/adjust with a positive delta.
   * Falls back to in-memory if no backendId is available.
   */
  const receiveStock = useCallback(async (payload) => {
    const record = backendRecords.find(
      (r) => r.productId === payload.productId &&
        String(r.variantId ?? "") === String(payload.variantId ?? "") &&
        r.locationId === payload.locationId,
    );
    if (record?.backendId) {
      const qty = Math.max(0, Math.floor(Number(payload.quantity) || 0));
      if (qty <= 0) return { ok: false, error: "Receiving quantity must be greater than zero." };
      const result = await apiAdjustStock({
        stockId: record.backendId,
        delta: qty,
        type: "RECEIVE",
        reason: payload.supplier ? `Received from ${payload.supplier}` : (payload.reason || "Stock received"),
      });
      if (result.ok) refresh();
      return result;
    }
    // Fallback: in-memory (no backend stock record yet)
    const memResult = inventoryRepository.receiveStock(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [backendRecords, refresh]);

  /**
   * adjustStock — maps to POST /admin/inventory/stock/adjust.
   */
  const adjustStock = useCallback(async (payload) => {
    const record = backendRecords.find(
      (r) => r.productId === payload.productId &&
        String(r.variantId ?? "") === String(payload.variantId ?? "") &&
        r.locationId === payload.locationId,
    );
    if (record?.backendId) {
      const delta = Math.trunc(Number(payload.adjustment) || 0);
      if (delta === 0) return { ok: false, error: "Adjustment cannot be zero." };
      const result = await apiAdjustStock({
        stockId: record.backendId,
        delta,
        type: "ADJUST",
        reason: payload.reason || "System Correction",
      });
      if (result.ok) refresh();
      return result;
    }
    const memResult = inventoryRepository.adjustStock(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [backendRecords, refresh]);

  /**
   * markDamaged — negative DAMAGE adjust.
   */
  const markDamaged = useCallback(async (payload) => {
    const record = backendRecords.find(
      (r) => r.productId === payload.productId &&
        String(r.variantId ?? "") === String(payload.variantId ?? "") &&
        r.locationId === payload.locationId,
    );
    if (record?.backendId) {
      const qty = Math.max(0, Math.floor(Number(payload.quantity) || 0));
      if (qty <= 0) return { ok: false, error: "Damaged quantity must be greater than zero." };
      const result = await apiAdjustStock({
        stockId: record.backendId,
        delta: -qty,
        type: "DAMAGE",
        reason: payload.reason || "Stock marked damaged",
      });
      if (result.ok) refresh();
      return result;
    }
    const memResult = inventoryRepository.markDamaged(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [backendRecords, refresh]);

  /**
   * returnStock — positive RETURN adjust (quarantine, not yet sellable).
   */
  const returnStock = useCallback(async (payload) => {
    const record = backendRecords.find(
      (r) => r.productId === payload.productId &&
        String(r.variantId ?? "") === String(payload.variantId ?? ""),
    );
    if (record?.backendId) {
      const qty = Math.max(0, Math.floor(Number(payload.quantity) || 0));
      if (qty <= 0) return { ok: false, error: "Returned quantity must be greater than zero." };
      const result = await apiAdjustStock({
        stockId: record.backendId,
        delta: qty,
        type: "RETURN",
        reason: payload.reason || "Customer return awaiting inspection",
      });
      if (result.ok) refresh();
      return result;
    }
    const memResult = inventoryRepository.returnStock(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [backendRecords, refresh]);

  /**
   * inspectReturnedStock — in-memory only (no dedicated backend endpoint yet).
   */
  const inspectReturnedStock = useCallback((payload) => {
    const memResult = inventoryRepository.inspectReturnedStock(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [refresh]);

  /**
   * updateThreshold — in-memory only (no dedicated backend endpoint yet).
   */
  const updateThreshold = useCallback((payload) => {
    const memResult = inventoryRepository.updateThreshold(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [refresh]);

  /**
   * addLocation — in-memory (warehouse CRUD lives in /admin/warehouses).
   */
  const addLocation = useCallback((payload) => {
    const memResult = inventoryRepository.addLocation(payload);
    if (memResult?.ok) refresh();
    return memResult;
  }, [refresh]);

  /**
   * createTransfer — POST /admin/stock-transfers.
   * Payload expected: { fromWarehouseId, toWarehouseId, lines, notes? }
   * The existing InventoryTransfersPage passes sourceLocationId /
   * destinationLocationId / productId / quantity, so we map those here.
   */
  const createTransfer = useCallback(async (payload) => {
    const fromId = payload.fromWarehouseId ?? payload.sourceLocationId;
    const toId   = payload.toWarehouseId   ?? payload.destinationLocationId;

    if (!fromId || !toId) {
      return { ok: false, error: "Source and destination are required." };
    }

    // Build lines array — find the backend stock id if possible
    const record = backendRecords.find(
      (r) => r.productId === payload.productId &&
        String(r.variantId ?? "") === String(payload.variantId ?? "") &&
        r.locationId === fromId,
    );
    const lines = payload.lines ?? [{
      stockId: record?.backendId ?? undefined,
      sku: payload.sku ?? undefined,
      quantity: Math.max(1, Math.floor(Number(payload.quantity) || 0)),
    }];

    const result = await apiCreateTransfer({
      fromWarehouseId: fromId,
      toWarehouseId:   toId,
      lines,
      notes: payload.notes ?? payload.reason ?? undefined,
    });
    if (result.ok) refresh();
    return result;
  }, [backendRecords, refresh]);

  /**
   * transitionTransfer — complete or cancel a backend transfer.
   * Accepts the same TRANSFER_STATES used by the in-memory layer.
   */
  const transitionTransfer = useCallback(async (transferId, nextStatus, _actor) => {
    const isBackendTransfer = backendTransfers.some((t) => t.id === transferId);

    if (isBackendTransfer) {
      let result;
      switch (nextStatus) {
        case "REQUESTED":
          result = await apiRequestTransfer(transferId); break;
        case "APPROVED":
          result = await apiApproveTransfer(transferId); break;
        case "IN_TRANSIT":
          result = await apiDispatchTransfer(transferId); break;
        case "RECEIVED":
        case "COMPLETED":
          result = await apiCompleteTransfer(transferId); break;
        case "CANCELLED":
          result = await apiCancelTransfer(transferId); break;
        default:
          result = { ok: false, error: `Unsupported transition to '${nextStatus}'.` };
      }
      if (result.ok) refresh();
      return result;
    }

    // Fallback: in-memory transitions (for transfers not yet backed by the server)
    const memResult = inventoryRepository.transitionTransfer(transferId, nextStatus, _actor);
    if (memResult?.ok) refresh();
    return memResult;
  }, [backendTransfers, refresh]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value = useMemo(() => ({
    ...snapshot,
    revision,
    refresh,
    query: (filters) => inventoryRepository.query(filters),
    getAvailability: (product, selection) => inventoryRepository.getCustomerAvailability(product, selection),
    receiveStock,
    adjustStock,
    markDamaged,
    returnStock,
    inspectReturnedStock,
    updateThreshold,
    addLocation,
    createTransfer,
    transitionTransfer,
  }), [
    snapshot,
    revision,
    refresh,
    receiveStock,
    adjustStock,
    markDamaged,
    returnStock,
    inspectReturnedStock,
    updateThreshold,
    addLocation,
    createTransfer,
    transitionTransfer,
  ]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

const inert = {
  records: [],
  locations: [],
  movements: [],
  transfers: [],
  metrics: {},
  reports: { byLocation: [], byCategory: [] },
  revision: 0,
  refresh: () => {},
  query: () => [],
  getAvailability: () => ({ tracked: false, available: 0, status: "IN_STOCK" }),
  receiveStock: async () => ({ ok: false, error: "No inventory context." }),
  adjustStock: async () => ({ ok: false, error: "No inventory context." }),
  markDamaged: async () => ({ ok: false, error: "No inventory context." }),
  returnStock: async () => ({ ok: false, error: "No inventory context." }),
  inspectReturnedStock: () => ({ ok: false, error: "No inventory context." }),
  updateThreshold: () => ({ ok: false, error: "No inventory context." }),
  addLocation: () => ({ ok: false, error: "No inventory context." }),
  createTransfer: async () => ({ ok: false, error: "No inventory context." }),
  transitionTransfer: async () => ({ ok: false, error: "No inventory context." }),
};

export const useInventory = () => useContext(InventoryContext) ?? inert;

export default InventoryContext;
