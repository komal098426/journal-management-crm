"use client";

import { Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataTable, DateRangeInputs, Pagination, SearchBox, type Column } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/Modal";
import { RemoteSelect } from "@/components/ui/RemoteSelect";
import { ConfirmDelete, RowActions } from "@/components/ui/RowActions";
import { ErrorState, Field, LoadingState, PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useApi, useList } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime, titleCase, useFormat } from "@/lib/format";
import { categoryService, productService, reportService, stockService, supplierService } from "@/services/erp";
import type { Category, Paginated, Product, StockAdjustment, StockMovement, Supplier } from "@/types/erp";

const TABS = [
  { href: "/inventory", label: "Products" },
  { href: "/inventory/categories", label: "Categories" },
  { href: "/inventory/adjustments", label: "Stock adjustments" },
  { href: "/inventory/history", label: "Stock history" },
];

function InventoryTabs() {
  const pathname = usePathname();
  return (
    <nav className="page-tabs" aria-label="Inventory sections">
      {TABS.map(tab => (
        <Link key={tab.href} href={tab.href} className={`nav-pill ${pathname === tab.href ? "active" : ""}`}>{tab.label}</Link>
      ))}
    </nav>
  );
}

function InventoryPanel({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader title={title} subtitle={subtitle} actions={actions} />
      <InventoryTabs />
      {children}
    </div>
  );
}

type ProductLike = Pick<Product, "id" | "name" | "sku" | "unit" | "stock_quantity">;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export function ProductsView() {
  const { can } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const list = useList<Product>(query => productService.list(query), {
    sort: "name", order: "asc", stock_status: searchParams.get("stock_status") ?? undefined,
  });
  const summary = useApi(() => reportService.run("inventory", { pageSize: 1 }), [list.data]);
  const categories = useApi(() => categoryService.list({ pageSize: 100, sort: "name", order: "asc" }), []);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const columns: Column<Product>[] = [
    { key: "name", label: "Product", sortable: true, render: p => <div className="person-cell"><div><b>{p.name}</b><span>{p.sku}{p.brand ? ` · ${p.brand}` : ""}</span></div></div> },
    { key: "category_name", label: "Category", sortable: true, render: p => p.category_name ?? "—" },
    { key: "stock_quantity", label: "Stock", sortable: true, numeric: true, render: p => <span className={p.stock_status !== "in_stock" ? "danger-text" : undefined}>{fmt.number(p.stock_quantity)} {p.unit}</span> },
    { key: "minimum_stock", label: "Minimum", sortable: true, numeric: true, render: p => fmt.number(p.minimum_stock) },
    { key: "purchase_price", label: "Cost", sortable: true, numeric: true, render: p => fmt.money(p.purchase_price) },
    { key: "selling_price", label: "Price", sortable: true, numeric: true, render: p => fmt.money(p.selling_price) },
    { key: "stock_value", label: "Stock value", sortable: true, numeric: true, render: p => fmt.money(p.stock_value) },
    { key: "stock_status", label: "Status", render: p => <span className="chip-list"><StatusBadge status={p.stock_status} />{p.status === "inactive" ? <StatusBadge status="inactive" /> : null}</span> },
    {
      key: "actions", label: "",
      render: p => (
        <div className="row-actions" onClick={event => event.stopPropagation()}>
          {can("inventory:write") ? <button className="icon-button" onClick={() => setAdjusting(p)} aria-label={`Adjust stock of ${p.name}`} title="Adjust stock"><SlidersHorizontal size={13} /></button> : null}
          <RowActions label={p.name} onEdit={can("inventory:write") ? () => setEditing(p) : undefined} onDelete={can("inventory:delete") ? () => setDeleting(p) : undefined} />
        </div>
      ),
    },
  ];

  const s = summary.data?.summary ?? [];

  return (
    <InventoryPanel
      title="Inventory"
      subtitle="Live stock levels — changed only by purchases, sales, returns and adjustments"
      actions={can("inventory:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add product</button> : null}
    >
      <div className="detail-grid">
        {s.length === 0 ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="mini-metric"><span className="skeleton" style={{ height: 22 }} /></div>) : null}
        {s.slice(0, 2).map(item => <div key={item.label} className="mini-metric"><span>{item.label}</span><b>{item.type === "money" ? fmt.compactMoney(item.value) : fmt.number(item.value)}</b></div>)}
        {s.slice(3, 5).map(item => <div key={item.label} className="mini-metric"><span>{item.label}</span><b style={{ color: item.value ? "#b8746b" : undefined }}>{fmt.number(item.value)}</b></div>)}
      </div>
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search name, SKU, brand or category" />
        <select className="select-dark" value={list.params.category_id ?? ""} onChange={e => list.setParam("category_id", e.target.value || undefined)} aria-label="Category">
          <option value="">All categories</option>
          {categories.data?.data.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select className="select-dark" value={list.params.stock_status ?? ""} onChange={e => list.setParam("stock_status", e.target.value || undefined)} aria-label="Stock status">
          <option value="">Any stock level</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
        <select className="select-dark" value={list.params.status ?? ""} onChange={e => list.setParam("status", e.target.value || undefined)} aria-label="Product status">
          <option value="">Active & inactive</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        onRowClick={p => router.push(`/inventory/${p.id}`)}
        emptyMessage={list.params.search || list.params.stock_status ? "No products match these filters." : "No products yet. Add your first product to start tracking stock."} />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />

      {editing && (
        <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={saved => { toast(`${saved.name} saved`); setEditing(null); list.reload(); }} />
      )}
      {adjusting && <AdjustmentModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); list.reload(); }} />}
      {deleting && (
        <ConfirmDelete title={`Delete ${deleting.name}?`} message="Products with sales, purchases or adjustments cannot be deleted — mark them inactive instead."
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await productService.remove(deleting.id); toast(`${deleting.name} deleted`); setDeleting(null); list.reload(); }} />
      )}
    </InventoryPanel>
  );
}

