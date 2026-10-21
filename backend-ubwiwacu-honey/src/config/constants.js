// Values here mirror the CHECK constraints in database/schema.sql. Keep them in sync.

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  VERIFIER: 'verifier',
});
export const ALL_ROLES = Object.values(ROLES);

// Who may do what. Today only the admin exists; other roles slot in later.
export const ROLE_GROUPS = Object.freeze({
  CATALOGUE: [ROLES.ADMIN, ROLES.MANAGER],
  ORDERS: [ROLES.ADMIN, ROLES.MANAGER],
  PAYMENTS: [ROLES.ADMIN, ROLES.MANAGER, ROLES.VERIFIER],
  RECEIPTS: [ROLES.ADMIN, ROLES.MANAGER, ROLES.VERIFIER, ROLES.CASHIER],
  POS: [ROLES.ADMIN, ROLES.CASHIER],
  POS_VOID: [ROLES.ADMIN],
  REPORTS: [ROLES.ADMIN, ROLES.MANAGER],
  AUDIT: [ROLES.ADMIN],
});

export const USER_STATUS = Object.freeze({ ACTIVE: 'active', SUSPENDED: 'suspended' });

export const PRODUCT_CATEGORIES = Object.freeze(['standard', 'premium']);

export const ORDER_SOURCES = Object.freeze({
  WEB: 'web',
  POS: 'pos',
  WHATSAPP: 'whatsapp',
  PHONE: 'phone',
  INSTAGRAM: 'instagram',
});
export const ALL_ORDER_SOURCES = Object.values(ORDER_SOURCES);
export const MANUAL_ORDER_SOURCES = Object.freeze([
  ORDER_SOURCES.WHATSAPP,
  ORDER_SOURCES.PHONE,
  ORDER_SOURCES.INSTAGRAM,
]);

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFICATION: 'verification',
  PAID: 'paid',
  REJECTED: 'rejected',
  REFUNDED: 'refunded',
});
export const ALL_PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);

export const FULFILMENT_STATUS = Object.freeze({
  RECEIVED: 'received',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_VERIFICATION: 'payment_verification',
  PAID: 'paid',
  PREPARING: 'preparing',
  READY: 'ready',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});
export const ALL_FULFILMENT_STATUSES = Object.values(FULFILMENT_STATUS);

// Manual transitions an admin may make via PATCH /admin/orders/:id/status.
// 'paid' is never set here: only payment verification (or a verified webhook) does that.
export const FULFILMENT_TRANSITIONS = Object.freeze({
  received: ['preparing', 'cancelled'],
  awaiting_payment: ['preparing', 'cancelled'],
  payment_verification: ['preparing', 'cancelled'],
  paid: ['preparing', 'cancelled', 'refunded'],
  preparing: ['ready', 'cancelled'],
  ready: ['fulfilled', 'cancelled'],
  fulfilled: ['refunded'],
  cancelled: [],
  refunded: [],
});

// Statuses before payment is confirmed; payment events may move the order forward from these.
export const PRE_PAYMENT_FULFILMENT = Object.freeze([
  FULFILMENT_STATUS.RECEIVED,
  FULFILMENT_STATUS.AWAITING_PAYMENT,
  FULFILMENT_STATUS.PAYMENT_VERIFICATION,
]);

export const CLOSED_FULFILMENT = Object.freeze([
  FULFILMENT_STATUS.CANCELLED,
  FULFILMENT_STATUS.REFUNDED,
]);

export const FULFILMENT_TYPES = Object.freeze({ DELIVERY: 'delivery', COLLECTION: 'collection' });

export const PAYMENT_METHODS = Object.freeze({
  MTN_MOMO: 'mtn_momo',
  AIRTEL: 'airtel',
  BANK: 'bank',
  CASH: 'cash',
  GATEWAY: 'gateway',
});
export const ALL_PAYMENT_METHODS = Object.values(PAYMENT_METHODS);
// Methods a guest may choose at checkout / when submitting a reference.
export const CUSTOMER_PAYMENT_METHODS = Object.freeze(['mtn_momo', 'airtel', 'bank', 'cash']);
export const REFERENCE_PAYMENT_METHODS = Object.freeze(['mtn_momo', 'airtel', 'bank']);
export const POS_PAYMENT_METHODS = Object.freeze(['cash', 'mtn_momo', 'airtel', 'bank']);

export const PAYMENT_METHOD_LABELS = Object.freeze({
  mtn_momo: 'MTN Mobile Money',
  airtel: 'Airtel Money',
  bank: 'Bank Transfer',
  cash: 'Cash',
  gateway: 'Online Payment',
});

export const RECEIPT_DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
});

export const DELIVERY_REQUIRED_FIELDS = Object.freeze([
  'delivery_recipient_name',
  'delivery_phone',
  'delivery_district',
  'delivery_sector',
  'delivery_cell',
  'delivery_village',
  'delivery_landmark',
]);

export const DELIVERY_FIELDS = Object.freeze([
  ...DELIVERY_REQUIRED_FIELDS,
  'delivery_email',
  'delivery_preferred_time',
  'delivery_province',
  'delivery_location_code',
  'delivery_address',
]);

export const DELIVERY_NOTICE =
  "Delivery is not included in the product price. Customers are responsible for arranging and paying for delivery. Please confirm your delivery arrangements with Ubw'iwacu Honey before completing your order.";

export const COLLECTION_NOTICE =
  "You chose to collect your order. Ubw'iwacu Honey will contact you to confirm when and where your order is ready for collection.";

export const PAYMENT_SAFETY_NOTICE =
  "Ubw'iwacu Honey will never ask for your Mobile Money PIN, bank password or card details.";

export const COUNTERS = Object.freeze({ ORDER: 'order_seq', RECEIPT: 'receipt_seq' });
export const IDEMPOTENCY_PREFIX = 'idem:';

export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  PASSWORD_RESET_REQUEST: 'auth.password_reset_request',
  PASSWORD_RESET: 'auth.password_reset',
  PASSWORD_CHANGE: 'auth.password_change',
  TWO_FACTOR_CHANGE: 'auth.two_factor_change',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',
  PRODUCT_IMAGE: 'product.image',
  STOCK_ADJUST: 'stock.adjust',
  ORDER_CREATE: 'order.create',
  ORDER_MANUAL_CREATE: 'order.manual_create',
  ORDER_STATUS: 'order.status',
  ORDER_CANCEL: 'order.cancel',
  ORDER_REFUND: 'order.refund',
  PAYMENT_SUBMIT_REF: 'payment.submit_reference',
  PAYMENT_PUSH_REQUEST: 'payment.push_request',
  PAYMENT_VERIFY: 'payment.verify',
  PAYMENT_REJECT: 'payment.reject',
  PAYMENT_WEBHOOK: 'payment.webhook',
  RECEIPT_ISSUE: 'receipt.issue',
  RECEIPT_RESEND: 'receipt.resend',
  POS_SALE: 'pos.sale',
  POS_VOID: 'pos.void',
});

export const LOW_STOCK_STATUS = Object.freeze({
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
});

export const PAGINATION = Object.freeze({ DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

export const TIMEZONE = 'Africa/Kigali';
