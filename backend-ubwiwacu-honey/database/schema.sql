-- ============================================================================
-- UBW'IWACU HONEY - DATABASE SCHEMA (9 tables)
-- PostgreSQL 14+  (gen_random_uuid() is built in from PostgreSQL 13)
--
-- This mirrors the schema already applied to `ubwiwacu_honey`.
-- It is idempotent: every statement uses IF NOT EXISTS / ON CONFLICT, so
-- running it again (npm run migrate) never drops or changes existing data.
-- ============================================================================

-- 1) USERS - every human that can log in. Admin today, more roles later.
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) UNIQUE NOT NULL,
  phone           VARCHAR(30),
  password_hash   TEXT NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'manager', 'cashier', 'verifier')),
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2) PRODUCTS - price_history is JSONB: array of {price_rwf, previous_price_rwf, changed_at, changed_by}
CREATE TABLE IF NOT EXISTS products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(160) NOT NULL,
  slug              VARCHAR(180) UNIQUE NOT NULL,
  sku               VARCHAR(60) UNIQUE,
  short_description TEXT,
  marketing_story   TEXT,
  suggested_uses    TEXT,
  weight_grams      INTEGER NOT NULL CHECK (weight_grams > 0),
  category          VARCHAR(20) NOT NULL DEFAULT 'standard'
                    CHECK (category IN ('standard', 'premium')),
  price_rwf         INTEGER NOT NULL CHECK (price_rwf > 0),
  currency          VARCHAR(3) NOT NULL DEFAULT 'RWF',
  image_url         TEXT,
  stock_qty         INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  low_stock_at      INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_at >= 0),
  is_available      BOOLEAN NOT NULL DEFAULT true,
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  price_history     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_products_featured  ON products(is_featured);

-- 3) CUSTOMERS - guest checkouts. No password.
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  phone       VARCHAR(30) NOT NULL,
  email       VARCHAR(160),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- 4) ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          VARCHAR(30) UNIQUE NOT NULL,
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  source                VARCHAR(20) NOT NULL DEFAULT 'web'
                        CHECK (source IN ('web', 'pos', 'whatsapp', 'phone', 'instagram')),
  entered_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  entry_note            TEXT,

  payment_status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending', 'verification', 'paid', 'rejected', 'refunded')),
  fulfilment_status     VARCHAR(20) NOT NULL DEFAULT 'received'
                        CHECK (fulfilment_status IN
                          ('received', 'awaiting_payment', 'payment_verification',
                           'paid', 'preparing', 'ready', 'fulfilled', 'cancelled', 'refunded')),

  subtotal_rwf          INTEGER NOT NULL CHECK (subtotal_rwf >= 0),
  discount_rwf          INTEGER NOT NULL DEFAULT 0 CHECK (discount_rwf >= 0),
  total_rwf             INTEGER NOT NULL CHECK (total_rwf >= 0),
  amount_paid_rwf       INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_rwf >= 0),
  balance_rwf           INTEGER NOT NULL DEFAULT 0,

  fulfilment_type       VARCHAR(20) NOT NULL DEFAULT 'delivery'
                        CHECK (fulfilment_type IN ('delivery', 'collection')),

  customer_name         VARCHAR(120) NOT NULL,
  customer_phone        VARCHAR(30) NOT NULL,
  customer_email        VARCHAR(160),

  delivery_recipient_name VARCHAR(120),
  delivery_phone          VARCHAR(30),
  delivery_email          VARCHAR(160),
  delivery_district       VARCHAR(80),
  delivery_sector         VARCHAR(80),
  delivery_cell           VARCHAR(80),
  delivery_village        VARCHAR(80),
  delivery_landmark       TEXT,
  delivery_preferred_time VARCHAR(120),

  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_number     ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_source     ON orders(source);
CREATE INDEX IF NOT EXISTS idx_orders_payment    ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfilment ON orders(fulfilment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at);

-- 5) ORDER ITEMS - snapshot of what was bought. Prices frozen forever.
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name    VARCHAR(160) NOT NULL,
  package_size    VARCHAR(40) NOT NULL,
  unit_price_rwf  INTEGER NOT NULL CHECK (unit_price_rwf >= 0),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  line_total_rwf  INTEGER NOT NULL CHECK (line_total_rwf >= 0),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 6) PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_rwf          INTEGER NOT NULL CHECK (amount_rwf > 0),
  method              VARCHAR(20) NOT NULL
                      CHECK (method IN ('mtn_momo', 'airtel', 'bank', 'cash', 'gateway')),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'verification', 'paid', 'rejected', 'refunded')),
  transaction_ref     VARCHAR(120),
  provider_reference  VARCHAR(160),
  verified_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order  ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_paid_per_order ON payments(order_id) WHERE status = 'paid';

-- 7) RECEIPTS - one per paid payment.
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number  VARCHAR(30) UNIQUE NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id      UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount_rwf      INTEGER NOT NULL CHECK (amount_rwf > 0),
  file_path       TEXT,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  delivery_error  TEXT,
  correction_ref  TEXT,
  issued_at       TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_payment ON receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_order ON receipts(order_id);

-- 8) AUDIT LOGS - every admin mutation, plus stock adjustments (action = 'stock.adjust').
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(80) NOT NULL,
  record_type   VARCHAR(40),
  record_id     UUID,
  details       JSONB,
  ip            VARCHAR(64),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_record  ON audit_logs(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 9) APP META - counters + idempotency keys.
--   order_seq   -> {"value": n}
--   receipt_seq -> {"value": n}
--   idem:<uuid> -> {"order_id": "...", "created_at": "..."}
CREATE TABLE IF NOT EXISTS app_meta (
  key         VARCHAR(120) PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_meta (key, value) VALUES
  ('order_seq',   '{"value": 0}'::jsonb),
  ('receipt_seq', '{"value": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 10) SECURITY: two-step login and password reset.
--   two_factor_enabled   -> staff must enter an emailed 6-digit code after the password
--   password_changed_at  -> tokens issued before this moment stop working
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- One-time codes (only a keyed hash is stored, never the code itself).
CREATE TABLE IF NOT EXISTS auth_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('login', 'reset')),
  code_hash   VARCHAR(128) NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes(user_id, purpose, created_at);

-- 11) DELIVERY LOCATION: official Rwanda village code + province + street address (e.g. KG 7 Ave, house 12).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_province      VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_location_code VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address       VARCHAR(200);

-- 12) MOBILE MONEY PUSH (USSD prompt): the customer approves on their own phone with their PIN.
--   channel         push = we asked MTN/Airtel to prompt the customer; reference = customer typed a ref; manual = staff
--   provider        mock | intouch | ...   provider_status = raw status from the provider
--   expires_at      a push request we stop waiting for after this time
ALTER TABLE payments ADD COLUMN IF NOT EXISTS channel         VARCHAR(20) NOT NULL DEFAULT 'reference';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_phone     VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider        VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_status VARCHAR(80);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_ref ON payments(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_push_open ON payments(channel, status) WHERE channel = 'push' AND status = 'pending';