export function ProductModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: (product: Product) => void }) {
  const { can } = useAuth();
  const canSuppliers = can("suppliers:read");
  const categories = useApi(() => categoryService.list({ pageSize: 100, sort: "name", order: "asc" }), []);
  const suppliers = useApi<Paginated<Supplier>>(
    () => (canSuppliers ? supplierService.list({ pageSize: 100, sort: "name", order: "asc" }) : Promise.resolve({ data: [], total: 0, page: 1, pageSize: 100 })),
    [canSuppliers],
  );

  return (
    <FormModal
      wide
      eyebrow={product ? "Edit product" : "Quick create"}
      title={product ? product.name : "Add product"}
      description={product ? "Stock quantity changes only through purchases, sales, returns or adjustments." : "Opening stock is recorded in the stock history."}
      submitLabel={product ? "Save product" : "Add product"}
      onClose={onClose}
      onSubmit={async form => {
        const body: Record<string, unknown> = {
          name: form.get("name"),
          sku: form.get("sku"),
          category_id: form.get("category_id") || null,
          brand: form.get("brand"),
          unit: form.get("unit"),
          purchase_price: Number(form.get("purchase_price") || 0),
          selling_price: Number(form.get("selling_price") || 0),
          minimum_stock: Number(form.get("minimum_stock") || 0),
          status: form.get("status"),
          image: form.get("image"),
          description: form.get("description"),
        };
        if (canSuppliers) body.supplier_id = form.get("supplier_id") || null;
        if (!product) body.stock_quantity = Number(form.get("stock_quantity") || 0);
        onSaved(product ? await productService.update(product.id, body) : await productService.create(body));
      }}
    >
      <div className="form-grid">
        <Field label="Product name" full><input className="input-dark" name="name" defaultValue={product?.name} required maxLength={160} placeholder="e.g. Nitrile gloves (box of 100)" /></Field>
        <Field label="SKU"><input className="input-dark" name="sku" defaultValue={product?.sku} required maxLength={60} placeholder="GLV-NTR-100" /></Field>
        <Field label="Brand"><input className="input-dark" name="brand" defaultValue={product?.brand ?? ""} maxLength={80} /></Field>
        <Field label="Category">
          <select className="select-dark" name="category_id" defaultValue={product?.category_id ?? ""}>
            <option value="">No category</option>
            {categories.data?.data.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {canSuppliers ? (
          <Field label="Default supplier">
            <select className="select-dark" name="supplier_id" defaultValue={product?.supplier_id ?? ""}>
              <option value="">No supplier</option>
              {suppliers.data?.data.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Unit"><input className="input-dark" name="unit" defaultValue={product?.unit ?? "pcs"} maxLength={20} /></Field>
        <Field label="Purchase price"><input className="input-dark" name="purchase_price" type="number" min="0" step="0.01" defaultValue={product?.purchase_price ?? 0} required /></Field>
        <Field label="Selling price"><input className="input-dark" name="selling_price" type="number" min="0" step="0.01" defaultValue={product?.selling_price ?? 0} required /></Field>
        {!product ? <Field label="Opening stock"><input className="input-dark" name="stock_quantity" type="number" min="0" step="any" defaultValue={0} /></Field> : null}
        <Field label="Minimum stock"><input className="input-dark" name="minimum_stock" type="number" min="0" step="any" defaultValue={product?.minimum_stock ?? 0} /></Field>
        <Field label="Status">
          <select className="select-dark" name="status" defaultValue={product?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Image URL" full><input className="input-dark" name="image" type="url" defaultValue={product?.image ?? ""} placeholder="https://…" /></Field>
        <Field label="Description" full><textarea className="textarea-dark" name="description" defaultValue={product?.description ?? ""} maxLength={1000} /></Field>
      </div>
    </FormModal>
  );
}

export function AdjustmentModal({ product, onClose, onSaved }: { product?: ProductLike | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const fmt = useFormat();
  const [selected, setSelected] = useState<ProductLike | null>(product ?? null);

  return (
    <FormModal
      eyebrow="Stock adjustment"
      title={product ? `Adjust ${product.name}` : "New stock adjustment"}
      description="Use adjustments for counts, damage, samples or corrections. Every change is written to the stock history."
      submitLabel="Save adjustment"
      onClose={onClose}
      onSubmit={async form => {
        if (!selected) throw new Error("Select a product");
        await stockService.adjust({
          product_id: selected.id,
          adjustment_type: form.get("adjustment_type"),
          quantity: Number(form.get("quantity")),
          reason: form.get("reason"),
        });
        toast(`Stock for ${selected.name} adjusted`);
        onSaved();
      }}
    >
      <div className="form-grid">
        {!product ? (
          <Field label="Product" full>
            <RemoteSelect<Product>
              load={search => productService.list({ search, pageSize: 50, sort: "name", order: "asc" }).then(r => r.data)}
              value={selected?.id ?? null}
              onChange={(_, item) => setSelected(item)}
              getLabel={p => `${p.name} · ${p.sku} · ${fmt.number(p.stock_quantity)} ${p.unit}`}
              noun="product"
              required
            />
          </Field>
        ) : null}
        {selected ? <Field label="Current stock" full><input className="input-dark" value={`${fmt.number(selected.stock_quantity)} ${selected.unit}`} readOnly /></Field> : null}
        <Field label="Type">
          <select className="select-dark" name="adjustment_type" defaultValue="increase">
            <option value="increase">Increase (+)</option>
            <option value="decrease">Decrease (−)</option>
          </select>
        </Field>
        <Field label="Quantity"><input className="input-dark" name="quantity" type="number" min="0.001" step="any" required /></Field>
        <Field label="Reason" full><input className="input-dark" name="reason" required maxLength={300} placeholder="Cycle count, damaged in storage…" /></Field>
      </div>
    </FormModal>
  );
}

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------
function movementLink(movement: StockMovement) {
  switch (movement.reference_type) {
    case "sale": return `/sales/${movement.reference_id}`;
    case "purchase": return `/purchases/${movement.reference_id}`;
    case "sales_return":
    case "purchase_return": return "/returns";
    case "stock_adjustment": return "/inventory/adjustments";
    default: return null;
  }
}

export function MovementsTable({ rows, loading, error, onRetry, showProduct }: { rows: StockMovement[]; loading?: boolean; error?: string | null; onRetry?: () => void; showProduct?: boolean }) {
  const fmt = useFormat();
  const columns: Column<StockMovement>[] = [
    { key: "created_at", label: "When", render: m => <span className="mono">{formatDateTime(m.created_at)}</span> },
    ...(showProduct ? [{ key: "product_name", label: "Product", render: (m: StockMovement) => <Link className="link" href={`/inventory/${m.product_id}`}>{m.product_name}</Link> }] : []),
    { key: "movement_type", label: "Movement", render: m => <StatusBadge status={m.quantity_change >= 0 ? "increase" : "decrease"} label={titleCase(m.movement_type)} /> },
    { key: "quantity_change", label: "Change", numeric: true, render: m => <b className={m.quantity_change < 0 ? "danger-text" : "positive-text"}>{m.quantity_change > 0 ? "+" : ""}{fmt.number(m.quantity_change)}</b> },
    { key: "balance_after", label: "Balance", numeric: true, render: m => `${fmt.number(m.balance_after)} ${m.unit}` },
    { key: "reference", label: "Reference", render: m => { const href = movementLink(m); return href ? <Link className="link" href={href}>{m.note ?? titleCase(m.reference_type)}</Link> : m.note ?? "—"; } },
    { key: "created_by_name", label: "By", render: m => m.created_by_name ?? "—" },
  ];
  return <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry} emptyMessage="No stock movements yet." />;
}

export function ProductDetailView({ id }: { id: number }) {
  const { can } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => productService.get(id), [id]);
  const [modal, setModal] = useState<"edit" | "adjust" | null>(null);

  if (loading && !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><LoadingState /></div>;
  if (error || !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Product · {data.sku}</div>
          <h1>{data.name}</h1>
          <p>{[data.category_name, data.brand, data.supplier_name].filter(Boolean).join(" · ") || "Uncategorised"} <StatusBadge status={data.stock_status} /> {data.status === "inactive" ? <StatusBadge status="inactive" /> : null}</p>
        </div>
        <div className="heading-actions">
          <Link className="secondary-button" href="/inventory">All products</Link>
          {can("inventory:write") ? <button className="secondary-button" onClick={() => setModal("edit")}>Edit</button> : null}
          {can("inventory:write") ? <button className="primary-button" onClick={() => setModal("adjust")}><SlidersHorizontal size={14} /> Adjust stock</button> : null}
        </div>
      </div>
      <div className="panel data-panel page-panel">
        <div className="detail-grid" style={{ paddingTop: 20 }}>
          <div className="mini-metric"><span>Current stock</span><b className={data.stock_status !== "in_stock" ? "danger-text" : undefined}>{fmt.number(data.stock_quantity)} {data.unit}</b></div>
          <div className="mini-metric"><span>Minimum stock</span><b>{fmt.number(data.minimum_stock)} {data.unit}</b></div>
          <div className="mini-metric"><span>Cost / price</span><b>{fmt.money(data.purchase_price)} / {fmt.money(data.selling_price)}</b></div>
          <div className="mini-metric"><span>Stock value</span><b>{fmt.money(data.stock_value)}</b></div>
        </div>
        {data.description ? <p className="panel-subtitle" style={{ padding: "0 20px" }}>{data.description}</p> : null}
        <div style={{ padding: "0 20px" }}><PanelHeader title="Stock history" subtitle="Latest 50 movements for this product" /></div>
        <MovementsTable rows={data.movements} />
      </div>
      {modal === "edit" && <ProductModal product={data} onClose={() => setModal(null)} onSaved={saved => { toast(`${saved.name} saved`); setModal(null); reload(); }} />}
      {modal === "adjust" && <AdjustmentModal product={data} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Categories, adjustments, history
// ---------------------------------------------------------------------------
export function CategoriesView() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList<Category>(query => categoryService.list(query), { sort: "name", order: "asc" });
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  return (
    <InventoryPanel
      title="Categories"
      subtitle={`${list.total} categories organise your product catalogue`}
      actions={can("inventory:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add category</button> : null}
    >
      <div className="toolbar"><SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search categories" /></div>
      <DataTable<Category>
        columns={[
          { key: "name", label: "Category", sortable: true, render: c => <b>{c.name}</b> },
          { key: "description", label: "Description", render: c => c.description ?? "—" },
          { key: "product_count", label: "Products", numeric: true, render: c => c.product_count ?? 0 },
          { key: "actions", label: "", render: c => <RowActions label={c.name} onEdit={can("inventory:write") ? () => setEditing(c) : undefined} onDelete={can("inventory:delete") ? () => setDeleting(c) : undefined} /> },
        ]}
        rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        emptyMessage="No categories yet."
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {editing && (
        <FormModal
          title={editing === "new" ? "Add category" : `Edit ${editing.name}`}
          submitLabel="Save category"
          onClose={() => setEditing(null)}
          onSubmit={async form => {
            const body = { name: form.get("name"), description: form.get("description") };
            if (editing === "new") await categoryService.create(body); else await categoryService.update(editing.id, body);
            toast("Category saved");
            setEditing(null);
            list.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Name" full><input className="input-dark" name="name" defaultValue={editing === "new" ? "" : editing.name} required maxLength={80} /></Field>
            <Field label="Description" full><textarea className="textarea-dark" name="description" defaultValue={editing === "new" ? "" : editing.description ?? ""} maxLength={300} /></Field>
          </div>
        </FormModal>
      )}
      {deleting && (
        <ConfirmDelete title={`Delete ${deleting.name}?`} message="Products in this category keep their data and become uncategorised."
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await categoryService.remove(deleting.id); toast("Category deleted"); setDeleting(null); list.reload(); }} />
      )}
    </InventoryPanel>
  );
}

export function AdjustmentsView() {
  const { can } = useAuth();
  const fmt = useFormat();
  const list = useList<StockAdjustment>(query => stockService.adjustments(query), { sort: "created_at" });
  const [open, setOpen] = useState(false);

  return (
    <InventoryPanel
      title="Stock adjustments"
      subtitle="Manual corrections with a recorded reason"
      actions={can("inventory:write") ? <button className="primary-button" onClick={() => setOpen(true)}><Plus size={14} /> New adjustment</button> : null}
    >
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search product, SKU or reason" />
        <DateRangeInputs from={list.params.from} to={list.params.to} onChange={list.setParam} />
      </div>
      <DataTable<StockAdjustment>
        columns={[
          { key: "created_at", label: "When", sortable: true, render: a => <span className="mono">{formatDateTime(a.created_at)}</span> },
          { key: "product_name", label: "Product", sortable: true, render: a => <Link className="link" href={`/inventory/${a.product_id}`}>{a.product_name}</Link> },
          { key: "adjustment_type", label: "Type", sortable: true, render: a => <StatusBadge status={a.adjustment_type} /> },
          { key: "quantity", label: "Quantity", sortable: true, numeric: true, render: a => `${a.adjustment_type === "increase" ? "+" : "−"}${fmt.number(a.quantity)} ${a.unit}` },
          { key: "reason", label: "Reason" },
          { key: "created_by_name", label: "By", render: a => a.created_by_name ?? "—" },
        ]}
        rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        emptyMessage="No adjustments recorded."
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {open && <AdjustmentModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload(); }} />}
    </InventoryPanel>
  );
}

export function HistoryView() {
  const list = useList<StockMovement>(query => stockService.movements(query), { sort: "created_at" });
  return (
    <InventoryPanel title="Stock history" subtitle="Every stock movement from purchases, sales, returns, edits, cancellations and adjustments">
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search product, SKU or note" />
        <select className="select-dark" value={list.params.movement_type ?? ""} onChange={e => list.setParam("movement_type", e.target.value || undefined)} aria-label="Movement type">
          <option value="">All movements</option>
          {["opening", "purchase", "purchase_edit", "purchase_cancel", "purchase_return", "sale", "sale_edit", "sale_cancel", "sales_return", "adjustment"].map(type => (
            <option key={type} value={type}>{titleCase(type)}</option>
          ))}
        </select>
        <DateRangeInputs from={list.params.from} to={list.params.to} onChange={list.setParam} />
      </div>
      <MovementsTable showProduct rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
    </InventoryPanel>
  );
}
