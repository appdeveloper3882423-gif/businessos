
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { auth, db } from "@/lib/firebase";
import {
  addRecord,
  createWorkspace,
  getUserWorkspace,
  getWorkspace,
  listenToRecords,
  removeRecord,
  type BusinessModule,
  type BusinessRecord
} from "@/lib/business";

type FieldConfig = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
};

const moduleConfig: Record<
  BusinessModule,
  { title: string; icon: string; description: string; fields: FieldConfig[] }
> = {
  products: {
    title: "Products & Inventory",
    icon: "▦",
    description: "Manage products, prices and stock levels.",
    fields: [
      { key: "name", label: "Product name", required: true },
      { key: "sku", label: "SKU / product code" },
      { key: "quantity", label: "Quantity in stock", type: "number", required: true },
      { key: "costPrice", label: "Purchase cost", type: "number", required: true },
      { key: "salePrice", label: "Selling price", type: "number", required: true },
      { key: "reorderLevel", label: "Low-stock threshold", type: "number" }
    ]
  },
  sales: {
    title: "Sales",
    icon: "↗",
    description: "Record sales and review revenue.",
    fields: [
      { key: "reference", label: "Sale reference", required: true },
      { key: "customer", label: "Customer" },
      { key: "amount", label: "Sale total", type: "number", required: true },
      { key: "paymentMethod", label: "Payment method" },
      { key: "status", label: "Payment status" }
    ]
  },
  expenses: {
    title: "Expenses",
    icon: "↘",
    description: "Track business spending.",
    fields: [
      { key: "title", label: "Expense title", required: true },
      { key: "category", label: "Category", required: true },
      { key: "amount", label: "Amount", type: "number", required: true },
      { key: "paymentMethod", label: "Payment method" },
      { key: "notes", label: "Notes" }
    ]
  },
  customers: {
    title: "Customers",
    icon: "♙",
    description: "Keep customer contacts in one place.",
    fields: [
      { key: "name", label: "Customer name", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone" },
      { key: "company", label: "Company" },
      { key: "notes", label: "Notes" }
    ]
  },
  suppliers: {
    title: "Suppliers",
    icon: "▤",
    description: "Manage suppliers and contact details.",
    fields: [
      { key: "name", label: "Supplier name", required: true },
      { key: "company", label: "Company" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone" },
      { key: "notes", label: "Notes" }
    ]
  },
  employees: {
    title: "Employees",
    icon: "♧",
    description: "Maintain employee records.",
    fields: [
      { key: "name", label: "Employee name", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "role", label: "Job title / role", required: true },
      { key: "department", label: "Department" },
      { key: "phone", label: "Phone" }
    ]
  },
  invoices: {
    title: "Invoices",
    icon: "▣",
    description: "Track invoice references and payment status.",
    fields: [
      { key: "invoiceNo", label: "Invoice number", required: true },
      { key: "customer", label: "Customer", required: true },
      { key: "amount", label: "Total amount", type: "number", required: true },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "status", label: "Status", required: true }
    ]
  },
  tasks: {
    title: "Tasks & Operations",
    icon: "✓",
    description: "Organize tasks and follow-ups.",
    fields: [
      { key: "title", label: "Task title", required: true },
      { key: "assignedTo", label: "Assigned to" },
      { key: "status", label: "Status", required: true },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "notes", label: "Details" }
    ]
  },
  stockMovements: {
    title: "Stock Movements",
    icon: "⇄",
    description: "Record stock adjustments and movement notes.",
    fields: [
      { key: "product", label: "Product name", required: true },
      { key: "type", label: "Movement type", required: true },
      { key: "quantity", label: "Quantity", type: "number", required: true },
      { key: "note", label: "Reason / reference" }
    ]
  },
  notifications: {
    title: "Notifications",
    icon: "♧",
    description: "Maintain internal business reminders.",
    fields: [
      { key: "title", label: "Notification title", required: true },
      { key: "message", label: "Message", required: true },
      { key: "status", label: "Status" }
    ]
  }
};

const navOrder: BusinessModule[] = [
  "products", "sales", "invoices", "customers", "suppliers",
  "expenses", "employees", "tasks", "stockMovements", "notifications"
];

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
}

