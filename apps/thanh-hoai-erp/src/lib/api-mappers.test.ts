/**
 * Lightweight Node test for API mappers (no Jest required).
 * Run: node --experimental-strip-types apps/thanh-hoai-erp/src/lib/api-mappers.test.ts
 * or via npx tsx.
 */
import assert from "node:assert/strict";
import {
  mapRuntimeCustomer,
  mapRuntimeProject,
  mapRuntimeQuotation,
  mapRuntimeReceivable,
  mapRuntimeRole,
  mapRuntimeUser,
  rowsOf,
} from "./api-mappers";

assert.equal(mapRuntimeRole("Giam doc"), "giamdoc");
assert.equal(mapRuntimeRole("Quan tri he thong"), "admin");
assert.equal(mapRuntimeRole("Ky thuat truong"), "ktt");

const user = mapRuntimeUser({
  id: 7,
  username: "boss",
  full_name: "Nguyen Van A",
  role: "Giam doc",
});
assert.equal(user.role, "giamdoc");
assert.equal(user.username, "boss");

assert.deepEqual(
  rowsOf({ invoices: [{ code: "1" }] }).map((r) => r.code),
  ["1"],
);
assert.equal(rowsOf([{ id: 1 }]).length, 1);

const c = mapRuntimeCustomer({
  id: 3,
  code: "KH-03",
  customer_name: "CTY ABC",
  tax_id: "0123",
});
assert.equal(c.name, "CTY ABC");
assert.equal(c.taxId, "0123");

const p = mapRuntimeProject({
  project_id: 9,
  code: "CT-01",
  project_name: "HVAC",
  customer_name: "CTY ABC",
  percent_complete: 55,
  status: "Open",
  cham_tien_do: 2,
});
assert.equal(p.id, "9");
assert.equal(p.stage, "thi_cong");
assert.equal(p.overdue, true);

const q = mapRuntimeQuotation(
  { id: 1, code: "BG-1", customer_name: "X", status: "Cho duyet", grand_total: 1 },
  {
    items: [{ id: 1, ten_hang: "Ong", so_luong: 2, don_gia: 1000, don_vi: "m" }],
    chain: [{ version: "V2" }],
  },
);
assert.equal(q.status, "pending");
assert.equal(q.revision, 2);
assert.equal(q.lines.length, 1);

const ar = mapRuntimeReceivable(
  {
    code: "HD-1",
    customer_name: "X",
    grand_total: 100,
    da_thu: 20,
    outstanding_amount: 80,
    due_date: "2020-01-01",
  },
  0,
);
assert.equal(ar.status, "overdue");
assert.equal(ar.value, 100);

console.log("api-mappers.test.ts: OK");
