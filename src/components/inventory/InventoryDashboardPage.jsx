/**
 * PRATIKSHYA FASHION — Admin & Employee Inventory Dashboard.
 * Now fetches stock records directly from the backend for the admin portal
 * to avoid the InventoryContext timing issue (context mounts before admin login).
 */

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  PackageX,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Store,
  Warehouse,
} from "lucide-react";
import AdminPage from "../admin/AdminPage";
import AdminPanel from "../admin/AdminPanel";
import EmployeePage from "../employee/EmployeePage";
import DataTable from "../employee/DataTable";
import { AtelierButton } from "../../design-system";
import { useInventory } from "../../context/InventoryContext";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { PERMISSIONS } from "../../config/employeePermissions";
import { ROLES } from "../../config/employeeRoles";
import { categoryLabels } from "../../data/products/taxonomy";
import { formatINR } from "../../utils/shopping";
import { formatEmployeeDateTime } from "../../utils/employee";
import InventoryNav from "./InventoryNav";
import InventoryStatusBadge from "./InventoryStatusBadge";
import { LOCATION_TYPES, STOCK_STATUS, calculateStockStatus } from "../../services/inventory/inventoryRepository";
import { apiListStock } from "../../services/api/inventoryApi";

const inputClass = "h-10 w-full border border-mist bg-canvas px-3 font-ui text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/20";

function Metric({ label, value, hint, Icon, alert = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="border border-mist/80 bg-surface/45 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">{label}</p>
          <p className={`mt-2 font-display text-2xl font-light sm:text-3xl ${alert ? "text-accent" : "text-ink"}`}>
            {value}
          </p>
          {hint ? <p className="mt-1 font-ui text-[10px] text-taupe">{hint}</p> : null}
        </div>
        <Icon size={17} strokeWidth={1.3} className={alert ? "text-accent" : "text-brass"} aria-hidden="true" />
      </div>
    </motion.div>
  );
}

