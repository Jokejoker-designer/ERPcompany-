import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type CartLine,
  type Customer,
  type GoodsReceipt,
  type GrnLine,
  type Lot,
  type Product,
  type PromoRule,
  type PurchaseOrder,
  type Sale,
  type Shift,
  type StockCount,
  type StoreConfig,
  type Supplier,
  type User,
  DEMO_USERS,
  SEED_CATEGORIES,
  SEED_CUSTOMERS,
  SEED_GRNS,
  SEED_LOTS,
  SEED_POS,
  SEED_PRODUCTS,
  SEED_PROMOS,
  SEED_STORE,
  SEED_SUPPLIERS,
  computeMap,
  productByBarcode,
  parseWeightedBarcode,
  toBaseQty,
  tierDiscount,
} from "@/data/retail";

type RetailState = {
  user: User | null;
  store: StoreConfig;
  products: Product[];
  categories: typeof SEED_CATEGORIES;
  lots: Lot[];
  suppliers: Supplier[];
  customers: Customer[];
  promos: PromoRule[];
  purchaseOrders: PurchaseOrder[];
  grns: GoodsReceipt[];
  sales: Sale[];
  counts: StockCount[];
  shifts: Shift[];
  /** active POS cart */
  cart: CartLine[];
  cartCustomerId: string | null;
  activeShiftId: string | null;

  login: (username: string) => boolean;
  logout: () => void;
  updateStore: (p: Partial<StoreConfig>) => void;

  addProduct: (p: Omit<Product, "id">) => void;
  updateProduct: (id: string, p: Partial<Product>) => void;
  addSupplier: (s: Omit<Supplier, "id">) => void;
  addCustomer: (c: Omit<Customer, "id" | "code"> & { code?: string }) => void;

  createPo: (supplierId: string, lines: PurchaseOrder["lines"]) => string;
  postGrn: (input: {
    supplierId: string;
    poId?: string;
    lines: GrnLine[];
  }) => string;

  openShift: (openingCash: number) => string;
  closeShift: (countedCash: number) => void;

  setCartCustomer: (id: string | null) => void;
  addToCartByCode: (code: string) => { ok: boolean; message: string };
  addToCart: (productId: string, qty: number, uom?: string) => void;
  updateCartQty: (lineId: string, qty: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  cartTotals: () => {
    subtotal: number;
    discount: number;
    vat: number;
    total: number;
    appliedPromos: string[];
  };
  checkout: (payments: Sale["payments"]) => { ok: boolean; saleId?: string; message: string };

  createCount: (location: string, productIds: string[]) => string;
  submitCount: (id: string, counts: Record<string, number>, reasons: Record<string, string>) => void;
  approveCount: (id: string) => void;

  nearExpiryLots: (withinDays?: number) => (Lot & { product?: Product; days: number })[];
  resetDemo: () => void;
};

function saleCode(n: number) {
  return `HD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(n).padStart(4, "0")}`;
}

export const useRetailStore = create<RetailState>()(
  persist(
    (set, get) => ({
      user: null,
      store: SEED_STORE,
      products: SEED_PRODUCTS,
      categories: SEED_CATEGORIES,
      lots: SEED_LOTS,
      suppliers: SEED_SUPPLIERS,
      customers: SEED_CUSTOMERS,
      promos: SEED_PROMOS,
      purchaseOrders: SEED_POS,
      grns: SEED_GRNS,
      sales: [],
      counts: [],
      shifts: [],
      cart: [],
      cartCustomerId: null,
      activeShiftId: null,

      login: (username) => {
        const found = DEMO_USERS.find(
          (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (!found) return false;
        set({ user: found });
        return true;
      },
      logout: () => set({ user: null, cart: [], cartCustomerId: null }),

      updateStore: (p) => set((s) => ({ store: { ...s.store, ...p } })),

      addProduct: (p) =>
        set((s) => ({
          products: [{ ...p, id: `p${Date.now()}` }, ...s.products],
        })),

      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        })),

      addSupplier: (sup) =>
        set((s) => ({
          suppliers: [{ ...sup, id: `s${Date.now()}` }, ...s.suppliers],
        })),

      addCustomer: (c) =>
        set((s) => ({
          customers: [
            {
              id: `c${Date.now()}`,
              code: c.code || `KH-${String(s.customers.length + 1).padStart(3, "0")}`,
              name: c.name,
              phone: c.phone,
              tier: c.tier,
              points: c.points ?? 0,
              visits: c.visits ?? 0,
              totalSpend: c.totalSpend ?? 0,
              lastItems: c.lastItems ?? [],
            },
            ...s.customers,
          ],
        })),

      createPo: (supplierId, lines) => {
        const id = `po${Date.now()}`;
        const code = `PO-2026-${String(get().purchaseOrders.length + 20).padStart(3, "0")}`;
        set((s) => ({
          purchaseOrders: [
            {
              id,
              code,
              supplierId,
              status: "ordered",
              createdAt: new Date().toISOString().slice(0, 10),
              lines,
            },
            ...s.purchaseOrders,
          ],
        }));
        return id;
      },

      postGrn: ({ supplierId, poId, lines }) => {
        const id = `grn${Date.now()}`;
        const code = `GRN-${String(get().grns.length + 1).padStart(4, "0")}`;
        const grn: GoodsReceipt = {
          id,
          code,
          poId,
          supplierId,
          status: "posted",
          createdAt: new Date().toISOString(),
          lines,
        };

        set((s) => {
          let products = [...s.products];
          let lots = [...s.lots];
          for (const line of lines) {
            if (!line.qcOk) continue;
            const p = products.find((x) => x.id === line.productId);
            if (!p) continue;
            const newMap = computeMap(
              p.stock,
              p.costMap,
              line.qtyBase,
              line.unitCost,
            );
            products = products.map((x) =>
              x.id === p.id
                ? {
                    ...x,
                    stock: x.stock + line.qtyBase,
                    costMap: newMap,
                  }
                : x,
            );
            if (p.trackLot) {
              lots = [
                {
                  id: `lot-${Date.now()}-${line.productId}`,
                  productId: line.productId,
                  batchNo: line.batchNo || `AUTO-${Date.now()}`,
                  expiryDate: line.expiryDate || "2099-12-31",
                  qty: line.qtyBase,
                  cost: line.unitCost,
                  receivedAt: new Date().toISOString().slice(0, 10),
                },
                ...lots,
              ];
            }
          }
          const purchaseOrders = s.purchaseOrders.map((po) =>
            po.id === poId ? { ...po, status: "received" as const } : po,
          );
          return {
            grns: [grn, ...s.grns],
            products,
            lots,
            purchaseOrders,
          };
        });
        return id;
      },

      openShift: (openingCash) => {
        const user = get().user;
        if (!user) return "";
        const id = `sh${Date.now()}`;
        const shift: Shift = {
          id,
          code: `CA-${new Date().toISOString().slice(0, 10)}-${user.initials}`,
          cashierId: user.id,
          cashierName: user.name,
          openedAt: new Date().toISOString(),
          openingCash,
          systemCash: 0,
          status: "open",
        };
        set((s) => ({
          shifts: [shift, ...s.shifts],
          activeShiftId: id,
        }));
        return id;
      },

      closeShift: (countedCash) => {
        const id = get().activeShiftId;
        if (!id) return;
        set((s) => ({
          shifts: s.shifts.map((sh) => {
            if (sh.id !== id) return sh;
            const systemCash = sh.openingCash + sh.systemCash;
            return {
              ...sh,
              closedAt: new Date().toISOString(),
              countedCash,
              status: "closed" as const,
              variance: countedCash - systemCash,
            };
          }),
          activeShiftId: null,
        }));
      },

      setCartCustomer: (id) => set({ cartCustomerId: id }),

      addToCartByCode: (code) => {
        const products = get().products;
        const weighted = parseWeightedBarcode(products, code.trim());
        if (weighted) {
          get().addToCart(weighted.product.id, weighted.qtyKg, "Kg");
          return {
            ok: true,
            message: `${weighted.product.name} · ${weighted.qtyKg} Kg (mã cân)`,
          };
        }
        const p = productByBarcode(products, code);
        if (!p) return { ok: false, message: "Không tìm thấy mã vạch / SKU" };
        get().addToCart(p.id, 1, p.baseUom);
        return { ok: true, message: p.name };
      },

      addToCart: (productId, qty, uom) => {
        const p = get().products.find((x) => x.id === productId);
        if (!p) return;
        const unit = uom || p.baseUom;
        const factor = p.conversion[unit] ?? 1;
        const unitPrice = p.price * factor;
        set((s) => {
          const existing = s.cart.find(
            (l) => l.productId === productId && l.uom === unit,
          );
          if (existing) {
            return {
              cart: s.cart.map((l) =>
                l.id === existing.id
                  ? { ...l, qty: l.qty + qty }
                  : l,
              ),
            };
          }
          return {
            cart: [
              ...s.cart,
              {
                id: `cl${Date.now()}`,
                productId: p.id,
                name: p.name,
                qty,
                uom: unit,
                unitPrice,
                discount: 0,
              },
            ],
          };
        });
      },

      updateCartQty: (lineId, qty) =>
        set((s) => ({
          cart:
            qty <= 0
              ? s.cart.filter((l) => l.id !== lineId)
              : s.cart.map((l) => (l.id === lineId ? { ...l, qty } : l)),
        })),

      removeCartLine: (lineId) =>
        set((s) => ({ cart: s.cart.filter((l) => l.id !== lineId) })),

      clearCart: () => set({ cart: [], cartCustomerId: null }),

      cartTotals: () => {
        const s = get();
        let subtotal = 0;
        let discount = 0;
        const applied: string[] = [];
        const lines = s.cart.map((l) => ({ ...l }));

        for (const l of lines) {
          subtotal += l.qty * l.unitPrice;
        }

        // bundle promo
        for (const pr of s.promos.filter((p) => p.active && p.type === "bundle")) {
          if (!pr.skus || pr.skus.length < 2) continue;
          const skusInCart = pr.skus.every((sku) => {
            const prod = s.products.find((p) => p.sku === sku);
            return prod && lines.some((l) => l.productId === prod.id);
          });
          if (skusInCart && pr.percent) {
            let bundleBase = 0;
            for (const sku of pr.skus) {
              const prod = s.products.find((p) => p.sku === sku);
              if (!prod) continue;
              const line = lines.find((l) => l.productId === prod.id);
              if (line) bundleBase += line.qty * line.unitPrice;
            }
            const d = (bundleBase * pr.percent) / 100;
            discount += d;
            applied.push(pr.name);
          }
        }

        // time promo
        const hour = new Date().getHours();
        for (const pr of s.promos.filter((p) => p.active && p.type === "time")) {
          if (
            pr.startHour != null &&
            pr.endHour != null &&
            hour >= pr.startHour &&
            hour < pr.endHour &&
            pr.percent &&
            pr.skus
          ) {
            for (const sku of pr.skus) {
              const prod = s.products.find((p) => p.sku === sku);
              if (!prod) continue;
              const line = lines.find((l) => l.productId === prod.id);
              if (line) {
                discount += (line.qty * line.unitPrice * pr.percent) / 100;
                applied.push(pr.name);
              }
            }
          }
        }

        // tier
        const cust = s.customers.find((c) => c.id === s.cartCustomerId);
        if (cust) {
          const td = tierDiscount(cust.tier);
          if (td > 0) {
            discount += (subtotal - discount) * td;
            applied.push(`Hạng ${cust.tier} −${td * 100}%`);
          }
        }

        discount = Math.round(discount);
        const after = Math.max(0, subtotal - discount);
        const vat = Math.round((after * s.store.vatDefault) / (100 + s.store.vatDefault));
        // price already includes VAT typically in VN retail; show VAT as included portion
        const total = after;
        return { subtotal, discount, vat, total, appliedPromos: applied };
      },

      checkout: (payments) => {
        const s = get();
        if (!s.cart.length) return { ok: false, message: "Giỏ trống" };
        if (!s.activeShiftId && s.user?.role === "cashier") {
          return { ok: false, message: "Mở ca trước khi bán" };
        }
        // ensure shift for any role selling
        let shiftId = s.activeShiftId;
        if (!shiftId) {
          shiftId = get().openShift(0);
        }

        const totals = get().cartTotals();
        const paySum = payments.reduce((a, p) => a + p.amount, 0);
        if (paySum + 0.5 < totals.total) {
          return { ok: false, message: "Thiếu tiền thanh toán" };
        }

        // stock check
        for (const line of s.cart) {
          const p = s.products.find((x) => x.id === line.productId);
          if (!p) continue;
          const base = toBaseQty(p, line.qty, line.uom);
          if (p.stock < base) {
            return {
              ok: false,
              message: `Không đủ tồn: ${p.name} (còn ${p.stock} ${p.baseUom})`,
            };
          }
        }

        const saleId = `sale${Date.now()}`;
        const sale: Sale = {
          id: saleId,
          code: saleCode(s.sales.length + 1),
          createdAt: new Date().toISOString(),
          cashierId: s.user?.id || "u3",
          customerId: s.cartCustomerId || undefined,
          lines: s.cart.map((l) => ({ ...l })),
          subtotal: totals.subtotal,
          discount: totals.discount,
          vat: totals.vat,
          total: totals.total,
          payments,
          status: "paid",
          shiftId: shiftId!,
        };

        set((st) => {
          let products = [...st.products];
          let lots = [...st.lots];
          for (const line of st.cart) {
            const p = products.find((x) => x.id === line.productId);
            if (!p) continue;
            const base = toBaseQty(p, line.qty, line.uom);
            products = products.map((x) =>
              x.id === p.id ? { ...x, stock: Math.max(0, x.stock - base) } : x,
            );
            // FEFO deduct lots
            if (p.trackLot) {
              let remain = base;
              const productLots = lots
                .filter((l) => l.productId === p.id && l.qty > 0)
                .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
              for (const lot of productLots) {
                if (remain <= 0) break;
                const take = Math.min(lot.qty, remain);
                lots = lots.map((l) =>
                  l.id === lot.id ? { ...l, qty: l.qty - take } : l,
                );
                remain -= take;
              }
            }
          }

          let customers = st.customers;
          if (st.cartCustomerId) {
            const pts = Math.floor(totals.total / 10000);
            customers = st.customers.map((c) =>
              c.id === st.cartCustomerId
                ? {
                    ...c,
                    points: c.points + pts,
                    visits: c.visits + 1,
                    totalSpend: c.totalSpend + totals.total,
                    lastItems: st.cart.slice(0, 3).map((l) => l.name),
                  }
                : c,
            );
          }

          const cashPay = payments
            .filter((p) => p.method === "cash")
            .reduce((a, p) => a + p.amount, 0);

          return {
            sales: [sale, ...st.sales],
            products,
            lots,
            customers,
            cart: [],
            cartCustomerId: null,
            shifts: st.shifts.map((sh) =>
              sh.id === shiftId
                ? { ...sh, systemCash: sh.systemCash + cashPay }
                : sh,
            ),
          };
        });

        return { ok: true, saleId, message: sale.code };
      },

      createCount: (location, productIds) => {
        const id = `cnt${Date.now()}`;
        const products = get().products;
        const lines = productIds.map((pid) => {
          const p = products.find((x) => x.id === pid);
          return {
            productId: pid,
            systemQty: p?.stock ?? 0,
            countedQty: p?.stock ?? 0,
          };
        });
        set((s) => ({
          counts: [
            {
              id,
              code: `KK-${String(s.counts.length + 1).padStart(3, "0")}`,
              location,
              status: "open",
              createdAt: new Date().toISOString(),
              lines,
            },
            ...s.counts,
          ],
        }));
        return id;
      },

      submitCount: (id, counts, reasons) =>
        set((s) => ({
          counts: s.counts.map((c) => {
            if (c.id !== id) return c;
            return {
              ...c,
              status: "submitted" as const,
              lines: c.lines.map((l) => ({
                ...l,
                countedQty: counts[l.productId] ?? l.countedQty,
                reasonCode:
                  (counts[l.productId] ?? l.countedQty) !== l.systemQty
                    ? reasons[l.productId] || "04"
                    : undefined,
              })),
            };
          }),
        })),

      approveCount: (id) =>
        set((s) => {
          const count = s.counts.find((c) => c.id === id);
          if (!count) return s;
          let products = [...s.products];
          for (const line of count.lines) {
            const variance = line.countedQty - line.systemQty;
            if (variance === 0) continue;
            products = products.map((p) =>
              p.id === line.productId
                ? { ...p, stock: line.countedQty }
                : p,
            );
          }
          return {
            products,
            counts: s.counts.map((c) =>
              c.id === id ? { ...c, status: "approved" as const } : c,
            ),
          };
        }),

      nearExpiryLots: (withinDays = 60) => {
        const { lots, products } = get();
        const now = new Date();
        return lots
          .map((l) => {
            const d = new Date(l.expiryDate + "T00:00:00");
            const days = Math.ceil(
              (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            return {
              ...l,
              product: products.find((p) => p.id === l.productId),
              days,
            };
          })
          .filter((l) => l.qty > 0 && l.days <= withinDays)
          .sort((a, b) => a.days - b.days);
      },

      resetDemo: () =>
        set({
          store: SEED_STORE,
          products: SEED_PRODUCTS,
          categories: SEED_CATEGORIES,
          lots: SEED_LOTS,
          suppliers: SEED_SUPPLIERS,
          customers: SEED_CUSTOMERS,
          promos: SEED_PROMOS,
          purchaseOrders: SEED_POS,
          grns: [],
          sales: [],
          counts: [],
          shifts: [],
          cart: [],
          cartCustomerId: null,
          activeShiftId: null,
        }),
    }),
    {
      name: "ankhang-retail-erp-v1",
      partialize: (s) => ({
        user: s.user,
        store: s.store,
        products: s.products,
        lots: s.lots,
        suppliers: s.suppliers,
        customers: s.customers,
        promos: s.promos,
        purchaseOrders: s.purchaseOrders,
        grns: s.grns,
        sales: s.sales,
        counts: s.counts,
        shifts: s.shifts,
        activeShiftId: s.activeShiftId,
      }),
    },
  ),
);
