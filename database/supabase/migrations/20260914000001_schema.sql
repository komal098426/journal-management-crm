-- Northstar ERP · core relational schema
-- Money columns use numeric(14,2); quantities use numeric(14,3) so fractional units (kg, m) work.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Users (profile + role for every Supabase Auth account)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null unique,
  role text not null default 'sales_staff'
    check (role in ('admin', 'manager', 'sales_staff', 'inventory_staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data ->> 'role', 'sales_staff')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Workspace settings (single row)
-- ---------------------------------------------------------------------------
create table public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'Northstar Operations',
  timezone text not null default 'Asia/Karachi',
  currency text not null default 'PKR',
  invoice_footer text not null default 'Thank you for your business.',
  low_stock_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.workspace_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------
create table public.customers (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  total_sales numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  balance numeric(14,2) generated always as (total_sales - total_paid) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));

create table public.suppliers (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  total_purchases numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  balance numeric(14,2) generated always as (total_purchases - total_paid) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_name_idx on public.suppliers (lower(name));

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table public.categories (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(name));

create table public.products (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  sku text not null check (length(trim(sku)) > 0),
  category_id bigint references public.categories (id) on delete set null,
  brand text,
  unit text not null default 'pcs',
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  stock_quantity numeric(14,3) not null default 0 check (stock_quantity >= 0),
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  stock_value numeric(16,2) generated always as (round(stock_quantity * purchase_price, 2)) stored,
  supplier_id bigint references public.suppliers (id) on delete set null,
  image text,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_key on public.products (upper(sku));
create index products_name_idx on public.products (lower(name));
create index products_category_idx on public.products (category_id);
create index products_supplier_idx on public.products (supplier_id);

create table public.stock_adjustments (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('increase', 'decrease')),
  quantity numeric(14,3) not null check (quantity > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_adjustments_product_idx on public.stock_adjustments (product_id);

-- Every stock change is written here by the transaction functions (stock history).
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  movement_type text not null check (movement_type in (
    'opening', 'purchase', 'purchase_edit', 'purchase_cancel', 'purchase_return',
    'sale', 'sale_edit', 'sale_cancel', 'sales_return', 'adjustment')),
  quantity_change numeric(14,3) not null,
  balance_after numeric(14,3) not null,
  reference_type text,
  reference_id bigint,
  note text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create sequence public.sale_invoice_seq;
create sequence public.purchase_invoice_seq;
create sequence public.sales_return_seq;
create sequence public.purchase_return_seq;

create table public.sales (
  id bigint generated always as identity primary key,
  customer_id bigint references public.customers (id) on delete restrict,
  invoice_number text not null unique,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null check (total >= 0),
  returned_amount numeric(14,2) not null default 0 check (returned_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14,2) generated always as (total - returned_amount - paid_amount) stored,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'card', 'online_transfer')),
  status text not null default 'unpaid' check (status in ('paid', 'partial', 'unpaid', 'returned', 'cancelled')),
  sale_date date not null default current_date,
  notes text,
  created_by uuid references public.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_amounts_consistent check (total - returned_amount - paid_amount >= 0),
  constraint sales_discount_le_subtotal check (discount <= subtotal)
);
create index sales_customer_idx on public.sales (customer_id);
create index sales_date_idx on public.sales (sale_date);
create index sales_status_idx on public.sales (status);

create table public.sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  returned_quantity numeric(14,3) not null default 0 check (returned_quantity >= 0),
  constraint sale_items_returned_le_qty check (returned_quantity <= quantity)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
create table public.purchases (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers (id) on delete restrict,
  invoice_number text not null,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null check (total >= 0),
  returned_amount numeric(14,2) not null default 0 check (returned_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14,2) generated always as (total - returned_amount - paid_amount) stored,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'card', 'online_transfer')),
  status text not null default 'unpaid' check (status in ('paid', 'partial', 'unpaid', 'returned', 'cancelled')),
  purchase_date date not null default current_date,
  notes text,
  created_by uuid references public.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_amounts_consistent check (total - returned_amount - paid_amount >= 0),
  constraint purchases_discount_le_subtotal check (discount <= subtotal),
  constraint purchases_invoice_per_supplier unique (supplier_id, invoice_number)
);
create index purchases_supplier_idx on public.purchases (supplier_id);
create index purchases_date_idx on public.purchases (purchase_date);
create index purchases_status_idx on public.purchases (status);

