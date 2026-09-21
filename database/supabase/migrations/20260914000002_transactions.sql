-- Northstar ERP · atomic transaction functions
--
-- The Node.js backend owns the business rules: it validates input, prices every
-- line, splits order discounts and tax, computes return amounts and P&L. These
-- functions only persist an already-computed document atomically and re-check
-- the invariants that can race (stock, balances, returnable quantities) under
-- row locks. Lock order everywhere: invoice -> party -> invoice items -> products.
--
-- Errors meant for users are raised as 'ERP:<CODE>:<message>'.

create or replace function public.erp_raise(p_code text, p_message text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception 'ERP:%:%', p_code, p_message using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
create or replace function public.erp_apply_stock(
  p_product_id bigint, p_delta numeric, p_type text,
  p_ref_type text, p_ref_id bigint, p_user uuid, p_note text default null)
returns numeric language plpgsql set search_path = '' as $$
declare
  v_stock numeric;
  v_name text;
begin
  select stock_quantity, name into v_stock, v_name
  from public.products where id = p_product_id for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', format('Product #%s does not exist', p_product_id));
  end if;
  if v_stock + p_delta < 0 then
    perform public.erp_raise('INSUFFICIENT_STOCK', format(
      'Insufficient stock for %s: %s available, %s required',
      v_name, trim_scale(v_stock), trim_scale(-p_delta)));
  end if;

  update public.products set stock_quantity = v_stock + p_delta where id = p_product_id;
  insert into public.stock_movements
    (product_id, movement_type, quantity_change, balance_after, reference_type, reference_id, note, created_by)
  values (p_product_id, p_type, p_delta, v_stock + p_delta, p_ref_type, p_ref_id, p_note, p_user);
  return v_stock + p_delta;
end $$;

create or replace function public.erp_create_product(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_id bigint;
  v_opening numeric := coalesce((p ->> 'stock_quantity')::numeric, 0);
begin
  if v_opening < 0 then
    perform public.erp_raise('INVALID_QUANTITY', 'Opening stock cannot be negative');
  end if;
  insert into public.products
    (name, sku, category_id, brand, unit, purchase_price, selling_price, minimum_stock,
     supplier_id, image, description, status)
  values (
    p ->> 'name', p ->> 'sku', nullif(p ->> 'category_id', '')::bigint, nullif(p ->> 'brand', ''),
    coalesce(nullif(p ->> 'unit', ''), 'pcs'),
    coalesce((p ->> 'purchase_price')::numeric, 0), coalesce((p ->> 'selling_price')::numeric, 0),
    coalesce((p ->> 'minimum_stock')::numeric, 0), nullif(p ->> 'supplier_id', '')::bigint,
    nullif(p ->> 'image', ''), nullif(p ->> 'description', ''), coalesce(p ->> 'status', 'active'))
  returning id into v_id;

  if v_opening > 0 then
    perform public.erp_apply_stock(v_id, v_opening, 'opening', 'product', v_id, p_user, 'Opening stock');
  end if;
  return v_id;
end $$;

create or replace function public.erp_create_stock_adjustment(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_id bigint;
  v_qty numeric := (p ->> 'quantity')::numeric;
  v_type text := p ->> 'adjustment_type';
begin
  if v_qty is null or v_qty <= 0 then
    perform public.erp_raise('INVALID_QUANTITY', 'Adjustment quantity must be greater than zero');
  end if;
  insert into public.stock_adjustments (product_id, adjustment_type, quantity, reason, created_by)
  values ((p ->> 'product_id')::bigint, v_type, v_qty, p ->> 'reason', p_user)
  returning id into v_id;

  perform public.erp_apply_stock(
    (p ->> 'product_id')::bigint,
    case when v_type = 'increase' then v_qty else -v_qty end,
    'adjustment', 'stock_adjustment', v_id, p_user, p ->> 'reason');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create or replace function public.erp_insert_sale_items(p_sale_id bigint, p_items jsonb, p_user uuid, p_type text)
returns void language plpgsql set search_path = '' as $$
declare
  v_item jsonb;
  v_cost numeric;
  v_qty numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    perform public.erp_raise('NO_ITEMS', 'Add at least one product');
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) order by (value ->> 'product_id')::bigint
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      perform public.erp_raise('INVALID_QUANTITY', 'Quantities must be greater than zero');
    end if;
    select purchase_price into v_cost from public.products where id = (v_item ->> 'product_id')::bigint;
    if not found then
      perform public.erp_raise('NOT_FOUND', format('Product #%s does not exist', v_item ->> 'product_id'));
    end if;

    insert into public.sale_items (sale_id, product_id, quantity, selling_price, cost_price, discount, subtotal)
    values (p_sale_id, (v_item ->> 'product_id')::bigint, v_qty, (v_item ->> 'selling_price')::numeric,
            v_cost, coalesce((v_item ->> 'discount')::numeric, 0), (v_item ->> 'subtotal')::numeric);

    perform public.erp_apply_stock((v_item ->> 'product_id')::bigint, -v_qty, p_type, 'sale', p_sale_id, p_user);
  end loop;
end $$;

create or replace function public.erp_create_sale(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_customer bigint := nullif(p ->> 'customer_id', '')::bigint;
  v_total numeric := (p ->> 'total')::numeric;
  v_paid numeric := coalesce((p ->> 'paid_amount')::numeric, 0);
  v_date date := (p ->> 'sale_date')::date;
  v_invoice text;
  v_sale_id bigint;
  v_payment_id bigint;
begin
  if v_paid < 0 or v_paid > v_total then
    perform public.erp_raise('INVALID_PAYMENT', 'Paid amount must be between zero and the invoice total');
  end if;
  if v_customer is not null then
    perform 1 from public.customers where id = v_customer for update;
    if not found then
      perform public.erp_raise('NOT_FOUND', 'Customer not found');
    end if;
  elsif v_paid < v_total then
    perform public.erp_raise('WALK_IN_UNPAID', 'Walk-in sales must be paid in full. Select a customer to sell on credit.');
  end if;

  v_invoice := 'INV-' || lpad(nextval('public.sale_invoice_seq')::text, 6, '0');
  insert into public.sales
    (customer_id, invoice_number, subtotal, discount, tax, total, paid_amount, payment_method, sale_date, notes, created_by)
  values (v_customer, v_invoice, (p ->> 'subtotal')::numeric, coalesce((p ->> 'discount')::numeric, 0),
          coalesce((p ->> 'tax')::numeric, 0), v_total, v_paid, p ->> 'payment_method', v_date,
          nullif(p ->> 'notes', ''), p_user)
  returning id into v_sale_id;

  perform public.erp_insert_sale_items(v_sale_id, p -> 'items', p_user, 'sale');

  if v_customer is not null then
    update public.customers
    set total_sales = total_sales + v_total, total_paid = total_paid + v_paid
    where id = v_customer;
  end if;

  if v_paid > 0 then
    insert into public.payments
      (party_type, direction, customer_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('customer', 'in', v_customer, v_paid, p ->> 'payment_method', v_invoice,
            'Payment received with sale', v_date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, sale_id, amount) values (v_payment_id, v_sale_id, v_paid);
  end if;

  return v_sale_id;
end $$;

create or replace function public.erp_update_sale(p_sale_id bigint, p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_customer bigint := nullif(p ->> 'customer_id', '')::bigint;
  v_total numeric := (p ->> 'total')::numeric;
  v_extra numeric := coalesce((p ->> 'additional_payment')::numeric, 0);
  v_item record;
  v_payment_id bigint;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Sale not found');
  end if;
  if v_sale.status = 'cancelled' then
    perform public.erp_raise('SALE_CANCELLED', 'Cancelled sales cannot be edited');
  end if;
  if v_sale.returned_amount > 0 then
    perform public.erp_raise('SALE_HAS_RETURNS', 'This sale has returns and can no longer be edited');
  end if;
  if v_customer is distinct from v_sale.customer_id and v_sale.paid_amount > 0 then
    perform public.erp_raise('CUSTOMER_LOCKED', 'The customer cannot be changed after payments were recorded');
  end if;
  if v_extra < 0 then
    perform public.erp_raise('INVALID_PAYMENT', 'Additional payment cannot be negative');
  end if;
  if v_sale.paid_amount + v_extra > v_total then
    perform public.erp_raise('TOTAL_BELOW_PAID', 'The invoice total cannot be lower than the amount paid');
  end if;
  if v_customer is null and v_sale.paid_amount + v_extra < v_total then
    perform public.erp_raise('WALK_IN_UNPAID', 'Walk-in sales must be paid in full. Select a customer to sell on credit.');
  end if;

  if v_sale.customer_id is not null then
    perform 1 from public.customers where id = v_sale.customer_id for update;
  end if;
  if v_customer is not null and v_customer is distinct from v_sale.customer_id then
    perform 1 from public.customers where id = v_customer for update;
    if not found then
      perform public.erp_raise('NOT_FOUND', 'Customer not found');
    end if;
  end if;

  -- Reverse the old document.
  for v_item in select product_id, quantity from public.sale_items where sale_id = p_sale_id order by product_id loop
    perform public.erp_apply_stock(v_item.product_id, v_item.quantity, 'sale_edit', 'sale', p_sale_id, p_user, 'Reversed before edit');
  end loop;
  delete from public.sale_items where sale_id = p_sale_id;
  if v_sale.customer_id is not null then
    update public.customers
    set total_sales = total_sales - v_sale.total, total_paid = total_paid - v_sale.paid_amount
    where id = v_sale.customer_id;
  end if;

  -- Apply the new document.
  update public.sales set
    customer_id = v_customer,
    subtotal = (p ->> 'subtotal')::numeric,
    discount = coalesce((p ->> 'discount')::numeric, 0),
    tax = coalesce((p ->> 'tax')::numeric, 0),
    total = v_total,
    paid_amount = paid_amount + v_extra,
    payment_method = p ->> 'payment_method',
    sale_date = (p ->> 'sale_date')::date,
    notes = nullif(p ->> 'notes', '')
  where id = p_sale_id;

  perform public.erp_insert_sale_items(p_sale_id, p -> 'items', p_user, 'sale_edit');

  if v_customer is not null then
    update public.customers
    set total_sales = total_sales + v_total, total_paid = total_paid + v_sale.paid_amount + v_extra
    where id = v_customer;
  end if;

  if v_extra > 0 then
    insert into public.payments
      (party_type, direction, customer_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('customer', 'in', v_customer, v_extra, p ->> 'payment_method', v_sale.invoice_number,
            'Payment added while editing sale', (p ->> 'sale_date')::date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, sale_id, amount) values (v_payment_id, p_sale_id, v_extra);
  end if;

  return p_sale_id;
end $$;

create or replace function public.erp_cancel_sale(p_sale_id bigint, p_refund_method text, p_date date, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_payment_id bigint;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Sale not found');
  end if;
  if v_sale.status = 'cancelled' then
    perform public.erp_raise('ALREADY_CANCELLED', 'This sale is already cancelled');
  end if;
  if v_sale.customer_id is not null then
    perform 1 from public.customers where id = v_sale.customer_id for update;
  end if;

  for v_item in
    select product_id, quantity - returned_quantity as open_qty
    from public.sale_items where sale_id = p_sale_id and quantity > returned_quantity order by product_id
  loop
    perform public.erp_apply_stock(v_item.product_id, v_item.open_qty, 'sale_cancel', 'sale', p_sale_id, p_user, 'Sale cancelled');
  end loop;

  if v_sale.paid_amount > 0 then
    insert into public.payments
      (party_type, direction, customer_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('customer', 'out', v_sale.customer_id, v_sale.paid_amount,
            coalesce(p_refund_method, v_sale.payment_method), v_sale.invoice_number,
            'Refund for cancelled sale', p_date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, sale_id, amount)
    values (v_payment_id, p_sale_id, -v_sale.paid_amount);
  end if;

  if v_sale.customer_id is not null then
    update public.customers
    set total_sales = total_sales - (v_sale.total - v_sale.returned_amount),
        total_paid = total_paid - v_sale.paid_amount
    where id = v_sale.customer_id;
  end if;

  update public.sales
  set paid_amount = 0, status = 'cancelled', cancelled_at = now()
  where id = p_sale_id;
  return p_sale_id;
end $$;

create or replace function public.erp_create_sales_return(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_si public.sale_items%rowtype;
  v_item jsonb;
  v_return_id bigint;
  v_number text;
  v_qty numeric;
  v_amount numeric;
  v_line_cost numeric;
  v_total numeric := 0;
  v_cost numeric := 0;
  v_tax numeric := coalesce((p ->> 'tax_amount')::numeric, 0);
  v_adjust numeric;
  v_refund numeric;
  v_method text;
  v_payment_id bigint;
begin
  select * into v_sale from public.sales where id = (p ->> 'sale_id')::bigint for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Sale not found');
  end if;
  if v_sale.status = 'cancelled' then
    perform public.erp_raise('SALE_CANCELLED', 'Items cannot be returned on a cancelled sale');
  end if;
  if v_sale.customer_id is not null then
    perform 1 from public.customers where id = v_sale.customer_id for update;
  end if;
  if p -> 'items' is null or jsonb_array_length(p -> 'items') = 0 then
    perform public.erp_raise('NO_ITEMS', 'Select at least one item to return');
  end if;

  v_number := 'SRN-' || lpad(nextval('public.sales_return_seq')::text, 6, '0');
  insert into public.sales_returns (return_number, sale_id, customer_id, total_amount, tax_amount, return_date, reason, created_by)
  values (v_number, v_sale.id, v_sale.customer_id, 0, 0, (p ->> 'return_date')::date, nullif(p ->> 'reason', ''), p_user)
  returning id into v_return_id;

  for v_item in
    select value from jsonb_array_elements(p -> 'items') order by (value ->> 'sale_item_id')::bigint
  loop
    select * into v_si from public.sale_items
    where id = (v_item ->> 'sale_item_id')::bigint and sale_id = v_sale.id for update;
    if not found then
      perform public.erp_raise('INVALID_ITEM', 'A returned item does not belong to this sale');
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_amount := (v_item ->> 'amount')::numeric;
    if v_qty is null or v_qty <= 0 then
      perform public.erp_raise('INVALID_QUANTITY', 'Return quantities must be greater than zero');
    end if;
    if v_qty > v_si.quantity - v_si.returned_quantity then
      perform public.erp_raise('RETURN_EXCEEDS_SOLD', format(
        'Only %s unit(s) of this item can still be returned', trim_scale(v_si.quantity - v_si.returned_quantity)));
    end if;

    v_line_cost := round(v_qty * v_si.cost_price, 2);
    update public.sale_items set returned_quantity = returned_quantity + v_qty where id = v_si.id;
    insert into public.sales_return_items (return_id, sale_item_id, product_id, quantity, amount, cost_amount)
    values (v_return_id, v_si.id, v_si.product_id, v_qty, v_amount, v_line_cost);
    perform public.erp_apply_stock(v_si.product_id, v_qty, 'sales_return', 'sales_return', v_return_id, p_user, v_number);

    v_total := v_total + v_amount;
    v_cost := v_cost + v_line_cost;
  end loop;

  if v_total > v_sale.total - v_sale.returned_amount then
    perform public.erp_raise('RETURN_EXCEEDS_INVOICE', 'The return amount exceeds what is left on this invoice');
  end if;
  if v_tax > v_total then
    perform public.erp_raise('INVALID_AMOUNT', 'Return tax cannot exceed the return amount');
  end if;

  -- Credit the open receivable first; anything beyond it is refunded.
  v_adjust := least(v_total, v_sale.total - v_sale.returned_amount - v_sale.paid_amount);
  v_refund := v_total - v_adjust;
  v_method := case when v_refund > 0 then coalesce(nullif(p ->> 'refund_method', ''), v_sale.payment_method) end;

  update public.sales_returns
  set total_amount = v_total, tax_amount = v_tax, cost_amount = v_cost,
      receivable_adjusted = v_adjust, refund_amount = v_refund, refund_method = v_method
  where id = v_return_id;

  update public.sales
  set returned_amount = returned_amount + v_total, paid_amount = paid_amount - v_refund
  where id = v_sale.id;

  if v_refund > 0 then
    insert into public.payments
      (party_type, direction, customer_id, sales_return_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('customer', 'out', v_sale.customer_id, v_return_id, v_refund, v_method, v_number,
            'Refund for sales return', (p ->> 'return_date')::date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, sale_id, amount) values (v_payment_id, v_sale.id, -v_refund);
  end if;

  if v_sale.customer_id is not null then
    update public.customers
    set total_sales = total_sales - v_total, total_paid = total_paid - v_refund
    where id = v_sale.customer_id;
  end if;

  return v_return_id;
end $$;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
create or replace function public.erp_insert_purchase_items(p_purchase_id bigint, p_items jsonb, p_user uuid, p_type text)
returns void language plpgsql set search_path = '' as $$
declare
  v_item jsonb;
  v_qty numeric;
  v_unit numeric;
  v_stock numeric;
  v_cost numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    perform public.erp_raise('NO_ITEMS', 'Add at least one product');
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) order by (value ->> 'product_id')::bigint
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_unit := coalesce((v_item ->> 'unit_cost')::numeric, (v_item ->> 'purchase_price')::numeric);
    if v_qty is null or v_qty <= 0 then
      perform public.erp_raise('INVALID_QUANTITY', 'Quantities must be greater than zero');
    end if;

    select stock_quantity, purchase_price into v_stock, v_cost
    from public.products where id = (v_item ->> 'product_id')::bigint for update;
    if not found then
      perform public.erp_raise('NOT_FOUND', format('Product #%s does not exist', v_item ->> 'product_id'));
    end if;

    insert into public.purchase_items (purchase_id, product_id, quantity, purchase_price, discount, subtotal)
    values (p_purchase_id, (v_item ->> 'product_id')::bigint, v_qty, (v_item ->> 'purchase_price')::numeric,
            coalesce((v_item ->> 'discount')::numeric, 0), (v_item ->> 'subtotal')::numeric);

    -- Weighted average cost keeps COGS accurate as purchase prices change.
    update public.products
    set purchase_price = case
      when v_stock <= 0 then round(v_unit, 2)
      else round((v_stock * v_cost + v_qty * v_unit) / (v_stock + v_qty), 2) end
    where id = (v_item ->> 'product_id')::bigint;

    perform public.erp_apply_stock((v_item ->> 'product_id')::bigint, v_qty, p_type, 'purchase', p_purchase_id, p_user);
  end loop;
end $$;

create or replace function public.erp_create_purchase(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_supplier bigint := (p ->> 'supplier_id')::bigint;
  v_total numeric := (p ->> 'total')::numeric;
  v_paid numeric := coalesce((p ->> 'paid_amount')::numeric, 0);
  v_date date := (p ->> 'purchase_date')::date;
  v_invoice text := nullif(trim(p ->> 'invoice_number'), '');
  v_purchase_id bigint;
  v_payment_id bigint;
begin
  if v_paid < 0 or v_paid > v_total then
    perform public.erp_raise('INVALID_PAYMENT', 'Paid amount must be between zero and the invoice total');
  end if;
  perform 1 from public.suppliers where id = v_supplier for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Supplier not found');
  end if;

  v_invoice := coalesce(v_invoice, 'PUR-' || lpad(nextval('public.purchase_invoice_seq')::text, 6, '0'));
  insert into public.purchases
    (supplier_id, invoice_number, subtotal, discount, tax, total, paid_amount, payment_method, purchase_date, notes, created_by)
  values (v_supplier, v_invoice, (p ->> 'subtotal')::numeric, coalesce((p ->> 'discount')::numeric, 0),
          coalesce((p ->> 'tax')::numeric, 0), v_total, v_paid, p ->> 'payment_method', v_date,
          nullif(p ->> 'notes', ''), p_user)
  returning id into v_purchase_id;

  perform public.erp_insert_purchase_items(v_purchase_id, p -> 'items', p_user, 'purchase');

  update public.suppliers
  set total_purchases = total_purchases + v_total, total_paid = total_paid + v_paid
  where id = v_supplier;

  if v_paid > 0 then
    insert into public.payments
      (party_type, direction, supplier_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('supplier', 'out', v_supplier, v_paid, p ->> 'payment_method', v_invoice,
            'Payment made with purchase', v_date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, purchase_id, amount) values (v_payment_id, v_purchase_id, v_paid);
  end if;

  return v_purchase_id;
end $$;

create or replace function public.erp_update_purchase(p_purchase_id bigint, p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
  v_supplier bigint := (p ->> 'supplier_id')::bigint;
  v_total numeric := (p ->> 'total')::numeric;
  v_extra numeric := coalesce((p ->> 'additional_payment')::numeric, 0);
  v_item record;
  v_payment_id bigint;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Purchase not found');
  end if;
  if v_purchase.status = 'cancelled' then
    perform public.erp_raise('PURCHASE_CANCELLED', 'Cancelled purchases cannot be edited');
  end if;
  if v_purchase.returned_amount > 0 then
    perform public.erp_raise('PURCHASE_HAS_RETURNS', 'This purchase has returns and can no longer be edited');
  end if;
  if v_supplier <> v_purchase.supplier_id and v_purchase.paid_amount > 0 then
    perform public.erp_raise('SUPPLIER_LOCKED', 'The supplier cannot be changed after payments were recorded');
  end if;
  if v_extra < 0 then
    perform public.erp_raise('INVALID_PAYMENT', 'Additional payment cannot be negative');
  end if;
  if v_purchase.paid_amount + v_extra > v_total then
    perform public.erp_raise('TOTAL_BELOW_PAID', 'The invoice total cannot be lower than the amount paid');
  end if;

  perform 1 from public.suppliers where id = v_purchase.supplier_id for update;
  if v_supplier <> v_purchase.supplier_id then
    perform 1 from public.suppliers where id = v_supplier for update;
    if not found then
      perform public.erp_raise('NOT_FOUND', 'Supplier not found');
    end if;
  end if;

  -- Receive the new lines before reversing the old ones, so stock from this
  -- purchase that was already sold does not make a valid edit fail part-way.
  declare
    v_old_ids bigint[] := array(select id from public.purchase_items where purchase_id = p_purchase_id);
  begin
    update public.suppliers
    set total_purchases = total_purchases - v_purchase.total, total_paid = total_paid - v_purchase.paid_amount
    where id = v_purchase.supplier_id;

    update public.purchases set
      supplier_id = v_supplier,
      invoice_number = coalesce(nullif(trim(p ->> 'invoice_number'), ''), invoice_number),
      subtotal = (p ->> 'subtotal')::numeric,
      discount = coalesce((p ->> 'discount')::numeric, 0),
      tax = coalesce((p ->> 'tax')::numeric, 0),
      total = v_total,
      paid_amount = paid_amount + v_extra,
      payment_method = p ->> 'payment_method',
      purchase_date = (p ->> 'purchase_date')::date,
      notes = nullif(p ->> 'notes', '')
    where id = p_purchase_id;

    perform public.erp_insert_purchase_items(p_purchase_id, p -> 'items', p_user, 'purchase_edit');

    for v_item in select product_id, quantity from public.purchase_items where id = any (v_old_ids) order by product_id loop
      perform public.erp_apply_stock(v_item.product_id, -v_item.quantity, 'purchase_edit', 'purchase', p_purchase_id, p_user, 'Replaced by edit');
    end loop;
    delete from public.purchase_items where id = any (v_old_ids);
  end;

  update public.suppliers
  set total_purchases = total_purchases + v_total, total_paid = total_paid + v_purchase.paid_amount + v_extra
  where id = v_supplier;

  if v_extra > 0 then
    insert into public.payments
      (party_type, direction, supplier_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('supplier', 'out', v_supplier, v_extra, p ->> 'payment_method', v_purchase.invoice_number,
            'Payment added while editing purchase', (p ->> 'purchase_date')::date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, purchase_id, amount) values (v_payment_id, p_purchase_id, v_extra);
  end if;

  return p_purchase_id;
end $$;

create or replace function public.erp_cancel_purchase(p_purchase_id bigint, p_refund_method text, p_date date, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
  v_item record;
  v_payment_id bigint;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Purchase not found');
  end if;
  if v_purchase.status = 'cancelled' then
    perform public.erp_raise('ALREADY_CANCELLED', 'This purchase is already cancelled');
  end if;
  perform 1 from public.suppliers where id = v_purchase.supplier_id for update;

  for v_item in
    select product_id, quantity - returned_quantity as open_qty
    from public.purchase_items where purchase_id = p_purchase_id and quantity > returned_quantity order by product_id
  loop
    perform public.erp_apply_stock(v_item.product_id, -v_item.open_qty, 'purchase_cancel', 'purchase', p_purchase_id, p_user, 'Purchase cancelled');
  end loop;

  if v_purchase.paid_amount > 0 then
    insert into public.payments
      (party_type, direction, supplier_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('supplier', 'in', v_purchase.supplier_id, v_purchase.paid_amount,
            coalesce(p_refund_method, v_purchase.payment_method), v_purchase.invoice_number,
            'Refund for cancelled purchase', p_date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, purchase_id, amount)
    values (v_payment_id, p_purchase_id, -v_purchase.paid_amount);
  end if;

  update public.suppliers
  set total_purchases = total_purchases - (v_purchase.total - v_purchase.returned_amount),
      total_paid = total_paid - v_purchase.paid_amount
  where id = v_purchase.supplier_id;

  update public.purchases
  set paid_amount = 0, status = 'cancelled', cancelled_at = now()
  where id = p_purchase_id;
  return p_purchase_id;
end $$;

create or replace function public.erp_create_purchase_return(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
  v_pi public.purchase_items%rowtype;
  v_item jsonb;
  v_return_id bigint;
  v_number text;
  v_qty numeric;
  v_amount numeric;
  v_total numeric := 0;
  v_tax numeric := coalesce((p ->> 'tax_amount')::numeric, 0);
  v_adjust numeric;
  v_refund numeric;
  v_method text;
  v_payment_id bigint;
begin
  select * into v_purchase from public.purchases where id = (p ->> 'purchase_id')::bigint for update;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Purchase not found');
  end if;
  if v_purchase.status = 'cancelled' then
    perform public.erp_raise('PURCHASE_CANCELLED', 'Items cannot be returned on a cancelled purchase');
  end if;
  perform 1 from public.suppliers where id = v_purchase.supplier_id for update;
  if p -> 'items' is null or jsonb_array_length(p -> 'items') = 0 then
    perform public.erp_raise('NO_ITEMS', 'Select at least one item to return');
  end if;

  v_number := 'PRN-' || lpad(nextval('public.purchase_return_seq')::text, 6, '0');
  insert into public.purchase_returns (return_number, purchase_id, supplier_id, total_amount, tax_amount, return_date, reason, created_by)
  values (v_number, v_purchase.id, v_purchase.supplier_id, 0, 0, (p ->> 'return_date')::date, nullif(p ->> 'reason', ''), p_user)
  returning id into v_return_id;

  for v_item in
    select value from jsonb_array_elements(p -> 'items') order by (value ->> 'purchase_item_id')::bigint
  loop
    select * into v_pi from public.purchase_items
    where id = (v_item ->> 'purchase_item_id')::bigint and purchase_id = v_purchase.id for update;
    if not found then
      perform public.erp_raise('INVALID_ITEM', 'A returned item does not belong to this purchase');
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_amount := (v_item ->> 'amount')::numeric;
    if v_qty is null or v_qty <= 0 then
      perform public.erp_raise('INVALID_QUANTITY', 'Return quantities must be greater than zero');
    end if;
    if v_qty > v_pi.quantity - v_pi.returned_quantity then
      perform public.erp_raise('RETURN_EXCEEDS_PURCHASED', format(
        'Only %s unit(s) of this item can still be returned', trim_scale(v_pi.quantity - v_pi.returned_quantity)));
    end if;

    update public.purchase_items set returned_quantity = returned_quantity + v_qty where id = v_pi.id;
    insert into public.purchase_return_items (return_id, purchase_item_id, product_id, quantity, amount)
    values (v_return_id, v_pi.id, v_pi.product_id, v_qty, v_amount);
    perform public.erp_apply_stock(v_pi.product_id, -v_qty, 'purchase_return', 'purchase_return', v_return_id, p_user, v_number);
    v_total := v_total + v_amount;
  end loop;

  if v_total > v_purchase.total - v_purchase.returned_amount then
    perform public.erp_raise('RETURN_EXCEEDS_INVOICE', 'The return amount exceeds what is left on this invoice');
  end if;
  if v_tax > v_total then
    perform public.erp_raise('INVALID_AMOUNT', 'Return tax cannot exceed the return amount');
  end if;

  -- Reduce the open payable first; anything beyond it is refunded by the supplier.
  v_adjust := least(v_total, v_purchase.total - v_purchase.returned_amount - v_purchase.paid_amount);
  v_refund := v_total - v_adjust;
  v_method := case when v_refund > 0 then coalesce(nullif(p ->> 'refund_method', ''), v_purchase.payment_method) end;

  update public.purchase_returns
  set total_amount = v_total, tax_amount = v_tax, payable_adjusted = v_adjust,
      refund_amount = v_refund, refund_method = v_method
  where id = v_return_id;

  update public.purchases
  set returned_amount = returned_amount + v_total, paid_amount = paid_amount - v_refund
  where id = v_purchase.id;

  if v_refund > 0 then
    insert into public.payments
      (party_type, direction, supplier_id, purchase_return_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('supplier', 'in', v_purchase.supplier_id, v_return_id, v_refund, v_method, v_number,
            'Refund for purchase return', (p ->> 'return_date')::date, p_user)
    returning id into v_payment_id;
    insert into public.payment_allocations (payment_id, purchase_id, amount) values (v_payment_id, v_purchase.id, -v_refund);
  end if;

  update public.suppliers
  set total_purchases = total_purchases - v_total, total_paid = total_paid - v_refund
  where id = v_purchase.supplier_id;

  return v_return_id;
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create or replace function public.erp_record_party_payment(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_party text := p ->> 'party_type';
  v_amount numeric := (p ->> 'amount')::numeric;
  v_invoice bigint := nullif(p ->> 'invoice_id', '')::bigint;
  v_party_id bigint;
  v_balance numeric;
  v_left numeric;
  v_alloc numeric;
  v_payment_id bigint;
  r record;
begin
  if v_amount is null or v_amount <= 0 then
    perform public.erp_raise('INVALID_PAYMENT', 'Payment amount must be greater than zero');
  end if;

  if v_party = 'customer' then
    v_party_id := (p ->> 'customer_id')::bigint;
    select balance into v_balance from public.customers where id = v_party_id for update;
    if not found then
      perform public.erp_raise('NOT_FOUND', 'Customer not found');
    end if;
  elsif v_party = 'supplier' then
    v_party_id := (p ->> 'supplier_id')::bigint;
    select balance into v_balance from public.suppliers where id = v_party_id for update;
    if not found then
      perform public.erp_raise('NOT_FOUND', 'Supplier not found');
    end if;
  else
    perform public.erp_raise('INVALID_PAYMENT', 'Payments must be for a customer or a supplier');
  end if;

  if v_balance <= 0 then
    perform public.erp_raise('NOTHING_OUTSTANDING', 'There is no outstanding balance to pay');
  end if;
  if v_amount > v_balance then
    perform public.erp_raise('PAYMENT_EXCEEDS_BALANCE', format(
      'Payment exceeds the outstanding balance of %s', to_char(v_balance, 'FM999,999,999,990.00')));
  end if;

  if v_invoice is not null then
    if v_party = 'customer' then
      perform 1 from public.sales where id = v_invoice and customer_id = v_party_id and status <> 'cancelled';
    else
      perform 1 from public.purchases where id = v_invoice and supplier_id = v_party_id and status <> 'cancelled';
    end if;
    if not found then
      perform public.erp_raise('INVALID_INVOICE', 'The selected invoice does not belong to this party');
    end if;
  end if;

  if v_party = 'customer' then
    insert into public.payments
      (party_type, direction, customer_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('customer', 'in', v_party_id, v_amount, p ->> 'payment_method', nullif(p ->> 'reference', ''),
            nullif(p ->> 'notes', ''), (p ->> 'payment_date')::date, p_user)
    returning id into v_payment_id;
    update public.customers set total_paid = total_paid + v_amount where id = v_party_id;

    -- Apply to the chosen invoice first, then oldest open invoices.
    v_left := v_amount;
    for r in
      select id, total - returned_amount - paid_amount as open_amount
      from public.sales
      where customer_id = v_party_id and status <> 'cancelled' and total - returned_amount - paid_amount > 0
      order by (id = v_invoice) desc nulls last, sale_date, id
      for update
    loop
      exit when v_left <= 0;
      v_alloc := least(v_left, r.open_amount);
      update public.sales set paid_amount = paid_amount + v_alloc where id = r.id;
      insert into public.payment_allocations (payment_id, sale_id, amount) values (v_payment_id, r.id, v_alloc);
      v_left := v_left - v_alloc;
    end loop;
  else
    insert into public.payments
      (party_type, direction, supplier_id, amount, payment_method, reference, notes, payment_date, created_by)
    values ('supplier', 'out', v_party_id, v_amount, p ->> 'payment_method', nullif(p ->> 'reference', ''),
            nullif(p ->> 'notes', ''), (p ->> 'payment_date')::date, p_user)
    returning id into v_payment_id;
    update public.suppliers set total_paid = total_paid + v_amount where id = v_party_id;

    v_left := v_amount;
    for r in
      select id, total - returned_amount - paid_amount as open_amount
      from public.purchases
      where supplier_id = v_party_id and status <> 'cancelled' and total - returned_amount - paid_amount > 0
      order by (id = v_invoice) desc nulls last, purchase_date, id
      for update
    loop
      exit when v_left <= 0;
      v_alloc := least(v_left, r.open_amount);
      update public.purchases set paid_amount = paid_amount + v_alloc where id = r.id;
      insert into public.payment_allocations (payment_id, purchase_id, amount) values (v_payment_id, r.id, v_alloc);
      v_left := v_left - v_alloc;
    end loop;
  end if;

  if v_left > 0 then
    perform public.erp_raise('BALANCE_MISMATCH', 'The balance does not match open invoices; payment was not saved');
  end if;
  return v_payment_id;
end $$;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create or replace function public.erp_create_expense(p jsonb, p_user uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into public.expenses (title, category, amount, payment_method, expense_date, description, receipt, created_by)
  values (p ->> 'title', p ->> 'category', (p ->> 'amount')::numeric, p ->> 'payment_method',
          (p ->> 'expense_date')::date, nullif(p ->> 'description', ''), nullif(p ->> 'receipt', ''), p_user)
  returning id into v_id;

  insert into public.payments (party_type, direction, expense_id, amount, payment_method, reference, notes, payment_date, created_by)
  values ('expense', 'out', v_id, (p ->> 'amount')::numeric, p ->> 'payment_method', p ->> 'title',
          'Expense payment', (p ->> 'expense_date')::date, p_user);
  return v_id;
end $$;

create or replace function public.erp_update_expense(p_id bigint, p jsonb)
returns bigint language plpgsql set search_path = '' as $$
begin
  update public.expenses set
    title = p ->> 'title',
    category = p ->> 'category',
    amount = (p ->> 'amount')::numeric,
    payment_method = p ->> 'payment_method',
    expense_date = (p ->> 'expense_date')::date,
    description = nullif(p ->> 'description', ''),
    receipt = nullif(p ->> 'receipt', '')
  where id = p_id;
  if not found then
    perform public.erp_raise('NOT_FOUND', 'Expense not found');
  end if;

  update public.payments set
    amount = (p ->> 'amount')::numeric,
    payment_method = p ->> 'payment_method',
    payment_date = (p ->> 'expense_date')::date,
    reference = p ->> 'title'
  where expense_id = p_id;
  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Read-side aggregates (sums only; derived metrics are computed in Node)
-- ---------------------------------------------------------------------------
create or replace function public.erp_financial_totals(p_from date, p_to date)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'sales_count', (select count(*) from public.sales s
      where s.status <> 'cancelled' and s.sale_date between p_from and p_to),
    'sales_total', (select coalesce(sum(s.total), 0) from public.sales s
      where s.status <> 'cancelled' and s.sale_date between p_from and p_to),
    'sales_tax', (select coalesce(sum(s.tax), 0) from public.sales s
      where s.status <> 'cancelled' and s.sale_date between p_from and p_to),
    'sales_discount', (select coalesce(sum(s.discount), 0) from public.sales s
      where s.status <> 'cancelled' and s.sale_date between p_from and p_to),
    'sales_cost', (select coalesce(sum(round(si.quantity * si.cost_price, 2)), 0)
      from public.sale_items si join public.sales s on s.id = si.sale_id
      where s.status <> 'cancelled' and s.sale_date between p_from and p_to),
    'sales_returns_count', (select count(*) from public.sales_returns r join public.sales s on s.id = r.sale_id
      where s.status <> 'cancelled' and r.return_date between p_from and p_to),
    'sales_returns_total', (select coalesce(sum(r.total_amount), 0) from public.sales_returns r join public.sales s on s.id = r.sale_id
      where s.status <> 'cancelled' and r.return_date between p_from and p_to),
    'sales_returns_tax', (select coalesce(sum(r.tax_amount), 0) from public.sales_returns r join public.sales s on s.id = r.sale_id
      where s.status <> 'cancelled' and r.return_date between p_from and p_to),
    'sales_returns_cost', (select coalesce(sum(r.cost_amount), 0) from public.sales_returns r join public.sales s on s.id = r.sale_id
      where s.status <> 'cancelled' and r.return_date between p_from and p_to),
    'purchases_count', (select count(*) from public.purchases pu
      where pu.status <> 'cancelled' and pu.purchase_date between p_from and p_to),
    'purchases_total', (select coalesce(sum(pu.total), 0) from public.purchases pu
      where pu.status <> 'cancelled' and pu.purchase_date between p_from and p_to),
    'purchase_returns_total', (select coalesce(sum(r.total_amount), 0) from public.purchase_returns r join public.purchases pu on pu.id = r.purchase_id
      where pu.status <> 'cancelled' and r.return_date between p_from and p_to),
    'expenses_count', (select count(*) from public.expenses e where e.expense_date between p_from and p_to),
    'expenses_total', (select coalesce(sum(e.amount), 0) from public.expenses e where e.expense_date between p_from and p_to),
    'expenses_by_category', (select coalesce(jsonb_object_agg(x.category, x.amount), '{}'::jsonb) from (
      select e.category, sum(e.amount) as amount from public.expenses e
      where e.expense_date between p_from and p_to group by e.category) x),
    'cash_in', (select coalesce(sum(pm.amount), 0) from public.payments pm
      where pm.direction = 'in' and pm.payment_date between p_from and p_to),
    'cash_out', (select coalesce(sum(pm.amount), 0) from public.payments pm
      where pm.direction = 'out' and pm.payment_date between p_from and p_to)
  );
$$;

create or replace function public.erp_position_snapshot()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'receivables', (select coalesce(sum(balance), 0) from public.customers where balance > 0),
    'customer_credit', (select coalesce(-sum(balance), 0) from public.customers where balance < 0),
    'payables', (select coalesce(sum(balance), 0) from public.suppliers where balance > 0),
    'supplier_credit', (select coalesce(-sum(balance), 0) from public.suppliers where balance < 0),
    'customers_count', (select count(*) from public.customers),
    'suppliers_count', (select count(*) from public.suppliers),
    'products_count', (select count(*) from public.products where status = 'active'),
    'low_stock_count', (select count(*) from public.products
      where status = 'active' and stock_quantity > 0 and stock_quantity <= minimum_stock),
    'out_of_stock_count', (select count(*) from public.products where status = 'active' and stock_quantity <= 0),
    'stock_value', (select coalesce(sum(stock_value), 0) from public.products),
    'stock_retail_value', (select coalesce(sum(round(stock_quantity * selling_price, 2)), 0) from public.products),
    'cash_by_method', (select coalesce(jsonb_object_agg(x.payment_method, x.net), '{}'::jsonb) from (
      select payment_method, sum(case when direction = 'in' then amount else -amount end) as net
      from public.payments group by payment_method) x)
  );
$$;

create or replace function public.erp_timeseries(p_from date, p_to date, p_bucket text)
returns table (bucket date, sales_total numeric, revenue numeric, cost_of_goods numeric,
               purchases_total numeric, expenses_total numeric)
language plpgsql stable set search_path = '' as $$
begin
  if p_bucket not in ('day', 'week', 'month') then
    perform public.erp_raise('INVALID_BUCKET', 'Bucket must be day, week or month');
  end if;

  return query
  with buckets as (
    select generate_series(date_trunc(p_bucket, p_from::timestamp), date_trunc(p_bucket, p_to::timestamp),
                           ('1 ' || p_bucket)::interval)::date as b
  ), s as (
    select date_trunc(p_bucket, x.sale_date::timestamp)::date as b, sum(x.total) as total, sum(x.total - x.tax) as net
    from public.sales x where x.status <> 'cancelled' and x.sale_date between p_from and p_to group by 1
  ), c as (
    select date_trunc(p_bucket, x.sale_date::timestamp)::date as b, sum(round(i.quantity * i.cost_price, 2)) as cost
    from public.sale_items i join public.sales x on x.id = i.sale_id
    where x.status <> 'cancelled' and x.sale_date between p_from and p_to group by 1
  ), sr as (
    select date_trunc(p_bucket, r.return_date::timestamp)::date as b,
           sum(r.total_amount - r.tax_amount) as net, sum(r.cost_amount) as cost
    from public.sales_returns r join public.sales x on x.id = r.sale_id
    where x.status <> 'cancelled' and r.return_date between p_from and p_to group by 1
  ), pu as (
    select date_trunc(p_bucket, x.purchase_date::timestamp)::date as b, sum(x.total) as total
    from public.purchases x where x.status <> 'cancelled' and x.purchase_date between p_from and p_to group by 1
  ), e as (
    select date_trunc(p_bucket, x.expense_date::timestamp)::date as b, sum(x.amount) as total
    from public.expenses x where x.expense_date between p_from and p_to group by 1
  )
  select buckets.b,
         coalesce(s.total, 0),
         coalesce(s.net, 0) - coalesce(sr.net, 0),
         coalesce(c.cost, 0) - coalesce(sr.cost, 0),
         coalesce(pu.total, 0),
         coalesce(e.total, 0)
  from buckets
  left join s on s.b = buckets.b
  left join c on c.b = buckets.b
  left join sr on sr.b = buckets.b
  left join pu on pu.b = buckets.b
  left join e on e.b = buckets.b
  order by buckets.b;
end $$;

-- Verifies that every stored balance matches the underlying transactions.
create or replace function public.erp_integrity_check()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'customer_balance_mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select c.id, c.balance, coalesce(sum(s.total - s.returned_amount - s.paid_amount), 0) as open_invoices
      from public.customers c
      left join public.sales s on s.customer_id = c.id and s.status <> 'cancelled'
      group by c.id having c.balance <> coalesce(sum(s.total - s.returned_amount - s.paid_amount), 0)) x),
    'supplier_balance_mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select sp.id, sp.balance, coalesce(sum(pu.total - pu.returned_amount - pu.paid_amount), 0) as open_invoices
      from public.suppliers sp
      left join public.purchases pu on pu.supplier_id = sp.id and pu.status <> 'cancelled'
      group by sp.id having sp.balance <> coalesce(sum(pu.total - pu.returned_amount - pu.paid_amount), 0)) x),
    'stock_mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.id, p.stock_quantity, coalesce(sum(m.quantity_change), 0) as movements
      from public.products p left join public.stock_movements m on m.product_id = p.id
      group by p.id having p.stock_quantity <> coalesce(sum(m.quantity_change), 0)) x),
    'sale_payment_mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select s.id, s.paid_amount, coalesce(sum(a.amount), 0) as allocated
      from public.sales s left join public.payment_allocations a on a.sale_id = s.id
      group by s.id having s.paid_amount <> coalesce(sum(a.amount), 0)) x),
    'purchase_payment_mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select pu.id, pu.paid_amount, coalesce(sum(a.amount), 0) as allocated
      from public.purchases pu left join public.payment_allocations a on a.purchase_id = pu.id
      group by pu.id having pu.paid_amount <> coalesce(sum(a.amount), 0)) x)
  );
$$;

-- Only the backend (service role) may run these.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
