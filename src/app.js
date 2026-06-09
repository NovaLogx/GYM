if (!window.BODY_FIT_ENV) {
  await import(`/api/bodyfit-env.js?v=${Date.now()}`);
}

const env = window.BODY_FIT_ENV || {};
const DEFAULT_SUPABASE_URL = env.SUPABASE_URL || "";
const DEFAULT_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "";
const MEMBERSHIP_PRICE = 50000;
const ROLE_PERMISSIONS = {
  "super-admin": ["dashboard", "sales", "inventory-view", "inventory-edit", "memberships", "cash-view", "cash-open", "cash-edit", "reports-view", "reports-edit", "history", "settings", "users-manage", "connection"],
  admin: ["dashboard", "sales", "inventory-view", "inventory-edit", "memberships", "cash-view", "cash-open", "reports-view", "history"],
  operator: ["dashboard", "sales", "inventory-view", "cash-view", "cash-open"],
};
const DEFAULT_SYSTEM_USERS = [
  { name: "Super Administrador", role: "super-admin", password: "Superadmin" },
  { name: "Administrador", role: "admin", password: "" },
  { name: "Operador", role: "operator", password: "" },
];

const initialState = {
  booting: true,
  activeTab: "monitor",
  theme: "light",
  supabase: {
    url: DEFAULT_SUPABASE_URL,
    anonKey: DEFAULT_SUPABASE_ANON_KEY,
    status: "pending",
    message: DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY ? "Configuracion cargada desde Vercel." : "Faltan variables de entorno de Supabase.",
    checkedAt: null,
  },
  user: {
    name: "Sin sesión",
    role: "",
  },
  users: [],
  currentUserId: "",
  sessionActive: false,
  settingsView: "home",
  reportsView: "",
  reportStatsPeriod: "day",
  reportStatsDate: toDateKey(new Date()),
  reportStatsStartDate: toDateKey(new Date()),
  reportStatsEndDate: toDateKey(new Date()),
  cashRegister: null,
  members: [],
  products: [],
  sales: [],
  cashMovements: [],
  reportDemoSeeded: false,
  inventoryFilePanelOpen: false,
  inventoryFileMessage: "Importa archivos CSV, Excel o Word para crear y actualizar productos.",
  inventoryExportCsv: "",
  inventoryExportFileName: "",
  inventoryExportDate: "",
  stockProductId: "",
  newProductModalOpen: false,
  editingProductId: "",
  memberModalMode: "",
  selectedMemberId: "",
  membershipImportSummary: null,
  saleCart: [],
  saleNewPanelOpen: false,
  salePaymentMethod: "cash",
  pendingSale: null,
  movements: [],
};

let state = normalizeState(initialState);

function normalizeState(nextState) {
  const users = Array.isArray(nextState.users) ? nextState.users : [];
  const currentUserId = nextState.currentUserId || "";
  const currentUser = users.find((user) => user.id === currentUserId);
  const normalizedState = {
    ...nextState,
    users,
    currentUserId,
    user: currentUser ? { name: currentUser.name, role: currentUser.role } : { name: "Sin sesión", role: "" },
    sessionActive: Boolean(nextState.sessionActive && currentUser),
    toast: "",
    members: nextState.members || [],
    products: nextState.products.map(withInventoryWeek),
    movements: (nextState.movements || []).filter((movement) => !isSaleInventoryMovement(movement)),
    newProductModalOpen: false,
    editingProductId: "",
    memberModalMode: "",
    selectedMemberId: "",
    reportsView: ["stats", "daily", "history"].includes(nextState.reportsView) ? nextState.reportsView : "",
    cashMovements: Array.isArray(nextState.cashMovements) ? nextState.cashMovements : [],
    reportStatsPeriod: ["day", "week", "month", "custom"].includes(nextState.reportStatsPeriod) ? nextState.reportStatsPeriod : "day",
    reportStatsDate: nextState.reportStatsDate || toDateKey(new Date()),
    reportStatsStartDate: nextState.reportStatsStartDate || toDateKey(new Date()),
    reportStatsEndDate: nextState.reportStatsEndDate || toDateKey(new Date()),
    saleCart: Array.isArray(nextState.saleCart) ? nextState.saleCart : [],
    saleNewPanelOpen: Boolean(nextState.saleNewPanelOpen),
    salePaymentMethod: ["cash", "transfer"].includes(nextState.salePaymentMethod) ? nextState.salePaymentMethod : "cash",
    historyMonth: nextState.historyMonth || toMonthKey(new Date()),
    historyWeekStart: nextState.historyWeekStart || toDateKey(startOfHistoryWeek(new Date())),
  };

  rolloverCashRegisterForToday(normalizedState);
  normalizedState.cashMovements = syncCashMovementsFromSales(normalizedState);

  return normalizedState;
}

function normalizeProductKey(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function syncCashMovementsFromSales(targetState) {
  const movements = Array.isArray(targetState.cashMovements) ? [...targetState.cashMovements] : [];
  const movementKeys = new Set(movements.map(cashMovementKey));
  const groupedSales = new Map();

  (targetState.sales || []).forEach((sale) => {
    const category = sale.source === "membership_renewal"
      ? "renovacion_membresia"
      : sale.source === "membership"
        ? "membresia_nueva"
        : "venta_producto";
    const relatedId = category === "venta_producto" ? sale.transactionId || sale.id : sale.id;
    const key = `sales|${relatedId}|${category}`;

    if (!groupedSales.has(key)) {
      groupedSales.set(key, {
        id: crypto.randomUUID(),
        type: "income",
        category,
        description: reportCategoryLabel(category, sale.productName),
        amount: 0,
        paymentMethod: sale.paymentMethod || "cash",
        relatedTable: "sales",
        relatedId,
        isInitialImport: false,
        occurredAt: sale.createdAt,
        createdAt: sale.createdAt,
      });
    }

    const grouped = groupedSales.get(key);
    grouped.amount += Number(sale.total || 0);
    if (new Date(sale.createdAt) < new Date(grouped.occurredAt)) grouped.occurredAt = sale.createdAt;
  });

  groupedSales.forEach((movement) => {
    const key = cashMovementKey(movement);
    if (movementKeys.has(key)) return;
    movements.push(movement);
    movementKeys.add(key);
  });

  return movements.sort((a, b) => new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt));
}

function cashMovementKey(movement) {
  return `${movement.relatedTable || ""}|${movement.relatedId || ""}|${movement.category || ""}`;
}

function reportCategoryLabel(category, fallback = "") {
  if (category === "venta_producto") return "Venta de productos";
  if (category === "membresia_nueva") return fallback || "Nueva membresia";
  if (category === "renovacion_membresia") return fallback || "Renovacion de membresia";
  if (category === "otro_ingreso") return "Otro ingreso";
  if (category === "gasto") return "Gasto";
  return fallback || "Movimiento de caja";
}

