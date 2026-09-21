-- Northstar ERP · read views and row level security
--
-- The browser never queries tables directly: every read and write goes through
-- the Node.js backend with the service role key. RLS is enabled everywhere with
-- no anon/authenticated data policies, so the public anon key can only be used
-- for Supabase Auth (sign-in), plus reading the caller's own profile row.

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS of the caller still applies)
-- ---------------------------------------------------------------------------
create view public.v_products with (security_invoker = true) as
select p.*,
       c.name as category_name,
       s.name as supplier_name,
       case when p.stock_quantity <= 0 then 'out_of_stock'
            when p.stock_quantity <= p.minimum_stock then 'low_stock'
            else 'in_stock' end as stock_status
from public.products p
left join public.categories c on c.id = p.category_id
left join public.suppliers s on s.id = p.supplier_id;

create view public.v_sales with (security_invoker = true) as
select s.*,
       coalesce(c.name, 'Walk-in customer') as customer_name,
       (select count(*) from public.sale_items i where i.sale_id = s.id) as items_count
from public.sales s
left join public.customers c on c.id = s.customer_id;

create view public.v_purchases with (security_invoker = true) as
select pu.*,
       sp.name as supplier_name,
       (select count(*) from public.purchase_items i where i.purchase_id = pu.id) as items_count
from public.purchases pu
join public.suppliers sp on sp.id = pu.supplier_id;

create view public.v_payments with (security_invoker = true) as
select pm.*,
       case pm.party_type
         when 'customer' then coalesce(c.name, 'Walk-in customer')
         when 'supplier' then sp.name
         else e.title end as party_name,
       e.category as expense_category
from public.payments pm
left join public.customers c on c.id = pm.customer_id
left join public.suppliers sp on sp.id = pm.supplier_id
left join public.expenses e on e.id = pm.expense_id;

create view public.v_sales_returns with (security_invoker = true) as
select r.*, s.invoice_number, coalesce(c.name, 'Walk-in customer') as customer_name
from public.sales_returns r
join public.sales s on s.id = r.sale_id
left join public.customers c on c.id = r.customer_id;

create view public.v_purchase_returns with (security_invoker = true) as
select r.*, pu.invoice_number, sp.name as supplier_name
from public.purchase_returns r
join public.purchases pu on pu.id = r.purchase_id
join public.suppliers sp on sp.id = r.supplier_id;

create view public.v_stock_movements with (security_invoker = true) as
select m.*, p.name as product_name, p.sku, p.unit, u.name as created_by_name
from public.stock_movements m
join public.products p on p.id = m.product_id
left join public.users u on u.id = m.created_by;

create view public.v_stock_adjustments with (security_invoker = true) as
select a.*, p.name as product_name, p.sku, p.unit, u.name as created_by_name
from public.stock_adjustments a
join public.products p on p.id = a.product_id
left join public.users u on u.id = a.created_by;

create view public.v_departments with (security_invoker = true) as
select d.*, (select count(*) from public.employees e where e.department_id = d.id) as employee_count
from public.departments d;

create view public.v_employees with (security_invoker = true) as
select e.*, d.name as department_name
from public.employees e
left join public.departments d on d.id = e.department_id;

create view public.v_operations with (security_invoker = true) as
select o.*, e.name as employee_name, e.color as employee_color, d.name as department_name
from public.operations o
join public.employees e on e.id = o.employee_id
left join public.departments d on d.id = e.department_id;

create view public.v_attendance with (security_invoker = true) as
select a.*, e.name as employee_name, e.color as employee_color, e.working_hours, d.name as department_name
from public.attendance a
join public.employees e on e.id = a.employee_id
left join public.departments d on d.id = e.department_id;

create view public.v_tasks with (security_invoker = true) as
select t.*, e.name as employee_name, d.name as department_name
from public.tasks t
left join public.employees e on e.id = t.employee_id
left join public.departments d on d.id = t.department_id;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'workspace_settings', 'customers', 'suppliers', 'categories', 'products',
    'stock_adjustments', 'stock_movements', 'sales', 'sale_items', 'purchases', 'purchase_items',
    'sales_returns', 'sales_return_items', 'purchase_returns', 'purchase_return_items',
    'expenses', 'payments', 'payment_allocations', 'departments', 'employees', 'operations',
    'attendance', 'tasks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "Users can read their own profile"
  on public.users for select to authenticated
  using ((select auth.uid()) = id);

-- Views and sequences are backend-only as well.
revoke all on
  public.v_products, public.v_sales, public.v_purchases, public.v_payments,
  public.v_sales_returns, public.v_purchase_returns, public.v_stock_movements,
  public.v_stock_adjustments, public.v_departments, public.v_employees,
  public.v_operations, public.v_attendance, public.v_tasks
from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
