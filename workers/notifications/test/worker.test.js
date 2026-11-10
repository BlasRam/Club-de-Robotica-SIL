import test from "node:test";
import assert from "node:assert/strict";
import worker, { DoorDeviceHub } from "../src/index.js";

test("rejects unlisted event routes without needing Firebase credentials", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/events/send-anything", { method: "POST" }), {});
  assert.equal(response.status, 404);
});

test("requires a Firebase bearer token before reading the event", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/events/task-created", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "event-1" }),
  }), {});
  assert.equal(response.status, 401);
});

test("accepts only event IDs, not client supplied push content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "INVALID_ID_TOKEN" } }), { status: 400 });
  try {
    const response = await worker.fetch(new Request("https://worker.test/v1/events/task-created", {
      method: "POST",
      headers: { Authorization: "Bearer fake", "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", token: "arbitrary", title: "spoof", body: "spoof" }),
    }), { FIREBASE_WEB_API_KEY: "fake" });
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unverified or non-institutional Firebase accounts", async () => {
  const originalFetch = globalThis.fetch;
  for (const user of [
    { localId: "external", email: "person@gmail.com", emailVerified: true },
    { localId: "unverified", email: "student@robotica-sil.invalid", emailVerified: false },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ users: [user] }), { status: 200 });
    const response = await worker.fetch(new Request("https://worker.test/v1/events/task-created", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }), { FIREBASE_WEB_API_KEY: "fake" });
    assert.equal(response.status, 403);
  }
  globalThis.fetch = originalFetch;
});

test("door control stays disabled unless explicitly provisioned", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doorId: "lab-main" }),
  }), { DOOR_CONTROL_ENABLED: "false", DOOR_ID: "lab-main", DOOR_DEVICE_ID: "cdr-esp32-door-01" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "door_control_disabled" });
});

test("entry-event receiver stays disabled by default", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/entry-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessId: "entry-1" }),
  }), {
    DOOR_ENTRY_TEST_ENABLED: "false",
    DOOR_ID: "lab-main",
    DOOR_DEVICE_ID: "cdr-esp32-door-01",
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "door_entry_test_disabled" });
});

test("entry-event API requires a Firebase bearer token", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/entry-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessId: "entry-1" }),
  }), {
    DOOR_ENTRY_TEST_ENABLED: "true",
    DOOR_ID: "lab-main",
    DOOR_DEVICE_ID: "cdr-esp32-door-01",
    DOOR_DEVICE_SECRET: "a".repeat(64),
  });
  assert.equal(response.status, 401);
});

test("entry-event endpoint rejects client-chosen message content", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/entry-events", {
    method: "POST",
    headers: { Authorization: "Bearer fake", "Content-Type": "application/json" },
    body: JSON.stringify({ accessId: "entry-1", action: "unlock", message: "open the door" }),
  }), {
    DOOR_ENTRY_TEST_ENABLED: "true",
    DOOR_ID: "lab-main",
    DOOR_DEVICE_ID: "cdr-esp32-door-01",
    DOOR_DEVICE_SECRET: "a".repeat(64),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_entry_event" });
});

test("door device routes remain disabled until explicitly provisioned", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/device/cdr-esp32-door-01/next"), {
    DOOR_CONTROL_ENABLED: "false",
    DOOR_ID: "lab-main",
    DOOR_DEVICE_ID: "cdr-esp32-door-01",
  });
  assert.equal(response.status, 503);
});

test("WebSocket device endpoint requires a valid device signature", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/device/cdr-esp32-door-01/ws", {
    method: "GET",
    headers: { Upgrade: "websocket" },
  }), {
    DOOR_ENTRY_TEST_ENABLED: "true",
    DOOR_ID: "lab-main",
    DOOR_DEVICE_ID: "cdr-esp32-door-01",
    DOOR_DEVICE_SECRET: "a".repeat(64),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "device_unauthorized" });
});

test("Durable Object sends only the fixed availability notice", async () => {
  const messages = [];
  const hub = new DoorDeviceHub({
    getWebSockets: () => [{ send: (message) => messages.push(JSON.parse(message)) }],
  });
  const response = await hub.fetch(new Request("https://hub.test/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { notified: 1 });
  assert.deepEqual(messages, [{ type: "entry-available" }]);
});

test("Durable Object rejects client-selected WebSocket notification content", async () => {
  const hub = new DoorDeviceHub({ getWebSockets: () => [] });
  const response = await hub.fetch(new Request("https://hub.test/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unlock", message: "open the door" }),
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_notification" });
});

test("door control cannot be enabled without a per-device secret", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/door/commands", {
    method: "POST",
    headers: { Authorization: "Bearer fake", "Content-Type": "application/json" },
    body: JSON.stringify({ doorId: "lab-main" }),
  }), {
    DOOR_CONTROL_ENABLED: "true",
    DOOR_ID: "lab-main",
    DOOR_DEVICE_ID: "cdr-esp32-door-01",
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "door_control_disabled" });
});
