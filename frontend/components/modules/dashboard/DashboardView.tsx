"use client";

import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronDown,
  Package, Plus, Receipt, ShoppingCart, TrendingUp, Truck, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, ErrorState, StatCard, StatusBadge } from "@/components/ui/primitives";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, titleCase, useFormat } from "@/lib/format";
import { dashboardService } from "@/services/erp";
import type { Dashboard } from "@/types/erp";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

const ACCENTS = ["rgba(197,187,255,.28)", "rgba(191,227,181,.22)", "rgba(239,209,151,.25)", "rgba(225,186,182,.22)"];

const SERIES = [
  { key: "sales", label: "Sales", bar: "", dot: "#879bb5" },
  { key: "purchases", label: "Purchases", bar: "alt", dot: "#a99fe7" },
  { key: "revenue", label: "Revenue", bar: "green", dot: "#9cc794" },
  { key: "expenses", label: "Expenses", bar: "amber", dot: "#e3c07f" },
  { key: "profit", label: "Profit", bar: "profit", dot: "#687d99" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function bucketLabel(bucket: string, size: Dashboard["range"]["bucket"]) {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (size === "day") return bucket.slice(8, 10);
  if (size === "week") return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date);
}

export function DashboardView() {
  const { me, can } = useAuth();
  const fmt = useFormat();
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<Record<string, string>>({ range: "month" });
  const [active, setActive] = useState<Record<SeriesKey, boolean>>({ sales: true, purchases: true, revenue: false, expenses: false, profit: false });

  useEffect(() => {
    if (range !== "custom") setApplied({ range });
    else if (from && to && from <= to) setApplied({ range, from, to });
  }, [range, from, to]);

  const { data, error, loading, reload } = useApi(() => dashboardService.get(applied), [JSON.stringify(applied)]);

  const today = new Date();
  const eyebrow = `${new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(today)} · ${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(today)} · ERP CONTROL CENTER`;
  const firstName = me?.user.name.split(" ")[0] ?? "";

  const cards = useMemo(() => {
    if (!data) return [];
    const m = data.metrics;
    const list: { label: string; value: string; foot: string; icon: LucideIcon; show: boolean }[] = [
      { label: "Total sales", value: fmt.compactMoney(m.total_sales?.value), foot: `${m.total_sales?.count ?? 0} invoices in range`, icon: ShoppingCart, show: !!m.total_sales },
      { label: "Total purchases", value: fmt.compactMoney(m.total_purchases?.value), foot: `${m.total_purchases?.count ?? 0} purchase invoices`, icon: Truck, show: !!m.total_purchases },
      { label: "Revenue", value: fmt.compactMoney(m.revenue?.value), foot: `Net of ${fmt.compactMoney(m.revenue?.returns)} returns & tax`, icon: TrendingUp, show: !!m.revenue },
      { label: "Expenses", value: fmt.compactMoney(m.expenses?.value), foot: `${m.expenses?.count ?? 0} expenses recorded`, icon: Receipt, show: !!m.expenses },
      { label: "Gross profit", value: fmt.compactMoney(m.gross_profit?.value), foot: `${m.gross_profit?.margin ?? 0}% gross margin`, icon: BarChart3, show: !!m.gross_profit },
      { label: "Net profit", value: fmt.compactMoney(m.net_profit?.value), foot: `${m.net_profit?.margin ?? 0}% net margin`, icon: CheckCircle2, show: !!m.net_profit },
      { label: "Receivables", value: fmt.compactMoney(m.receivables?.value), foot: `Owed by customers · ${m.receivables?.customers ?? 0} total`, icon: ArrowDownLeft, show: !!m.receivables },
      { label: "Payables", value: fmt.compactMoney(m.payables?.value), foot: `Owed to suppliers · ${m.payables?.suppliers ?? 0} total`, icon: ArrowUpRight, show: !!m.payables },
      { label: "Total products", value: fmt.number(m.total_products?.value), foot: `${fmt.compactMoney(m.total_products?.stock_value)} stock value`, icon: Package, show: !!m.total_products },
      { label: "Low stock alerts", value: fmt.number(m.low_stock?.value), foot: `${m.low_stock?.low ?? 0} low · ${m.low_stock?.out ?? 0} out of stock`, icon: AlertTriangle, show: !!m.low_stock },
      { label: "Today's sales", value: fmt.compactMoney(m.todays_sales?.value), foot: `${m.todays_sales?.count ?? 0} invoices today`, icon: CalendarDays, show: !!m.todays_sales },
      { label: "Today's purchases", value: fmt.compactMoney(m.todays_purchases?.value), foot: `${m.todays_purchases?.count ?? 0} purchases today`, icon: Wallet, show: !!m.todays_purchases },
    ];
    return list.filter(card => card.show);
  }, [data, fmt]);

  const availableSeries = SERIES.filter(series => data?.series.some(point => point[series.key] !== null));
  const shownSeries = availableSeries.filter(series => active[series.key]);
  const max = Math.max(1, ...(data?.series ?? []).flatMap(point => shownSeries.map(series => Math.abs(point[series.key] ?? 0))));
  const labelStep = Math.max(1, Math.ceil((data?.series.length ?? 0) / 12));

  const finance = can("finance:read");
  const grossMargin = data?.metrics.gross_profit?.margin ?? 0;
  const lowStock = data?.metrics.low_stock;
  const stockHealth = data?.metrics.total_products && data.metrics.total_products.value > 0
    ? Math.round(((data.metrics.total_products.value - (lowStock?.value ?? 0)) / data.metrics.total_products.value) * 100)
    : 100;
  const ring = Math.max(0, Math.min(100, finance ? grossMargin : stockHealth));

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{greeting()}, {firstName}</h1>
          <p>One connected view of sales, purchases, inventory, customers, suppliers and finance — calculated live from your records.</p>
        </div>
        <div className="heading-actions" style={{ flexWrap: "wrap" }}>
          <div className="range-picker">
            <select className="select-dark" value={range} onChange={event => setRange(event.target.value)} aria-label="Date range">
              {RANGES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {range === "custom" && (
              <>
                <input className="input-dark" type="date" value={from} onChange={event => setFrom(event.target.value)} aria-label="From date" />
                <input className="input-dark" type="date" value={to} onChange={event => setTo(event.target.value)} aria-label="To date" />
              </>
            )}
          </div>
          {can("inventory:read") && (
            <Link className="icon-button" href="/inventory?stock_status=low_stock" aria-label="Low stock alerts" title="Low stock alerts">
              <Bell size={15} />
            </Link>
          )}
          {can("sales:write") ? (
            <Link className="primary-button" href="/sales/new"><Plus size={14} /> New sale</Link>
          ) : can("purchases:write") ? (
            <Link className="primary-button" href="/purchases/new"><Plus size={14} /> New purchase</Link>
          ) : null}
        </div>
      </div>

      {error ? <div style={{ marginBottom: 10 }}><ErrorState message={error} onRetry={reload} /></div> : null}

      <div className="stats-grid" style={loading && data ? { opacity: 0.6 } : undefined}>
        {!data && loading
          ? Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="glass-card stat-card">
              <span className="skeleton" style={{ height: 10, width: "50%" }} />
              <span className="skeleton" style={{ height: 28, width: "70%", marginTop: 12 }} />
            </div>
          ))
          : cards.map((card, index) => (
            <StatCard key={card.label} label={card.label} value={card.value} foot={card.foot} accent={ACCENTS[index % ACCENTS.length]} icon={card.icon} />
          ))}
      </div>

      <div className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Business activity</div>
              <div className="panel-subtitle">
                {data ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)} · by ${data.range.bucket}` : "Loading range…"}
              </div>
            </div>
            <div className="legend" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
              {availableSeries.map(series => (
                <button
                  key={series.key}
                  className={`graph-toggle ${active[series.key] ? "" : "off"}`}
                  onClick={() => setActive(current => ({ ...current, [series.key]: !current[series.key] }))}
                  aria-pressed={active[series.key]}
                >
                  <i style={{ background: series.dot }} /> {series.label}
                </button>
              ))}
            </div>
          </div>
          <div className="activity-graph" style={{ marginBottom: 18 }} role="img" aria-label="Business activity chart">
            {(data?.series ?? []).map((point, index) => (
              <div
                className="graph-column"
                key={point.bucket}
                title={`${formatDate(point.bucket)}\n${shownSeries.map(series => `${series.label}: ${fmt.money(point[series.key])}`).join("\n")}`}
              >
                {shownSeries.map(series => {
                  const value = point[series.key] ?? 0;
                  const negative = series.key === "profit" && value < 0;
                  return (
                    <div
                      key={series.key}
                      className={`graph-bar ${negative ? "neg" : series.bar === "profit" ? "" : series.bar}`}
                      style={{ height: `${(Math.abs(value) / max) * 100}%`, minHeight: value === 0 ? 2 : 9, ...(series.key === "profit" && !negative ? { background: "linear-gradient(180deg,#687d99,#9fb0c5)" } : {}) }}
                    />
                  );
                })}
                {index % labelStep === 0 ? <span className="graph-label">{bucketLabel(point.bucket, data!.range.bucket)}</span> : null}
              </div>
            ))}
            {data && shownSeries.length === 0 ? <div className="empty-state" style={{ width: "100%" }}>Choose a series to plot.</div> : null}
          </div>
        </div>

        <div className="panel today-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Today&apos;s operations pulse</div>
              <div className="panel-subtitle">{data ? formatDate(data.range.today) : ""} · live</div>
            </div>
            <Zap size={15} color="#f0dca9" />
          </div>
          <div className="today-ring" style={{ background: `conic-gradient(#687d99 0 ${ring}%, rgba(102,121,145,.18) ${ring}% 100%)` }}>
            <div className="today-ring-content">
              <b>{Math.round(finance ? grossMargin : stockHealth)}%</b>
              <span>{finance ? "gross margin" : "stock health"}</span>
            </div>
          </div>
          <div className="today-summary">
            {data?.metrics.todays_sales ? <div><strong>{data.metrics.todays_sales.count}</strong><span>sales today</span></div> : null}
            {data?.metrics.todays_purchases ? <div><strong>{data.metrics.todays_purchases.count}</strong><span>purchase orders</span></div> : null}
            {lowStock ? <div><strong>{lowStock.value}</strong><span>low stock items</span></div> : null}
          </div>
        </div>
      </div>

      <div className="content-grid" style={{ marginTop: 10 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Latest business activity</div>
              <div className="panel-subtitle">Recent sales, purchases and payments across connected modules</div>
            </div>
            {can("finance:read", "sales:read", "purchases:read") && (
              <Link className="secondary-button" href="/payments">View finance <ChevronDown size={12} /></Link>
            )}
          </div>
          <div className="timeline">
            {data?.recent.length === 0 ? <div className="empty-state">No transactions yet. Record a purchase or a sale to get started.</div> : null}
            {data?.recent.map(item => {
              const row = (
                <div className="timeline-row" key={`${item.kind}-${item.id}`}>
                  <span className="timeline-time">{formatDate(item.date).slice(0, 6)}</span>
                  <Avatar name={item.title} />
                  <div className="timeline-copy">
                    <b>{item.title} <span style={{ color: "#9c9a94", fontWeight: 400 }}>· {fmt.money(item.amount)}</span></b>
                    <span>{item.subtitle}</span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              );
              return item.href ? <Link key={`${item.kind}-${item.id}`} href={item.href} style={{ textDecoration: "none" }}>{row}</Link> : row;
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Stock & balances</div>
              <div className="panel-subtitle">What needs attention right now</div>
            </div>
          </div>
          <div className="stack">
            {data?.cash_by_method ? (
              <div className="mini-metric">
                <span>Cash & bank position (all time)</span>
                {Object.keys(data.cash_by_method).length === 0 ? <b>{fmt.money(0)}</b> : null}
                {Object.entries(data.cash_by_method).map(([method, amount]) => (
                  <div key={method} className="totals-row" style={{ padding: "3px 0" }}>
                    <span>{titleCase(method)}</span><b className={amount < 0 ? "danger-text" : undefined}>{fmt.money(amount)}</b>
                  </div>
                ))}
              </div>
            ) : null}
            {data?.low_stock_products.length ? (
              <div className="mini-metric">
                <span>Low stock watch</span>
                {data.low_stock_products.map(product => (
                  <div key={product.id} className="totals-row" style={{ padding: "3px 0" }}>
                    <Link className="link" href={`/inventory/${product.id}`}>{product.name}</Link>
                    <b className={product.stock_status === "out_of_stock" ? "danger-text" : undefined}>
                      {fmt.number(product.stock_quantity)} / {fmt.number(product.minimum_stock)} {product.unit}
                    </b>
                  </div>
                ))}
              </div>
            ) : data && can("inventory:read") ? (
              <div className="mini-metric"><span>Low stock watch</span><b style={{ fontSize: 14 }}>All products above minimum</b></div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
