import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import {
  approveStaffSignupRequest,
  listAppointments
} from "./adminController.js";
import { createStaffSignupRequest } from "./publicController.js";

function createResponseDouble() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    type() {
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

function withPatchedPrisma(setup, run) {
  const originals = new Map();

  const register = (target, key, value) => {
    originals.set([target, key], target[key]);
    target[key] = value;
  };

  setup(register);

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [[target, key], original] of originals.entries()) {
        target[key] = original;
      }
    });
}

test("listAppointments hides canceled appointments by default", async () => {
  let receivedWhere;

  await withPatchedPrisma(
    (patch) => {
      patch(prisma.appointment, "findMany", async ({ where }) => {
        receivedWhere = where;
        return [
          {
            id: "appointment-1",
            status: "PENDING",
            startAt: new Date("2026-05-12T15:00:00.000Z"),
            endAt: new Date("2026-05-12T16:00:00.000Z"),
            notes: "Primeira revisão",
            client: { name: "Leo", email: "leo@example.com", phone: "71999999999" },
            professional: { name: "Admin", email: "admin@example.com" },
            space: { id: "space-1", name: "Sala 1" }
          }
        ];
      });
    },
    async () => {
      const req = {
        query: {
          from: "2026-05-10T00:00:00.000Z",
          to: "2026-05-20T00:00:00.000Z"
        },
        user: { id: "admin-1", role: "ADMIN" }
      };
      const res = createResponseDouble();

      await listAppointments(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.length, 1);
      assert.match(
        res.body[0].googleCalendarUrl,
        /^https:\/\/calendar\.google\.com\/calendar\/render\?/
      );
      assert.match(res.body[0].googleCalendarUrl, /action=TEMPLATE/);
      assert.match(res.body[0].googleCalendarUrl, /Sala\+1|Sala%201/);
      assert.deepEqual(receivedWhere.status, { not: "CANCELED" });
    }
  );
});

test("listAppointments includes canceled appointments only when explicitly requested", async () => {
  let receivedWhere;

  await withPatchedPrisma(
    (patch) => {
      patch(prisma.appointment, "findMany", async ({ where }) => {
        receivedWhere = where;
        return [];
      });
    },
    async () => {
      const req = {
        query: {
          from: "2026-05-10T00:00:00.000Z",
          to: "2026-05-20T00:00:00.000Z",
          includeCanceled: "true"
        },
        user: { id: "admin-1", role: "ADMIN" }
      };
      const res = createResponseDouble();

      await listAppointments(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal("status" in receivedWhere, false);
    }
  );
});

test("createStaffSignupRequest rejects duplicate pending requests for the same email", async () => {
  await withPatchedPrisma(
    (patch) => {
      patch(prisma.user, "findUnique", async () => null);
      patch(prisma.staffSignupRequest, "findFirst", async () => ({
        id: "pending-1"
      }));
    },
    async () => {
      const req = {
        body: {
          name: "Nova Pessoa",
          email: "teste@example.com",
          password: "123456"
        }
      };
      const res = createResponseDouble();

      await createStaffSignupRequest(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, "There is already a pending request for this email");
    }
  );
});

test("createStaffSignupRequest normalizes and persists valid requests", async () => {
  let createdPayload;

  await withPatchedPrisma(
    (patch) => {
      patch(prisma.user, "findUnique", async () => null);
      patch(prisma.staffSignupRequest, "findFirst", async () => null);
      patch(prisma.staffSignupRequest, "create", async ({ data }) => {
        createdPayload = data;
        return {
          id: "request-1",
          name: data.name,
          email: data.email,
          status: "PENDING",
          createdAt: new Date("2026-05-12T12:00:00.000Z")
        };
      });
    },
    async () => {
      const req = {
        body: {
          name: "  Pessoa Teste  ",
          email: "  TESTE@Example.com  ",
          password: "123456"
        }
      };
      const res = createResponseDouble();

      await createStaffSignupRequest(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(createdPayload.name, "Pessoa Teste");
      assert.equal(createdPayload.email, "teste@example.com");
      assert.notEqual(createdPayload.passwordHash, "123456");
      assert.equal(res.body.email, "teste@example.com");
      assert.equal(res.body.status, "PENDING");
    }
  );
});

test("approveStaffSignupRequest creates a professional and default availability rules", async () => {
  const updatedRequest = {
    id: "signup-1",
    name: "Pessoa Nova",
    email: "pessoa@example.com",
    status: "APPROVED"
  };
  let createdUserPayload;
  let availabilityPayload;
  let reviewedPayload;

  await withPatchedPrisma(
    (patch) => {
      patch(prisma.staffSignupRequest, "findUnique", async () => ({
        id: "signup-1",
        name: "Pessoa Nova",
        email: "pessoa@example.com",
        passwordHash: "hash",
        status: "PENDING"
      }));
      patch(prisma.user, "findUnique", async () => null);
      patch(prisma, "$transaction", async (callback) => {
        const tx = {
          user: {
            create: async ({ data }) => {
              createdUserPayload = data;
              return { id: "professional-1", ...data };
            }
          },
          availabilityRule: {
            createMany: async ({ data }) => {
              availabilityPayload = data;
              return { count: data.length };
            }
          },
          staffSignupRequest: {
            update: async ({ data }) => {
              reviewedPayload = data;
              return updatedRequest;
            }
          }
        };

        return callback(tx);
      });
    },
    async () => {
      const req = {
        params: { id: "signup-1" },
        user: { id: "admin-1", role: "ADMIN" }
      };
      const res = createResponseDouble();

      await approveStaffSignupRequest(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(createdUserPayload.role, "PROFESSIONAL");
      assert.equal(createdUserPayload.email, "pessoa@example.com");
      assert.equal(availabilityPayload.length, 5);
      assert.deepEqual(
        availabilityPayload.map((rule) => rule.dayOfWeek),
        [1, 2, 3, 4, 5]
      );
      assert.ok(
        availabilityPayload.every(
          (rule) =>
            rule.userId === "professional-1" &&
            rule.startTime === config.defaultWorkStart &&
            rule.endTime === config.defaultWorkEnd &&
            rule.slotMinutes === config.defaultSlotMinutes &&
            rule.isActive === true
        )
      );
      assert.equal(reviewedPayload.status, "APPROVED");
      assert.equal(reviewedPayload.reviewedById, "admin-1");
      assert.deepEqual(res.body, updatedRequest);
    }
  );
});
