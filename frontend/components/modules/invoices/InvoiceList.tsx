"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, DateRangeInputs, Pagination, SearchBox, type Column } from "@/components/ui/DataTable";
import { PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useAuth } from "@/hooks/useAuth";
import { useList } from "@/hooks/useApi";
import { formatDate, useFormat } from "@/lib/format";
import { purchaseService, saleService } from "@/services/erp";
import type { Paginated, Purchase, Sale } from "@/types/erp";

type Row = Sale | Purchase;

export function InvoiceList({ kind }: { kind: "sale" | "purchase" }) {
  const isSale = kind === "sale";
  const { can } = useAuth();
  const fmt = useFormat();
  const router = useRouter();
  const dateKey = isSale ? "sale_date" : "purchase_date";
  const list = useList<Row>(
    query => (isSale ? saleService.list(query) : purchaseService.list(query)) as Promise<Paginated<Row>>,
    { sort: dateKey },
  );

  const columns: Column<Row>[] = [
    {
      key: "invoice_number", label: "Invoice", sortable: true,
      render: row => <div className="person-cell"><div><b>{row.invoice_number}</b><span>{row.items_count} item(s)</span></div></div>,
    },
    { key: dateKey, label: "Date", sortable: true, render: row => <span className="mono">{formatDate(isSale ? (row as Sale).sale_date : (row as Purchase).purchase_date)}</span> },
    { key: isSale ? "customer_name" : "supplier_name", label: isSale ? "Customer" : "Supplier", sortable: true, render: row => (isSale ? (row as Sale).customer_name : (row as Purchase).supplier_name) },
    { key: "total", label: "Total", sortable: true, numeric: true, render: row => fmt.money(row.total) },
    { key: "paid_amount", label: "Paid", sortable: true, numeric: true, render: row => fmt.money(row.paid_amount) },
    { key: "remaining_amount", label: isSale ? "Due" : "Payable", sortable: true, numeric: true, render: row => <span className={row.remaining_amount > 0 && row.status !== "cancelled" ? "danger-text" : undefined}>{row.status === "cancelled" ? "—" : fmt.money(row.remaining_amount)}</span> },
    { key: "status", label: "Status", sortable: true, render: row => <StatusBadge status={row.status} /> },
  ];

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title={isSale ? "Sales history" : "Procurement · purchase history"}
        subtitle={isSale
          ? `${list.total} invoices · every sale reduces stock and updates the customer balance`
          : `${list.total} purchase invoices · every purchase adds stock and updates the supplier payable`}
        actions={can(isSale ? "sales:write" : "purchases:write") ? (
          <Link className="primary-button" href={isSale ? "/sales/new" : "/purchases/new"}><Plus size={14} /> {isSale ? "New sale" : "New purchase"}</Link>
        ) : null}
      />
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder={`Search invoice or ${isSale ? "customer" : "supplier"}`} />
        <select className="select-dark" value={list.params.status ?? ""} onChange={event => list.setParam("status", event.target.value || undefined)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
          <option value="returned">Returned</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <DateRangeInputs from={list.params.from} to={list.params.to} onChange={list.setParam} />
      </div>
      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        sort={list.params.sort}
        order={list.params.order}
        onSort={list.toggleSort}
        onRowClick={row => router.push(`/${isSale ? "sales" : "purchases"}/${row.id}`)}
        emptyMessage={list.params.search || list.params.status || list.params.from ? "No invoices match these filters." : `No ${isSale ? "sales" : "purchases"} recorded yet.`}
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
    </div>
  );
}