function normalizeMemberName(name = "") {
  return name.trim().toLocaleLowerCase("es-CO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function getImportedMembershipStatus(endDate) {
  const today = new Date();
  const expiration = new Date(`${endDate}T12:00:00`);
  today.setHours(0, 0, 0, 0);
  expiration.setHours(0, 0, 0, 0);
  return expiration < today ? "vencida" : "activa";
}

function createCashRegister(initialAmount = 0, notes = "", openedAt = new Date().toISOString()) {
  return {
    id: crypto.randomUUID(),
    status: "abierta",
    openedAt,
    closedAt: null,
    initialAmount,
    cashTotal: 0,
    transferTotal: 0,
    expenses: 0,
    countedAmount: null,
    difference: null,
    notes,
  };
}

function cashExpectedForRegister(cash) {
  if (!cash) return 0;
  return (cash.initialAmount || 0) + (cash.cashTotal || 0) - (cash.expenses || 0);
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rolloverCashRegisterForToday(targetState) {
  const cash = targetState.cashRegister;
  if (!cash || cash.status !== "abierta" || !cash.openedAt) return;
  if (localDateKey(cash.openedAt) === localDateKey()) return;

  const createdAt = new Date().toISOString();
  const expected = cashExpectedForRegister(cash);
  const userName = targetState.user?.name || "Sistema";
  const previousDateKey = localDateKey(cash.openedAt);
  const previousDate = previousDateKey ? formatShortDate(previousDateKey) : "fecha anterior";

  targetState.movements = [
    ...(targetState.movements || []),
    {
      id: crypto.randomUUID(),
      type: "caja",
      description: `Caja del ${previousDate} cerrada automaticamente por cambio de dia. Esperado: ${formatCurrency(expected)}`,
      amount: expected,
      userName,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      type: "caja",
      description: "Caja abierta automaticamente por nuevo dia",
      amount: 0,
      userName,
      createdAt,
    },
  ];
  targetState.cashRegister = createCashRegister(0, "Caja abierta automaticamente por nuevo dia.", createdAt);
  targetState.saleCart = [];
  targetState.pendingSale = null;
}

function activeUser() {
  return state.users?.find((user) => user.id === state.currentUserId) || state.user || { id: "", name: "Sin sesión", role: "" };
}

function roleLabel(role = activeUser().role) {
  if (role === "super-admin") return "Super Admin";
  if (role === "admin") return "Admin";
  return "Operador";
}

function hasPermission(permission) {
  return Boolean(state.sessionActive && ROLE_PERMISSIONS[activeUser().role]?.includes(permission));
}

function requirePermission(permission, message = "No tienes permiso para realizar esta acción.") {
  if (hasPermission(permission)) return true;
  alert(message);
  return false;
}

function routePermission(tabId) {
  return {
    monitor: "dashboard",
    pos: "sales",
    memberships: "memberships",
    inventory: "inventory-view",
    "stock-zone": "inventory-view",
    "stock-alerts": "inventory-view",
    "product-search": "inventory-view",
    cash: "cash-view",
    reports: "reports-view",
    history: "history",
    settings: "settings",
    connection: "connection",
  }[tabId] || "dashboard";
}

function saveState() {
  // El estado operativo vive en Supabase. Esta función solo conserva el flujo actual en memoria.
}

function supabaseHeaders({ prefer = "" } = {}) {
  const headers = {
    apikey: state.supabase.anonKey,
    Authorization: `Bearer ${state.supabase.anonKey}`,
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function supabaseRequest(path, { method = "GET", body = null, prefer = "", optional = false } = {}) {
  if (!supabaseConfigured()) {
    throw new Error("Supabase no esta configurado.");
  }

  const response = await fetch(`${state.supabase.url}/rest/v1/${path}`, {
    method,
    headers: {
      ...supabaseHeaders({ prefer }),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    const details = await response.text();
    if (optional && response.status === 404) return [];
    throw new Error(details || `Error Supabase ${response.status}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function supabaseSelect(table, query = "select=*", options = {}) {
  return supabaseRequest(`${table}?${query}`, options);
}

function supabaseInsert(table, payload) {
  return supabaseRequest(table, {
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });
}

function supabaseUpsert(table, payload, conflictColumn) {
  return supabaseRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

function supabasePatch(table, id, payload) {
  return supabaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    prefer: "return=representation",
  });
}

function supabasePatchWhere(table, filter, payload) {
  return supabaseRequest(`${table}?${filter}`, {
    method: "PATCH",
    body: payload,
    prefer: "return=representation",
  });
}

function supabaseDeleteWhere(table, filter) {
  return supabaseRequest(`${table}?${filter}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
}

async function dbEnsureProfile() {
  const user = activeUser();
  if (user.id) return user.id;
  const existing = await supabaseSelect("profiles", "select=id&limit=1", { optional: true });
  if (existing?.[0]?.id) return existing[0].id;
  return dbEnsureSystemUser(DEFAULT_SYSTEM_USERS[0]);
}

async function dbEnsureSystemUser(user) {
  const name = user.name.trim();
  const existing = await supabaseSelect("profiles", `select=id,full_name&full_name=eq.${encodeURIComponent(name)}&limit=1`, { optional: true });
  const payload = {
    full_name: name,
    role: dbRoleFromLocal(user.role),
    status: "active",
    password: user.password || null,
    pin: null,
    updated_at: new Date().toISOString(),
  };
  if (existing?.[0]?.id) {
    const updated = await supabasePatch("profiles", existing[0].id, payload);
    return updated?.[0]?.id || existing[0].id;
  }
  const created = await supabaseInsert("profiles", payload);
  return created?.[0]?.id || "";
}

async function dbEnsureCategory(name) {
  const categoryName = (name || "Inventario").trim();
  const existing = await supabaseSelect("categories", `select=id,name&name=eq.${encodeURIComponent(categoryName)}&limit=1`, { optional: true });
  if (existing?.[0]?.id) return existing[0].id;
  const created = await supabaseUpsert("categories", { name: categoryName, is_active: true }, "name");
  return created?.[0]?.id || "";
}

async function dbUpsertProduct(product) {
  const categoryId = await dbEnsureCategory(product.category);
  const userId = await dbEnsureProfile();
  const productPayload = {
    id: product.id,
    name: product.name,
    sku: product.sku || null,
    category_id: categoryId,
    sale_price: product.salePrice,
    purchase_cost: product.purchaseCost,
    purchase_cost_total: product.purchaseCostTotal || product.purchaseCost * product.quantity,
    status: dbProductStatus(product.status, product.quantity),
    supplier_name: product.supplier || null,
    image_url: product.imageUrl || null,
    created_by: userId || null,
    updated_at: new Date().toISOString(),
  };
  const savedProduct = await supabaseUpsert("products", productPayload, "id");
  const productId = savedProduct?.[0]?.id || product.id;
  await supabaseUpsert("inventory", {
    product_id: productId,
    current_quantity: product.quantity,
    min_quantity: product.minQuantity,
    ideal_quantity: product.idealQuantity,
    inventory_date: product.inventoryDate,
    week_start: product.weekStart,
    week_end: product.weekEnd,
    updated_at: new Date().toISOString(),
  }, "product_id");
  return productId;
}

async function dbDisableProduct(product) {
  await supabasePatch("products", product.id, {
    status: "discontinued",
    updated_at: new Date().toISOString(),
  });
  await supabasePatchWhere("inventory", `product_id=eq.${encodeURIComponent(product.id)}`, {
    current_quantity: 0,
    updated_at: new Date().toISOString(),
  });
}

async function dbRecordInventoryMovement(product, amount, previousQuantity, reason = "Surtido") {
  const userId = await dbEnsureProfile();
  await supabasePatchWhere("inventory", `product_id=eq.${encodeURIComponent(product.id)}`, {
    current_quantity: product.quantity,
    inventory_date: product.inventoryDate,
    week_start: product.weekStart,
    week_end: product.weekEnd,
    updated_at: new Date().toISOString(),
  });
  await supabaseInsert("inventory_movements", {
    product_id: product.id,
    user_id: userId,
    movement_type: amount >= 0 ? "purchase" : "sale",
    quantity_change: amount,
    previous_quantity: previousQuantity,
    new_quantity: product.quantity,
    reason,
  });
}

async function dbOpenCashRegister(cash) {
  const userId = await dbEnsureProfile();
  const saved = await supabaseInsert("cash_registers", {
    opened_by: userId,
    opened_at: cash.openedAt,
    initial_amount: cash.initialAmount,
    cash_total: cash.cashTotal,
    transfer_total: cash.transferTotal,
    expense_total: cash.expenses,
    status: "open",
    notes: cash.notes || null,
  });
  return saved?.[0]?.id || cash.id;
}

async function dbUpdateCashRegister(cash) {
  if (!cash?.id) return;
  await supabasePatch("cash_registers", cash.id, {
    closed_at: cash.closedAt,
    initial_amount: cash.initialAmount,
    cash_total: cash.cashTotal,
    transfer_total: cash.transferTotal,
    expense_total: cash.expenses,
    counted_amount: cash.countedAmount,
    difference: cash.difference,
    status: dbCashStatus(cash.status),
    notes: cash.notes || null,
  });
}

async function dbInsertCashMovement(movement) {
  if (!state.cashRegister?.id || !movement?.category || !movement?.relatedId) return;
  const userId = await dbEnsureProfile();
  const movementType = movement.category === "gasto" ? "expense" : movement.category === "ajuste" ? "adjustment" : "manual_income";
  await supabaseInsert("cash_movements", {
    cash_register_id: state.cashRegister.id,
    user_id: userId,
    sale_id: movement.relatedTable === "sales" ? movement.relatedId : null,
    movement_type: movement.category === "venta_producto" ? "sale" : movementType,
    payment_method: dbPaymentMethod(movement.paymentMethod || "cash"),
    amount: movement.amount,
    description: movement.description || reportCategoryLabel(movement.category),
    type: movement.type || "income",
    category: movement.category,
    payment_method_text: movement.paymentMethod || "cash",
    related_table: movement.relatedTable,
    related_id: movement.relatedId,
    is_initial_import: false,
    occurred_at: movement.occurredAt || new Date().toISOString(),
  });
}

async function dbCreateSale(items, paymentMethod, createdAt) {
  const userId = await dbEnsureProfile();
  const totalAmount = items.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  const totalCost = items.reduce((sum, item) => sum + item.product.purchaseCost * item.quantity, 0);
  const savedSale = await supabaseInsert("sales", {
    cash_register_id: state.cashRegister.id,
    user_id: userId,
    payment_method: dbPaymentMethod(paymentMethod),
    total_amount: totalAmount,
    total_cost: totalCost,
    gross_profit: totalAmount - totalCost,
    status: "completed",
    created_at: createdAt,
  });
  const saleId = savedSale?.[0]?.id;
  if (!saleId) throw new Error("No se pudo crear la venta en Supabase.");

  await Promise.all(items.map(({ product, quantity }) => supabaseInsert("sale_items", {
    sale_id: saleId,
    product_id: product.id,
    quantity,
    unit_price: product.salePrice,
    unit_cost: product.purchaseCost,
    subtotal: product.salePrice * quantity,
    profit: (product.salePrice - product.purchaseCost) * quantity,
  })));

  await Promise.all(items.map(({ product, quantity, previousQuantity }) => dbRecordInventoryMovement(product, -quantity, previousQuantity, `Venta: ${product.name}`)));
  await dbUpdateCashRegister(state.cashRegister);
  await dbInsertCashMovement({
    type: "income",
    category: "venta_producto",
    description: "Venta de productos",
    amount: totalAmount,
    paymentMethod,
    relatedTable: "sales",
    relatedId: saleId,
    occurredAt: createdAt,
  });
  return saleId;
}

async function dbUpsertMember(member, { registerIncome = false, renewal = false } = {}) {
  const clientPayload = {
    full_name: member.name,
    normalized_name: normalizeMemberName(member.name),
    phone: member.phone || null,
    email: member.email || null,
    document_number: member.documentId || null,
    notes: member.notes || null,
    updated_at: new Date().toISOString(),
  };
  const savedClient = await supabaseUpsert("clients", clientPayload, "normalized_name");
  const clientId = savedClient?.[0]?.id || member.clientId;
  const membershipPayload = {
    id: member.id,
    client_id: clientId,
    plan: member.plan || "Mensual",
    start_date: member.acquiredAt,
    end_date: member.expiresAt,
    status: getImportedMembershipStatus(member.expiresAt),
    price: MEMBERSHIP_PRICE,
    payment_method: "cash",
    notes: member.notes || null,
    is_initial_import: false,
    updated_at: new Date().toISOString(),
  };
  const savedMembership = await supabaseUpsert("memberships", membershipPayload, "id");
  const membershipId = savedMembership?.[0]?.id || member.id;

  if (registerIncome) {
    await dbRegisterMembershipIncome({ ...member, id: membershipId, clientId }, renewal);
  }

  return { id: membershipId, clientId };
}

async function dbRegisterMembershipIncome(member, renewal = false) {
  ensureMembershipCashRegister();
  if (!state.cashRegister.id) state.cashRegister.id = await dbOpenCashRegister(state.cashRegister);
  state.cashRegister.cashTotal += MEMBERSHIP_PRICE;
  await dbUpdateCashRegister(state.cashRegister);
  await dbInsertCashMovement({
    type: "income",
    category: renewal ? "renovacion_membresia" : "membresia_nueva",
    description: renewal ? `Renovacion de membresia - ${member.name}` : `Nueva membresia - ${member.name}`,
    amount: MEMBERSHIP_PRICE,
    paymentMethod: "cash",
    relatedTable: "memberships",
    relatedId: member.id,
    occurredAt: new Date().toISOString(),
  });
}

async function dbDeleteMembership(member) {
  await supabaseDeleteWhere("memberships", `id=eq.${encodeURIComponent(member.id)}`);
}

function normalizeDbName(value = "") {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function localRoleFromDb(role) {
  if (role === "superadmin") return "super-admin";
  if (role === "admin") return "admin";
  return "operator";
}

function dbRoleFromLocal(role) {
  if (role === "super-admin") return "superadmin";
  if (role === "admin") return "admin";
  return "cashier";
}

function localProductStatus(status) {
  if (status === "out_of_stock") return "agotado";
  if (status === "discontinued") return "inactivo";
  return "activo";
}

function dbProductStatus(status, quantity = 0) {
  if (status === "inactivo") return "discontinued";
  if (status === "agotado" || quantity <= 0) return "out_of_stock";
  return "active";
}

function localCashStatus(status) {
  if (status === "closed" || status === "reviewed") return "cerrada";
  return "abierta";
}

function dbCashStatus(status) {
  return status === "cerrada" ? "closed" : "open";
}

function dbPaymentMethod(method) {
  return method === "transfer" ? "transfer" : "cash";
}

function localPaymentMethod(method) {
  return method === "transfer" ? "transfer" : "cash";
}

async function hydrateFromSupabase() {
  if (!supabaseConfigured()) {
    state.booting = false;
    state.supabase.status = "error";
    state.supabase.message = "Faltan SUPABASE_URL y SUPABASE_ANON_KEY en Vercel.";
    render();
    return;
  }

  try {
    const [
      profiles,
      categories,
      products,
      inventory,
      cashRegisters,
      sales,
      saleItems,
      cashMovements,
      inventoryMovements,
      clients,
      memberships,
    ] = await Promise.all([
      supabaseSelect("profiles", "select=id,full_name,role,status,password&order=created_at.asc", { optional: true }),
      supabaseSelect("categories", "select=id,name,is_active&order=name.asc", { optional: true }),
      supabaseSelect("products", "select=id,name,sku,category_id,sale_price,purchase_cost,purchase_cost_total,status,supplier_name,image_url,updated_at&order=name.asc", { optional: true }),
      supabaseSelect("inventory", "select=product_id,current_quantity,min_quantity,ideal_quantity,inventory_date,week_start,week_end,updated_at", { optional: true }),
      supabaseSelect("cash_registers", "select=*&order=opened_at.desc&limit=1", { optional: true }),
      supabaseSelect("sales", "select=*&order=created_at.desc&limit=1000", { optional: true }),
      supabaseSelect("sale_items", "select=*&order=created_at.desc&limit=2000", { optional: true }),
      supabaseSelect("cash_movements", "select=*&order=created_at.desc&limit=1000", { optional: true }),
      supabaseSelect("inventory_movements", "select=*&order=created_at.desc&limit=1000", { optional: true }),
      supabaseSelect("clients", "select=*", { optional: true }),
      supabaseSelect("memberships", "select=*", { optional: true }),
    ]);

    applyRemoteProfiles(profiles || []);
    applyRemoteProducts(categories || [], products || [], inventory || []);
    applyRemoteCashRegister((cashRegisters || [])[0] || null);
    applyRemoteSales(sales || [], saleItems || []);
    applyRemoteCashMovements(cashMovements || []);
    applyRemoteInventoryMovements(inventoryMovements || []);
    applyRemoteMemberships(clients || [], memberships || []);

    state.booting = false;
    state.supabase.status = "connected";
    state.supabase.message = "Datos cargados desde Supabase.";
    state.supabase.checkedAt = new Date().toISOString();
    saveState();
    render();
  } catch (error) {
    state.booting = false;
    state.supabase.status = "error";
    state.supabase.message = `No se pudo cargar Supabase: ${String(error.message || error).slice(0, 120)}`;
    state.supabase.checkedAt = new Date().toISOString();
    saveState();
    render();
  }
}

function applyRemoteProfiles(profiles) {
  if (!profiles.length) {
    state.users = [];
    state.currentUserId = "";
    state.user = { name: "Sin sesión", role: "" };
    state.sessionActive = false;
    return;
  }
  const dedupedProfiles = [...profiles]
    .filter((profile) => profile.status !== "inactive")
    .reduce((map, profile) => {
      const key = normalizeMemberName(profile.full_name || "");
      if (key && !map.has(key)) map.set(key, profile);
      return map;
    }, new Map());
  state.users = [...dedupedProfiles.values()].map((profile) => ({
    id: profile.id,
    name: profile.full_name,
    role: localRoleFromDb(profile.role),
    password: profile.password || "",
  }));
  if (!state.users.some((user) => user.id === state.currentUserId)) {
    const superAdmin = state.users.find((user) => user.role === "super-admin") || state.users[0];
    state.currentUserId = superAdmin?.id || "";
  }
  const user = activeUser();
  state.user = { name: user.name, role: user.role };
}

function applyRemoteProducts(categories, products, inventory) {
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const inventoryByProduct = new Map(inventory.map((item) => [item.product_id, item]));
  state.dbCategories = categories;
  state.products = products.map((product) => {
    const stock = inventoryByProduct.get(product.id) || {};
    return withInventoryWeek({
      id: product.id,
      name: product.name,
      sku: product.sku || "",
      category: categoriesById.get(product.category_id) || "Inventario",
      salePrice: Number(product.sale_price || 0),
      purchaseCost: Number(product.purchase_cost || 0),
      purchaseCostTotal: Number(product.purchase_cost_total || 0),
      quantity: Number(stock.current_quantity || 0),
      minQuantity: Number(stock.min_quantity || 0),
      idealQuantity: Number(stock.ideal_quantity || 0),
      supplier: product.supplier_name || "",
      status: localProductStatus(product.status),
      imageUrl: product.image_url || "",
      inventoryDate: stock.inventory_date || getInventoryWeek().inventoryDate,
      weekStart: stock.week_start || getInventoryWeek().weekStart,
      weekEnd: stock.week_end || getInventoryWeek().weekEnd,
    });
  });
}

function applyRemoteCashRegister(cash) {
  if (!cash) {
    state.cashRegister = null;
    return;
  }

  state.cashRegister = {
    id: cash.id,
    status: localCashStatus(cash.status),
    openedAt: cash.opened_at,
    closedAt: cash.closed_at,
    initialAmount: Number(cash.initial_amount || 0),
    cashTotal: Number(cash.cash_total || 0),
    transferTotal: Number(cash.transfer_total || 0),
    expenses: Number(cash.expense_total || 0),
    countedAmount: cash.counted_amount === null ? null : Number(cash.counted_amount),
    difference: cash.difference === null ? null : Number(cash.difference),
    notes: cash.notes || "",
  };
}

function applyRemoteSales(sales, saleItems) {
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  state.sales = saleItems
    .map((item) => {
      const sale = salesById.get(item.sale_id);
      if (!sale || sale.status === "voided") return null;
      return {
        id: item.id,
        transactionId: sale.id,
        productId: item.product_id,
        productName: item.product_name || state.products.find((product) => product.id === item.product_id)?.name || "Producto",
        quantity: Number(item.quantity || 0),
        paymentMethod: localPaymentMethod(sale.payment_method),
        total: Number(item.subtotal || item.total_amount || 0),
        cost: Number(item.unit_cost || 0) * Number(item.quantity || 0),
        profit: Number(item.profit || 0),
        createdAt: sale.created_at,
      };
    })
    .filter(Boolean);
}

function applyRemoteCashMovements(cashMovements) {
  state.cashMovements = cashMovements.map((movement) => ({
    id: movement.id,
    type: movement.type || (movement.movement_type === "expense" ? "expense" : "income"),
    category: movement.category || dbMovementCategory(movement),
    description: movement.description || "",
    amount: Number(movement.amount || 0),
    paymentMethod: movement.payment_method_text || localPaymentMethod(movement.payment_method),
    relatedTable: movement.related_table || (movement.sale_id ? "sales" : ""),
    relatedId: movement.related_id || movement.sale_id || movement.id,
    isInitialImport: Boolean(movement.is_initial_import),
    occurredAt: movement.occurred_at || movement.created_at,
    createdAt: movement.created_at,
  }));
}

function dbMovementCategory(movement) {
  if (movement.movement_type === "sale") return "venta_producto";
  if (movement.movement_type === "expense") return "gasto";
  return "otro_ingreso";
}

function applyRemoteInventoryMovements(inventoryMovements) {
  const productById = new Map(state.products.map((product) => [product.id, product]));
  const inventoryHistory = inventoryMovements.map((movement) => {
    const product = productById.get(movement.product_id);
    return {
      id: movement.id,
      type: "inventario",
      description: movement.reason || `Inventario: ${product?.name || "Producto"} ${movement.quantity_change > 0 ? "+" : ""}${movement.quantity_change}`,
      amount: 0,
      userName: "Sistema",
      createdAt: movement.created_at,
    };
  });
  const cashHistory = (state.cashMovements || []).map((movement) => ({
    id: movement.id,
    type: movement.category === "venta_producto" ? "venta" : movement.category?.includes("membresia") ? "membresia" : "caja",
    description: movement.description || reportCategoryLabel(movement.category),
    amount: movement.amount,
    userName: "Sistema",
    createdAt: movement.occurredAt || movement.createdAt,
  }));
  state.movements = [...cashHistory, ...inventoryHistory].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function applyRemoteMemberships(clients, memberships) {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  state.members = memberships.map((membership) => {
    const client = clientsById.get(membership.client_id) || {};
    return {
      id: membership.id,
      clientId: membership.client_id,
      name: client.full_name || "Miembro",
      phone: client.phone || "",
      documentId: client.document_number || "",
      email: client.email || "",
      plan: membership.plan || "Mensual",
      acquiredAt: membership.start_date,
      expiresAt: membership.end_date,
      status: membership.status || getImportedMembershipStatus(membership.end_date),
      price: Number(membership.price || MEMBERSHIP_PRICE),
      notes: membership.notes || client.notes || "",
      isInitialImport: Boolean(membership.is_initial_import),
      createdAt: membership.created_at,
      updatedAt: membership.updated_at,
    };
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatMoneyInput(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatLongDate(value) {
  const formatted = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function getInventoryWeek(dateValue = new Date()) {
  const date = new Date(dateValue);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  start.setDate(date.getDate() + mondayOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + 5);

  return {
    inventoryDate: toDateKey(date),
    weekStart: toDateKey(start),
    weekEnd: toDateKey(end),
  };
}

function withInventoryWeek(product) {
  const week = getInventoryWeek(product.inventoryDate || new Date());
  return {
    ...product,
    imageUrl: product.imageUrl || "",
    inventoryDate: product.inventoryDate || week.inventoryDate,
    weekStart: product.weekStart || week.weekStart,
    weekEnd: product.weekEnd || week.weekEnd,
  };
}

function weekLabel(product) {
  const productWithWeek = withInventoryWeek(product);
  return `${formatShortDate(productWithWeek.weekStart)} - ${formatShortDate(productWithWeek.weekEnd)}`;
}

function getProductStatus(product) {
  if (product.status === "inactivo" || product.status === "descontinuado") return { label: "Inactivo", tone: "muted" };
  if (product.quantity === 0 || product.status === "agotado") return { label: "Agotado", tone: "bad" };
  if (product.quantity <= product.minQuantity) return { label: "Bajo", tone: "warn" };
  return { label: "Disponible", tone: "ok" };
}

function isActiveProduct(product) {
  return product.status === "activo";
}

function todaySales() {
  const today = new Date().toDateString();
  return state.sales.filter((sale) => new Date(sale.createdAt).toDateString() === today);
}

function todaySaleRecords() {
  const grouped = new Map();

  todaySales().forEach((sale) => {
    const key = sale.transactionId || sale.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        createdAt: sale.createdAt,
        paymentMethod: sale.paymentMethod,
        total: 0,
        quantity: 0,
        items: [],
      });
    }

    const record = grouped.get(key);
    record.total += sale.total;
    record.quantity += sale.quantity;
    record.items.push(sale);
    if (new Date(sale.createdAt) > new Date(record.createdAt)) record.createdAt = sale.createdAt;
  });

  return [...grouped.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getMetrics() {
  const sales = todaySales();
  const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfit = sales.reduce((sum, sale) => sum + sale.profit, 0);
  const soldItems = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const criticalProducts = state.products.filter((product) => isActiveProduct(product) && product.quantity <= product.minQuantity).length;

  return { totalSales, totalProfit, soldItems, criticalProducts, saleCount: todaySaleRecords().length };
}

function cashExpected() {
  return cashExpectedForRegister(state.cashRegister);
}

function supabaseConfigured() {
  return Boolean(state.supabase?.url && state.supabase?.anonKey);
}

function icon(name) {
  const icons = {
    monitor: '<path d="M3 13h6l2-7 4 13 2-6h4"/><path d="M3 21h18"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
    inventory: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M7 12h.01M17 12h.01"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.6 12.42a2 2 0 0 0 2 1.58h8.8a2 2 0 0 0 1.95-1.57L21 7H5.12"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
    pos: '<path d="M6 2h12v20H6z"/><path d="M9 6h6M9 10h6M9 14h2"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6"/><path d="M16 12H8"/><path d="M13 16H8"/>',
    transfer: '<path d="m17 3 4 4-4 4"/><path d="M21 7H3"/><path d="m7 21-4-4 4-4"/><path d="M3 17h18"/>',
    connection: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    renew: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1"/><path d="M16 14h.01"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sales: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    profit: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    user: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.2 14.6A6 6 0 1 1 15.8 14.6c-.8.6-.8 1.4-.8 2.4H9c0-1 0-1.8-.8-2.4Z"/><path d="M4 4l1.4 1.4"/><path d="M20 4l-1.4 1.4"/><path d="M2 11h2"/><path d="M20 11h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 7.5A9 9 0 1 1 12 3"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.monitor}</svg>`;
}

function renderAppHeader() {
  return `
    <header class="topbar">
      <div class="brand-wrap">
        <div class="brand">
          <strong class="brand-title">BODY-FIT Software</strong>
          <span>POS, inventario, caja y monitoreo operativo</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="user-chip"><span class="status-dot"></span>${connectionShortLabel()} · Super-Admin</div>
        <button class="icon-button" type="button" id="theme-toggle" title="Cambiar tema">${icon(state.theme === "dark" ? "sun" : "moon")}</button>
      </div>
    </header>
  `;
}

function renderSidebar() {
  const mainItems = [
    ["monitor", "INICIO", "home", "dashboard"],
    ["pos", "Ventas", "pos", "sales"],
    ["memberships", "Membresias", "user", "memberships"],
    ["inventory", "Inventario", "inventory", "inventory-view"],
    ["reports", "Reportes", "sales", "reports-view"],
    ["settings", "Configuracion", "settings", "settings"],
  ].filter(([, , , permission]) => hasPermission(permission));

  return `
    <header class="sidebar app-navbar" aria-label="Navegacion principal">
      <div class="sidebar-brand">
        <strong class="sidebar-wordmark">BODY FI<span class="wordmark-t">T</span></strong>
      </div>
      <div class="sidebar-section">
        ${mainItems.map(([id, label, iconName]) => navButton(id, label, iconName)).join("")}
      </div>
      <div class="navbar-session">
        <span class="sidebar-session"><i></i>${activeUser().name} · ${roleLabel()}</span>
        <button class="navbar-logout interactive-sidebar" type="button" data-session-action="logout">${icon("logout")}<span>Cerrar sesi&oacute;n</span></button>
      </div>
    </header>
  `;
}

function navButton(id, label, iconName) {
  return `<button class="nav-item interactive-sidebar ${state.activeTab === id ? "active" : ""}" type="button" data-tab="${id}">${icon(iconName)}<span>${label}</span></button>`;
}

function renderQuickActions() {
  const isOperator = activeUser().role === "operator";
  const actions = isOperator
    ? [
        { tabId: "pos", label: "Ventas", iconName: "pos", permission: "sales" },
      ]
    : [
        { tabId: "reports", label: "Reportes", iconName: "sales", permission: "reports-view" },
        { tabId: "inventory", label: "Inventario", iconName: "inventory", permission: "inventory-view" },
      ];
  const sessionAction = state.sessionActive
    ? { action: "logout", label: "Cerrar sesi&oacute;n", iconName: "logout", className: "session-logout" }
    : { action: "login", label: "Iniciar sesi&oacute;n", iconName: "login" };
  const visibleActions = [...actions.filter(({ permission }) => !permission || hasPermission(permission)), sessionAction];

  return `
    <div class="quick-actions">
      <strong>Atajos r&aacute;pidos</strong>
      ${visibleActions.map(({ tabId, action, label, iconName, className = "" }) => `<button class="interactive-sidebar ${state.activeTab === tabId ? "active" : ""} ${className}" type="button" ${tabId ? `data-tab="${tabId}"` : `data-session-action="${action}"`}>${icon(iconName)}<span>${label}</span></button>`).join("")}
    </div>
  `;
}

function renderSectionPanel(title, subtitle, content, actions = "") {
  return `
    <section class="panel section-panel">
      <div class="panel-header">
        <div>
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        ${actions}
      </div>
      ${content}
    </section>
  `;
}

function renderStatusBadge(label, tone = "ok") {
  return `<span class="status ${tone}">${label}</span>`;
}

function renderEmptyState(title, text) {
  return `<div class="empty-state">${icon("alert")}<strong>${title}</strong><span>${text}</span></div>`;
}

function productInitials(product) {
  return product.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderProductThumbnail(product, className = "product-search-thumb") {
  if (product.imageUrl) {
    return `<div class="${className} has-image" style="background-image:url('${escapeAttribute(product.imageUrl)}')" aria-label="${escapeAttribute(product.name)}"></div>`;
  }

  return `<div class="${className}">${productInitials(product)}</div>`;
}

function renderToastNotification() {
  if (!state.toast) return "";
  return `<div class="toast">${state.toast}</div>`;
}

function render() {
  const app = document.querySelector("#app");
  if (state.booting) {
    app.innerHTML = renderLoadingScreen();
    return;
  }
  if (!state.sessionActive) {
    app.innerHTML = renderLoginScreen();
    bindLoginEvents();
    return;
  }
  normalizeActiveTab();

  app.innerHTML = `
    <div class="app-shell" data-theme="${state.theme || "light"}">
      <div class="app-layout">
        ${renderSidebar()}
        <main class="main">
          ${renderActiveTab()}
        </main>
      </div>
      ${renderStockModal()}
      ${renderNewProductModal()}
      ${renderSaleConfirmationModal()}
      ${renderMembershipModal()}
      ${renderToastNotification()}
    </div>
  `;

  bindEvents();
}

function renderLoadingScreen() {
  return `
    <main class="login-screen">
      <section class="login-card">
        <div class="login-brand">
          <strong>BODY FI<span>T</span></strong>
          <p>Conectando con Supabase</p>
        </div>
        <div class="empty-state">
          ${icon("connection")}
          <strong>Cargando datos reales</strong>
          <span>La información viene desde la base de datos.</span>
        </div>
      </section>
    </main>
  `;
}

function renderLoginScreen() {
  return `
    <main class="login-screen">
      <section class="login-card">
        <div class="login-brand">
          <strong>BODY FI<span>T</span></strong>
          <p>Control operativo del gimnasio</p>
        </div>
        <div>
          <h1>Iniciar sesión</h1>
          <p>Selecciona tu usuario e ingresa tu contraseña.</p>
        </div>
        <form id="login-form" class="login-form">
          <div class="field">
            <label for="loginUser">Usuario</label>
            ${state.users.length
              ? renderPremiumSelect("loginUser", "loginUser", state.users.map((user) => ({ value: user.id, label: `${user.name} · ${roleLabel(user.role)}` })))
              : `<div class="notice">No hay usuarios cargados desde Supabase.</div>`}
          </div>
          <div class="field">
            <label for="loginPassword">Contraseña</label>
            <input id="loginPassword" name="loginPassword" type="password" autocomplete="current-password" placeholder="Ingresa tu contraseña" required />
          </div>
          <button class="button login-submit" type="submit" ${state.users.length ? "" : "disabled"}>${icon("login")}<span>Ingresar al sistema</span></button>
        </form>
        ${!state.users.length ? renderInitialUserRegistration() : ""}
      </section>
    </main>
  `;
}

function bindLoginEvents() {
  bindPremiumSelects();
  document.querySelector("#login-form")?.addEventListener("submit", login);
  document.querySelector("#create-default-users")?.addEventListener("click", createDefaultSystemUsers);
}

function renderInitialUserRegistration() {
  return `
    <section class="initial-register-panel">
      <div>
        <strong>Registro inicial</strong>
        <span>Crea los tres accesos base del sistema en Supabase.</span>
      </div>
      <div class="initial-user-grid">
        ${DEFAULT_SYSTEM_USERS.map((user) => `
          <article>
            <span>${icon(user.role === "super-admin" ? "settings" : user.role === "admin" ? "user" : "pos")}</span>
            <strong>${roleLabel(user.role)}</strong>
            <small>${user.role === "super-admin" ? "Acceso maestro" : "Contraseña pendiente"}</small>
          </article>
        `).join("")}
      </div>
      <button class="button initial-register-button" type="button" id="create-default-users">
        ${icon("user")}<span>Crear usuarios base</span>
      </button>
    </section>
  `;
}

function renderTabs() {
  const tabs = [
    ["monitor", "Monitoreo"],
    ["inventory", "Inventario"],
    ["pos", "Ventas"],
  ];

  return `
    <nav class="tabs" aria-label="Modulos principales">
      ${tabs
        .map(
          ([id, label]) =>
            `<button class="tab interactive-tab ${state.activeTab === id ? "active" : ""}" data-tab="${id}">${label}</button>`,
        )
        .join("")}
      <div class="tab-menu">
        <button class="tab tab-menu-button interactive-tab ${["connection", "history"].includes(state.activeTab) ? "active" : ""}" type="button" id="more-menu-toggle">
          Mas <span class="chevron">⌄</span>
        </button>
        <div class="tab-menu-content" id="more-menu-content">
          <button class="tab-menu-item interactive-tab" type="button" data-tab="connection">Conexion</button>
          <button class="tab-menu-item interactive-tab" type="button" data-tab="history">Historial</button>
        </div>
      </div>
    </nav>
  `;
}

function renderActiveTab() {
  normalizeActiveTab();
  if (state.activeTab === "inventory") return renderInventory();
  if (state.activeTab === "cash") return renderCash();
  if (state.activeTab === "pos") return renderPos();
  if (state.activeTab === "memberships") return renderMemberships();
  if (state.activeTab === "reports") return renderReports();
  if (state.activeTab === "settings") return renderSettings();
  if (state.activeTab === "connection") return renderConnection();
  return renderMonitor();
}

function normalizeActiveTab() {
  if (!hasPermission(routePermission(state.activeTab))) {
    state.activeTab = "monitor";
  }
  if (state.activeTab === "stock-zone") state.activeTab = "inventory";
  if (state.activeTab === "stock-alerts") state.activeTab = "inventory";
  if (state.activeTab === "product-search") state.activeTab = "inventory";
  if (state.activeTab === "history") state.activeTab = "reports";
  if (state.activeTab === "cash") state.activeTab = "pos";
}

function connectionLabel() {
  if (state.supabase?.status === "connected") return "Supabase conectado";
  if (state.supabase?.status === "error") return "Supabase pendiente";
  return "Modo local";
}

function connectionShortLabel() {
  if (state.supabase?.status === "connected") return "Conectado";
  if (state.supabase?.status === "error") return "Pendiente";
  if (supabaseConfigured()) return "Conectado";
  return "Local";
}

function renderMonitor() {
  const metrics = getMetrics();
  const cash = state.cashRegister;
  const critical = state.products.filter((product) => isActiveProduct(product) && product.quantity <= product.minQuantity);
  const shownCritical = critical.slice(0, 2).map((product) => {
    const status = getProductStatus(product);
    return {
      product,
      name: product.name,
      text: `${product.quantity} disponibles · minimo ${product.minQuantity} · ideal ${product.idealQuantity}`,
      badge: status.tone === "bad" ? "Agotado" : "Bajo stock",
      tone: status.tone,
      progress: product.idealQuantity ? Math.min(100, Math.round((product.quantity / product.idealQuantity) * 100)) : 0,
      count: `${product.quantity} / ${product.idealQuantity}`,
    };
  });
  const cashOpen = cash?.status === "abierta";
  const cashValue = cashOpen ? "Abierta" : "Sin abrir";
  const cashHelper = cashOpen ? `Desde ${formatDate(cash.openedAt)}` : "Abre caja para vender";
  const cashAction = hasPermission("cash-view")
    ? cashOpen
      ? `<button class="metric-action" type="button" data-tab="pos">Ver en ventas</button>`
      : `<button class="metric-action" type="button" data-tab="pos">${hasPermission("cash-open") ? "Abrir caja" : "Ver caja"}</button>`
    : "";
  const recentMovements = [...state.movements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

  return `
    <div class="dashboard-heading">
      <h1>INICIO</h1>
      <p>Resumen general del sistema</p>
    </div>
    <section class="metrics dashboard-metrics">
      ${renderMetric("Ventas del dia", formatCurrency(metrics.totalSales), `${metrics.soldItems} productos vendidos`, "profit", "mint", `<div class="progress muted"><span style="width: 0%"></span></div><small>0% vs ayer</small>`)}
      ${renderMetric("Ganancia estimada", formatCurrency(metrics.totalProfit), "Segun costo registrado", "sales", "blue", `<div class="progress muted"><span style="width: 0%"></span></div><small>0% vs ayer</small>`)}
      ${renderMetric("Caja actual", cashValue, cashHelper, "cash", "purple", cashAction, cashOpen ? "open" : "closed")}
      ${renderMetric("Inventario critico", String(metrics.criticalProducts), "Productos bajos o agotados", "alert", "orange", `<div class="progress orange"><span style="width: ${Math.min(100, metrics.criticalProducts * 18)}%"></span></div><button class="metric-link" type="button" data-tab="stock-alerts">Ver alertas →</button>`)}
    </section>

    <section class="dashboard-grid">
      <div class="dashboard-left-stack">
        <div class="panel alert-panel">
          <div class="panel-header">
            <div>
              <h2>${icon("monitor")} Alertas activas <span class="counter-badge">${metrics.criticalProducts}</span></h2>
              <p>Productos que necesitan revision o surtido.</p>
            </div>
          </div>
          <div class="product-alerts">
            ${shownCritical.length ? shownCritical.map(renderAlertProductRow).join("") : renderEmptyState("Inventario en orden", "No hay productos en nivel critico.")}
          </div>
          <button class="section-link" type="button" data-tab="stock-alerts">Ver todas las alertas →</button>
        </div>

        ${renderSmartSummary(metrics, critical, cash)}
      </div>

      <div class="panel movement-panel">
        <div class="panel-header">
          <div>
            <h2>${icon("monitor")} Movimientos recientes</h2>
            <p>Ventas, caja e inventario.</p>
          </div>
          ${hasPermission("history") ? `<button class="section-link movement-view-all" type="button" data-tab="history">Ver todos →</button>` : ""}
        </div>
        <div class="recent-movement-list">
          ${
            recentMovements.length
              ? recentMovements.map(renderRecentMovementCard).join("")
              : `<div class="empty">Cuando vendas o actualices inventario aparecera aqui.</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderRecentMovementCard(movement) {
  const style = recentMovementStyle(movement);
  const detail = recentMovementSideValue(movement);

  return `
    <div class="recent-movement ${style.tone}">
      <div class="movement-icon">${icon(style.iconName)}</div>
      <div>
        <strong>${formatMovementDescription(movement.description)}</strong>
        <span>${formatDate(movement.createdAt)}${movement.amount ? ` · ${formatCurrency(movement.amount)}` : ""}</span>
      </div>
      <span class="movement-side">${detail || "›"}</span>
    </div>
  `;
}

function recentMovementStyle(movement) {
  const text = `${movement.type || ""} ${movement.description || ""}`.toLowerCase();
  if (text.includes("renovacion")) return { tone: "renewal", iconName: "renew" };
  if (text.includes("membresia eliminada") || text.includes("anulada") || text.includes("cancelada")) return { tone: "danger", iconName: "alert" };
  if (text.includes("membresia")) return { tone: "member", iconName: "user" };
  if (text.includes("surtido") || text.includes("inventario") || text.includes("carga")) return { tone: "stock", iconName: "inventory" };
  if (movement.type === "venta") return { tone: "sale", iconName: "cart" };
  if (movement.type === "caja") return { tone: "cash", iconName: "cash" };
  return { tone: "neutral", iconName: "monitor" };
}

function recentMovementSideValue(movement) {
  const text = movement.description || "";
  const unitMatch = text.match(/\+(\d+)/);
  const isStock = movement.type === "inventario" || text.toLowerCase().includes("surtido");
  if (isStock && unitMatch) return `+${unitMatch[1]} unidades`;
  if (movement.amount) return `+${formatCurrency(movement.amount)}`;
  return "";
}

function renderMetric(label, value, helper, iconName = "monitor", color = "blue", footer = "", statusTone = "") {
  return `
    <article class="metric ${color}">
      <div class="metric-top">
        <span>${label}${statusTone ? `<i class="state-dot ${statusTone}" aria-hidden="true"></i>` : ""}</span>
        <div class="metric-icon ${color}">${icon(iconName)}</div>
      </div>
      <strong>${value}</strong>
      <small>${helper}</small>
      ${footer}
    </article>
  `;
}

function renderAlertProductRow(product) {
  return `
    <div class="alert-product">
      ${renderProductThumbnail(product.product || product, "product-thumb")}
      <div class="product-info">
        <div>
          <strong>${product.name}</strong>
          <span>${product.text}</span>
        </div>
        <div class="stock-progress">
          <div class="progress ${product.tone === "bad" ? "red" : "orange"}"><span style="width:${product.progress}%"></span></div>
        </div>
      </div>
      <div class="product-side">
        ${renderStatusBadge(product.badge, product.tone)}
        <span>${product.count}</span>
      </div>
    </div>
  `;
}

function renderSmartSummary(metrics = getMetrics(), critical = [], cash = state.cashRegister) {
  const cashOpen = cash?.status === "abierta";
  const criticalNames = critical.slice(0, 2).map((product) => product.name.toLowerCase()).join(" y ");
  const salesLine = metrics.totalSales > 0
    ? `Hoy llevas ${formatCurrency(metrics.totalSales)} en ventas y ${metrics.soldItems} productos vendidos.`
    : "Hoy no hay ventas registradas.";
  const inventoryLine = metrics.criticalProducts > 0
    ? `Hay ${metrics.criticalProducts} productos en inventario critico.${criticalNames ? ` Se recomienda surtir ${criticalNames}.` : ""}`
    : "El inventario no tiene alertas criticas.";
  const cashLine = cashOpen
    ? `La caja esta abierta desde ${formatDate(cash.openedAt)}.`
    : "La caja esta cerrada. Abre caja para comenzar ventas.";

  return `
    <section class="panel smart-summary">
      <div class="summary-copy">
        <div class="summary-icon">${icon("bulb")}</div>
        <div>
          <h2>Resumen inteligente ✨</h2>
          <p>${salesLine} ${inventoryLine} ${cashLine}</p>
        </div>
      </div>
    </section>
  `;
}

function renderActionButtonCard(title, subtitle, iconName) {
  return `<button class="action-card interactive-card" type="button">${icon(iconName)}<span><strong>${title}</strong><small>${subtitle}</small></span></button>`;
}

function renderComingSoon() {
  return renderSectionPanel("Modulo en preparacion", "Esta vista queda reservada para la siguiente fase.", renderEmptyState("Proximamente", "La estructura visual ya esta lista para conectar este modulo."));
}

function renderProductSearch() {
  return `
    <section class="panel product-search-panel">
      <div class="panel-header">
        <div>
          <h2>${icon("search")} Buscar producto</h2>
          <p>Consulta productos, cantidad disponible, precio y costo sin entrar al inventario.</p>
        </div>
      </div>
      <div class="product-search-box">
        ${icon("search")}
        <input id="product-search-input" type="search" placeholder="Buscar por producto, SKU o categoria" autocomplete="off" />
      </div>
      <div class="product-search-grid" id="product-search-results">
        ${state.products.map(renderProductSearchCard).join("")}
      </div>
      <div class="empty-state product-search-empty" id="product-search-empty">
        ${icon("alert")}
        <strong>Sin resultados</strong>
        <span>No encontramos productos con esa busqueda.</span>
      </div>
    </section>
  `;
}

function renderProductSearchCard(product) {
  const status = getProductStatus(product);
  const searchText = [product.name, product.sku, product.category, product.supplier].join(" ").toLowerCase();

  return `
    <article class="product-search-card" data-product-search="${searchText}">
      ${renderProductThumbnail(product)}
      <div class="product-search-info">
        <strong>${product.name}</strong>
        <span>${product.category} · ${product.sku || "Sin SKU"}</span>
      </div>
      <div class="product-search-meta">
        <span>Cantidad</span>
        <strong>${product.quantity}</strong>
      </div>
      <div class="product-search-meta">
        <span>Precio</span>
        <strong>${formatCurrency(product.salePrice)}</strong>
      </div>
      <div class="product-search-meta">
        <span>Costo</span>
        <strong>${formatCurrency(product.purchaseCost)}</strong>
      </div>
      ${renderStatusBadge(status.label, status.tone)}
    </article>
  `;
}

function renderMemberships() {
  const members = [...state.members].sort((a, b) => new Date(getMembershipStatus(a).expiresAt) - new Date(getMembershipStatus(b).expiresAt));
  const active = members.filter((member) => getMembershipStatus(member).tone === "ok").length;
  const expiring = members.filter((member) => getMembershipStatus(member).tone === "warn").length;
  const expired = members.filter((member) => getMembershipStatus(member).tone === "bad").length;
  const today = toDateKey(new Date());

  return `
    <section class="memberships-shell">
      <section class="membership-stats">
        ${renderMembershipStat("Membresias activas", String(active), "Miembros al dia", "user", "active")}
        ${renderMembershipStat("Proximas a vencer", String(expiring), "Vencen en 5 dias o menos", "alert", "warning")}
        ${renderMembershipStat("Vencidas", String(expired), "Requieren renovacion", "history", "expired")}
        ${renderMembershipStat("Total miembros", String(members.length), "Registrados en el gym", "inventory", "total")}
      </section>

      <section class="panel membership-form-panel">
        <div class="membership-section-header">
          <span class="membership-section-icon">${icon("user")}</span>
          <div>
            <h2>Registrar membresia</h2>
            <p>Agrega los datos del miembro. Cada registro suma ${formatCurrency(MEMBERSHIP_PRICE)} COP a caja.</p>
          </div>
          <strong>${formatCurrency(MEMBERSHIP_PRICE)} COP</strong>
        </div>
        <form id="member-form" class="member-form" novalidate>
          ${membershipFormFields({ acquiredAt: today }, "member")}
          <div class="actions">
            <button class="button membership-save-button" type="submit">${icon("wallet")}<span>Guardar membresia</span></button>
          </div>
        </form>
      </section>

      <section class="panel membership-list-panel">
        <div class="membership-section-header compact">
          <span class="membership-section-icon">${icon("user")}</span>
          <div>
            <h2>Miembros del gym</h2>
            <p>Estado de membresias, vencimientos y datos de contacto.</p>
          </div>
        </div>
        <div class="member-list">
          ${members.length ? members.map(renderMemberCard).join("") : renderEmptyState("Aun no hay miembros registrados", "Registra la primera membresia para comenzar a llevar el control del gimnasio.")}
        </div>
      </section>
    </section>
  `;
}

function renderMembershipStat(title, value, helper, iconName, tone) {
  return `
    <article class="membership-stat-card ${tone}">
      <span class="membership-stat-icon">${icon(iconName)}</span>
      <div>
        <span>${title}</span>
        <strong>${value}</strong>
        <small>${helper}</small>
      </div>
    </article>
  `;
}

function renderMemberCard(member) {
  const status = getMembershipStatus(member);
  const contact = [
    member.phone || "Sin telefono",
    member.documentId ? `ID ${member.documentId}` : "Sin documento",
  ].join(" · ");

  return `
    <article class="member-card membership-member-card">
      <div class="member-left">
        <div class="member-avatar">${memberInitials(member.name)}</div>
        <div class="member-main">
          <strong>${member.name}</strong>
          <span>${member.plan} · ${contact}</span>
          ${member.email ? `<small>${member.email}</small>` : ""}
          ${member.notes ? `<small>${member.notes}</small>` : ""}
        </div>
      </div>
      <div class="member-center">
        <div class="member-date">
          <span>Adquisicion</span>
          <strong>${formatShortDate(member.acquiredAt)}</strong>
        </div>
        <div class="member-date">
          <span>Vence</span>
          <strong>${formatShortDate(status.expiresAt)}</strong>
        </div>
        <div class="member-date">
          <span>Plan activo</span>
          <strong>${member.plan}</strong>
        </div>
      </div>
      <div class="member-right">
        <div class="member-status">
          ${renderStatusBadge(status.label, status.tone)}
          <small>${status.helper}</small>
        </div>
        <div class="member-actions">
          <button class="member-action edit" type="button" data-edit-member="${member.id}">${icon("edit")}<span>Editar</span></button>
          <button class="member-action renew" type="button" data-renew-member="${member.id}">${icon("renew")}<span>Renovar</span></button>
          <button class="member-action delete" type="button" data-delete-member="${member.id}">${icon("trash")}<span>Eliminar</span></button>
        </div>
      </div>
    </article>
  `;
}

function getMembershipStatus(member) {
  const expiresAt = getMembershipExpiration(member);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiresAt}T12:00:00`);
  const daysLeft = Math.ceil((expiry - today) / 86400000);

  if (daysLeft < 0) return { expiresAt, daysLeft, tone: "bad", label: "Vencida", helper: `Vencida hace ${Math.abs(daysLeft)} dias` };
  if (daysLeft === 0) return { expiresAt, daysLeft, tone: "warn", label: "Por vencer", helper: "Vence hoy" };
  if (daysLeft <= 5) return { expiresAt, daysLeft, tone: "warn", label: "Por vencer", helper: `Faltan ${daysLeft} dias` };
  return { expiresAt, daysLeft, tone: "ok", label: "Activa", helper: `Faltan ${daysLeft} dias` };
}

function getMembershipExpiration(member) {
  if (member.expiresAt) return member.expiresAt;
  if (member.endDate) return member.endDate;
  return addMonths(member.acquiredAt, membershipPlanMonths(member.plan));
}

function membershipPlanMonths(plan = "Mensual") {
  if (plan === "Trimestral") return 3;
  if (plan === "Semestral") return 6;
  if (plan === "Anual") return 12;
  return 1;
}

function membershipPlanOptions() {
  return [
    { value: "Mensual", label: "Mensual" },
    { value: "Mensual VIP", label: "Mensual VIP" },
    { value: "Estudiante", label: "Estudiante" },
    { value: "Trimestral", label: "Trimestral" },
    { value: "Semestral", label: "Semestral" },
    { value: "Anual", label: "Anual" },
  ];
}

function memberInitials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "BF";
}

function membershipInput(id, label, placeholder, type = "text", required = false, value = "", fieldName = id) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input id="${id}" name="${fieldName}" type="${type}" placeholder="${placeholder}" value="${escapeAttribute(value)}" ${required ? "required" : ""} autocomplete="off" />
    </div>
  `;
}

function membershipFormFields(member = {}, prefix = "member") {
  return `
    ${membershipInput(`${prefix}Name`, "Nombre completo", "Nombre del miembro", "text", true, member.name || "", "memberName")}
    ${membershipInput(`${prefix}Phone`, "Telefono", "Opcional", "text", false, member.phone || "", "memberPhone")}
    ${membershipInput(`${prefix}Document`, "Documento / ID", "Opcional", "text", false, member.documentId || "", "memberDocument")}
    ${membershipInput(`${prefix}Email`, "Correo", "Opcional", "email", false, member.email || "", "memberEmail")}
    <div class="field">
      <label for="${prefix}Plan">Plan</label>
      ${renderPremiumSelect(`${prefix}Plan`, "memberPlan", membershipPlanOptions(), true, member.plan || "Mensual")}
    </div>
    <div class="field">
      <label for="${prefix}AcquiredAt">Fecha de adquisicion</label>
      <input id="${prefix}AcquiredAt" name="memberAcquiredAt" type="date" value="${member.acquiredAt || toDateKey(new Date())}" required />
    </div>
    <div class="field member-notes-field">
      <label for="${prefix}Notes">Notas</label>
      <input id="${prefix}Notes" name="memberNotes" type="text" placeholder="Objetivo, horario, observaciones" value="${escapeAttribute(member.notes || "")}" />
    </div>
  `;
}

function addMonths(dateValue, months) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return toDateKey(date);
}

function renderInventory() {
  const canManageInventory = hasPermission("inventory-edit");

  return `
    <section class="inventory-shell">
      <section class="panel inventory-control-center">
        <div class="panel-header inventory-control-header">
          <div>
            <h2>${icon("inventory")} Centro de gestión de inventario</h2>
            <p>Crea, edita, elimina, consulta y surte productos desde un solo lugar.</p>
          </div>
          ${canManageInventory ? `<button class="button" type="button" id="open-new-product">${icon("inventory")}<span>Agregar producto</span></button>` : ""}
        </div>
        ${renderInventoryStats()}
        <div class="inventory-search-row">
          <div class="product-search-box inventory-search-box">
            ${icon("search")}
            <input id="product-search-input" type="search" placeholder="Buscar por producto, SKU, categoria, estado o proveedor" autocomplete="off" />
          </div>
          <div class="inventory-search-hint">${icon("alert")} Las alertas se construyen con cantidad mínima e ideal.</div>
        </div>
      </section>
      <section class="panel inventory-management-panel">
        <div class="panel-header">
          <div>
            <h2>Productos registrados</h2>
            <p>${state.products.length} referencias activas o controladas.</p>
          </div>
        </div>
        <div class="notice permission-notice">${icon("inventory")} ${canManageInventory ? "Cada cambio de producto queda registrado automáticamente en historial de movimientos." : "Vista de consulta: tu rol puede revisar cantidades, precios, costos y estado de stock."}</div>
        ${renderInventoryManagementGrid(canManageInventory)}
        <div class="empty-state product-search-empty" id="product-search-empty">
          ${icon("alert")}
          <strong>Sin productos</strong>
          <span>No encontramos productos con esa búsqueda.</span>
        </div>
      </section>
    </section>
  `;
}

function renderInventoryStats() {
  const activeProducts = state.products.filter(isActiveProduct);
  const criticalProducts = activeProducts.filter((product) => product.quantity <= product.minQuantity);
  const outOfStock = criticalProducts.filter((product) => product.quantity === 0).length;
  const totalUnits = activeProducts.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
  const inventoryValue = activeProducts.reduce((sum, product) => {
    if (Number(product.purchaseCostTotal || 0) > 0) return sum + Number(product.purchaseCostTotal);
    return sum + Number(product.quantity || 0) * Number(product.purchaseCost || 0);
  }, 0);

  return `
    <div class="inventory-stats">
      <article class="products"><span class="inventory-stat-icon products">${icon("inventory")}</span><span>Productos</span><strong>${activeProducts.length}</strong><small>Activos</small></article>
      <article class="units"><span class="inventory-stat-icon units">${icon("sales")}</span><span>Unidades</span><strong>${totalUnits}</strong><small>Disponibles</small></article>
      <article class="alerts"><span class="inventory-stat-icon alerts">${icon("alert")}</span><span>Alertas</span><strong>${criticalProducts.length}</strong><small>${outOfStock} agotados</small></article>
      <article class="value"><span class="inventory-stat-icon value">${icon("profit")}</span><span>Costo total</span><strong>${formatCurrency(inventoryValue)}</strong><small>Valor inventario</small></article>
    </div>
  `;
}

function renderInventoryManagementGrid(canManageInventory) {
  return `
    <div class="inventory-product-grid">
      ${state.products
        .slice()
        .sort((a, b) => Number(!isActiveProduct(a)) - Number(!isActiveProduct(b)) || a.name.localeCompare(b.name))
        .map((product) => renderInventoryProductCard(product, canManageInventory))
        .join("")}
    </div>
  `;
}

function renderInventoryProductCard(product, canManageInventory) {
  const status = getProductStatus(product);
  const progress = product.idealQuantity ? Math.min(100, Math.round((product.quantity / product.idealQuantity) * 100)) : 0;
  const searchText = [product.name, product.sku, product.category, product.supplier, status.label, product.status].join(" ").toLowerCase();

  return `
    <article class="inventory-product-card interactive-card" data-product-search="${searchText}" data-inventory-product>
      <div class="inventory-product-main">
        ${renderProductThumbnail(product)}
        <div>
          <strong>${product.name}</strong>
          <span>${product.sku || "Sin SKU"} · ${product.category || "Sin categoría"}</span>
        </div>
      </div>
      <div class="inventory-product-cell"><span>Cantidad</span><strong>${product.quantity}</strong></div>
      <div class="inventory-product-cell"><span>Costo</span><strong>${formatCurrency(product.purchaseCost)}</strong></div>
      <div class="inventory-product-cell"><span>Precio</span><strong>${formatCurrency(product.salePrice)}</strong></div>
      <div class="inventory-product-cell"><span>Mín / ideal</span><strong>${product.minQuantity} / ${product.idealQuantity}</strong></div>
      <div class="inventory-product-state">
        ${renderStatusBadge(status.label, status.tone)}
        <div class="inventory-product-stock">
          <div class="progress ${status.tone === "bad" ? "red" : status.tone === "warn" ? "orange" : ""}"><span style="width:${progress}%"></span></div>
          <small>${product.supplier ? product.supplier : `Alerta ${product.minQuantity} · ideal ${product.idealQuantity}`}</small>
        </div>
        ${
          canManageInventory
            ? `<div class="table-actions">
                <button class="button secondary" type="button" data-edit-product="${product.id}">Editar</button>
                <button class="button secondary" type="button" data-stock-product="${product.id}">+ Surtir</button>
                <button class="button danger-outline" type="button" data-delete-product="${product.id}">Eliminar</button>
              </div>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderStockAlerts(embedded = false) {
  const criticalProducts = state.products
    .filter((product) => isActiveProduct(product) && product.quantity <= product.minQuantity)
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  const outOfStock = criticalProducts.filter((product) => product.quantity === 0).length;
  const lowStock = criticalProducts.length - outOfStock;

  return `
    <section class="panel stock-alerts-panel">
      <div class="panel-header stock-alerts-header">
        <div>
          <h2>${icon("alert")} Alertas de stock bajo</h2>
          <p>Productos agotados o por debajo de la cantidad mínima recomendada.</p>
        </div>
        ${embedded ? "" : `<button class="button secondary" type="button" data-tab="monitor">← Volver al inicio</button>`}
      </div>
      <div class="stock-alert-summary">
        <div>
          <span>Inventario crítico</span>
          <strong>${criticalProducts.length}</strong>
          <small>Productos que requieren revisión</small>
        </div>
        <div>
          <span>Agotados</span>
          <strong>${outOfStock}</strong>
          <small>Sin unidades disponibles</small>
        </div>
        <div>
          <span>Bajo stock</span>
          <strong>${lowStock}</strong>
          <small>Por debajo del mínimo</small>
        </div>
      </div>
      <div class="stock-alert-list">
        ${criticalProducts.length ? criticalProducts.map(renderStockAlertCard).join("") : renderEmptyState("Inventario en orden", "No hay productos agotados ni por debajo del mínimo.")}
      </div>
    </section>
  `;
}

function renderStockAlertCard(product) {
  const status = getProductStatus(product);
  const progress = product.idealQuantity ? Math.min(100, Math.round((product.quantity / product.idealQuantity) * 100)) : 0;
  const searchText = [product.name, product.sku, product.category, product.supplier, status.label, product.status].join(" ").toLowerCase();

  return `
    <article class="stock-alert-card" data-product-search="${searchText}">
      ${renderProductThumbnail(product, "product-thumb")}
      <div class="stock-alert-main">
        <div>
          <strong>${product.name}</strong>
          <span>${product.sku || "Sin SKU"} · ${product.category}</span>
        </div>
        <div class="stock-alert-progress">
          <div class="progress ${status.tone === "bad" ? "red" : "orange"}"><span style="width:${progress}%"></span></div>
          <small>${product.quantity} actuales · mínimo ${product.minQuantity} · ideal ${product.idealQuantity}</small>
        </div>
      </div>
      <div class="stock-alert-side">
        ${renderStatusBadge(status.tone === "bad" ? "Agotado" : "Bajo stock", status.tone)}
        <strong>${product.quantity} / ${product.idealQuantity}</strong>
        ${hasPermission("inventory-edit") ? `<button class="button secondary" type="button" data-stock-product="${product.id}">+ Surtir</button>` : ""}
      </div>
    </article>
  `;
}

function renderInventoryFileTools(alwaysOpen = false) {
  if (!alwaysOpen && !state.inventoryFilePanelOpen) return "";
  const today = state.inventoryExportDate || toDateKey(new Date());
  const fileMessage = state.inventoryFileMessage === "Selecciona primero un archivo CSV, Excel o Word."
    ? "Importa un archivo o exporta el inventario del dia seleccionado."
    : state.inventoryFileMessage;
  const exportCsv = state.inventoryExportCsv?.includes("semana_inicio") ? "" : state.inventoryExportCsv;
  const exportFileName = state.inventoryExportFileName || "body-fit-diario.csv";

  return `
    <div class="file-tools">
      <div class="file-tool-section">
        <div>
          <h3>Importar archivo</h3>
          <p>Sube CSV, Excel o Word para crear o actualizar productos.</p>
        </div>
        <div class="file-import-row">
          <input id="inventory-file" type="file" accept=".csv,.xlsx,.docx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <button class="button" type="button" id="import-inventory-file">Importar archivo</button>
        </div>
      </div>

      <div class="file-tool-section">
        <div>
          <h3>Exportar inventario</h3>
          <p>Selecciona el dia y descarga inventario actual junto con ventas del dia.</p>
        </div>
        <div class="file-export-row">
          <div class="field">
            <label for="inventory-export-date">Dia del inventario</label>
            <input id="inventory-export-date" type="date" value="${today}" />
          </div>
          <button class="button" type="button" id="export-inventory-file">Exportar Archivo</button>
        </div>
      </div>

      <div class="notice">${fileMessage}</div>
      <div class="file-help">
        Columnas recomendadas: nombre, sku, categoria, fecha_inventario, precio_venta, costo_compra, cantidad_actual, cantidad_minima, cantidad_ideal, proveedor.
      </div>
      ${
        exportCsv
          ? `
            <div class="export-preview">
              <div class="export-ready">
                <div>
                  <h2>Archivo listo</h2>
                  <p>${state.inventoryExportFileName || "inventario-body-fit.csv"}</p>
                </div>
                <div class="export-actions">
                  <button class="button" type="button" id="download-inventory-csv">Descargar Archivo</button>
                  <button class="button secondary" type="button" id="copy-inventory-csv">Copiar CSV</button>
                </div>
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function field(name, label, placeholder, type = "text", required = false) {
  const isQuantityField = ["quantity", "minQuantity", "idealQuantity", "saleQuantity"].includes(name);
  const inputType = isQuantityField ? "text" : type;
  const valueAttr = isQuantityField ? `value="${placeholder}"` : "";
  const numberAttrs = isQuantityField
    ? 'min="0" step="1" inputmode="numeric" pattern="[0-9]*"'
    : type === "number"
      ? 'min="0" step="0.01" inputmode="decimal"'
      : "";

  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${inputType}" placeholder="${placeholder}" ${valueAttr} ${required ? "required" : ""} ${numberAttrs} />
    </div>
  `;
}

function moneyField(name, label, value = 0, required = false) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="text" placeholder="0" value="${formatMoneyInput(value)}" ${required ? 'data-required="true"' : ""} inputmode="numeric" autocomplete="off" />
    </div>
  `;
}

function escapeAttribute(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function productFormField(name, label, value = "", type = "text", required = false, numeric = false) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeAttribute(value)}" ${required ? "required" : ""} ${numeric ? 'inputmode="numeric" pattern="[0-9]*"' : ""} autocomplete="off" />
    </div>
  `;
}

function renderProductsTable(canEdit = hasPermission("inventory-edit"), products = state.products, showCost = true, showSku = true, canDelete = false) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoria</th>
            <th>Precio</th>
            ${showCost ? "<th>Costo</th>" : ""}
            <th>Cantidad</th>
            <th>Min/Ideal</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map((product) => {
              const status = getProductStatus(product);
              return `
                <tr>
                  <td><strong class="${showSku ? "" : "product-name-primary"}">${product.name}</strong>${showSku ? `<br><small>${product.sku || "Sin SKU"}</small>` : ""}</td>
                  <td>${product.category}</td>
                  <td>${formatCurrency(product.salePrice)}</td>
                  ${showCost ? `<td>${formatCurrency(product.purchaseCost)}</td>` : ""}
                  <td>${product.quantity}</td>
                  <td>${product.minQuantity} / ${product.idealQuantity}</td>
                  <td>${renderStatusBadge(status.label, status.tone)}</td>
                  <td>
                    ${
                      canEdit
                        ? `<div class="table-actions">
                            <button class="button secondary" type="button" data-stock-product="${product.id}">+ Surtir</button>
                            ${canDelete ? `<button class="button danger-outline" type="button" data-delete-product="${product.id}">Eliminar</button>` : ""}
                          </div>`
                        : ""
                    }
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderNewProductModal() {
  if (!state.newProductModalOpen || !hasPermission("inventory-edit")) return "";
  const product = state.products.find((item) => item.id === state.editingProductId);
  const isEditing = Boolean(product);
  const formProduct = product || {
    name: "",
    sku: "",
    category: "",
    supplier: "",
    imageUrl: "",
    salePrice: 0,
    purchaseCost: 0,
    quantity: 0,
    minQuantity: 0,
    idealQuantity: 0,
    status: "activo",
  };
  const statusOptions = [
    { value: "activo", label: "Activo" },
    { value: "agotado", label: "Agotado" },
    { value: "inactivo", label: "Inactivo" },
    { value: "descontinuado", label: "Descontinuado" },
  ];

  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card product-modal-card" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="product-modal-title">${isEditing ? "Editar producto" : "Agregar producto"}</h2>
            <p>${isEditing ? "Actualiza categoría, cantidades, estado, costo y precio." : "Registra la referencia y su inventario inicial."}</p>
          </div>
          <button class="modal-close" type="button" data-close-product-modal aria-label="Cerrar">×</button>
        </div>
        <form id="product-form" class="product-form">
          <div class="product-photo-field">
            <div>
              <label for="productImage">Foto del producto</label>
              <span>Se mostrará como thumbnail en inventario y ventas.</span>
            </div>
            <div class="product-photo-control">
              ${renderProductThumbnail(formProduct, "product-photo-preview")}
              <input id="productImage" name="productImage" type="file" accept="image/*" />
            </div>
          </div>
          ${productFormField("name", "Nombre del producto", formProduct.name, "text", true)}
          ${productFormField("sku", "SKU", formProduct.sku, "text", true)}
          ${productFormField("category", "Categoría", formProduct.category, "text", true)}
          ${productFormField("supplier", "Proveedor", formProduct.supplier)}
          ${moneyField("salePrice", "Precio de venta", formProduct.salePrice, true)}
          ${moneyField("purchaseCost", "Costo de compra", formProduct.purchaseCost, true)}
          ${productFormField("quantity", "Cantidad actual", formProduct.quantity, "text", true, true)}
          ${productFormField("minQuantity", "Cantidad mínima", formProduct.minQuantity, "text", true, true)}
          ${productFormField("idealQuantity", "Cantidad ideal", formProduct.idealQuantity, "text", true, true)}
          <div class="field">
            <label for="productStatus">Estado</label>
            ${renderPremiumSelect("productStatus", "productStatus", statusOptions, true, formProduct.status || "activo")}
          </div>
          <div class="modal-actions product-form-actions">
            <button class="button secondary" type="button" data-close-product-modal>Cancelar</button>
            <button class="button" type="submit">${isEditing ? "Guardar cambios" : "Guardar producto"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderStockModal() {
  const product = state.products.find((item) => item.id === state.stockProductId);
  if (!product || !hasPermission("inventory-edit")) return "";

  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="stock-modal-title">Surtir producto</h2>
            <p>Registra la cantidad que ingresa al inventario.</p>
          </div>
          <button class="modal-close" type="button" data-close-stock-modal aria-label="Cerrar">×</button>
        </div>
        <div class="stock-product-summary">
          ${renderProductThumbnail(product)}
          <div>
            <strong>${product.name}</strong>
            <span>SKU: ${product.sku || "Sin SKU"}</span>
          </div>
          <div>
            <span>Cantidad actual</span>
            <strong>${product.quantity}</strong>
          </div>
        </div>
        <form id="stock-form" class="stock-form">
          <div class="field">
            <label for="stockAmount">Cantidad a agregar</label>
            <input id="stockAmount" name="stockAmount" type="text" value="0" inputmode="numeric" pattern="[0-9]*" required autocomplete="off" />
          </div>
          <div class="modal-actions">
            <button class="button secondary" type="button" data-close-stock-modal>Cancelar</button>
            <button class="button" type="submit">Confirmar surtido</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderSaleConfirmationModal() {
  const sale = state.pendingSale;
  if (!sale) return "";
  const items = (sale.items || []).map((item) => {
    const product = state.products.find((productItem) => productItem.id === item.productId);
    if (!product) return null;
    return { product, quantity: item.quantity, subtotal: product.salePrice * item.quantity };
  }).filter(Boolean);
  if (!items.length) return "";
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const units = items.reduce((sum, item) => sum + item.quantity, 0);

  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="sale-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="sale-modal-title">Confirmar venta</h2>
            <p>Revisa los datos antes de registrar la operación.</p>
          </div>
          <button class="modal-close" type="button" data-cancel-sale aria-label="Cerrar">×</button>
        </div>
        <div class="sale-confirmation-summary">
          <div><span>Productos</span><strong>${items.length}</strong></div>
          <div><span>Unidades</span><strong>${units}</strong></div>
          <div><span>Pago</span><strong>${paymentLabel(sale.paymentMethod)}</strong></div>
          <div><span>Total</span><strong>${formatCurrency(total)}</strong></div>
        </div>
        <div class="sale-confirmation-items">
          ${items.map((item) => `<div><span>${item.quantity} x ${item.product.name}</span><strong>${formatCurrency(item.subtotal)}</strong></div>`).join("")}
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-cancel-sale>Cancelar</button>
          <button class="button" type="button" id="confirm-sale">Confirmar venta</button>
        </div>
      </section>
    </div>
  `;
}

function renderMembershipModal() {
  if (!state.memberModalMode || !state.selectedMemberId) return "";
  const member = state.members.find((item) => item.id === state.selectedMemberId);
  if (!member) return "";

  if (state.memberModalMode === "edit") {
    return `
      <div class="modal-backdrop" role="presentation">
        <section class="modal-card membership-modal-card" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
          <div class="modal-header">
            <div>
              <h2 id="member-modal-title">${icon("edit")} Editar membresia</h2>
              <p>Actualiza los datos del miembro sin modificar caja.</p>
            </div>
            <button class="modal-close" type="button" data-close-member-modal aria-label="Cerrar">×</button>
          </div>
          <form id="member-edit-form" class="member-form membership-form" novalidate>
            ${membershipFormFields(member, "editMember")}
            <div class="modal-actions membership-modal-actions">
              <button class="button secondary" type="button" data-close-member-modal>Cancelar</button>
              <button class="button" type="submit">${icon("edit")} Guardar cambios</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  if (state.memberModalMode === "renew") {
    return `
      <div class="modal-backdrop" role="presentation">
        <section class="modal-card membership-confirm-card" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
          <div class="modal-header">
            <div>
              <h2 id="member-modal-title">${icon("renew")} Renovar membresia</h2>
              <p>Confirma el pago antes de renovar.</p>
            </div>
            <button class="modal-close" type="button" data-close-member-modal aria-label="Cerrar">×</button>
          </div>
          <div class="membership-confirm-body">
            <div class="member-avatar">${memberInitials(member.name)}</div>
            <div>
              <strong>${member.name}</strong>
              <span>Renovacion mensual por ${formatCurrency(MEMBERSHIP_PRICE)} COP.</span>
            </div>
          </div>
          <div class="notice">Esta accion suma ${formatCurrency(MEMBERSHIP_PRICE)} COP a caja y registra el movimiento del dia.</div>
          <div class="modal-actions">
            <button class="button secondary" type="button" data-close-member-modal>Cancelar</button>
            <button class="button" type="button" id="confirm-renew-member">${icon("renew")} Confirmar renovacion</button>
          </div>
        </section>
      </div>
    `;
  }

  if (state.memberModalMode === "delete") {
    return `
      <div class="modal-backdrop" role="presentation">
        <section class="modal-card membership-confirm-card" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
          <div class="modal-header">
            <div>
              <h2 id="member-modal-title">${icon("trash")} Eliminar membresia</h2>
              <p>Esta accion no se puede deshacer.</p>
            </div>
            <button class="modal-close" type="button" data-close-member-modal aria-label="Cerrar">×</button>
          </div>
          <div class="membership-confirm-body danger">
            <div class="member-avatar">${memberInitials(member.name)}</div>
            <div>
              <strong>${member.name}</strong>
              <span>Se eliminara solo el registro del miembro. La caja y los movimientos historicos se conservan.</span>
            </div>
          </div>
          <div class="modal-actions">
            <button class="button secondary" type="button" data-close-member-modal>Cancelar</button>
            <button class="button danger" type="button" id="confirm-delete-member">${icon("trash")} Eliminar membresia</button>
          </div>
        </section>
      </div>
    `;
  }

  return "";
}

function renderSettings() {
  if (!hasPermission("settings")) return renderAccessDenied();
  if (state.settingsView === "users") return renderUserManagement();
  if (state.settingsView === "files") {
    return `
      <section class="panel settings-files-panel">
        <div class="panel-header">
          <div>
            <h2>${icon("inventory")} Archivos de inventario</h2>
            <p>Importa archivos y exporta inventario por dia.</p>
          </div>
          <button class="button secondary settings-back" type="button" data-settings-view="home">← Atrás</button>
        </div>
        ${renderInventoryFileTools(true)}
      </section>
    `;
  }

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${icon("settings")} Configuracion</h2>
          <p>Herramientas administrativas del sistema.</p>
        </div>
      </div>
      <div class="settings-tabs">
        <button class="settings-tab-card interactive-card" type="button" data-settings-view="files">
          <span>${icon("inventory")}</span>
          <strong>Archivos</strong>
          <small>Importar archivos y exportar inventario diario</small>
        </button>
        <button class="settings-tab-card interactive-card" type="button" data-settings-view="users">
          <span>${icon("user")}</span>
          <strong>Usuarios y permisos</strong>
          <small>Administra accesos para Super Admin, Admin y Operador</small>
        </button>
      </div>
    </section>
  `;
}

function renderUserManagement() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${icon("user")} Usuarios y permisos</h2>
          <p>Crea accesos y asigna el nivel operativo correspondiente.</p>
        </div>
        <button class="button secondary settings-back" type="button" data-settings-view="home">← Atrás</button>
      </div>
      <form id="user-form" class="user-form">
        ${field("accountName", "Nombre del usuario", "Nombre completo", "text", true)}
        <div class="field">
          <label for="accountRole">Rol</label>
          ${renderPremiumSelect("accountRole", "accountRole", [
            { value: "admin", label: "Admin" },
            { value: "operator", label: "Operador" },
            { value: "super-admin", label: "Super Admin" },
          ])}
        </div>
        <div class="field">
          <label for="accountPassword">Contraseña inicial</label>
          <input id="accountPassword" name="accountPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Contraseña segura" required />
        </div>
        <div class="actions"><button class="button" type="submit">Crear usuario</button></div>
      </form>
      <div class="user-access-list">
        ${state.users.map(renderUserAccessCard).join("")}
      </div>
    </section>
  `;
}

function renderUserAccessCard(user) {
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  const canDelete = user.id !== state.currentUserId && user.id !== "super-admin";
  const passwordStatus = user.password ? "Contraseña configurada" : "Sin contraseña configurada";
  return `
    <article class="user-access-card">
      <div class="member-avatar">${user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
      <div>
        <strong>${user.name}</strong>
        <span>${roleLabel(user.role)} · ${permissions.length} permisos activos · ${passwordStatus}</span>
      </div>
      ${renderStatusBadge(user.role === "super-admin" ? "Acceso completo" : user.role === "admin" ? "Gestión operativa" : "Acceso limitado", user.role === "operator" ? "warn" : "ok")}
      ${canDelete ? `<button class="button secondary" type="button" data-delete-user="${user.id}">Eliminar</button>` : ""}
      <form class="user-password-form" data-password-user="${user.id}">
        <input name="newPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Nueva contraseña" required />
        <button class="button secondary" type="submit">Guardar contraseña</button>
      </form>
    </article>
  `;
}

function renderAccessDenied() {
  return renderSectionPanel("Acceso restringido", "Tu rol no tiene autorización para abrir este módulo.", renderEmptyState("Permiso requerido", "Inicia sesión con una cuenta autorizada para continuar."));
}

function renderCash() {
  const cash = state.cashRegister;
  const canEdit = hasPermission("cash-edit");
  if (!canEdit && cash?.status === "abierta") {
    return `
      <section class="metrics">
        ${renderMetric("Estado", "Abierta", `Desde ${formatDate(cash.openedAt)}`, "monitor", "blue", "", "open")}
        ${renderMetric("Efectivo", formatCurrency(cash.cashTotal), "Ventas pagadas en efectivo")}
        ${renderMetric("Transferencias", formatCurrency(cash.transferTotal), "Ventas pagadas por transferencia")}
        ${renderMetric("Esperado caja", formatCurrency(cashExpected()), "Monto inicial + efectivo - egresos")}
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Movimientos recientes</h2>
            <p>Vista de consulta de caja e inventario.</p>
          </div>
          ${renderStatusBadge("Solo lectura", "warn")}
        </div>
        ${renderMovements()}
      </section>
    `;
  }

  if (!cash || cash.status === "cerrada") {
    return `
      <section class="panel cash-open-panel">
        <div class="panel-header">
          <div>
            <h2>Abrir caja</h2>
            <p>Registra el monto inicial antes de comenzar ventas.</p>
          </div>
        </div>
        ${
          cash?.status === "cerrada"
            ? `
              <div class="notice cash-status-notice">Ultima caja cerrada con diferencia de <strong>${formatCurrency(cash.difference)}</strong>.</div>
              ${canEdit ? `
                <div class="cash-option-grid">
                  <button class="button secondary" type="button" id="reopen-cash">
                    <strong>Reabrir caja</strong>
                    <span>Volver a corrección</span>
                  </button>
                  <button class="button danger" type="button" id="delete-cash">
                    <strong>Eliminar caja</strong>
                    <span>Abrir una nueva</span>
                  </button>
                </div>
              ` : ""}
            `
            : ""
        }
        <form id="open-cash-form" class="cash-open-form" novalidate>
          ${moneyField("initialAmount", "Monto inicial", 0, true)}
          <div class="actions">
            <button class="button" type="submit">
              <strong>Abrir caja</strong>
              <span>Iniciar operaciones</span>
            </button>
          </div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Movimientos recientes</h2>
            <p>Historial operativo del dia.</p>
          </div>
        </div>
        ${renderMovements()}
      </section>
    `;
  }

  return `
    <section class="metrics">
      ${renderMetric("Estado", "Abierta", `Desde ${formatDate(cash.openedAt)}`, "monitor", "blue", "", "open")}
      ${renderMetric("Efectivo", formatCurrency(cash.cashTotal), "Ventas pagadas en efectivo")}
      ${renderMetric("Transferencias", formatCurrency(cash.transferTotal), "Ventas pagadas por transferencia")}
      ${renderMetric("Esperado caja", formatCurrency(cashExpected()), "Monto inicial + efectivo - egresos")}
    </section>
    <section class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Cierre de caja</h2>
            <p>Registra dinero contado para calcular diferencia.</p>
          </div>
        </div>
        <div class="cash-admin">
          <div class="notice">Monto inicial registrado: <strong>${formatCurrency(cash.initialAmount)}</strong></div>
          <form id="edit-cash-form" class="cash-edit-row" novalidate>
            ${moneyField("correctedInitialAmount", "Corregir monto inicial", cash.initialAmount, true)}
            <div class="field">
              <label for="cashCorrectionReason">Motivo</label>
              <input id="cashCorrectionReason" name="cashCorrectionReason" type="text" placeholder="Digitación, corrección..." />
            </div>
            <div class="actions">
              <button class="button secondary" type="submit">Actualizar monto</button>
              <button class="button danger" type="button" id="void-cash">Anular caja</button>
            </div>
          </form>
        </div>
        <form id="close-cash-form" class="cash-close-row" novalidate>
          ${moneyField("countedAmount", "Dinero contado", 0, true)}
          <div class="field">
            <label for="cashNotes">Observaciones</label>
            <textarea id="cashNotes" name="cashNotes" placeholder="Opcional"></textarea>
          </div>
          <div class="actions">
            <button class="button danger" type="submit">Cerrar caja</button>
          </div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Movimientos recientes</h2>
            <p>Actividad de caja e inventario.</p>
          </div>
        </div>
        ${renderMovements()}
      </div>
    </section>
  `;
}

function renderPos() {
  const cash = state.cashRegister;
  const cashOpen = state.cashRegister?.status === "abierta";
  const sellableProducts = state.products.filter((product) => product.quantity > 0 && product.status === "activo");
  const productOptions = sellableProducts.map((product) => ({
    value: product.id,
    label: product.name,
  }));
  const paymentOptions = [
    { value: "cash", label: "Efectivo" },
    { value: "transfer", label: "Transferencia" },
  ];

  return `
    <section class="sales-workspace">
      <div class="sales-header">
        <div>
          <h1>VENTAS</h1>
        </div>
      </div>

      ${renderSalesDaySummary(cash)}

      <div class="sales-pos-layout">
        <div class="sales-right-stack">
          ${renderSalesCashPopup(cash)}
          <details class="panel sales-cart-panel sale-new-card" ${state.saleNewPanelOpen ? "open" : ""}>
            <summary class="sale-new-summary">
              <span class="action-card-icon sale-icon" aria-hidden="true">
                ${icon("cart")}
                <em>+</em>
              </span>
              <span class="summary-title">Venta Nueva</span>
              ${cashOpen ? renderStatusBadge("Caja abierta", "ok") : renderStatusBadge("Caja cerrada", "bad")}
              <i>⌄</i>
            </summary>
            <div class="sale-new-content">
              <div class="sale-new-module-header">
                <h2>Ventas</h2>
                <p>Agrega productos y registra la venta.</p>
              </div>
              ${cashOpen ? "" : `<div class="notice">Debes abrir caja antes de registrar ventas. Usa la planilla de caja a la izquierda.</div>`}
              <form id="sale-add-form" class="cart-add-form" novalidate>
                <div class="field">
                  <label for="productId">Producto</label>
                  ${renderPremiumSelect("productId", "productId", productOptions, cashOpen && productOptions.length > 0)}
                </div>
                <div class="field">
                  <label for="saleQuantity">Cantidad</label>
                  <div class="quantity-stepper">
                    <button class="button secondary" type="button" data-sale-qty-step="-1">−</button>
                    <input id="saleQuantity" name="saleQuantity" type="text" value="1" inputmode="numeric" pattern="[0-9]*" required />
                    <button class="button secondary" type="button" data-sale-qty-step="1">+</button>
                  </div>
                </div>
                <div class="field">
                  <label for="paymentMethod">Pago</label>
                  ${renderPremiumSelect("paymentMethod", "paymentMethod", paymentOptions, cashOpen, state.salePaymentMethod)}
                </div>
                <div class="actions">
                  <button class="button sales-submit" type="submit" ${cashOpen ? "" : "disabled"}>+ Agregar</button>
                </div>
              </form>
              ${renderSaleCart()}
            </div>
          </details>
        </div>
        ${renderSalesDailyRegister()}
      </div>
    </section>
  `;
}

function renderSalesDaySummary(cash) {
  const metrics = getMetrics();
  const today = new Date();
  const cashOpen = cash?.status === "abierta";
  const cashTotal = cash?.cashTotal || 0;
  const transferTotal = cash?.transferTotal || 0;
  const totalSales = metrics.totalSales || 0;
  const cashPercent = totalSales ? `${Math.round((cashTotal / totalSales) * 100)}% del total` : "Recibido hoy";
  const transferPercent = totalSales ? `${Math.round((transferTotal / totalSales) * 100)}% del total` : "Recibido hoy";

  return `
    <section class="panel sales-day-summary" id="sales-cash-sheet">
      <div class="sales-day-heading">
        <div class="sales-day-title">
          <h2>Resumen del día</h2>
          <span>${icon("calendar")}${formatLongDate(today)}</span>
        </div>
        <div class="sales-day-status ${cashOpen ? "ok" : "bad"}">
          <span>${cashOpen ? "Caja abierta" : "Caja cerrada"}</span>
          <i>⌄</i>
        </div>
      </div>
      <div class="sales-summary-cards">
        ${renderSummaryMetricCard("Total del día", formatCurrency(totalSales), "Ventas totales", "profit", "green")}
        ${renderSummaryMetricCard("Efectivo", formatCurrency(cashTotal), cashPercent, "cash", "mint")}
        ${renderSummaryMetricCard("Transferencias", formatCurrency(transferTotal), transferPercent, "transfer", "blue")}
        ${renderSummaryMetricCard("Ventas registradas", metrics.saleCount, "Operaciones", "receipt", "purple")}
        ${renderSummaryMetricCard("Esperado en caja", formatCurrency(cashExpected()), cashOpen ? `Desde ${formatDate(cash.openedAt)}` : "Sin caja abierta", "history", "orange")}
      </div>
    </section>
  `;
}

function renderSummaryMetricCard(label, value, helper, iconName, tone) {
  return `
    <article class="summary-card ${tone}">
      <span class="summary-card-icon">${icon(iconName)}</span>
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${helper}</small>
    </article>
  `;
}

function renderSalesDailyRegister() {
  const records = todaySaleRecords().slice(0, 8);
  const totalRecords = todaySaleRecords().length;

  return `
    <section class="panel sales-day-register">
      <div class="sales-register-titlebar">
        <span class="sales-register-module-icon">${icon("receipt")}</span>
        <div>
          <h2>Registro del día</h2>
          <p>Ventas recientes registradas hoy</p>
        </div>
      </div>
      ${
        records.length
          ? `
            <div class="sales-register-table">
              <div class="sales-register-head">
                <span>Registro <i>↕</i></span>
                <span>Valor <i>↕</i></span>
                <span>Fecha / hora <i>↕</i></span>
                <span>Tipo de venta <i>↕</i></span>
              </div>
              ${records.map((record, index) => renderSalesRegisterRow(record, totalRecords - index)).join("")}
            </div>
          `
          : renderEmptyState("Sin ventas hoy", "Cuando registres una venta aparecera en esta planilla.")
      }
    </section>
  `;
}

function renderSalesRegisterRow(record, sequence) {
  return `
    <article class="sales-register-row">
      <div class="register-id-cell">
        <span class="register-row-icon">${icon("receipt")}</span>
        <strong>#${String(sequence).padStart(2, "0")}</strong>
      </div>
      <strong class="register-value">${formatCurrency(record.total)}</strong>
      <span class="register-date">${formatDate(record.createdAt)}</span>
      <div class="register-payment-cell">
        ${renderPaymentBadge(record.paymentMethod)}
        <span class="register-units">· ${record.quantity} uds.</span>
      </div>
    </article>
  `;
}

function saleCartItems() {
  return (state.saleCart || [])
    .map((item) => {
      const product = state.products.find((productItem) => productItem.id === item.productId);
      if (!product) return null;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      return {
        product,
        quantity,
        subtotal: product.salePrice * quantity,
      };
    })
    .filter(Boolean);
}

function saleCartTotal() {
  return saleCartItems().reduce((sum, item) => sum + item.subtotal, 0);
}

function renderSaleCart() {
  const items = saleCartItems();
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  return `
    <div class="sale-cart">
      <div class="sale-cart-header">
        <h3>Carrito (${items.length})</h3>
        ${items.length ? `<button class="cart-clear" type="button" id="clear-sale-cart">Vaciar carrito</button>` : ""}
      </div>
      ${
        items.length
          ? `
            <div class="cart-list">
              ${items.map(renderSaleCartItem).join("")}
            </div>
            <div class="cart-total">
              <div>
                <span>Total a pagar</span>
                <small>${items.length} productos · ${totalUnits} unidades</small>
              </div>
              <strong>${formatCurrency(saleCartTotal())}</strong>
            </div>
            <div class="cart-actions">
              <button class="button secondary" type="button" id="clear-sale-cart-secondary">Limpiar</button>
              <button class="button" type="button" id="register-cart-sale">Registrar venta</button>
            </div>
          `
          : renderEmptyState("Carrito vacío", "Agrega productos para registrar una venta múltiple.")
      }
    </div>
  `;
}

function renderSaleCartItem(item) {
  return `
    <article class="cart-item">
      ${renderProductThumbnail(item.product)}
      <div>
        <strong>${item.product.name}</strong>
        <span>${formatCurrency(item.product.salePrice)} c/u</span>
      </div>
      <div class="cart-item-qty">
        <button class="button secondary" type="button" data-cart-qty="${item.product.id}" data-cart-delta="-1">−</button>
        <span>${item.quantity}</span>
        <button class="button secondary" type="button" data-cart-qty="${item.product.id}" data-cart-delta="1">+</button>
      </div>
      <strong>${formatCurrency(item.subtotal)}</strong>
      <button class="cart-remove" type="button" data-cart-remove="${item.product.id}">Eliminar</button>
    </article>
  `;
}

function renderSalesCashSheet(cash) {
  const cashOpen = cash?.status === "abierta";
  const canEdit = hasPermission("cash-edit");

  return `
    <aside class="panel sales-cash-sheet" id="sales-cash-sheet">
      <div class="sales-cash-title">
        <div>
          <span>Planilla de caja</span>
          <h2>${cashOpen ? "Caja abierta" : cash?.status === "cerrada" ? "Caja cerrada" : "Sin abrir"}</h2>
        </div>
        <i class="state-dot ${cashOpen ? "open" : "closed"}"></i>
      </div>

      <div class="cash-sheet-grid">
        <div><span>Estado</span><strong>${cashOpen ? "Abierta" : cash?.status === "cerrada" ? "Cerrada" : "Sin abrir"}</strong></div>
        <div><span>Monto inicial</span><strong>${formatCurrency(cash?.initialAmount || 0)}</strong></div>
        <div><span>Efectivo</span><strong>${formatCurrency(cash?.cashTotal || 0)}</strong></div>
        <div><span>Transferencias</span><strong>${formatCurrency(cash?.transferTotal || 0)}</strong></div>
        <div class="cash-sheet-total"><span>Esperado en caja</span><strong>${formatCurrency(cashExpected())}</strong></div>
      </div>

      ${!cash || cash.status === "cerrada" ? renderSalesCashOpenControls(cash, canEdit) : renderSalesCashCloseControls(cash, canEdit)}
    </aside>
  `;
}

function renderSalesCashOpenControls(cash, canEdit) {
  return `
    <div class="sales-cash-controls">
      ${cash?.status === "cerrada" ? `<div class="notice cash-status-notice">Última caja cerrada con diferencia de <strong>${formatCurrency(cash.difference)}</strong>.</div>` : ""}
      ${
        cash?.status === "cerrada" && canEdit
          ? `
            <div class="cash-option-grid compact-cash-options">
              <button class="button secondary" type="button" id="reopen-cash">
                <strong>Reabrir caja</strong>
                <span>Volver a corrección</span>
              </button>
              <button class="button danger" type="button" id="delete-cash">
                <strong>Eliminar caja</strong>
                <span>Abrir una nueva</span>
              </button>
            </div>
          `
          : ""
      }
      <form id="open-cash-form" class="sales-open-cash-form" novalidate>
        ${moneyField("initialAmount", "Monto inicial", 0, true)}
        <button class="button" type="submit">Abrir caja</button>
      </form>
    </div>
  `;
}

function renderSalesCashCloseControls(cash, canEdit) {
  if (!canEdit) {
    return `<div class="notice cash-status-notice">Caja abierta desde <strong>${formatDate(cash.openedAt)}</strong>. Las ventas se registran automáticamente.</div>`;
  }

  return `
    <details class="sales-cash-control-panel">
      <summary>
        <span>Controles de caja</span>
        <i>⌄</i>
      </summary>
      <div class="sales-cash-control-body">
        ${renderSalesCashCloseControlsBody(cash)}
      </div>
    </details>
  `;
}

function renderSalesCashCloseControlsBody(cash) {
  return `
    <div class="notice">Monto inicial registrado: <strong>${formatCurrency(cash.initialAmount)}</strong></div>
    <form id="edit-cash-form" class="sales-cash-edit-form" novalidate>
      ${moneyField("correctedInitialAmount", "Corregir monto inicial", cash.initialAmount, true)}
      <div class="field">
        <label for="cashCorrectionReason">Motivo</label>
        <input id="cashCorrectionReason" name="cashCorrectionReason" type="text" placeholder="Digitación, corrección..." />
      </div>
      <button class="button secondary" type="submit">Actualizar monto</button>
      <button class="button danger" type="button" id="void-cash">Anular caja</button>
    </form>
    <form id="close-cash-form" class="sales-cash-close-form" novalidate>
      ${moneyField("countedAmount", "Dinero contado", 0, true)}
      <div class="field">
        <label for="cashNotes">Observaciones</label>
        <textarea id="cashNotes" name="cashNotes" placeholder="Opcional"></textarea>
      </div>
      <button class="button danger" type="submit">Cerrar caja</button>
    </form>
  `;
}

function renderSalesCashPopup(cash) {
  const cashOpen = cash?.status === "abierta";
  const canEdit = hasPermission("cash-edit");

  return `
    <details class="sales-cash-popover">
      <summary class="sales-cash-popover-trigger">
        <span class="action-card-icon cash-icon" aria-hidden="true">
          ${icon("cash")}
          <em>$</em>
        </span>
        <span class="summary-title">Caja</span>
        <strong>${cashOpen ? "Abierta" : "Cerrada"}</strong>
        <i>⌄</i>
      </summary>
      <div class="sales-cash-popover-panel">
        <div class="sales-popover-head">
          <strong>${cashOpen ? "Controles de caja" : "Abrir caja"}</strong>
          ${renderStatusBadge(cashOpen ? "Abierta" : "Cerrada", cashOpen ? "ok" : "bad")}
        </div>
        <div class="sales-popover-control-body">
          ${cashOpen && !canEdit ? `<div class="notice cash-status-notice">Caja abierta desde <strong>${formatDate(cash.openedAt)}</strong>. Las ventas se registran automáticamente.</div>` : ""}
          ${!cash || cash.status === "cerrada" ? renderSalesCashOpenControls(cash, canEdit) : canEdit ? renderSalesCashCloseControlsBody(cash) : ""}
        </div>
      </div>
    </details>
  `;
}

function renderPremiumSelect(id, name, options, enabled = true, selectedValue = "") {
  const selected = options.find((option) => option.value === selectedValue) || options[0] || { value: "", label: "Sin opciones disponibles" };

  return `
    <details class="premium-select ${enabled ? "" : "disabled"}" data-premium-select data-disabled="${enabled ? "false" : "true"}">
      <summary class="premium-select-trigger" aria-label="Abrir opciones de ${name}">
        <span data-premium-select-label>${selected.label}</span>
        <span class="premium-select-chevron">⌄</span>
      </summary>
      <div class="premium-select-menu">
        <div class="premium-select-options">
          ${options
            .map(
              (option) => `
                <button class="premium-select-option ${option.value === selected.value ? "selected" : ""}" type="button" data-premium-option="${option.value}">
                  <span>${option.label}</span>
                  <i>✓</i>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <input id="${id}" name="${name}" type="hidden" value="${selected.value}" />
    </details>
  `;
}

function renderMovements() {
  const items = [...state.movements]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  if (!items.length) return `<div class="empty">Todavia no hay movimientos.</div>`;

  return `
    <div class="list">
      ${items
        .map(
          (movement) => `
            <div class="list-item">
              <strong>${formatMovementDescription(movement.description)}</strong>
              <span>${formatDate(movement.createdAt)}${movement.amount ? ` · ${formatCurrency(movement.amount)}` : ""}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderHistory() {
  const months = getHistoryMonths();
  const weeks = getHistoryWeeks(state.historyMonth);
  const selectedWeek = weeks.find((week) => week.startKey === state.historyWeekStart) || weeks[0];
  const groups = groupMovementsByDay(selectedWeek);

  return `
    <section class="panel history-panel">
      <div class="panel-header">
        <div>
          <h2>Historial de movimientos</h2>
          <p>Registro completo de caja, ventas, inventario, membres&iacute;as y sesi&oacute;n.</p>
        </div>
      </div>
      <div class="history-week-filter">
        <div class="history-week-copy">
          <div class="history-week-icon">${icon("history")}</div>
          <span>Consulta semanal</span>
          <strong>${formatHistoryWeekRange(selectedWeek)}</strong>
          <small>Selecciona el mes y la semana que deseas revisar.</small>
        </div>
        <div class="history-week-controls">
          <div class="field">
            <label for="history-month">Mes</label>
            ${renderPremiumSelect("history-month", "history-month", months.map((month) => ({ value: month.key, label: month.label })), true, state.historyMonth)}
          </div>
          <div class="field">
            <label for="history-week">Semana del mes</label>
            ${renderPremiumSelect("history-week", "history-week", weeks.map((week, index) => ({ value: week.startKey, label: `Semana ${index + 1} · ${formatHistoryWeekRange(week)}` })), true, selectedWeek.startKey)}
          </div>
        </div>
      </div>
      ${
        groups.length
          ? `<div class="history-day-list">${groups.map(renderMovementDay).join("")}</div>`
          : `<div class="empty">No hay movimientos registrados durante esta semana.</div>`
      }
    </section>
  `;
}

function groupMovementsByDay(week = null) {
  const grouped = new Map();

  [...state.movements]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((movement) => {
      const date = new Date(movement.createdAt);
      if (week && (date < week.start || date > week.end)) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!grouped.has(key)) grouped.set(key, { key, date: movement.createdAt, items: [] });
      grouped.get(key).items.push(movement);
    });

  return [...grouped.values()];
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getHistoryMonths() {
  const monthKeys = new Set([toMonthKey(new Date()), ...state.movements.map((movement) => toMonthKey(new Date(movement.createdAt)))]);
  const formatter = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

  return [...monthKeys]
    .sort()
    .reverse()
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      const label = formatter.format(new Date(year, month - 1, 1));
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
}

function startOfHistoryWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addHistoryDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function getHistoryWeeks(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);
  const weeks = [];
  let start = startOfHistoryWeek(firstDay);

  while (start <= lastDay) {
    const end = addHistoryDays(start, 6);
    end.setHours(23, 59, 59, 999);
    weeks.push({ start: new Date(start), end, startKey: toDateKey(start) });
    start = addHistoryDays(start, 7);
  }

  return weeks;
}

function formatHistoryWeekRange(week) {
  const formatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  return `${formatter.format(week.start)} - ${formatter.format(week.end)}`;
}

function renderMovementDay(group, index) {
  return `
    <details class="movement-day" ${index === 0 ? "open" : ""}>
      <summary class="movement-day-summary">
        <div class="movement-day-title">
          <h3>${formatReportDate(group.date)}</h3>
          <span>${group.items.length} ${group.items.length === 1 ? "movimiento" : "movimientos"}</span>
        </div>
        <div class="movement-day-toggle">
          <span class="movement-open-label">Ver detalle</span>
          <span class="movement-close-label">Cerrar detalle</span>
          <span class="movement-chevron">⌄</span>
        </div>
      </summary>
      <div class="movement-day-content">
        <div class="movement-day-inner">
          ${group.items.map(renderHistoryMovement).join("")}
        </div>
      </div>
    </details>
  `;
}

function renderHistoryMovement(movement) {
  const type = movement.type || "movimiento";
  const iconName = type === "venta" ? "pos" : type === "caja" ? "cash" : type === "sesion" ? "user" : type === "membresia" ? "user" : "inventory";
  const time = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(new Date(movement.createdAt));
  const userName = movement.userName || state.user?.name || "Administrador";

  return `
    <article class="history-movement">
      <div class="history-movement-icon">${icon(iconName)}</div>
      <div class="history-movement-main">
        <strong>${formatMovementDescription(movement.description)}</strong>
        <span>${time} · Usuario: ${userName}</span>
      </div>
      <div class="history-movement-side">
        <span class="history-type">${type}</span>
        ${movement.amount ? `<strong>${formatCurrency(movement.amount)}</strong>` : ""}
      </div>
    </article>
  `;
}

function renderReports() {
  if (state.reportsView === "stats") return renderGeneralStatsReports();
  if (state.reportsView === "daily") return renderDailyReports();
  if (state.reportsView === "history") {
    return `
      <section class="reports-shell">
        ${renderReportsSubHeader("Historial de movimientos", "Registro completo de movimientos del sistema.")}
        ${renderHistory()}
      </section>
    `;
  }

  return `
    <section class="reports-shell">
      <div class="dashboard-heading report-heading">
        <div>
          <h1>Reportes</h1>
          <p>Selecciona el reporte que quieres consultar.</p>
        </div>
      </div>
      <div class="reports-menu-grid">
        <button class="reports-menu-card interactive-card" type="button" data-reports-view="stats">
          <span class="reports-menu-icon">${icon("sales")}</span>
          <strong>Estadisticas generales</strong>
          <small>Ingresos, membresias, caja, metodos de pago, horarios fuertes y movimientos.</small>
        </button>
        <button class="reports-menu-card interactive-card" type="button" data-reports-view="daily">
          <span class="reports-menu-icon">${icon("sales")}</span>
          <strong>Reportes diarios</strong>
          <small>Ventas registradas día a día, totales, ganancias y productos vendidos.</small>
        </button>
        <button class="reports-menu-card interactive-card" type="button" data-reports-view="history">
          <span class="reports-menu-icon">${icon("history")}</span>
          <strong>Historial de movimientos</strong>
          <small>Caja, ventas, inventario, membresías y sesión organizados por fecha.</small>
        </button>
      </div>
    </section>
  `;
}

function renderGeneralStatsReports() {
  const report = getReportsSummary();
  const periodLabel = reportPeriodTitle(state.reportStatsPeriod);

  return `
    <section class="reports-shell reports-stats-shell">
      ${renderReportsSubHeader("Estadisticas generales", "Ingresos, membresias y actividad del gimnasio.")}
      ${renderReportPeriodFilter()}

      <section class="report-stats-grid">
        ${renderReportStatCard("Ingresos totales", formatCurrency(report.totalIncome), report.changeLabel, "profit", "green")}
        ${renderReportStatCard("Ventas", formatCurrency(report.productIncome), "Productos vendidos", "cart", "blue")}
        ${renderReportStatCard("Membresias", formatCurrency(report.membershipIncome), "Nuevas y renovaciones", "user", "purple")}
        ${renderReportStatCard("Miembros activos", String(report.activeMembers), "Membresias vigentes", "user", "teal")}
        ${renderReportStatCard("Vencidas", String(report.expiredMemberships), "Requieren renovacion", "history", "red")}
        ${renderReportStatCard("Proximas a vencer", String(report.expiringMemberships), "7 dias o menos", "alert", "orange")}
        ${renderReportStatCard("Movimientos", String(report.totalMovements), "Del periodo", "receipt", "indigo")}
        ${renderReportStatCard("Ticket promedio", formatCurrency(report.ticketAverage), "Por movimiento", "cash", "cyan")}
      </section>

      <section class="report-analytics-grid">
        <article class="panel report-income-card">
          <div class="report-card-heading">
            <div>
              <span>${periodLabel}</span>
              <h2>${formatCurrency(report.totalIncome)}</h2>
              <p>${report.rangeLabel}</p>
            </div>
            <strong class="${report.change >= 0 ? "positive" : "negative"}">${report.changeLabel}</strong>
          </div>
          ${renderIncomeLineChart(report.chartData)}
          <div class="report-card-foot">
            <span>Ticket promedio: <strong>${formatCurrency(report.ticketAverage)}</strong></span>
            <span>${report.totalMovements} movimientos registrados</span>
          </div>
        </article>

        <article class="panel report-mini-card">
          <div class="report-card-heading compact">
            <div>
              <span>Metodos de pago</span>
              <h2>${report.topPaymentMethod}</h2>
            </div>
          </div>
          ${renderPaymentMethodChart(report.paymentMethods)}
        </article>
      </section>

      <section class="report-analytics-grid lower">
        <article class="panel report-mini-card">
          <div class="report-card-heading compact">
            <div>
              <span>Ventas vs membresias</span>
              <h2>Origen del ingreso</h2>
            </div>
          </div>
          ${renderCategoryBars(report.categoryBreakdown)}
        </article>
        <article class="panel report-insights-panel">
          <div class="report-card-heading compact">
            <div>
              <span>Lectura rapida</span>
              <h2>Insights del periodo</h2>
            </div>
          </div>
          <div class="report-insights-grid">
            <div><span>Mejor dia</span><strong>${report.bestDay}</strong></div>
            <div><span>Mejor horario</span><strong>${report.bestHour}</strong></div>
            <div><span>Metodo mas usado</span><strong>${report.topPaymentMethod}</strong></div>
            <div><span>Mayor ingreso</span><strong>${report.topCategory}</strong></div>
          </div>
        </article>
      </section>

      <section class="panel report-table-panel">
        <div class="report-card-heading compact">
          <div>
            <span>Movimientos del periodo</span>
            <h2>Resumen financiero</h2>
          </div>
        </div>
        ${renderReportMovementsTable(report.movements)}
      </section>
    </section>
  `;
}

function renderReportPeriodFilter() {
  const periods = [
    ["day", "Hoy"],
    ["week", "Semana"],
    ["month", "Mes"],
    ["custom", "Rango personalizado"],
  ];
  const isCustom = state.reportStatsPeriod === "custom";

  return `
    <section class="panel report-period-filter">
      <div class="report-period-tabs">
        ${periods.map(([id, label]) => `<button class="${state.reportStatsPeriod === id ? "active" : ""}" type="button" data-report-period="${id}">${label}</button>`).join("")}
      </div>
      <div class="report-period-fields">
        <label>
          <span>Fecha base</span>
          <input class="interactive-input" id="report-stats-date" type="date" value="${escapeAttribute(state.reportStatsDate)}">
        </label>
        <label class="${isCustom ? "" : "hidden"}">
          <span>Desde</span>
          <input class="interactive-input" id="report-stats-start" type="date" value="${escapeAttribute(state.reportStatsStartDate)}">
        </label>
        <label class="${isCustom ? "" : "hidden"}">
          <span>Hasta</span>
          <input class="interactive-input" id="report-stats-end" type="date" value="${escapeAttribute(state.reportStatsEndDate)}">
        </label>
      </div>
    </section>
  `;
}

function renderReportStatCard(title, value, helper, iconName, tone) {
  return `
    <article class="report-stat-card ${tone}">
      <span class="report-stat-icon">${icon(iconName)}</span>
      <div>
        <h3>${title}</h3>
        <strong>${value}</strong>
        <small>${helper}</small>
      </div>
    </article>
  `;
}

function getReportsSummary() {
  const range = getReportPeriodRange(state.reportStatsPeriod, state.reportStatsDate, state.reportStatsStartDate, state.reportStatsEndDate);
  const previousRange = getPreviousReportRange(state.reportStatsPeriod, range);
  const movements = cashMovementsInRange(range.start, range.end);
  const previousMovements = cashMovementsInRange(previousRange.start, previousRange.end);
  const memberships = getMembershipSummaryForReports();
  const totalIncome = sumReportMovements(movements);
  const previousIncome = sumReportMovements(previousMovements);
  const productIncome = sumReportMovements(movements.filter((movement) => movement.category === "venta_producto"));
  const membershipIncome = sumReportMovements(movements.filter((movement) => ["membresia_nueva", "renovacion_membresia"].includes(movement.category)));
  const totalMovements = movements.length;
  const chartData = buildReportChartData(movements, range);
  const paymentMethods = groupReportByPaymentMethod(movements);
  const categoryBreakdown = groupReportByCategory(movements);
  const change = calculateReportChange(totalIncome, previousIncome);

  return {
    movements: [...movements].sort((a, b) => new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt)),
    totalIncome,
    productIncome,
    membershipIncome,
    activeMembers: memberships.active,
    expiredMemberships: memberships.expired,
    expiringMemberships: memberships.expiring,
    totalMovements,
    ticketAverage: totalMovements ? totalIncome / totalMovements : 0,
    chartData,
    paymentMethods,
    categoryBreakdown,
    change,
    changeLabel: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs ${previousPeriodLabel(state.reportStatsPeriod)}`,
    rangeLabel: `${formatShortDate(localDateKey(range.start))} - ${formatShortDate(localDateKey(range.end))}`,
    bestDay: getBestReportDay(movements),
    bestHour: getBestReportHour(movements),
    topPaymentMethod: paymentMethods[0]?.label || "Sin datos",
    topCategory: categoryBreakdown[0]?.label || "Sin datos",
  };
}

function getReportPeriodRange(period, dateKey, startKey, endKey) {
  const base = new Date(`${dateKey || toDateKey(new Date())}T12:00:00`);
  let start = new Date(base);
  let end = new Date(base);

  if (period === "week") {
    const day = base.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(base.getDate() + mondayOffset);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start = new Date(base.getFullYear(), base.getMonth(), 1);
    end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  } else if (period === "custom") {
    start = new Date(`${startKey || dateKey}T12:00:00`);
    end = new Date(`${endKey || dateKey}T12:00:00`);
    if (start > end) [start, end] = [end, start];
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end, period };
}

function getPreviousReportRange(period, range) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);

  if (period === "month") {
    const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const previousEnd = new Date(start.getFullYear(), start.getMonth(), 0);
    previousStart.setHours(0, 0, 0, 0);
    previousEnd.setHours(23, 59, 59, 999);
    return { start: previousStart, end: previousEnd };
  }

  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  previousEnd.setHours(23, 59, 59, 999);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days + 1);
  previousStart.setHours(0, 0, 0, 0);
  return { start: previousStart, end: previousEnd };
}

function cashMovementsInRange(start, end) {
  return (state.cashMovements || []).filter((movement) => {
    if (movement.isInitialImport) return false;
    const date = new Date(movement.occurredAt || movement.createdAt);
    return movement.type === "income" && date >= start && date <= end;
  });
}

function sumReportMovements(movements) {
  return movements.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
}

function calculateReportChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function previousPeriodLabel(period) {
  if (period === "week") return "semana anterior";
  if (period === "month") return "mes anterior";
  if (period === "custom") return "periodo anterior";
  return "ayer";
}

function reportPeriodTitle(period) {
  if (period === "week") return "Ingresos de la semana";
  if (period === "month") return "Ingresos del mes";
  if (period === "custom") return "Ingresos del rango";
  return "Ingresos del dia";
}

function getMembershipSummaryForReports() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  return state.members.reduce((summary, member) => {
    const expiration = new Date(`${getMembershipExpiration(member)}T12:00:00`);
    expiration.setHours(0, 0, 0, 0);
    if (expiration < today) summary.expired += 1;
    else {
      summary.active += 1;
      if (expiration <= nextWeek) summary.expiring += 1;
    }
    return summary;
  }, { active: 0, expired: 0, expiring: 0 });
}

function buildReportChartData(movements, range) {
  const dayCount = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
  const hourly = dayCount <= 1;
  const labels = hourly
    ? Array.from({ length: 9 }, (_, index) => `${String(6 + index * 2).padStart(2, "0")}:00`)
    : Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(range.start);
        date.setDate(date.getDate() + index);
        return dayCount > 10 ? String(date.getDate()).padStart(2, "0") : new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(date);
      });
  const data = labels.map((label) => ({ label, ingresos: 0, ventas: 0, membresias: 0, movimientos: 0 }));

  movements.forEach((movement) => {
    const date = new Date(movement.occurredAt || movement.createdAt);
    const index = hourly
      ? Math.min(data.length - 1, Math.max(0, Math.floor((date.getHours() - 6) / 2)))
      : Math.min(data.length - 1, Math.max(0, Math.floor((date - range.start) / 86400000)));
    data[index].ingresos += Number(movement.amount || 0);
    data[index].movimientos += 1;
    if (movement.category === "venta_producto") data[index].ventas += Number(movement.amount || 0);
    if (["membresia_nueva", "renovacion_membresia"].includes(movement.category)) data[index].membresias += Number(movement.amount || 0);
  });

  return data;
}

function groupReportByPaymentMethod(movements) {
  const grouped = new Map();
  movements.forEach((movement) => {
    const label = paymentLabel(movement.paymentMethod || "cash");
    const current = grouped.get(label) || { label, value: 0, count: 0 };
    current.value += Number(movement.amount || 0);
    current.count += 1;
    grouped.set(label, current);
  });
  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

function groupReportByCategory(movements) {
  const labels = {
    venta_producto: "Ventas de productos",
    membresia_nueva: "Membresias nuevas",
    renovacion_membresia: "Renovaciones",
    otro_ingreso: "Otros ingresos",
  };
  const grouped = new Map();
  movements.forEach((movement) => {
    const label = labels[movement.category] || reportCategoryLabel(movement.category);
    const current = grouped.get(label) || { label, value: 0 };
    current.value += Number(movement.amount || 0);
    grouped.set(label, current);
  });
  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

function getBestReportDay(movements) {
  const grouped = new Map();
  movements.forEach((movement) => {
    const label = formatReportDate(movement.occurredAt || movement.createdAt);
    grouped.set(label, (grouped.get(label) || 0) + Number(movement.amount || 0));
  });
  return [...grouped.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Sin datos";
}

function getBestReportHour(movements) {
  const grouped = new Map();
  movements.forEach((movement) => {
    const date = new Date(movement.occurredAt || movement.createdAt);
    const label = `${String(date.getHours()).padStart(2, "0")}:00`;
    grouped.set(label, (grouped.get(label) || 0) + 1);
  });
  return [...grouped.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Sin datos";
}

function renderIncomeLineChart(data) {
  const max = Math.max(...data.map((item) => item.ingresos), 1);
  const points = data.map((item, index) => {
    const x = 24 + (index * (552 / Math.max(1, data.length - 1)));
    const y = 168 - (item.ingresos / max) * 126;
    return `${x},${y}`;
  }).join(" ");
  const area = `24,178 ${points} 576,178`;

  return `
    <div class="report-chart-wrap">
      <svg class="report-line-chart" viewBox="0 0 600 200" role="img" aria-label="Grafico de ingresos">
        <polyline class="chart-grid" points="24,42 576,42"/>
        <polyline class="chart-grid" points="24,105 576,105"/>
        <polyline class="chart-grid" points="24,168 576,168"/>
        <polygon class="chart-area" points="${area}"/>
        <polyline class="chart-line" points="${points}"/>
      </svg>
      <div class="report-chart-labels">
        ${data.map((item) => `<span>${item.label}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderPaymentMethodChart(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  if (!items.length) return renderEmptyState("Sin pagos", "No hay metodos de pago en este periodo.");
  return `
    <div class="report-bars">
      ${items.map((item, index) => `
        <div class="report-bar-row ${index === 0 ? "primary" : ""}">
          <div><strong>${item.label}</strong><span>${item.count} movimientos</span></div>
          <small>${formatCurrency(item.value)}</small>
          <i><b style="width:${Math.round((item.value / total) * 100)}%"></b></i>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCategoryBars(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  if (!items.length) return renderEmptyState("Sin ingresos", "No hay ingresos por categorias en este periodo.");
  return `
    <div class="report-bars category">
      ${items.map((item) => `
        <div class="report-bar-row">
          <div><strong>${item.label}</strong><span>${Math.round((item.value / total) * 100)}% del total</span></div>
          <small>${formatCurrency(item.value)}</small>
          <i><b style="width:${Math.round((item.value / total) * 100)}%"></b></i>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReportMovementsTable(movements) {
  if (!movements.length) return renderEmptyState("Sin movimientos", "No hay movimientos registrados en este periodo.");
  return `
    <div class="report-movements-table">
      <div class="report-table-head">
        <span>Fecha</span><span>Hora</span><span>Tipo</span><span>Categoria</span><span>Descripcion</span><span>Pago</span><span>Valor</span>
      </div>
      ${movements.slice(0, 12).map((movement) => {
        const date = new Date(movement.occurredAt || movement.createdAt);
        return `
          <div class="report-table-row">
            <span>${formatShortDate(localDateKey(date))}</span>
            <span>${new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(date)}</span>
            <span>${movement.type}</span>
            <span>${reportCategoryLabel(movement.category)}</span>
            <strong>${movement.description || reportCategoryLabel(movement.category)}</strong>
            <span>${paymentLabel(movement.paymentMethod || "cash")}</span>
            <b>${formatCurrency(movement.amount)}</b>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReportsSubHeader(title, subtitle) {
  return `
    <div class="dashboard-heading report-heading">
      <div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <button class="button secondary" type="button" data-reports-back>← Opciones de reportes</button>
    </div>
  `;
}

function renderDailyReports() {
  const groups = groupSalesByDay();
  const totals = groups.reduce(
    (summary, group) => ({
      totalSales: summary.totalSales + group.totalSales,
      totalProfit: summary.totalProfit + group.totalProfit,
      totalItems: summary.totalItems + group.totalItems,
      totalTickets: summary.totalTickets + group.sales.length,
    }),
    { totalSales: 0, totalProfit: 0, totalItems: 0, totalTickets: 0 },
  );

  return `
    <section class="reports-shell">
      ${renderReportsSubHeader("Reportes diarios", "Ventas registradas día a día.")}

      <section class="metrics reports-metrics">
        ${renderMetric("Ventas acumuladas", formatCurrency(totals.totalSales), `${totals.totalTickets} ventas registradas`, "profit", "mint")}
        ${renderMetric("Ganancia total", formatCurrency(totals.totalProfit), "Segun costo registrado", "sales", "blue")}
        ${renderMetric("Productos vendidos", String(totals.totalItems), "Unidades vendidas", "inventory", "purple")}
        ${renderMetric("Dias con ventas", String(groups.length), "Reportes disponibles", "history", "orange")}
      </section>

      ${
        groups.length
          ? `<div class="daily-report-list">${groups.map(renderDailyReportCard).join("")}</div>`
          : renderSectionPanel("Sin ventas registradas", "Cuando realices ventas, aqui se creara el reporte diario automaticamente.", renderEmptyState("Aun no hay reportes", "Abre caja y registra ventas para ver el cierre dia a dia."))
      }
    </section>
  `;
}

function groupSalesByDay() {
  const grouped = new Map();

  state.sales.forEach((sale) => {
    const key = new Date(sale.createdAt).toISOString().slice(0, 10);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        date: sale.createdAt,
        sales: [],
        totalSales: 0,
        totalCost: 0,
        totalProfit: 0,
        totalItems: 0,
        cashTotal: 0,
        transferTotal: 0,
      });
    }

    const group = grouped.get(key);
    group.sales.push(sale);
    group.totalSales += sale.total;
    group.totalCost += sale.cost;
    group.totalProfit += sale.profit;
    group.totalItems += sale.quantity;
    if (sale.paymentMethod === "cash") group.cashTotal += sale.total;
    if (sale.paymentMethod === "transfer") group.transferTotal += sale.total;
  });

  return [...grouped.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderDailyReportCard(report) {
  const sales = [...report.sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return `
    <details class="panel daily-report-card">
      <summary class="daily-report-header">
        <div>
          <h2>${formatReportDate(report.date)}</h2>
          <p>${sales.length} ventas · ${report.totalItems} productos vendidos</p>
        </div>
        <div class="daily-report-summary-side">
          <strong>${formatCurrency(report.totalSales)}</strong>
          <span class="report-open-label">Abrir resumen</span>
          <span class="report-close-label">Cerrar resumen</span>
        </div>
      </summary>

      <div class="daily-report-details">
        <div class="daily-report-stats">
          <div><span>Ganancia</span><strong>${formatCurrency(report.totalProfit)}</strong></div>
          <div><span>Costo</span><strong>${formatCurrency(report.totalCost)}</strong></div>
          <div><span>Efectivo</span><strong>${formatCurrency(report.cashTotal)}</strong></div>
          <div><span>Transferencia</span><strong>${formatCurrency(report.transferTotal)}</strong></div>
        </div>

        <div class="daily-sales-table">
          ${sales.map(renderReportSaleRow).join("")}
        </div>
      </div>
    </details>
  `;
}

function renderReportSaleRow(sale) {
  return `
    <div class="daily-sale-row">
      <div>
        <strong>${sale.quantity} x ${sale.productName}</strong>
        <span>${formatDate(sale.createdAt)} · ${paymentLabel(sale.paymentMethod)}</span>
      </div>
      <div><span>Total</span><strong>${formatCurrency(sale.total)}</strong></div>
      <div><span>Ganancia</span><strong>${formatCurrency(sale.profit)}</strong></div>
    </div>
  `;
}

function formatReportDate(value) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function paymentLabel(method) {
  return method === "cash" ? "Efectivo" : "Transferencia";
}

function renderPaymentBadge(method) {
  const isCash = method === "cash";
  return `<span class="payment-badge ${isCash ? "cash" : "transfer"}">${icon(isCash ? "cash" : "transfer")} ${paymentLabel(method)}</span>`;
}

function formatMovementDescription(description) {
  return description.replace(/(-?\$ ?[\d.]+),\d{2}/g, "$1");
}

function isSaleInventoryMovement(movement) {
  return movement?.type === "inventario" && movement.description?.startsWith("Salida por venta:");
}

function renderConnection() {
  const status = state.supabase?.status || "pending";
  const tone = status === "connected" ? "ok" : status === "error" ? "bad" : "warn";
  const checkedAt = state.supabase?.checkedAt ? `Ultima prueba: ${formatDate(state.supabase.checkedAt)}` : "Sin prueba reciente";

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Conexion Supabase</h2>
          <p>La conexion se lee desde variables de entorno en Vercel.</p>
        </div>
        <span class="status ${tone}">${connectionLabel()}</span>
      </div>
      <div class="notice">
        La llave anon publica no vive en el codigo fuente. Vercel la entrega al navegador desde <strong>/api/bodyfit-env.js</strong>. La llave <strong>service_role</strong> no se usa en la web.
      </div>
    </section>

    <section class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Estado</h2>
            <p>${checkedAt}</p>
          </div>
        </div>
        <div class="list-item">
          <strong>${state.supabase.message}</strong>
          <span>${state.supabase.url || "Sin SUPABASE_URL"}</span>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Siguiente paso en Supabase</h2>
            <p>Ejecutar el esquema inicial antes de guardar datos reales.</p>
          </div>
        </div>
        <div class="list">
          <div class="list-item">
            <strong>1. Variables en Vercel</strong>
            <span>SUPABASE_URL y SUPABASE_ANON_KEY deben estar configuradas para Production y Preview.</span>
          </div>
          <div class="list-item">
            <strong>2. Base de datos</strong>
            <span>Los productos, caja, ventas, membresias y movimientos se cargan desde Supabase.</span>
          </div>
          <div class="list-item">
            <strong>3. Seguridad</strong>
            <span>No usar service_role en Vercel ni en el navegador.</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!hasPermission(routePermission(button.dataset.tab))) {
        state.toast = "Tu rol no tiene permiso para abrir este módulo.";
        saveState();
        render();
        return;
      }
      state.activeTab = button.dataset.tab;
      if (state.activeTab === "reports") state.reportsView = "";
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-reports-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportsView = button.dataset.reportsView;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-reports-back]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportsView = "";
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-report-period]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportStatsPeriod = button.dataset.reportPeriod;
      saveState();
      render();
    });
  });
  document.querySelector("#report-stats-date")?.addEventListener("change", (event) => {
    state.reportStatsDate = event.currentTarget.value || toDateKey(new Date());
    saveState();
    render();
  });
  document.querySelector("#report-stats-start")?.addEventListener("change", (event) => {
    state.reportStatsStartDate = event.currentTarget.value || state.reportStatsDate;
    saveState();
    render();
  });
  document.querySelector("#report-stats-end")?.addEventListener("change", (event) => {
    state.reportStatsEndDate = event.currentTarget.value || state.reportStatsDate;
    saveState();
    render();
  });

  document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
    render();
  });

  document.querySelector("#more-menu-toggle")?.addEventListener("click", () => {
    document.querySelector(".tab-menu")?.classList.toggle("open");
  });

  document.querySelectorAll("[data-settings-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsView = button.dataset.settingsView;
      saveState();
      render();
    });
  });

  document.querySelector("#history-month")?.addEventListener("change", (event) => {
    state.historyMonth = event.currentTarget.value;
    state.historyWeekStart = getHistoryWeeks(state.historyMonth)[0].startKey;
    saveState();
    render();
  });
  document.querySelector("#history-week")?.addEventListener("change", (event) => {
    state.historyWeekStart = event.currentTarget.value;
    saveState();
    render();
  });

  document.querySelectorAll("[data-focus-cash]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".sales-cash-popover[open]").forEach((popover) => popover.removeAttribute("open"));
      const sheet = document.querySelector("#sales-cash-sheet");
      sheet?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const input = sheet?.querySelector("input, button, summary");
        input?.focus?.();
      }, 180);
    });
  });

  bindPremiumSelects();

  document.querySelector("#product-form")?.addEventListener("submit", addProduct);
  document.querySelector("#productImage")?.addEventListener("change", previewProductImage);
  document.querySelector("#open-new-product")?.addEventListener("click", openNewProductModal);
  document.querySelectorAll("[data-close-product-modal]").forEach((button) => {
    button.addEventListener("click", closeNewProductModal);
  });
  document.querySelector("#member-form")?.addEventListener("submit", addMember);
  document.querySelector("#member-edit-form")?.addEventListener("submit", saveMemberEdit);
  document.querySelectorAll("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => openMemberModal("edit", button.dataset.editMember));
  });
  document.querySelectorAll("[data-renew-member]").forEach((button) => {
    button.addEventListener("click", () => openMemberModal("renew", button.dataset.renewMember));
  });
  document.querySelectorAll("[data-delete-member]").forEach((button) => {
    button.addEventListener("click", () => openMemberModal("delete", button.dataset.deleteMember));
  });
  document.querySelectorAll("[data-close-member-modal]").forEach((button) => {
    button.addEventListener("click", closeMemberModal);
  });
  document.querySelector("#confirm-renew-member")?.addEventListener("click", confirmRenewMembership);
  document.querySelector("#confirm-delete-member")?.addEventListener("click", confirmDeleteMembership);
  document.querySelector("#user-form")?.addEventListener("submit", addSystemUser);
  document.querySelectorAll("[data-password-user]").forEach((form) => {
    form.addEventListener("submit", updateSystemUserPassword);
  });
  document.querySelector("#product-search-input")?.addEventListener("input", filterProductSearch);
  document.querySelector("#open-cash-form")?.addEventListener("submit", openCash);
  document.querySelector("#close-cash-form")?.addEventListener("submit", closeCash);
  document.querySelector("#edit-cash-form")?.addEventListener("submit", editCashOpeningAmount);
  document.querySelector("#void-cash")?.addEventListener("click", voidCashRegister);
  document.querySelector("#reopen-cash")?.addEventListener("click", reopenCashRegister);
  document.querySelector("#delete-cash")?.addEventListener("click", deleteCashRegister);
  document.querySelector("#sale-add-form")?.addEventListener("submit", addSaleCartItem);
  document.querySelector(".sale-new-card")?.addEventListener("toggle", (event) => {
    state.saleNewPanelOpen = event.currentTarget.open;
    saveState();
  });
  document.querySelector("#register-cart-sale")?.addEventListener("click", createSale);
  document.querySelector("#clear-sale-cart")?.addEventListener("click", clearSaleCart);
  document.querySelector("#clear-sale-cart-secondary")?.addEventListener("click", clearSaleCart);
  document.querySelectorAll("[data-sale-qty-step]").forEach((button) => {
    button.addEventListener("click", () => stepSaleQuantity(Number(button.dataset.saleQtyStep)));
  });
  document.querySelectorAll("[data-cart-qty]").forEach((button) => {
    button.addEventListener("click", () => updateCartQuantity(button.dataset.cartQty, Number(button.dataset.cartDelta)));
  });
  document.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => removeCartItem(button.dataset.cartRemove));
  });
  document.querySelector("#confirm-sale")?.addEventListener("click", confirmSale);
  document.querySelectorAll("[data-cancel-sale]").forEach((button) => {
    button.addEventListener("click", cancelSale);
  });
  document.querySelector("#toggle-inventory-files")?.addEventListener("click", toggleInventoryFileTools);
  document.querySelector("#import-inventory-file")?.addEventListener("click", importInventoryFile);
  document.querySelector("#export-inventory-file")?.addEventListener("click", exportInventoryCsv);
  document.querySelector("#download-inventory-csv")?.addEventListener("click", downloadPreparedInventoryCsv);
  document.querySelector("#copy-inventory-csv")?.addEventListener("click", copyInventoryCsv);
  document.querySelectorAll("[data-session-action]").forEach((button) => {
    button.addEventListener("click", () => handleSessionAction(button.dataset.sessionAction));
  });

  document.querySelectorAll('input[inputmode="numeric"]').forEach((input) => {
    if (input.dataset.required === "true") {
      input.addEventListener("focus", () => {
        if (parseMoney(input.value) === 0) input.value = "";
      });

      input.addEventListener("input", () => {
        formatMoneyWhileTyping(input);
      });

      input.addEventListener("blur", () => {
        const value = parseMoney(input.value);
        if (Number.isFinite(value)) input.value = formatMoneyInput(Math.round(value));
      });
      return;
    }

    input.addEventListener("focus", () => {
      if (!input.dataset.placeholder) input.dataset.placeholder = input.placeholder;
      if (input.value === "0") input.value = "";
      input.placeholder = "";
    });

    input.addEventListener("click", () => {
      if (!input.dataset.placeholder) input.dataset.placeholder = input.placeholder;
      if (input.value === "0") input.value = "";
      input.placeholder = "";
    });

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });

    input.addEventListener("blur", () => {
      input.placeholder = input.dataset.placeholder || "0";
      if (input.required && input.value === "") input.value = "0";
    });
  });

  document.querySelectorAll("[data-stock-product]").forEach((button) => {
    button.addEventListener("click", () => openStockModal(button.dataset.stockProduct));
  });
  document.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => openEditProductModal(button.dataset.editProduct));
  });
  document.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.deleteProduct));
  });
  document.querySelector("#stock-form")?.addEventListener("submit", confirmStockSupply);
  document.querySelectorAll("[data-close-stock-modal]").forEach((button) => {
    button.addEventListener("click", closeStockModal);
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => deleteSystemUser(button.dataset.deleteUser));
  });
}

function bindPremiumSelects() {
  document.querySelectorAll("[data-premium-select]").forEach((select) => {
    select.querySelector(".premium-select-trigger")?.addEventListener("click", (event) => {
      if (select.dataset.disabled === "true") {
        event.preventDefault();
        return;
      }
      document.querySelectorAll("[data-premium-select][open]").forEach((other) => {
        if (other !== select) other.removeAttribute("open");
      });
    });

    select.querySelectorAll("[data-premium-option]").forEach((option) => {
      option.addEventListener("click", () => {
        const input = select.querySelector("input[type='hidden']");
        const label = select.querySelector("[data-premium-select-label]");
        if (!input || !label) return;

        input.value = option.dataset.premiumOption;
        label.textContent = option.querySelector("span")?.textContent || "";
        select.querySelectorAll("[data-premium-option]").forEach((item) => item.classList.toggle("selected", item === option));
        select.removeAttribute("open");
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.name === "paymentMethod") {
          state.salePaymentMethod = input.value;
          saveState();
        }
      });
    });
  });

  const root = document.querySelector(".app-shell") || document.querySelector(".login-screen");
  root?.addEventListener("click", (event) => {
    document.querySelectorAll("[data-premium-select][open]").forEach((select) => {
      if (!select.contains(event.target)) select.removeAttribute("open");
    });
    document.querySelectorAll(".sales-cash-popover[open]").forEach((popover) => {
      if (!popover.contains(event.target)) popover.removeAttribute("open");
    });
  });
  root?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-premium-select][open]").forEach((select) => select.removeAttribute("open"));
    document.querySelectorAll(".sales-cash-popover[open]").forEach((popover) => popover.removeAttribute("open"));
  });
}

function handleSessionAction(action) {
  const user = activeUser();
  addMovement("sesion", action === "login" ? `Cambio de usuario solicitado: ${user.name}` : `Sesion cerrada: ${user.name}`);
  state.sessionActive = false;
  state.currentUserId = "";
  state.user = { name: "Sin sesión", role: "" };
  saveState();
  render();
}

function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const user = state.users.find((item) => item.id === data.loginUser);
  const password = String(data.loginPassword || "");

  if (!user) {
    alert("Selecciona un usuario válido.");
    return;
  }

  if (!user.password) {
    alert("Este usuario todavía no tiene contraseña configurada.");
    return;
  }

  if (String(user.password) !== password) {
    alert("El usuario o la contraseña no son correctos.");
    return;
  }

  state.sessionActive = true;
  state.currentUserId = user.id;
  state.user = { name: user.name, role: user.role };
  state.activeTab = "monitor";
  state.toast = `Sesión iniciada como ${roleLabel(user.role)}.`;
  addMovement("sesion", `Sesion iniciada: ${user.name} (${roleLabel(user.role)})`);
  saveState();
  render();
  dismissToastAfterDelay();
}

function dismissToastAfterDelay() {
  const message = state.toast;
  window.setTimeout(() => {
    if (state.toast !== message) return;
    state.toast = "";
    saveState();
    render();
  }, 2600);
}

async function createDefaultSystemUsers() {
  if (!supabaseConfigured()) {
    alert("Primero configura SUPABASE_URL y SUPABASE_ANON_KEY en Vercel.");
    return;
  }

  try {
    for (const user of DEFAULT_SYSTEM_USERS) {
      await dbEnsureSystemUser(user);
    }
    state.toast = "Usuarios base creados en Supabase.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No pude crear los usuarios base en Supabase: ${error.message}`);
  }
}

async function addSystemUser(event) {
  event.preventDefault();
  if (!requirePermission("users-manage")) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const name = data.accountName.trim();
  const password = String(data.accountPassword || "");

  if (!name || password.length < 6) {
    alert("Ingresa un nombre y una contraseña de mínimo 6 caracteres.");
    return;
  }

  try {
    await supabaseInsert("profiles", {
      full_name: name,
      role: dbRoleFromLocal(data.accountRole),
      status: "active",
      password,
      pin: null,
    });
    state.toast = `Usuario creado: ${name}`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo crear el usuario en Supabase: ${error.message}`);
  }
}

async function updateSystemUserPassword(event) {
  event.preventDefault();
  if (!requirePermission("users-manage")) return;
  const form = event.currentTarget;
  const userId = form.dataset.passwordUser;
  const user = state.users.find((item) => item.id === userId);
  const password = String(new FormData(form).get("newPassword") || "");

  if (!user) {
    alert("No encontré este usuario.");
    return;
  }

  if (password.length < 6) {
    alert("La contraseña debe tener mínimo 6 caracteres.");
    return;
  }

  try {
    await supabasePatch("profiles", user.id, {
      password,
      pin: null,
      updated_at: new Date().toISOString(),
    });
    state.toast = `Contraseña actualizada para ${user.name}.`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo actualizar la contraseña: ${error.message}`);
  }
}

async function deleteSystemUser(userId) {
  if (!requirePermission("users-manage")) return;
  const user = state.users.find((item) => item.id === userId);
  if (!user || user.id === state.currentUserId || user.role === "super-admin") return;
  if (!confirm(`¿Eliminar el acceso de ${user.name}?`)) return;
  try {
    await supabaseDeleteWhere("profiles", `id=eq.${encodeURIComponent(userId)}`);
    state.toast = `Usuario eliminado: ${user.name}`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo eliminar el usuario en Supabase: ${error.message}`);
  }
}

function filterProductSearch(event) {
  const query = event.currentTarget.value.trim().toLowerCase();
  const cards = document.querySelectorAll("[data-product-search]");
  const empty = document.querySelector("#product-search-empty");
  let visibleCount = 0;

  cards.forEach((card) => {
    const matches = !query || card.dataset.productSearch.includes(query);
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  empty?.classList.toggle("visible", visibleCount === 0);
}

async function addMember(event) {
  event.preventDefault();
  if (!requirePermission("memberships")) return;
  const memberData = collectMemberFormData(event.currentTarget);

  if (!memberData.name) {
    alert("El nombre del miembro es obligatorio.");
    return;
  }

  if (!memberData.plan) {
    alert("Debes seleccionar un plan.");
    return;
  }

  if (!memberData.acquiredAt) {
    alert("Debes indicar la fecha de adquisicion.");
    return;
  }

  const member = {
    id: crypto.randomUUID(),
    ...memberData,
    expiresAt: addMonths(memberData.acquiredAt, membershipPlanMonths(memberData.plan)),
    status: "activa",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await dbUpsertMember(member, { registerIncome: true });
    state.memberModalMode = "";
    state.selectedMemberId = "";
    state.toast = "Membresia registrada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo guardar la membresia en Supabase: ${error.message}`);
  }
}

function collectMemberFormData(form) {
  const data = Object.fromEntries(new FormData(form));
  return {
    name: (data.memberName || "").trim(),
    phone: (data.memberPhone || "").trim(),
    documentId: (data.memberDocument || "").trim(),
    email: (data.memberEmail || "").trim(),
    plan: data.memberPlan || "Mensual",
    acquiredAt: data.memberAcquiredAt || "",
    notes: (data.memberNotes || "").trim(),
  };
}

function openMemberModal(mode, memberId) {
  if (!requirePermission("memberships")) return;
  if (!state.members.some((member) => member.id === memberId)) return;
  state.memberModalMode = mode;
  state.selectedMemberId = memberId;
  saveState();
  render();
}

function closeMemberModal() {
  state.memberModalMode = "";
  state.selectedMemberId = "";
  saveState();
  render();
}

async function saveMemberEdit(event) {
  event.preventDefault();
  if (!requirePermission("memberships")) return;
  const member = state.members.find((item) => item.id === state.selectedMemberId);
  if (!member) {
    alert("No se pudo completar la accion.");
    return;
  }

  const memberData = collectMemberFormData(event.currentTarget);
  if (!memberData.name) {
    alert("El nombre del miembro es obligatorio.");
    return;
  }
  if (!memberData.plan) {
    alert("Debes seleccionar un plan.");
    return;
  }
  if (!memberData.acquiredAt) {
    alert("Debes indicar la fecha de adquisicion.");
    return;
  }

  const updatedMember = {
    ...member,
    ...memberData,
    expiresAt: addMonths(memberData.acquiredAt, membershipPlanMonths(memberData.plan)),
    updatedAt: new Date().toISOString(),
  };

  try {
    await dbUpsertMember(updatedMember);
    state.memberModalMode = "";
    state.selectedMemberId = "";
    state.toast = "Membresia actualizada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo actualizar la membresia en Supabase: ${error.message}`);
  }
}

async function confirmRenewMembership() {
  if (!requirePermission("memberships")) return;
  const member = state.members.find((item) => item.id === state.selectedMemberId);
  if (!member) {
    alert("No se pudo completar la accion.");
    return;
  }

  const status = getMembershipStatus(member);
  const newStartDate = status.daysLeft >= 0 ? status.expiresAt : toDateKey(new Date());
  member.acquiredAt = newStartDate;
  member.expiresAt = addMonths(newStartDate, membershipPlanMonths(member.plan));
  member.status = "activa";
  member.renewedAt = new Date().toISOString();
  member.updatedAt = new Date().toISOString();

  try {
    await dbUpsertMember(member, { registerIncome: true, renewal: true });
    state.memberModalMode = "";
    state.selectedMemberId = "";
    state.toast = "Membresia renovada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo renovar la membresia en Supabase: ${error.message}`);
  }
}

async function confirmDeleteMembership() {
  if (!requirePermission("memberships")) return;
  const member = state.members.find((item) => item.id === state.selectedMemberId);
  if (!member) {
    alert("No se pudo completar la accion.");
    return;
  }

  try {
    await dbDeleteMembership(member);
    state.memberModalMode = "";
    state.selectedMemberId = "";
    state.toast = "Membresia eliminada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo eliminar la membresia en Supabase: ${error.message}`);
  }
}

function registerMembershipIncome(member, category) {
  const createdAt = new Date().toISOString();
  const saleId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const reportCategory = category === "membership_renewal" ? "renovacion_membresia" : "membresia_nueva";
  const description = category === "membership_renewal" ? `Renovacion de membresia - ${member.name}` : `Nueva membresia - ${member.name}`;
  ensureMembershipCashRegister();
  state.cashRegister.cashTotal += MEMBERSHIP_PRICE;
  state.sales.push({
    id: saleId,
    transactionId,
    productId: `membership-${member.id}`,
    productName: category === "membership_renewal" ? `Renovacion membresia - ${member.name}` : `Membresia - ${member.name}`,
    quantity: 1,
    paymentMethod: "cash",
    total: MEMBERSHIP_PRICE,
    cost: 0,
    profit: MEMBERSHIP_PRICE,
    createdAt,
    source: category,
    memberId: member.id,
  });
  addCashMovement({
    category: reportCategory,
    description,
    amount: MEMBERSHIP_PRICE,
    paymentMethod: "cash",
    relatedTable: "sales",
    relatedId: saleId,
    occurredAt: createdAt,
  });
  addMovement(
    "membresia",
    category === "membership_renewal" ? `Renovacion de membresia - ${member.name}` : `Pago de membresia - ${member.name}`,
    MEMBERSHIP_PRICE,
  );
}

function ensureMembershipCashRegister() {
  if (state.cashRegister?.status === "abierta") return;
  state.cashRegister = createCashRegister(0, "Caja abierta automaticamente por ingreso de membresia.");
  addMovement("caja", "Caja abierta automaticamente por ingreso de membresia", 0);
}

function formatMoneyWhileTyping(input) {
  const digits = input.value.replace(/\D/g, "");
  input.value = digits ? formatMoneyInput(Number(digits)) : "";
}

function openNewProductModal() {
  if (!requirePermission("inventory-edit")) return;
  state.newProductModalOpen = true;
  state.editingProductId = "";
  saveState();
  render();
}

function openEditProductModal(productId) {
  if (!requirePermission("inventory-edit")) return;
  if (!state.products.some((item) => item.id === productId)) return;
  state.newProductModalOpen = true;
  state.editingProductId = productId;
  saveState();
  render();
}

function closeNewProductModal() {
  state.newProductModalOpen = false;
  state.editingProductId = "";
  saveState();
  render();
}

async function addProduct(event) {
  event.preventDefault();
  if (!requirePermission("inventory-edit")) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const editingProduct = state.products.find((item) => item.id === state.editingProductId);
  const quantity = Number.parseInt(data.quantity, 10);
  const minQuantity = Number.parseInt(data.minQuantity, 10);
  const idealQuantity = Number.parseInt(data.idealQuantity, 10);
  const product = withInventoryWeek({
    id: editingProduct?.id || crypto.randomUUID(),
    name: data.name.trim(),
    sku: data.sku.trim(),
    category: data.category.trim(),
    imageUrl: editingProduct?.imageUrl || "",
    salePrice: parseMoney(data.salePrice),
    purchaseCost: parseMoney(data.purchaseCost),
    quantity,
    minQuantity,
    idealQuantity,
    supplier: data.supplier.trim(),
    status: data.productStatus || "activo",
  });

  if (!product.name || product.salePrice <= 0 || product.purchaseCost <= 0) {
    alert("Revisa nombre, precio de venta y costo de compra.");
    return;
  }

  if (state.products.some((item) => item.id !== product.id && item.sku && item.sku.toLowerCase() === product.sku.toLowerCase())) {
    alert("Ya existe un producto con este SKU.");
    return;
  }

  if ([product.quantity, product.minQuantity, product.idealQuantity].some((value) => !Number.isInteger(value) || value < 0)) {
    alert("Las cantidades no pueden ser negativas.");
    return;
  }

  if (product.quantity === 0 && product.status === "activo") product.status = "agotado";
  if (product.quantity > 0 && product.status === "agotado") product.status = "activo";

  const imageFile = event.currentTarget.querySelector("#productImage")?.files?.[0];
  if (imageFile) {
    try {
      product.imageUrl = await readProductImage(imageFile);
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  if (editingProduct) {
    state.toast = `Producto actualizado: ${product.name}`;
  } else {
    state.toast = `Producto agregado: ${product.name}`;
  }

  try {
    await dbUpsertProduct(product);
    state.newProductModalOpen = false;
    state.editingProductId = "";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo guardar el producto en Supabase: ${error.message}`);
  }
}

function readProductImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selecciona una imagen válida para el producto."));
      return;
    }

    if (file.size > 2_500_000) {
      reject(new Error("La imagen es muy pesada. Usa una foto menor a 2.5 MB."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("No pude leer la imagen seleccionada.")));
    reader.readAsDataURL(file);
  });
}

async function previewProductImage(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  try {
    const imageUrl = await readProductImage(file);
    const preview = document.querySelector(".product-photo-preview");
    if (!preview) return;
    preview.classList.add("has-image");
    preview.style.backgroundImage = `url('${imageUrl}')`;
    preview.textContent = "";
  } catch (error) {
    alert(error.message);
    event.currentTarget.value = "";
  }
}

async function deleteProduct(productId) {
  if (!requirePermission("inventory-edit")) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  if (!confirm(`¿Eliminar ${product.name} del inventario?`)) return;

  try {
    await dbDisableProduct(product);
    state.toast = `Producto inhabilitado: ${product.name}`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo inhabilitar el producto en Supabase: ${error.message}`);
  }
}

function toggleInventoryFileTools() {
  state.inventoryFilePanelOpen = !state.inventoryFilePanelOpen;
  saveState();
  render();
}

async function importInventoryFile() {
  if (!requirePermission("inventory-edit")) return;
  const input = document.querySelector("#inventory-file");
  const file = input?.files?.[0];

  if (!file) {
    state.inventoryFileMessage = "Para importar, selecciona un archivo CSV, Excel o Word.";
    saveState();
    render();
    return;
  }

  try {
    const products = await readInventoryFile(file);
    if (!products.length) {
      state.inventoryFileMessage = "No encontre productos validos en el archivo.";
      saveState();
      render();
      return;
    }

    const result = upsertInventoryProducts(products);
    await Promise.all(products.map((product) => dbUpsertProduct(product)));
    state.inventoryFileMessage = `Archivo importado en Supabase: ${result.created} creados, ${result.updated} actualizados.`;
    await hydrateFromSupabase();
  } catch (error) {
    state.inventoryFileMessage = `No pude leer el archivo: ${error.message}`;
    saveState();
    render();
  }
}

function getSelectedExportPeriod() {
  const dateValue = document.querySelector("#inventory-export-date")?.value || toDateKey(new Date());
  const week = getInventoryWeek(dateValue);

  return {
    mode: "day",
    inventoryDate: dateValue,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    label: `dia ${formatShortDate(dateValue)}`,
  };
}

async function readInventoryFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "csv") {
    return rowsToProducts(parseCsv(await file.text()));
  }

  if (extension === "xlsx") {
    return rowsToProducts(await readXlsxRows(file));
  }

  if (extension === "docx") {
    return readDocxProducts(await file.arrayBuffer());
  }

  throw new Error("Formato no soportado. Usa CSV, XLSX o DOCX.");
}

function upsertInventoryProducts(products, period = null) {
  let created = 0;
  let updated = 0;

  products.forEach((rawProduct) => {
    const product = withInventoryWeek({
      ...rawProduct,
      ...(period
        ? {
            inventoryDate: period.inventoryDate,
            weekStart: period.weekStart,
            weekEnd: period.weekEnd,
          }
        : {}),
    });
    const key = (product.sku || product.name).toLowerCase();
    const existing = state.products.find((item) => (item.sku || item.name).toLowerCase() === key);

    if (existing) {
      Object.assign(existing, {
        ...existing,
        ...product,
        id: existing.id,
        imageUrl: existing.imageUrl || product.imageUrl,
        status: product.quantity === 0 ? "agotado" : "activo",
      });
      updated += 1;
    } else {
      state.products.push({
        ...product,
        id: crypto.randomUUID(),
        status: product.quantity === 0 ? "agotado" : "activo",
      });
      created += 1;
    }
  });

  return { created, updated };
}

function exportInventoryCsv() {
  if (!requirePermission("inventory-edit")) return;
  const period = getSelectedExportPeriod();
  const products = state.products;
  const daySales = state.sales
    .filter((sale) => new Date(sale.createdAt).toISOString().slice(0, 10) === period.inventoryDate)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const inventoryHeaders = ["seccion", "nombre", "sku", "categoria", "fecha_inventario", "precio_venta", "costo_compra", "cantidad_actual", "cantidad_minima", "cantidad_ideal", "proveedor"];
  const inventoryRows = products.map((product) => [
    "inventario_actual",
    product.name,
    product.sku,
    product.category,
    period.inventoryDate,
    product.salePrice,
    product.purchaseCost,
    product.quantity,
    product.minQuantity,
    product.idealQuantity,
    product.supplier,
  ]);
  const salesHeaders = ["seccion", "fecha_venta", "producto", "cantidad", "metodo_pago", "total", "costo", "ganancia"];
  const salesRows = daySales.map((sale) => [
    "ventas_del_dia",
    sale.createdAt,
    sale.productName,
    sale.quantity,
    paymentLabel(sale.paymentMethod),
    sale.total,
    sale.cost,
    sale.profit,
  ]);

  const csv = [
    ["BODY FIT - EXPORTACION DIARIA"],
    [`Fecha`, period.inventoryDate],
    [],
    inventoryHeaders,
    ...inventoryRows,
    [],
    salesHeaders,
    ...salesRows,
  ].map((row) => row.map(csvCell).join(",")).join("\n");
  const fileName = `body-fit-diario-${period.inventoryDate}.csv`;
  state.inventoryExportCsv = csv;
  state.inventoryExportFileName = fileName;
  state.inventoryExportDate = period.inventoryDate;
  state.inventoryFileMessage = `Archivo preparado para ${period.label}: ${products.length} productos y ${daySales.length} ventas. Usa Descargar Archivo para guardarlo.`;
  saveState();

  render();
}

function downloadPreparedInventoryCsv() {
  if (!state.inventoryExportCsv) {
    state.inventoryFileMessage = "Primero prepara el archivo con Exportar Archivo.";
    saveState();
    render();
    return;
  }

  downloadCsv(state.inventoryExportCsv, state.inventoryExportFileName || "body-fit-diario.csv");
}

function downloadCsv(csv, fileName) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

async function copyInventoryCsv() {
  if (!state.inventoryExportCsv) return;

  try {
    await navigator.clipboard.writeText(state.inventoryExportCsv);
    state.inventoryFileMessage = "CSV copiado al portapapeles.";
  } catch {
    state.inventoryFileMessage = "No se pudo copiar automaticamente. Usa Descargar CSV.";
  }

  saveState();
  render();
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function rowsToProducts(rows) {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => rowToProduct(headers, row)).filter(Boolean);
}

function rowToProduct(headers, row) {
  const value = (names) => {
    const index = headers.findIndex((header) => names.includes(header));
    return index >= 0 ? String(row[index] ?? "").trim() : "";
  };

  const name = value(["nombre", "producto", "name"]);
  if (!name) return null;

  const product = {
    name,
    sku: value(["sku", "codigo", "codigo interno", "referencia"]) || slugSku(name),
    category: value(["categoria", "category"]) || "Inventario",
    inventoryDate: parseInventoryDate(value(["fecha inventario", "fecha_inventario", "fecha", "inventory date"])) || getInventoryWeek().inventoryDate,
    weekStart: parseInventoryDate(value(["semana inicio", "semana_inicio", "inicio semana", "week start"])),
    weekEnd: parseInventoryDate(value(["semana fin", "semana_fin", "fin semana", "week end"])),
    salePrice: parseMoney(value(["precio venta", "precio_venta", "venta", "sale price"])) || 0,
    purchaseCost: parseMoney(value(["costo compra", "costo_compra", "costo", "purchase cost"])) || 0,
    quantity: parseInteger(value(["cantidad actual", "cantidad_actual", "cantidad", "stock"])) || 0,
    minQuantity: parseInteger(value(["cantidad minima", "cantidad_minima", "minimo", "min"])) || 0,
    idealQuantity: parseInteger(value(["cantidad ideal", "cantidad_ideal", "ideal"])) || 0,
    supplier: value(["proveedor", "supplier"]),
  };

  if (product.salePrice <= 0) return null;
  if (product.purchaseCost < 0) product.purchaseCost = 0;
  const week = product.weekStart && product.weekEnd ? product : withInventoryWeek(product);
  return week;
}

function parseInventoryDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;

  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!local) return "";

  const day = local[1].padStart(2, "0");
  const month = local[2].padStart(2, "0");
  const year = local[3].length === 2 ? `20${local[3]}` : local[3];
  return `${year}-${month}-${day}`;
}

function normalizeHeader(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseMoney(value) {
  if (!String(value ?? "").trim()) return Number.NaN;

  const clean = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  return Number(clean) || 0;
}

function parseInteger(value) {
  const parsed = parseMoney(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function slugSku(name) {
  return `IMP-${normalizeHeader(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase()}`;
}

async function readXlsxRows(file) {
  const files = await unzipFiles(await file.arrayBuffer());
  const workbook = xmlDoc(files["xl/workbook.xml"]);
  const rels = xmlDoc(files["xl/_rels/workbook.xml.rels"]);
  const firstSheet = localElements(workbook, "sheet")[0];
  if (!firstSheet) return [];

  const relationId = firstSheet.getAttribute("r:id");
  const relation = localElements(rels, "Relationship").find((item) => item.getAttribute("Id") === relationId);
  const target = relation?.getAttribute("Target") || "worksheets/sheet1.xml";
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheet = xmlDoc(files[sheetPath]);
  const sharedStrings = files["xl/sharedStrings.xml"] ? localElements(xmlDoc(files["xl/sharedStrings.xml"]), "si").map((item) => item.textContent) : [];

  return localElements(sheet, "row").map((row) =>
    localElements(row, "c").map((cell) => {
      const raw = localElements(cell, "v")[0]?.textContent || "";
      return cell.getAttribute("t") === "s" ? sharedStrings[Number(raw)] || "" : raw;
    }),
  );
}

async function readDocxProducts(buffer) {
  const files = await unzipFiles(buffer);
  const documentXml = files["word/document.xml"];
  if (!documentXml) return [];

  const lines = localElements(xmlDoc(documentXml), "p")
    .map((paragraph) => paragraph.textContent.trim())
    .filter(Boolean);

  const structuredRows = extractDocxTableRows(lines);
  if (structuredRows.length > 1) return rowsToProducts(structuredRows);

  return parseMenuLikeDocx(lines);
}

function extractDocxTableRows(lines) {
  const headerIndex = lines.findIndex((line) => normalizeHeader(line).includes("producto"));
  if (headerIndex < 0) return [];
  return lines.slice(headerIndex).map((line) => line.split(/\t| {2,}/).map((value) => value.trim()).filter(Boolean));
}

function parseMenuLikeDocx(lines) {
  const products = [];

  lines.forEach((line, index) => {
    const unitSale = parseMoney(line.match(/\/\s*([\d.]+)/)?.[1] || line.match(/\$\s*([\d.]+)\s*C\/U/i)?.[1]);
    if (!unitSale) return;

    const name = cleanProductName(line.split(/\$|\/\s*[\d.]+/)[0]);
    const pack = parseInteger(line.match(/(\d+)\s*(PK|S|Unidades)/i)?.[1]) || 1;
    const totalCost = parseMoney(lines[index + 1]);
    const purchaseCost = totalCost && pack ? Math.round(totalCost / pack) : Math.round(unitSale * 0.6);

    products.push({
      name,
      sku: slugSku(name),
      category: inferCategory(lines, index),
      ...getInventoryWeek(),
      salePrice: unitSale,
      purchaseCost,
      quantity: 0,
      minQuantity: Math.min(pack, 10),
      idealQuantity: Math.max(pack, 10),
      supplier: "",
    });
  });

  return products.filter((product, index, list) => list.findIndex((item) => item.name === product.name) === index);
}

function cleanProductName(value) {
  return value.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function inferCategory(lines, index) {
  const previous = lines.slice(Math.max(0, index - 8), index).reverse();
  const category = previous.find((line) => /^[A-Z\s]+$/.test(line) || line.includes("BEBIDAS") || line.includes("Snacks"));
  return cleanProductName(category || "Inventario");
}

async function unzipFiles(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let directoryOffset = -1;

  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      directoryOffset = view.getUint32(offset + 16, true);
      break;
    }
  }

  if (directoryOffset < 0) throw new Error("No pude abrir el archivo comprimido.");

  const files = {};
  let offset = directoryOffset;
  while (view.getUint32(offset, true) === 0x02014b50) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      files[name] = await unzipEntry(compressed, method);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

async function unzipEntry(bytes, method) {
  if (method === 0) return new TextDecoder().decode(bytes);
  if (method !== 8) throw new Error("El archivo usa una compresion no soportada.");

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

function xmlDoc(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function localElements(root, localName) {
  return [...root.getElementsByTagName("*")].filter((element) => element.localName === localName);
}

function openStockModal(productId) {
  if (!requirePermission("inventory-edit")) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  state.stockProductId = productId;
  saveState();
  render();
}

function closeStockModal() {
  state.stockProductId = "";
  saveState();
  render();
}

async function confirmStockSupply(event) {
  event.preventDefault();
  if (!requirePermission("inventory-edit")) return;
  const product = state.products.find((item) => item.id === state.stockProductId);
  if (!product) return;

  const data = Object.fromEntries(new FormData(event.currentTarget));
  const amount = Number.parseInt(data.stockAmount, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    alert("Ingresa una cantidad válida para confirmar el surtido.");
    return;
  }

  const previousQuantity = product.quantity;
  product.quantity += amount;
  product.status = "activo";
  Object.assign(product, getInventoryWeek());

  try {
    await dbRecordInventoryMovement(product, amount, previousQuantity, `Surtido: ${product.name} +${amount}`);
    state.stockProductId = "";
    state.toast = `Surtido confirmado: ${product.name} +${amount}`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo registrar el surtido en Supabase: ${error.message}`);
  }
}

async function openCash(event) {
  event.preventDefault();
  if (!requirePermission("cash-open")) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const initialAmount = Math.round(parseMoney(data.initialAmount));

  if (!validateMoney(initialAmount, "Ingresa el monto inicial de la caja.")) {
    return;
  }

  const cash = createCashRegister(initialAmount);

  try {
    cash.id = await dbOpenCashRegister(cash);
    state.cashRegister = cash;
    state.toast = `Caja abierta con ${formatCurrency(initialAmount)}.`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo abrir la caja en Supabase: ${error.message}`);
  }
}

async function closeCash(event) {
  event.preventDefault();
  if (!requirePermission("cash-edit")) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const countedAmount = Math.round(parseMoney(data.countedAmount));

  if (!validateMoney(countedAmount, "Ingresa el dinero contado antes de cerrar la caja.")) {
    return;
  }

  state.cashRegister.status = "cerrada";
  state.cashRegister.closedAt = new Date().toISOString();
  state.cashRegister.countedAmount = countedAmount;
  state.cashRegister.difference = countedAmount - cashExpected();
  state.cashRegister.notes = data.cashNotes.trim();

  try {
    await dbUpdateCashRegister(state.cashRegister);
    state.toast = "Caja cerrada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo cerrar la caja en Supabase: ${error.message}`);
  }
}

async function editCashOpeningAmount(event) {
  event.preventDefault();
  if (!requirePermission("cash-edit")) return;
  if (!state.cashRegister || state.cashRegister.status !== "abierta") return;

  const data = Object.fromEntries(new FormData(event.currentTarget));
  const correctedAmount = Math.round(parseMoney(data.correctedInitialAmount));
  const reason = data.cashCorrectionReason.trim() || "Corrección manual";

  if (!validateMoney(correctedAmount, "Ingresa el monto inicial corregido.")) {
    return;
  }

  const previousAmount = state.cashRegister.initialAmount;
  state.cashRegister.initialAmount = correctedAmount;
  state.cashRegister.notes = `${state.cashRegister.notes || ""} Correccion: ${reason}`.trim();
  try {
    await dbUpdateCashRegister(state.cashRegister);
    state.toast = `Monto inicial corregido de ${formatCurrency(previousAmount)} a ${formatCurrency(correctedAmount)}.`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo corregir la caja en Supabase: ${error.message}`);
  }
}

function validateMoney(value, emptyMessage) {
  if (!Number.isFinite(value)) {
    alert(emptyMessage);
    return false;
  }

  if (value < 0) {
    alert("El monto no puede ser negativo.");
    return false;
  }

  return true;
}

async function voidCashRegister() {
  if (!requirePermission("cash-edit")) return;
  if (!state.cashRegister || state.cashRegister.status !== "abierta") return;

  if (state.cashRegister.cashTotal > 0 || state.cashRegister.transferTotal > 0) {
    alert("Esta caja ya tiene ventas registradas. Para proteger el historial, primero cierra la caja o anula las ventas desde un flujo autorizado.");
    return;
  }

  if (!confirm("Esta accion anula la caja abierta y permite abrir una nueva. ¿Continuar?")) return;

  try {
    state.cashRegister.status = "cerrada";
    state.cashRegister.closedAt = new Date().toISOString();
    state.cashRegister.countedAmount = 0;
    state.cashRegister.difference = -state.cashRegister.initialAmount;
    state.cashRegister.notes = "Caja anulada antes de ventas.";
    await dbUpdateCashRegister(state.cashRegister);
    state.toast = "Caja anulada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo anular la caja en Supabase: ${error.message}`);
  }
}

async function reopenCashRegister() {
  if (!requirePermission("cash-edit")) return;
  if (!state.cashRegister || state.cashRegister.status !== "cerrada") return;
  if (!confirm("La caja cerrada volverá a estado abierta para corrección. ¿Continuar?")) return;

  state.cashRegister.status = "abierta";
  state.cashRegister.closedAt = null;
  state.cashRegister.countedAmount = null;
  state.cashRegister.difference = null;
  try {
    await dbUpdateCashRegister(state.cashRegister);
    state.toast = "Caja reabierta para correccion.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo reabrir la caja en Supabase: ${error.message}`);
  }
}

async function deleteCashRegister() {
  if (!requirePermission("cash-edit")) return;
  if (!state.cashRegister) return;

  if (state.cashRegister.cashTotal > 0 || state.cashRegister.transferTotal > 0) {
    alert("No se puede eliminar una caja con ventas registradas. Reabre la caja para corregir el monto o realiza el cierre con observacion.");
    return;
  }

  if (!confirm("Esto elimina la caja actual del prototipo local y permite abrir otra. ¿Continuar?")) return;

  try {
    await supabaseDeleteWhere("cash_registers", `id=eq.${encodeURIComponent(state.cashRegister.id)}`);
    state.cashRegister = null;
    state.toast = "Caja eliminada correctamente.";
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    alert(`No se pudo eliminar la caja en Supabase: ${error.message}`);
  }
}

function stepSaleQuantity(delta) {
  const input = document.querySelector("#saleQuantity");
  if (!input) return;
  const current = Number.parseInt(input.value, 10) || 0;
  input.value = String(Math.max(1, current + delta));
}

function addSaleCartItem(event) {
  event.preventDefault();
  if (!requirePermission("sales")) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const product = state.products.find((item) => item.id === data.productId);
  const quantity = Number.parseInt(data.saleQuantity, 10);

  if (!state.cashRegister || state.cashRegister.status !== "abierta") {
    alert("Debes abrir caja antes de vender.");
    return;
  }

  if (!product || !Number.isInteger(quantity) || quantity <= 0) {
    alert("Selecciona producto y cantidad valida.");
    return;
  }

  const currentCartQuantity = (state.saleCart || [])
    .filter((item) => item.productId === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  if (quantity + currentCartQuantity > product.quantity) {
    alert("No hay inventario suficiente para esta venta.");
    return;
  }

  const existing = state.saleCart.find((item) => item.productId === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    state.saleCart.push({ productId: product.id, quantity });
  }

  state.saleNewPanelOpen = true;
  state.salePaymentMethod = data.paymentMethod || state.salePaymentMethod || "cash";
  state.toast = `${product.name} agregado al carrito.`;
  saveState();
  render();
}

function updateCartQuantity(productId, delta) {
  const item = state.saleCart.find((cartItem) => cartItem.productId === productId);
  const product = state.products.find((productItem) => productItem.id === productId);
  if (!item || !product) return;

  const nextQuantity = item.quantity + delta;
  if (nextQuantity <= 0) {
    removeCartItem(productId);
    return;
  }

  if (nextQuantity > product.quantity) {
    alert("No hay inventario suficiente para esa cantidad.");
    return;
  }

  item.quantity = nextQuantity;
  state.saleNewPanelOpen = true;
  saveState();
  render();
}

function removeCartItem(productId) {
  state.saleCart = state.saleCart.filter((item) => item.productId !== productId);
  state.saleNewPanelOpen = true;
  saveState();
  render();
}

function clearSaleCart() {
  state.saleCart = [];
  state.saleNewPanelOpen = true;
  saveState();
  render();
}

function createSale() {
  if (!requirePermission("sales")) return;
  const items = saleCartItems();

  if (!state.cashRegister || state.cashRegister.status !== "abierta") {
    alert("Debes abrir caja antes de vender.");
    return;
  }

  if (!items.length) {
    alert("Agrega al menos un producto al carrito.");
    return;
  }

  const invalid = items.find((item) => item.quantity > item.product.quantity);
  if (invalid) {
    alert(`No hay inventario suficiente para ${invalid.product.name}.`);
    return;
  }

  state.pendingSale = {
    items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    paymentMethod: state.salePaymentMethod || "cash",
  };
  saveState();
  render();
}

function cancelSale() {
  state.pendingSale = null;
  saveState();
  render();
}

async function confirmSale() {
  if (!requirePermission("sales")) return;
  const data = state.pendingSale;
  const items = (data?.items || []).map((item) => {
    const product = state.products.find((productItem) => productItem.id === item.productId);
    return product ? { product, quantity: item.quantity } : null;
  }).filter(Boolean);

  if (!state.cashRegister || state.cashRegister.status !== "abierta") {
    state.pendingSale = null;
    alert("Debes abrir caja antes de vender.");
    saveState();
    render();
    return;
  }

  if (!items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > item.product.quantity)) {
    state.pendingSale = null;
    alert("La disponibilidad del producto cambió. Revisa la venta e inténtalo nuevamente.");
    saveState();
    render();
    return;
  }

  const createdAt = new Date().toISOString();
  let total = 0;
  const dbItems = [];

  items.forEach(({ product, quantity }) => {
    const itemTotal = product.salePrice * quantity;
    const cost = product.purchaseCost * quantity;
    const previousQuantity = product.quantity;

    product.quantity -= quantity;
    product.status = product.quantity === 0 ? "agotado" : "activo";
    total += itemTotal;
    dbItems.push({ product, quantity, previousQuantity, itemTotal, cost });
  });

  if (data.paymentMethod === "cash") {
    state.cashRegister.cashTotal += total;
  } else {
    state.cashRegister.transferTotal += total;
  }

  try {
    await dbCreateSale(dbItems, data.paymentMethod, createdAt);
    state.saleCart = [];
    state.pendingSale = null;
    state.saleNewPanelOpen = true;
    state.toast = `Venta registrada por ${formatCurrency(total)}.`;
    await hydrateFromSupabase();
    dismissToastAfterDelay();
  } catch (error) {
    state.pendingSale = null;
    alert(`No se pudo registrar la venta en Supabase: ${error.message}`);
    await hydrateFromSupabase();
  }
}

function addMovement(type, description, amount = 0) {
  state.movements.push({
    id: crypto.randomUUID(),
    type,
    description,
    amount,
    userName: activeUser().name || "Sistema",
    createdAt: new Date().toISOString(),
  });
}

function addCashMovement({
  type = "income",
  category,
  description = "",
  amount = 0,
  paymentMethod = "",
  relatedTable = "",
  relatedId = "",
  occurredAt = new Date().toISOString(),
}) {
  if (!category || !relatedId) return;
  state.cashMovements = Array.isArray(state.cashMovements) ? state.cashMovements : [];
  const candidate = { relatedTable, relatedId, category };
  if (state.cashMovements.some((movement) => cashMovementKey(movement) === cashMovementKey(candidate))) return;

  state.cashMovements.push({
    id: crypto.randomUUID(),
    type,
    category,
    description,
    amount,
    paymentMethod,
    relatedTable,
    relatedId,
    isInitialImport: false,
    occurredAt,
    createdAt: new Date().toISOString(),
  });
}

async function bootstrap() {
  render();
  await hydrateFromSupabase();
}

bootstrap();