function num(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark">B</div>
      <div>
        <div className="brand-name">BusinessOS</div>
        <span className="brand-subtitle">Business, simplified.</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [country, setCountry] = useState("");
  const [companyReady, setCompanyReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<BusinessModule | "dashboard">("dashboard");
  const [records, setRecords] = useState<Record<string, BusinessRecord[]>>({});
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      setError("");
      setCompanyReady(false);
      setWorkspaceId("");
      setWorkspaceName("");

      if (!currentUser) return;

      try {
        const savedWorkspaceId = await getUserWorkspace(currentUser.uid);

        if (savedWorkspaceId) {
          const [member, workspace] = await Promise.all([
            import("@/lib/business").then((m) =>
              m.isWorkspaceMember(savedWorkspaceId, currentUser.uid)
            ),
            getWorkspace(savedWorkspaceId)
          ]);

          if (member && workspace) {
            setWorkspaceId(savedWorkspaceId);
            setWorkspaceName(String(workspace.name || "My Business"));
            setCurrency(String(workspace.currency || "USD"));
            setCountry(String(workspace.country || ""));
            setCompanyReady(true);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load workspace.");
      }
    });
  }, []);

  useEffect(() => {
    if (!user || !workspaceId || !companyReady) return;

    const unsubscribers = navOrder.map((module) =>
      listenToRecords(
        workspaceId,
        module,
        (items) => setRecords((previous) => ({ ...previous, [module]: items })),
        (err) => setError(err.message)
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, workspaceId, companyReady]);

  const all = (module: BusinessModule) => records[module] || [];
  const products = all("products");
  const sales = all("sales");
  const expenses = all("expenses");
  const customers = all("customers");
  const suppliers = all("suppliers");
  const employees = all("employees");
  const invoices = all("invoices");
  const tasks = all("tasks");

  const revenue = sales.reduce((sum, item) => sum + num(item.amount), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + num(item.amount), 0);
  const estimatedProfit = revenue - expenseTotal;
  const stockUnits = products.reduce((sum, item) => sum + num(item.quantity), 0);
  const lowStock = products.filter(
    (item) => num(item.quantity) <= num(item.reorderLevel ?? 5)
  );

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        day: date.toLocaleDateString(undefined, { weekday: "short" }),
        revenue: 0
      };
    });

    for (const sale of sales) {
      const timestamp = sale.createdAt as { toDate?: () => Date } | undefined;
      const date = timestamp?.toDate?.();
      if (!date) continue;
      const key = date.toISOString().slice(0, 10);
      const found = days.find((day) => day.key === key);
      if (found) found.revenue += num(sale.amount);
    }

    return days;
  }, [sales]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (authMode === "signup") {
        if (password.length < 6) {
          throw new Error("Password kam az kam 6 characters ka hona chahiye.");
        }
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setBusy(true);
    setError("");

    try {
      if (workspaceName.trim().length < 2) {
        throw new Error("Company ka naam kam az kam 2 characters ka hona chahiye.");
      }

      const id = await createWorkspace(
        user.uid,
        workspaceName,
        currency,
        country
      );

      await setDoc(
        doc(db, "users", user.uid),
        { email: user.email || email, displayName: name || user.displayName || "" },
        { merge: true }
      );

      setWorkspaceId(id);
      setCompanyReady(true);
      setNotice("Your business workspace is ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || active === "dashboard") return;

    setBusy(true);
    setError("");

    try {
      const config = moduleConfig[active];
      const data: Record<string, unknown> = {};

      for (const field of config.fields) {
        const value = (formValues[field.key] || "").trim();

        if (field.required && !value) {
          throw new Error(`${field.label} required hai.`);
        }

        if (value) {
          data[field.key] = field.type === "number" ? Number(value) : value;
        }
      }

      await addRecord(workspaceId, active, data);
      setFormValues({});
      setShowForm(false);
      setNotice(`${config.title}: record added successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save record.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(module: BusinessModule, recordId: string) {
    if (!workspaceId || !window.confirm("Is record ko delete karna hai?")) return;

    setError("");
    try {
      await removeRecord(workspaceId, module, recordId);
      setNotice("Record deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setRecords({});
    setWorkspaceId("");
    setCompanyReady(false);
  }

  if (authLoading) {
    return <div className="loading-screen"><span className="loading-mark" /></div>;
  }

  if (!user) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <Logo />
          <p className="eyebrow">YOUR BUSINESS, ONE WORKSPACE</p>
          <h1>{authMode === "signup" ? "Build your business hub" : "Welcome back"}</h1>
          <p>Manage your business operations from one secure place.</p>

          {error && <div className="notice error-notice">{error}</div>}

          <form className="auth-form" onSubmit={handleAuth}>
            {authMode === "signup" && (
              <div className="field">
                <label>Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Full name" autoComplete="name" />
              </div>
            )}
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters" required
                autoComplete={authMode === "signup" ? "new-password" : "current-password"} />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Please wait..." : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === "signup" ? "Already have an account?" : "New to BusinessOS?"}{" "}
            <button className="text-button" onClick={() =>
              setAuthMode(authMode === "signup" ? "login" : "signup")
            }>
              {authMode === "signup" ? "Sign in" : "Create account"}
            </button>
          </p>
          <p className="small">Your company data is stored in your private workspace.</p>
        </section>
      </main>
    );
  }

  if (!companyReady) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <Logo />
          <p className="eyebrow">WORKSPACE SETUP</p>
          <h1>Create your business</h1>
          <p>Set up your first workspace. You can configure more business settings later.</p>

          {error && <div className="notice error-notice">{error}</div>}

          <form className="auth-form" onSubmit={handleCreateWorkspace}>
            <div className="field">
              <label>Business / company name</label>
              <input value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Trading" required />
            </div>
            <div className="field">
              <label>Reporting currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD — US Dollar</option>
                <option value="PKR">PKR — Pakistani Rupee</option>
                <option value="GBP">GBP — Pound Sterling</option>
                <option value="EUR">EUR — Euro</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
            </div>
            <div className="field">
              <label>Country / region</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Pakistan" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Creating workspace..." : "Create workspace"}
            </button>
          </form>
          <button className="text-button" onClick={handleLogout}>Sign out</button>
        </section>
      </main>
    );
  }

  const currentConfig = active === "dashboard" ? null : moduleConfig[active];
  const currentRecords = active === "dashboard" ? [] : all(active);
  const filteredRecords = currentRecords.filter((record) =>
    Object.values(record).some((value) =>
      String(value ?? "").toLowerCase().includes(query.toLowerCase())
    )
  );

  function displayValue(value: unknown) {
    if (value == null || value === "") return "—";
    if (typeof value === "object" && "toDate" in value) {
      return (value as { toDate: () => Date }).toDate().toLocaleDateString();
    }
    return String(value);
  }

  const columns = currentConfig
    ? currentConfig.fields.map((field) => field.key)
    : [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />

        <div className="nav-section">
          <p className="nav-label">Workspace</p>
          <div className="nav-list">
            <button className={`nav-item ${active === "dashboard" ? "active" : ""}`}
              onClick={() => { setActive("dashboard"); setQuery(""); setShowForm(false); }}>
              <span className="nav-symbol">▦</span> Dashboard
            </button>
          </div>
        </div>

        <div className="nav-section">
          <p className="nav-label">Business operations</p>
          <div className="nav-list">
            {navOrder.map((module) => (
              <button key={module}
                className={`nav-item ${active === module ? "active" : ""}`}
                onClick={() => {
                  setActive(module);
                  setQuery("");
                  setShowForm(false);
                  setFormValues({});
                }}>
                <span className="nav-symbol">{moduleConfig[module].icon}</span>
                {moduleConfig[module].title}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="workspace-badge">
            <strong>{workspaceName}</strong>
            <span>{user.email}</span>
            <span>{currency} · {country || "Region not set"}</span>
          </div>
          <button className="nav-item" onClick={handleLogout}>
            <span className="nav-symbol">↪</span> Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">BUSINESS WORKSPACE / {workspaceName}</p>
            <h1>{active === "dashboard" ? "Business overview" : currentConfig?.title}</h1>
            <p className="page-description">
              {active === "dashboard"
                ? "Your business performance, at a glance."
                : currentConfig?.description}
            </p>
          </div>
          <div className="topbar-right">
            <div className="user-chip">
              <div className="avatar">{(user.email || "U")[0].toUpperCase()}</div>
              <div className="user-info">
                <strong>{name || user.displayName || "Business owner"}</strong>
                <small>Workspace owner</small>
              </div>
            </div>
          </div>
        </header>

        {error && <div className="notice error-notice">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {active === "dashboard" ? (
          <>
            <div className="grid stats-grid">
              <div className="stat-card">
                <div className="stat-top"><span>Total recorded sales</span><span className="stat-icon">↗</span></div>
                <strong className="stat-value">{money(revenue, currency)}</strong>
                <div className="stat-note">{sales.length} recorded transactions · all time</div>
              </div>
              <div className="stat-card">
                <div className="stat-top"><span>Recorded expenses</span><span className="stat-icon">↘</span></div>
                <strong className="stat-value">{money(expenseTotal, currency)}</strong>
                <div className="stat-note">{expenses.length} recorded expenses</div>
              </div>
              <div className="stat-card">
                <div className="stat-top"><span>Estimated difference</span><span className="stat-icon">◈</span></div>
                <strong className="stat-value">{money(estimatedProfit, currency)}</strong>
                <div className="stat-note">Sales minus recorded expenses only</div>
              </div>
              <div className="stat-card">
                <div className="stat-top"><span>Units in stock</span><span className="stat-icon">▦</span></div>
                <strong className="stat-value">{stockUnits.toLocaleString()}</strong>
                <div className="stat-note">{products.length} product records</div>
              </div>
            </div>

            <div className="grid content-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Sales activity</h2>
                    <p>Recorded sales by day · last 7 days</p>
                  </div>
                  <button className="btn btn-small" onClick={() => setActive("sales")}>View sales</button>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0e9f8a" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0e9f8a" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#748095" }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#748095" }} width={55} />
                      <Tooltip formatter={(value) => money(Number(value), currency)} />
                      <Area type="monotone" dataKey="revenue" stroke="#0e9f8a"
                        strokeWidth={2.5} fill="url(#salesFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Attention needed</h2><p>Items to review</p></div>
                </div>
                <div className="alert-list">
                  <div className="alert-item">
                    <span className={`alert-dot ${lowStock.length ? "warning" : ""}`} />
                    <div><strong>{lowStock.length} low-stock products</strong>
                      <span>Review items below their reorder threshold.</span></div>
                  </div>
                  <div className="alert-item">
                    <span className="alert-dot" />
                    <div><strong>{invoices.filter((item) => String(item.status).toLowerCase() !== "paid").length} invoices not marked paid</strong>
                      <span>Check payment status in Invoices.</span></div>
                  </div>
                  <div className="alert-item">
                    <span className="alert-dot" />
                    <div><strong>{tasks.filter((item) => String(item.status).toLowerCase() !== "done").length} open tasks</strong>
                      <span>Keep follow-ups moving.</span></div>
                  </div>
                </div>
              </section>
            </div>

            <section className="panel">
              <div className="panel-heading">
                <div><h2>Business snapshot</h2><p>Current workspace records</p></div>
              </div>
              <div className="grid stats-grid" style={{ margin: 0 }}>
                {[
                  ["Customers", customers.length],
                  ["Suppliers", suppliers.length],
                  ["Employees", employees.length],
                  ["Invoices", invoices.length]
                ].map(([label, value]) => (
                  <div className="stat-card" key={label}>
                    <span className="muted small">{label}</span>
                    <strong className="stat-value">{value}</strong>
                  </div>
                ))}
              </div>
            </section>
            <p className="small muted">
              Dashboard figures are based on records currently saved in this workspace.
              The estimated difference is not a complete accounting profit calculation.
            </p>
          </>
        ) : (
          <section className="panel">
            <div className="toolbar">
              <input className="search-input" value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${currentConfig?.title.toLowerCase()}...`} />
              <div className="toolbar-actions">
                <button className="btn" onClick={() => {
                  const rows = filteredRecords.map((record) =>
                    columns.map((column) =>
                      String(record[column] ?? "").replaceAll('"', '""')
                    )
                  );
                  const csv = [
                    columns.join(","),
                    ...rows.map((row) => row.map((v) => `"${v}"`).join(","))
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${active}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}>Export CSV</button>
                <button className="btn btn-primary" onClick={() => {
                  setShowForm((current) => !current);
                  setFormValues({});
                }}>{showForm ? "Close form" : "+ Add record"}</button>
              </div>
            </div>

            {showForm && currentConfig && (
              <form onSubmit={handleAddRecord} className="panel" style={{ background: "#f9fbfd" }}>
                <div className="panel-heading">
                  <div><h2>New {currentConfig.title.toLowerCase()} record</h2>
                    <p>Enter the details below.</p></div>
                </div>
                <div className="form-grid">
                  {currentConfig.fields.map((field) => (
                    <div className="field" key={field.key}>
                      <label>{field.label}{field.required ? " *" : ""}</label>
                      <input type={field.type || "text"}
                        required={Boolean(field.required)}
                        min={field.type === "number" ? 0 : undefined}
                        step={field.type === "number" ? "0.01" : undefined}
                        value={formValues[field.key] || ""}
                        onChange={(e) => setFormValues((old) => ({
                          ...old, [field.key]: e.target.value
                        }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="toolbar-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? "Saving..." : "Save record"}
                  </button>
                  <button type="button" className="btn" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="panel-heading">
              <div><h2>{currentConfig?.title}</h2>
                <p>{filteredRecords.length} record(s)</p></div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="empty-state">
                <strong>No records yet</strong>
                Add your first record or try a different search.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}
                      <th>Added</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr key={record.id}>
                        {columns.map((column) => (
                          <td key={column}>{displayValue(record[column])}</td>
                        ))}
                        <td>{displayValue(record.createdAt)}</td>
                        <td>
                          <button className="btn btn-small btn-danger"
                            onClick={() => handleDelete(active as BusinessModule, record.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