create table public.purchase_items (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  purchase_price numeric(14,2) not null check (purchase_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  returned_quantity numeric(14,3) not null default 0 check (returned_quantity >= 0),
  constraint purchase_items_returned_le_qty check (returned_quantity <= quantity)
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (product_id);

-- ---------------------------------------------------------------------------
-- Returns
-- ---------------------------------------------------------------------------
create table public.sales_returns (
  id bigint generated always as identity primary key,
  return_number text not null unique,
  sale_id bigint not null references public.sales (id) on delete restrict,
  customer_id bigint references public.customers (id) on delete restrict,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  cost_amount numeric(14,2) not null default 0 check (cost_amount >= 0),
  receivable_adjusted numeric(14,2) not null default 0 check (receivable_adjusted >= 0),
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  refund_method text check (refund_method in ('cash', 'bank', 'card', 'online_transfer')),
  return_date date not null default current_date,
  reason text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sales_returns_sale_idx on public.sales_returns (sale_id);
create index sales_returns_customer_idx on public.sales_returns (customer_id);
create index sales_returns_date_idx on public.sales_returns (return_date);

create table public.sales_return_items (
  id bigint generated always as identity primary key,
  return_id bigint not null references public.sales_returns (id) on delete cascade,
  sale_item_id bigint not null references public.sale_items (id) on delete restrict,
  product_id bigint not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount >= 0),
  cost_amount numeric(14,2) not null default 0 check (cost_amount >= 0)
);
create index sales_return_items_return_idx on public.sales_return_items (return_id);
create index sales_return_items_product_idx on public.sales_return_items (product_id);

create table public.purchase_returns (
  id bigint generated always as identity primary key,
  return_number text not null unique,
  purchase_id bigint not null references public.purchases (id) on delete restrict,
  supplier_id bigint not null references public.suppliers (id) on delete restrict,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  payable_adjusted numeric(14,2) not null default 0 check (payable_adjusted >= 0),
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  refund_method text check (refund_method in ('cash', 'bank', 'card', 'online_transfer')),
  return_date date not null default current_date,
  reason text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index purchase_returns_purchase_idx on public.purchase_returns (purchase_id);
create index purchase_returns_supplier_idx on public.purchase_returns (supplier_id);
create index purchase_returns_date_idx on public.purchase_returns (return_date);

create table public.purchase_return_items (
  id bigint generated always as identity primary key,
  return_id bigint not null references public.purchase_returns (id) on delete cascade,
  purchase_item_id bigint not null references public.purchase_items (id) on delete restrict,
  product_id bigint not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount >= 0)
);
create index purchase_return_items_return_idx on public.purchase_return_items (return_id);
create index purchase_return_items_product_idx on public.purchase_return_items (product_id);

-- ---------------------------------------------------------------------------
-- Expenses & payments (cash/bank ledger)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) > 0),
  category text not null check (category in (
    'rent', 'electricity', 'internet', 'salaries', 'transport', 'maintenance', 'marketing', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'card', 'online_transfer')),
  expense_date date not null default current_date,
  description text,
  receipt text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date);
create index expenses_category_idx on public.expenses (category);