export default function InventoryDashboardPage({ portal = "admin" }) {
  const inventory = useInventory();
  const { employee, hasPermission } = useEmployeeAuth();
  const { admin } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",    category: "",
    subcategory: "",
    productType: "",
    locationId: "",
    status: "",
    locationType: searchParams.get("locationType") || "",
    department: "",
    hasAvailable: false,
    hasReserved: false,
    hasDamaged: false,
    hasReturned: false,
  });
  const [locationDraft, setLocationDraft] = useState({ name: "", type: LOCATION_TYPES.STORE, address: "", area: "" });
  const [locationNotice, setLocationNotice] = useState("");
  const employeeWarehouseOnly = portal === "employee" && employee?.role === ROLES.WAREHOUSE_STAFF;
  const availabilityOnly = portal === "employee" && [
    ROLES.SALES_EXECUTIVE,
    ROLES.FASHION_STYLIST,
    ROLES.CUSTOMER_SUPPORT,
  ].includes(employee?.role);
  const root = portal === "super-admin" ? "/super-admin/inventory" : portal === "admin" ? "/admin/inventory" : "/employee/inventory";
  const Page = portal === "employee" ? EmployeePage : AdminPage;

  // ── Admin/Employee portal: fetch stock records directly from backend ──────
  // The InventoryContext shared fetch fires before admin/employee login, so for
  // these portals we fetch directly here where the token is guaranteed present.
  const isAdminPortal = portal === "admin" || portal === "super-admin" || portal === "employee";
  const [backendStockRows, setBackendStockRows] = useState(null);
  const [stockLoading, setStockLoading] = useState(isAdminPortal);

  const loadBackendStock = useCallback(async () => {
    if (!isAdminPortal) return;
    setStockLoading(true);
    const apiPortal = portal === "employee" ? "employee" : "admin";
    const result = await apiListStock({ pageSize: 500, portal: apiPortal });
    if (result.ok) {
      setBackendStockRows(
        (result.items ?? []).map((item) => {
          const onHand    = item.quantity_on_hand    ?? 0;
          const reserved  = item.quantity_reserved   ?? 0;
          const available = item.quantity_available  ?? Math.max(0, onHand - reserved);
          const threshold = item.low_threshold       ?? 5;
          return {
            id:               `backend::${item.id}`,
            backendId:        item.id,
            productId:        item.product_id  ?? "",
            variantId:        item.variant_id  ?? null,
            sku:              item.sku ?? "—",
            locationId:       item.warehouse_id ?? "loc-main-store",
            productName:      item.product_name ?? item.sku ?? item.product_id ?? "—",
            variantLabel:     "",
            category:         "",
            subcategory:      "",
            productType:      "",
            placement:        { department: "" },
            placementLabel:   "",
            location: {
              id:   item.warehouse_id ?? "loc-main-store",
              name: item.warehouse_id ? "Main Warehouse" : "Main Store",
              type: item.warehouse_id ? LOCATION_TYPES.WAREHOUSE : LOCATION_TYPES.STORE,
            },
            product:          null,
            estimatedValue:   0,
            quantity:         { onHand, available, reserved, sold: 0, returned: 0, damaged: 0 },
            lowStockThreshold: threshold,
            maximumStock:     null,
            active:           true,
            status:           calculateStockStatus({ available, lowStockThreshold: threshold }),
            createdAt:        item.created_at ?? null,
            updatedAt:        item.updated_at ?? null,
            lastMovementAt:   null,
          };
        })
      );
    }
    setStockLoading(false);
  }, [isAdminPortal]);

  useEffect(() => { loadBackendStock(); }, [loadBackendStock]);

  // For admin portals use the direct backend rows; for employee use in-memory query
  const rows = useMemo(() => {
    if (isAdminPortal) {
      const source = backendStockRows ?? inventory.records;
      const term = filters.search.trim().toLowerCase();
      return source.filter((row) => {
        if (!term) return true;
        const haystack = [row.productName, row.sku, row.variantLabel, row.category]
          .join(" ").toLowerCase();
        return haystack.includes(term);
      }).filter((row) =>
        (!filters.status || row.status === filters.status) &&
        (!filters.locationId || row.locationId === filters.locationId) &&
        (!filters.hasAvailable || row.quantity.available > 0) &&
        (!filters.hasReserved  || row.quantity.reserved  > 0) &&
        (!filters.hasDamaged   || row.quantity.damaged   > 0)
      );
    }
    return inventory.query({
      ...filters,
      ...(availabilityOnly ? {
        search: "", locationId: "", locationType: "", department: "",
        status: "", hasAvailable: false, hasReserved: false, hasDamaged: false, hasReturned: false,
      } : {}),
      locationType: employeeWarehouseOnly ? LOCATION_TYPES.WAREHOUSE : availabilityOnly ? "" : filters.locationType || "",
    });
  }, [isAdminPortal, backendStockRows, inventory, filters, employeeWarehouseOnly, availabilityOnly]);
  const availabilityRows = useMemo(() => {
    if (!availabilityOnly) return rows;
    const unique = new Map();
    rows.forEach((row) => {
      const key = `${row.productId}::${row.variantId || "base"}`;
      if (unique.has(key)) return;
      const availability = inventory.getAvailability(row.product, { variantId: row.variantId });
      unique.set(key, { ...row, customerAvailability: availability });
    });
    const term = filters.search.trim().toLowerCase();
    return [...unique.values()].filter((row) => {
      const safeSearch = [row.productName, row.sku, row.variantLabel, row.category, row.subcategory, row.productType]
        .join(" ")
        .toLowerCase();
      return (!term || safeSearch.includes(term)) &&
        (!filters.status || row.customerAvailability.status === filters.status);
    });
  }, [availabilityOnly, rows, inventory, filters.search, filters.status]);
  const metrics = useMemo(() => {
    // For admin portals, compute metrics directly from backend rows so they
    // reflect real DB state rather than the in-memory session store.
    const source = isAdminPortal ? (backendStockRows ?? inventory.records) : rows;
    if (!employeeWarehouseOnly && !isAdminPortal) return inventory.metrics;
    return {
      ...inventory.metrics,
      totalUnits:     source.reduce((sum, row) => sum + (row.quantity?.onHand    ?? 0), 0),
      availableUnits: source.reduce((sum, row) => sum + (row.quantity?.available ?? 0), 0),
      reservedUnits:  source.reduce((sum, row) => sum + (row.quantity?.reserved  ?? 0), 0),
      damagedUnits:   source.reduce((sum, row) => sum + (row.quantity?.damaged   ?? 0), 0),
      returnedUnits:  source.reduce((sum, row) => sum + (row.quantity?.returned  ?? 0), 0),
      estimatedValue: source.reduce((sum, row) => sum + (row.estimatedValue ?? 0), 0),
      storeStock:     source.filter((row) => row.location?.type === LOCATION_TYPES.STORE).reduce((sum, row) => sum + (row.quantity?.onHand ?? 0), 0),
      warehouseStock: source.filter((row) => row.location?.type === LOCATION_TYPES.WAREHOUSE).reduce((sum, row) => sum + (row.quantity?.onHand ?? 0), 0),
      totalProducts:  new Set(source.map((row) => row.productId)).size,
      totalVariants:  new Set(source.map((row) => row.variantId).filter(Boolean)).size,
      lowStock:       source.filter((row) => row.status === STOCK_STATUS.LOW_STOCK).length,
      outOfStock:     source.filter((row) => row.status === STOCK_STATUS.OUT_OF_STOCK).length,
    };
  }, [isAdminPortal, backendStockRows, inventory.metrics, inventory.records, rows, employeeWarehouseOnly]);

  const can = (permission) => portal !== "employee" || hasPermission(permission);
  const filterSourceRows = employeeWarehouseOnly
    ? inventory.records.filter((row) => row.location?.type === LOCATION_TYPES.WAREHOUSE)
    : inventory.records;
  const categories = [...new Set(filterSourceRows.map((row) => row.category).filter(Boolean))].sort();
  const subcategories = [...new Set(filterSourceRows.map((row) => row.subcategory).filter(Boolean))].sort();
  const productTypes = [...new Set(filterSourceRows.map((row) => row.productType).filter(Boolean))].sort();
  const departments = [...new Set(filterSourceRows.map((row) => row.placement.department).filter(Boolean))].sort();
  const visibleLocations = inventory.locations.filter((location) =>
    !employeeWarehouseOnly || location.type === LOCATION_TYPES.WAREHOUSE
  );
  const reports = useMemo(() => {
    const byLocation = inventory.reports.byLocation;
    const byCategory = inventory.reports.byCategory.map((item) => ({
      ...item,
      label: categoryLabels[item.label] || item.label,
    }));
    return { byLocation, byCategory };
  }, [inventory.reports]);

  const addLocation = (event) => {
    event.preventDefault();
    const result = inventory.addLocation({
      ...locationDraft,
      actor: { adminId: admin?.adminId, name: admin?.name || "Administrator" },
    });
    setLocationNotice(result.ok ? `${result.location.name} added.` : result.error);
    if (result.ok) setLocationDraft({ name: "", type: LOCATION_TYPES.STORE, address: "", area: "" });
  };

  const tiles = availabilityOnly
    ? [
        ["Catalogue pieces", availabilityRows.length, "Availability access only", Boxes],
        ["Available", availabilityRows.filter((row) => row.customerAvailability.available > 0).length, "In stock", PackageCheck],
        ["Only a few left", availabilityRows.filter((row) => row.customerAvailability.status === STOCK_STATUS.LOW_STOCK).length, "Customer-safe status", AlertTriangle, true],
        ["Unavailable", availabilityRows.filter((row) => row.customerAvailability.available <= 0).length, "Ask inventory team", PackageX, true],
      ]
    : employeeWarehouseOnly
      ? [
          ["Warehouse units", metrics.totalUnits || 0, "On hand", Warehouse],
          ["Available", metrics.availableUnits || 0, "Ready for allocation", PackageCheck],
          ["Reserved", metrics.reservedUnits || 0, "Held at checkout", RotateCcw],
          ["Damaged", metrics.damagedUnits || 0, "Unavailable for sale", ShieldAlert],
          ["Returned", metrics.returnedUnits || 0, "Awaiting inspection", RotateCcw],
          ["Low stock", metrics.lowStock || 0, "At or below threshold", AlertTriangle, true],
          ["Out of stock", metrics.outOfStock || 0, "Needs replenishment", PackageX, true],
        ]
      : [
        ["Total units", metrics.totalUnits || 0, "On hand across visible locations", Boxes],
        ["Available", metrics.availableUnits || 0, "Ready for sale", PackageCheck],
        ["Reserved", metrics.reservedUnits || 0, "Held at checkout", RotateCcw],
        ["Low stock", metrics.lowStock || 0, "At or below threshold", AlertTriangle, true],
        ["Out of stock", metrics.outOfStock || 0, "Needs receiving or transfer", PackageX, true],
        ["Estimated inventory value", formatINR(metrics.estimatedValue || 0), "Available units × selling price", CircleDollarSign],
        ["Damaged", metrics.damagedUnits || 0, "Unavailable for sale", ShieldAlert],
        ["Returned", metrics.returnedUnits || 0, "Awaiting inspection", RotateCcw],
        ["Store stock", metrics.storeStock || 0, "On hand", Store],
        ["Warehouse stock", metrics.warehouseStock || 0, "On hand", Warehouse],
      ];

  return (
    <Page
      eyebrow={portal === "employee" ? "Retail operations / Inventory" : "Business / Inventory"}
      title="Inventory Dashboard"
      description={employeeWarehouseOnly
        ? "Warehouse stock, receiving and transfer handling. Store-only details remain outside this work queue."
        : availabilityOnly
          ? "Customer-safe product availability for assisted selling and styling. Internal quantities, reservations and locations remain restricted."
          : "One stock ledger across the Main Store and Main Warehouse, connected to the existing catalogue and variants."}
      actions={
        <>
          {isAdminPortal && (
            <AtelierButton variant="outline" size="chip" onClick={loadBackendStock} aria-label="Refresh stock">
              <RefreshCw size={11} /> Refresh
            </AtelierButton>
          )}
          {can(PERMISSIONS.INVENTORY_RECEIVE) ? (
            <AtelierButton as={Link} to={`${root}/receive`} size="chip">Receive stock</AtelierButton>
          ) : null}
          {can(PERMISSIONS.INVENTORY_ADJUST) ? (
            <AtelierButton as={Link} to={`${root}/adjust`} variant="outline" size="chip">Adjust stock</AtelierButton>
          ) : null}
          {can(PERMISSIONS.INVENTORY_TRANSFER) ? (
            <AtelierButton as={Link} to={`${root}/transfers`} variant="outline" size="chip">Transfer stock</AtelierButton>
          ) : null}
        </>
      }
    >
      <InventoryNav portal={portal} />


      <section aria-label="Inventory metrics" className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map(([label, value, hint, Icon, alert], index) => (
          <motion.div key={label} transition={{ delay: index * 0.025 }}>
            <Metric label={label} value={value} hint={hint} Icon={Icon} alert={alert} />
          </motion.div>
        ))}
      </section>

      <AdminPanel eyebrow="Stock summary" title="Catalogue inventory" bodyClassName="px-0 py-0 sm:px-0">
        <form
          className="grid gap-3 border-b border-mist/70 bg-canvas/60 p-4 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => event.preventDefault()}
          aria-label="Inventory filters"
        >
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Search
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder={availabilityOnly ? "Product, SKU or category" : "Product, SKU, category, rack or bin"}
              className={`${inputClass} mt-2 normal-case tracking-normal`}
            />
          </label>
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Category
            <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{categoryLabels[category] || category}</option>)}
            </select>
          </label>
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Subcategory
            <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.subcategory} onChange={(event) => setFilters((current) => ({ ...current, subcategory: event.target.value }))}>
              <option value="">All subcategories</option>
              {subcategories.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
            </select>
          </label>
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Product type
            <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.productType} onChange={(event) => setFilters((current) => ({ ...current, productType: event.target.value }))}>
              <option value="">All product types</option>
              {productTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          {!availabilityOnly ? (
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Location
              <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.locationId} onChange={(event) => setFilters((current) => ({ ...current, locationId: event.target.value }))}>
                <option value="">All locations</option>
                {inventory.locations.filter((location) => !employeeWarehouseOnly || location.type === LOCATION_TYPES.WAREHOUSE).map((location) => (
                  <option key={location.id} value={location.id}>{location.name} · {location.type === "STORE" ? "Store" : "Warehouse"}</option>
                ))}
              </select>
            </label>
          ) : null}
          {!availabilityOnly ? (
            <>
              <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                Location type
                <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.locationType} onChange={(event) => setFilters((current) => ({ ...current, locationType: event.target.value }))}>
                  <option value="">Store & warehouse</option>
                  <option value={LOCATION_TYPES.STORE}>Store</option>
                  <option value={LOCATION_TYPES.WAREHOUSE}>Warehouse</option>
                </select>
              </label>
              <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                Department
                <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}>
                  <option value="">All departments</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
            </>
          ) : null}
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Stock status
            <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value={STOCK_STATUS.IN_STOCK}>In stock</option>
              <option value={STOCK_STATUS.LOW_STOCK}>Low stock</option>
              <option value={STOCK_STATUS.OUT_OF_STOCK}>Out of stock</option>
              <option value={STOCK_STATUS.OVERSTOCKED}>Overstocked</option>
              <option value={STOCK_STATUS.UNAVAILABLE}>Unavailable</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
            {[
              ["Low stock", STOCK_STATUS.LOW_STOCK],
              ["Out of stock", STOCK_STATUS.OUT_OF_STOCK],
              ["In stock", STOCK_STATUS.IN_STOCK],
            ].map(([label, status]) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, status: current.status === status ? "" : status }))}
                aria-pressed={filters.status === status}
                className={`border px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.13em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${filters.status === status ? "border-ink bg-ink text-ivory" : "border-mist text-taupe hover:border-ink hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
            {!availabilityOnly ? [
              ["Available", "hasAvailable"],
              ["Reserved", "hasReserved"],
              ["Damaged", "hasDamaged"],
              ["Returned", "hasReturned"],
            ].map(([label, key]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filters[key]}
                onClick={() => setFilters((current) => ({ ...current, [key]: !current[key] }))}
                className={`border px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.13em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${filters[key] ? "border-ink bg-ink text-ivory" : "border-mist text-taupe hover:border-ink hover:text-ink"}`}
              >
                {label}
              </button>
            )) : null}
            <button type="button" onClick={() => setFilters({ search: "", category: "", subcategory: "", productType: "", locationId: "", status: "", locationType: "", department: "", hasAvailable: false, hasReserved: false, hasDamaged: false, hasReturned: false })} className="px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.13em] text-accent hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent">
              Clear filters
            </button>
          </div>
        </form>

        {availabilityOnly ? (
          <DataTable
            className="border-0"
            rows={availabilityRows}
            empty="No products match these filters."
            columns={[
              { id: "product", label: "Product", render: (row) => <div><p className="font-medium">{row.productName}</p><p className="mt-1 font-mono text-[10px] text-taupe">{row.sku} · {row.variantLabel}</p></div> },
              { id: "category", label: "Category", render: (row) => categoryLabels[row.category] || row.category },
              { id: "status", label: "Availability", render: (row) => <InventoryStatusBadge status={row.customerAvailability.status} /> },
              { id: "guidance", label: "Customer guidance", render: (row) => row.customerAvailability.available <= 0 ? "Currently unavailable" : row.customerAvailability.status === STOCK_STATUS.LOW_STOCK ? "Only a few left" : "In stock" },
            ]}
          />
        ) : stockLoading ? (
          <p role="status" aria-busy="true" className="px-4 py-8 font-ui text-sm text-taupe">Loading stock…</p>
        ) : (
        <DataTable
          className="border-0"
          rows={rows}
          empty="No inventory rows match these filters."
          columns={[
            {
              id: "product",
              label: "Product",
              render: (row) => (
                <div className="min-w-44">
                  <p className="font-medium text-ink">{row.productName}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-taupe">{row.sku}</p>
                  <p className="mt-0.5 text-[10px] text-taupe">{categoryLabels[row.category] || row.category} · {row.variantLabel}</p>
                </div>
              ),
            },
            { id: "location", label: "Location", render: (row) => <div><p>{row.location?.name || "—"}</p><p className="mt-0.5 max-w-48 text-[10px] text-taupe">{row.placementLabel || "Placement not assigned"}</p></div> },
            { id: "onHand", label: "On hand", render: (row) => row.quantity?.onHand ?? 0 },
            { id: "available", label: "Available", render: (row) => <strong>{row.quantity?.available ?? 0}</strong> },
            { id: "reserved", label: "Reserved", render: (row) => row.quantity?.reserved ?? 0 },
            { id: "sold", label: "Sold", render: (row) => row.quantity?.sold ?? 0 },
            { id: "returned", label: "Returned", render: (row) => row.quantity?.returned ?? 0 },
            { id: "damaged", label: "Damaged", render: (row) => row.quantity?.damaged ?? 0 },
            { id: "threshold", label: "Threshold", render: (row) => row.lowStockThreshold },
            { id: "status", label: "Status", render: (row) => <InventoryStatusBadge status={row.status} /> },
            { id: "updated", label: "Last updated", render: (row) => <span className="whitespace-nowrap text-[11px] text-taupe">{formatEmployeeDateTime(row.updatedAt)}</span> },
            {
              id: "actions",
              label: "Actions",
              render: (row) => (
                <div className="flex flex-col items-end gap-1 sm:items-start">
                  {can(PERMISSIONS.INVENTORY_RECEIVE) ? <Link className="text-[11px] text-brass hover:text-accent" to={`${root}/receive?productId=${encodeURIComponent(row.productId)}&locationId=${encodeURIComponent(row.locationId)}`}>Receive</Link> : null}
                  {can(PERMISSIONS.INVENTORY_ADJUST) ? <Link className="text-[11px] text-brass hover:text-accent" to={`${root}/adjust?inventoryId=${encodeURIComponent(row.id)}`}>Adjust</Link> : null}
                  {can(PERMISSIONS.INVENTORY_TRANSFER) ? <Link className="text-[11px] text-brass hover:text-accent" to={`${root}/transfers?inventoryId=${encodeURIComponent(row.id)}`}>Transfer</Link> : null}
                </div>
              ),
            },
          ]}
        />
        )}
        <p className="border-t border-mist/60 px-5 py-3 font-ui text-[10px] text-taupe">
          {availabilityOnly
            ? `Showing ${availabilityRows.length} customer-safe availability status${availabilityRows.length === 1 ? "" : "es"}. Internal counts and locations are restricted.`
            : `Showing ${rows.length} inventory row${rows.length === 1 ? "" : "s"} · ${metrics.totalProducts || 0} catalogue products · ${metrics.totalVariants || 0} explicit variants`}
        </p>
      </AdminPanel>

      {!employeeWarehouseOnly && !availabilityOnly ? (
        <div className="mt-7 grid gap-6 xl:grid-cols-2">
          <AdminPanel eyebrow="Report" title="Stock by location">
            <DataTable
              className="border-0"
              rows={reports.byLocation}
              columns={[
                { id: "label", label: "Location" },
                { id: "units", label: "Units" },
                { id: "value", label: "Value", render: (row) => formatINR(row.value) },
                { id: "lowStock", label: "Low" },
                { id: "outOfStock", label: "Out" },
              ]}
            />
          </AdminPanel>
          <AdminPanel eyebrow="Report" title="Stock by category">
            <DataTable
              className="border-0"
              rows={reports.byCategory.slice(0, 8)}
              columns={[
                { id: "label", label: "Category" },
                { id: "units", label: "Units" },
                { id: "available", label: "Available" },
                { id: "value", label: "Value", render: (row) => formatINR(row.value) },
              ]}
            />
          </AdminPanel>
        </div>
      ) : null}

      {!availabilityOnly ? (
      <AdminPanel eyebrow="Physical network" title="Locations" className="mt-7">
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLocations.map((location) => (
            <article key={location.id} className="border border-mist/70 bg-canvas/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl text-ink">{location.name}</p>
                  <p className="mt-1 font-ui text-[10px] uppercase tracking-[.15em] text-brass">{location.type}</p>
                </div>
                <span className="font-ui text-[9px] uppercase tracking-[.14em] text-cocoa">{location.status}</span>
              </div>
              <p className="mt-3 font-ui text-xs text-taupe">{location.address}</p>
              <p className="mt-1 font-ui text-[10px] text-taupe">{location.area}</p>
            </article>
          ))}
        </div>
        {portal !== "employee" ? (
          <form onSubmit={addLocation} className="mt-5 grid gap-3 border-t border-mist/70 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Location name
              <input required className={`${inputClass} mt-2 normal-case tracking-normal`} value={locationDraft.name} onChange={(event) => setLocationDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Future store or warehouse" />
            </label>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Type
              <select className={`${inputClass} mt-2 normal-case tracking-normal`} value={locationDraft.type} onChange={(event) => setLocationDraft((current) => ({ ...current, type: event.target.value }))}>
                <option value={LOCATION_TYPES.STORE}>Store</option>
                <option value={LOCATION_TYPES.WAREHOUSE}>Warehouse</option>
              </select>
            </label>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Address / area
              <input className={`${inputClass} mt-2 normal-case tracking-normal`} value={locationDraft.address} onChange={(event) => setLocationDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Physical address" />
            </label>
            <div className="flex items-end gap-3">
              <AtelierButton type="submit" size="chip">Add location</AtelierButton>
              {locationNotice ? <span role="status" className="font-ui text-[10px] text-taupe">{locationNotice}</span> : null}
            </div>
          </form>
        ) : null}
      </AdminPanel>
      ) : null}
    </Page>
  );
}
