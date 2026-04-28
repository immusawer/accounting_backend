-- ============================================================
-- Seed: Roles and permissions
-- ============================================================

-- ── Roles ───────────────────────────────────────────────────
INSERT INTO roles (name, created_at) VALUES
  ('admin',   NOW()),
  ('manager', NOW()),
  ('finance', NOW()),
  ('staff',   NOW()),
  ('ceo',     NOW())
ON CONFLICT (name) DO NOTHING;


-- ── Permissions ─────────────────────────────────────────────
INSERT INTO permissions (name, label, group_name, created_at) VALUES

  -- Dashboard
  ('view', 'View Dashboard', 'dashboard', NOW()),

  -- Admin
  ('view', 'View Administration', 'admin', NOW()),
  ('users_view', 'View Users', 'admin', NOW()),
  ('users_create', 'Create Users', 'admin', NOW()),
  ('users_update', 'Update Users', 'admin', NOW()),
  ('users_delete', 'Delete Users', 'admin', NOW()),
  ('roles_view', 'View Roles & Permissions', 'admin', NOW()),
  ('logs_view', 'View Audit Logs', 'admin', NOW()),

  -- Customers
  ('view', 'View Customers', 'customers', NOW()),
  ('create', 'Create Customers', 'customers', NOW()),
  ('update', 'Update Customers', 'customers', NOW()),
  ('delete', 'Delete Customers', 'customers', NOW()),

  -- Vendors
  ('view', 'View Vendors', 'vendors', NOW()),
  ('create', 'Create Vendors', 'vendors', NOW()),
  ('update', 'Update Vendors', 'vendors', NOW()),
  ('delete', 'Delete Vendors', 'vendors', NOW()),

  -- Sales
  ('view', 'View Sales & Invoices', 'sales', NOW()),
  ('create', 'Create Invoices', 'sales', NOW()),
  ('update', 'Update Invoices', 'sales', NOW()),
  ('delete', 'Delete Invoices', 'sales', NOW()),

  -- Purchases
  ('view', 'View Expenses', 'purchases', NOW()),
  ('create', 'Create Expenses', 'purchases', NOW()),
  ('update', 'Update Expenses', 'purchases', NOW()),
  ('delete', 'Delete Expenses', 'purchases', NOW()),

  -- Payments
  ('view', 'View Payments', 'payments', NOW()),
  ('create', 'Create Payments', 'payments', NOW()),
  ('update', 'Update Payments', 'payments', NOW()),
  ('delete', 'Delete Payments', 'payments', NOW()),
  ('review', 'Review Payments (generate journal)', 'payments', NOW()),
  ('approve', 'Approve Payments (final sign-off)', 'payments', NOW()),

  -- Accounting
  ('view', 'View Accounting', 'accounting', NOW()),
  ('create', 'Create Accounting Entries', 'accounting', NOW()),
  ('update', 'Update Accounting Entries', 'accounting', NOW()),
  ('delete', 'Delete Accounting Entries', 'accounting', NOW()),
  ('journal_view', 'View Journal Entries', 'accounting', NOW()),
  ('ledger_view', 'View General Ledger', 'accounting', NOW()),
  ('trial_balance_view', 'View Trial Balance', 'accounting', NOW()),

  -- Transactions
  ('view', 'View Transactions Data', 'transactions', NOW()),
  ('update_status', 'Change Transaction Status', 'transactions', NOW()),

  -- Reports
  ('view', 'View Reports', 'reports', NOW()),

  -- Inventory
  ('view', 'View Inventory', 'inventory', NOW()),
  ('create', 'Create Products & Stock', 'inventory', NOW()),
  ('update', 'Update Products', 'inventory', NOW()),
  ('delete', 'Delete Products & Stock', 'inventory', NOW()),

  -- HR
  ('view', 'View HR & Payroll', 'hr', NOW()),
  ('create', 'Create Employees & Salary', 'hr', NOW()),
  ('update', 'Update Employees', 'hr', NOW()),
  ('delete', 'Delete Employees & Salary', 'hr', NOW())

ON CONFLICT (name, group_name) DO NOTHING;


-- ── Chart of Accounts ───────────────────────────────────────
INSERT INTO chart_of_accounts (
  account_name,
  code,
  type,
  category,
  parent_id,
  company_id
) VALUES
  ('Assets', 'C-1000', 'main'::"AccountType",'ASSET'::"AccountCategory", NULL, NULL),
  ('Current Assets', 'C-1000-01', 'sub1'::"AccountType",'ASSET'::"AccountCategory", 1, NULL),
  ('Liabilities', 'C-2000', 'main'::"AccountType",'LIABILITY'::"AccountCategory", NULL, NULL),
  ('Equity', 'C-3000', 'main'::"AccountType",'EQUITY'::"AccountCategory", NULL, NULL),
  ('Revenue', 'C-4000', 'main'::"AccountType",'REVENUE'::"AccountCategory", NULL, NULL),
  ('Expenses', 'C-5000', 'main'::"AccountType",'EXPENSE'::"AccountCategory", NULL, NULL),
  ('Accounts Receivable', 'C-1000-01-01', 'sub2'::"AccountType",'ASSET'::"AccountCategory", 2, NULL),
  ('Bank Account', 'C-1000-01-02', 'sub2'::"AccountType",'ASSET'::"AccountCategory", 2, NULL),
  ('Cash', 'C-1000-01-03', 'sub2'::"AccountType",'ASSET'::"AccountCategory", 2, NULL)

  
ON CONFLICT (code) DO NOTHING;