-- One row per real money movement. direction 'in' = cash/bank increases.
create table public.payments (
  id bigint generated always as identity primary key,
  party_type text not null check (party_type in ('customer', 'supplier', 'expense')),
  direction text not null check (direction in ('in', 'out')),
  customer_id bigint references public.customers (id) on delete restrict,
  supplier_id bigint references public.suppliers (id) on delete restrict,
  expense_id bigint references public.expenses (id) on delete cascade,
  sales_return_id bigint references public.sales_returns (id) on delete restrict,
  purchase_return_id bigint references public.purchase_returns (id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'bank', 'card', 'online_transfer')),
  reference text,
  notes text,
  payment_date date not null default current_date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_party_consistent check (
    (party_type = 'customer' and supplier_id is null and expense_id is null)
    or (party_type = 'supplier' and supplier_id is not null and customer_id is null and expense_id is null)
    or (party_type = 'expense' and expense_id is not null and customer_id is null and supplier_id is null and direction = 'out')
  )
);
create index payments_customer_idx on public.payments (customer_id);
create index payments_supplier_idx on public.payments (supplier_id);
create index payments_expense_idx on public.payments (expense_id);
create index payments_date_idx on public.payments (payment_date);

-- How each payment (or refund, negative amount) is applied to invoices.
create table public.payment_allocations (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments (id) on delete cascade,
  sale_id bigint references public.sales (id) on delete cascade,
  purchase_id bigint references public.purchases (id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_one_target check ((sale_id is null) <> (purchase_id is null))
);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_sale_idx on public.payment_allocations (sale_id);
create index payment_allocations_purchase_idx on public.payment_allocations (purchase_id);

-- ---------------------------------------------------------------------------
-- Workforce modules carried over from the original app
-- ---------------------------------------------------------------------------
create table public.departments (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  code text not null,
  head text,
  color text not null default '#c9c0ff',
  detail text,
  created_at timestamptz not null default now()
);
create unique index departments_name_key on public.departments (lower(name));

create table public.employees (
  id bigint generated always as identity primary key,
  employee_code text not null unique,
  name text not null check (length(trim(name)) > 0),
  department_id bigint references public.departments (id) on delete set null,
  role text not null default 'Team member',
  working_hours text not null default '09:00 – 17:00',
  status text not null default 'Active' check (status in ('Active', 'On leave', 'Offline')),
  email text,
  phone text,
  color text not null default '#c9c0ff',
  joining_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_department_idx on public.employees (department_id);

create table public.operations (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.employees (id) on delete cascade,
  work text not null check (length(trim(work)) > 0),
  entry_date date not null default current_date,
  start_time time not null,
  end_time time not null,
  status text not null default 'In Progress' check (status in ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  description text,
  created_at timestamptz not null default now()
);
create index operations_employee_idx on public.operations (employee_id);
create index operations_date_idx on public.operations (entry_date desc);

create table public.attendance (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.employees (id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('Present', 'Absent', 'Late', 'Leave', 'Half Day')),
  check_in time,
  created_at timestamptz not null default now(),
  constraint attendance_one_per_day unique (employee_id, attendance_date)
);
create index attendance_date_idx on public.attendance (attendance_date);

create table public.tasks (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) > 0),
  employee_id bigint references public.employees (id) on delete set null,
  department_id bigint references public.departments (id) on delete set null,
  due_date date,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  description text,
  created_at timestamptz not null default now()
);
create index tasks_employee_idx on public.tasks (employee_id);
create index tasks_department_idx on public.tasks (department_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger purchases_updated_at before update on public.purchases for each row execute function public.set_updated_at();
create trigger expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger workspace_settings_updated_at before update on public.workspace_settings for each row execute function public.set_updated_at();

-- Payment status is derived from the amounts, never set by hand (except cancellation).
create or replace function public.set_invoice_status()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_remaining numeric := new.total - new.returned_amount - new.paid_amount;
begin
  if new.status = 'cancelled' then
    return new;
  end if;
  if new.total > 0 and new.returned_amount >= new.total then
    new.status := 'returned';
  elsif v_remaining <= 0 then
    new.status := 'paid';
  elsif new.paid_amount > 0 then
    new.status := 'partial';
  else
    new.status := 'unpaid';
  end if;
  return new;
end $$;

create trigger sales_status before insert or update on public.sales for each row execute function public.set_invoice_status();
create trigger purchases_status before insert or update on public.purchases for each row execute function public.set_invoice_status();
