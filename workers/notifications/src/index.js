const EVENT_TYPES = new Set([
  "task-created",
  "task-reassigned",
  "join-requested",
  "join-decision",
]);
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging";
const encoder = new TextEncoder();
let accessTokenCache;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    const doorWebSocketRoute = url.pathname.match(/^\/v1\/door\/device\/([^/]+)\/ws$/);
    if (doorWebSocketRoute) return handleDoorDeviceWebSocket(request, env, doorWebSocketRoute[1]);
    const doorDeviceRoute = url.pathname.match(/^\/v1\/door\/device\/([^/]+)\/(next|ack)$/);
    if (doorDeviceRoute) return handleDoorDeviceRequest(request, env, doorDeviceRoute[1], doorDeviceRoute[2]);
    if (url.pathname === "/v1/door/entry-events") return handleDoorEntryEventRequest(request, env);
    const entryStatusRoute = url.pathname.match(/^\/v1\/door\/entry-events\/([A-Za-z0-9_-]{1,150})$/);
    if (entryStatusRoute) return handleDoorEntryStatus(request, env, entryStatusRoute[1]);
    if (url.pathname === "/v1/door/commands") return handleDoorCommandRequest(request, env);
    const doorStatusRoute = url.pathname.match(/^\/v1\/door\/commands\/([A-Za-z0-9_-]{1,150})$/);
    if (doorStatusRoute) return handleDoorCommandStatus(request, env, doorStatusRoute[1]);

    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const match = url.pathname.match(/^\/v1\/events\/([a-z-]+)$/);
    if (!match || !EVENT_TYPES.has(match[1])) return json({ error: "not_found" }, 404);

    const auth = request.headers.get("Authorization") || "";
    const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!idToken) return json({ error: "unauthorized" }, 401);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body || typeof body.eventId !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(body.eventId)) {
      return json({ error: "invalid_event" }, 400);
    }

    try {
      const user = await verifyFirebaseIdToken(idToken, env);
      const result = await processEvent(body.eventId, match[1], user.localId, env, false);
      return json({ ok: true, result });
    } catch (error) {
      if (error.status) return json({ error: error.code || "request_failed" }, error.status);
      console.error("Push event processing failed", error.message);
      return json({ error: "event_processing_failed" }, 500);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(processPendingEvents(env));
  },
};

async function handleDoorEntryEventRequest(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!doorEntryTestEnabled(env)) return json({ error: "door_entry_test_disabled" }, 503);
  const idToken = bearerToken(request);
  if (!idToken) return json({ error: "unauthorized" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || Object.keys(body).length !== 1 ||
      typeof body.accessId !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(body.accessId)) {
    return json({ error: "invalid_entry_event" }, 400);
  }

  try {
    const identity = await verifyFirebaseIdToken(idToken, env);
    const [profileDocument, accessDocument, doorDocument] = await Promise.all([
      getDocument(`usuarios/${encodeURIComponent(identity.localId)}`, env),
      getDocument(`accesos/${encodeURIComponent(body.accessId)}`, env),
      getDocument(`puertas/${encodeURIComponent(env.DOOR_ID)}`, env),
    ]);
    const profile = decodeFields(profileDocument?.fields || {});
    const access = decodeFields(accessDocument?.fields || {});
    const door = decodeFields(doorDocument?.fields || {});
    if (profile.autorizado !== true && profile.rol !== "admin") throw httpError(403, "user_not_authorized");
    if (!accessDocument || access.uid !== identity.localId || access.tipo !== "entrada") {
      throw httpError(403, "entry_record_not_owned");
    }
    if (!doorDocument || door.entryTestEnabled !== true || door.deviceId !== env.DOOR_DEVICE_ID) {
      throw httpError(503, "door_entry_receiver_not_provisioned");
    }

    const commandId = `entry-${body.accessId}`;
    const commandPath = `puertas/${encodeURIComponent(env.DOOR_ID)}/comandos/${encodeURIComponent(commandId)}`;
    const existing = await getDocument(commandPath, env);
    if (existing) {
      const fields = decodeFields(existing.fields || {});
      if (fields.requestedByUid !== identity.localId || fields.accessId !== body.accessId) {
        throw httpError(409, "entry_event_conflict");
      }
      if (fields.status === "pending") await notifyDoorDeviceAvailable(env);
      console.info("Door entry request reused", fields.status || "unknown");
      return json({ commandId, status: fields.status, expiresAt: fields.expiresAt }, 202);
    }

    const previousRequest = Date.parse(profile.lastDoorEntryEventAt || "");
    if (Number.isFinite(previousRequest) && previousRequest > Date.now() - 3_000) {
      throw httpError(429, "entry_event_rate_limited");
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60_000);
    const personName = typeof access.nombreCompleto === "string" ? access.nombreCompleto.slice(0, 100) : "Usuario del club";
    const commandName = firestoreDocumentName(
      `puertas/${encodeURIComponent(env.DOOR_ID)}/comandos/${encodeURIComponent(commandId)}`,
      env,
    );
    const response = await firestoreFetch(`${firestoreUrl("", env)}:commit`, env, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [
        { update: { name: commandName, fields: {
          action: { stringValue: "entry-recorded" },
          accessId: { stringValue: body.accessId },
          personName: { stringValue: personName },
          occurredAt: { timestampValue: accessDocument.fields?.fechaHora?.timestampValue || createdAt.toISOString() },
          requestedByUid: { stringValue: identity.localId },
          deviceId: { stringValue: env.DOOR_DEVICE_ID },
          status: { stringValue: "pending" },
          createdAt: { timestampValue: createdAt.toISOString() },
          expiresAt: { timestampValue: expiresAt.toISOString() },
        } }, currentDocument: { exists: false } },
        { update: { name: profileDocument.name, fields: { lastDoorEntryEventAt: { timestampValue: createdAt.toISOString() } } },
          updateMask: { fieldPaths: ["lastDoorEntryEventAt"] }, currentDocument: { updateTime: profileDocument.updateTime } },
      ] }),
    });
    if (response.status === 409) {
      const racedCommand = await getDocument(commandPath, env);
      if (racedCommand) {
        const racedFields = decodeFields(racedCommand.fields || {});
        if (racedFields.requestedByUid === identity.localId && racedFields.accessId === body.accessId) {
          return json({ commandId, status: racedFields.status, expiresAt: racedFields.expiresAt }, 202);
        }
      }
      throw httpError(409, "entry_event_write_conflict");
    }
    if (!response.ok) {
      const firestoreError = await response.json().catch(() => ({}));
      const detail = typeof firestoreError.error?.message === "string"
        ? firestoreError.error.message.slice(0, 300)
        : "No detail returned";
      console.error("Door entry Firestore commit failed", response.status, detail);
      throw httpError(503, "entry_event_store_failed");
    }
    await notifyDoorDeviceAvailable(env);
    console.info("Door entry request stored", "pending");
    return json({ commandId, status: "pending", expiresAt: expiresAt.toISOString() }, 202);
  } catch (error) {
    if (error.status) return json({ error: error.code || "request_failed" }, error.status);
    console.error("Door entry event request failed", error.message);
    return json({ error: "door_entry_event_failed" }, 500);
  }
}

async function handleDoorEntryStatus(request, env, commandId) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!doorEntryTestEnabled(env)) return json({ error: "door_entry_test_disabled" }, 503);
  const idToken = bearerToken(request);
  if (!idToken) return json({ error: "unauthorized" }, 401);
  try {
    const identity = await verifyFirebaseIdToken(idToken, env);
    const command = await getDocument(`puertas/${encodeURIComponent(env.DOOR_ID)}/comandos/${encodeURIComponent(commandId)}`, env);
    if (!command) throw httpError(404, "entry_event_not_found");
    const fields = decodeFields(command.fields || {});
    if (fields.action !== "entry-recorded" || fields.requestedByUid !== identity.localId) {
      throw httpError(403, "entry_event_owner_required");
    }
    console.info("Door entry status checked", fields.status || "unknown");
    if (fields.status === "pending" && Date.parse(fields.expiresAt || "") <= Date.now()) {
      await updateDoorCommand(command, { status: { stringValue: "expired" } }, env);
      fields.status = "expired";
    }
    return json({ commandId, status: fields.status, expiresAt: fields.expiresAt });
  } catch (error) {
    if (error.status) return json({ error: error.code || "request_failed" }, error.status);
    console.error("Door entry status lookup failed", error.message);
    return json({ error: "door_entry_status_failed" }, 500);
  }
}

async function handleDoorCommandRequest(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!doorControlEnabled(env)) return json({ error: "door_control_disabled" }, 503);

  const idToken = bearerToken(request);
  if (!idToken) return json({ error: "unauthorized" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || Object.keys(body).length !== 1 || body.doorId !== env.DOOR_ID) {
    return json({ error: "invalid_door_request" }, 400);
  }

  try {
    const identity = await verifyFirebaseIdToken(idToken, env);
    const [profileDocument, doorDocument] = await Promise.all([
      getDocument(`usuarios/${encodeURIComponent(identity.localId)}`, env),
      getDocument(`puertas/${encodeURIComponent(env.DOOR_ID)}`, env),
    ]);
    const profile = decodeFields(profileDocument?.fields || {});
    const door = decodeFields(doorDocument?.fields || {});
    if (profile.autorizado !== true && profile.rol !== "admin") {
      throw httpError(403, "user_not_authorized");
    }
    if (!doorDocument || door.enabled !== true || door.deviceId !== env.DOOR_DEVICE_ID) {
      throw httpError(503, "door_not_provisioned");
    }
    const previousRequest = Date.parse(profile.lastDoorCommandAt || "");
    if (Number.isFinite(previousRequest) && previousRequest > Date.now() - 30_000) {
      throw httpError(429, "door_request_rate_limited");
    }

    const commandId = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30_000);
    const command = {
      fields: {
        action: { stringValue: "unlock" },
        requestedByUid: { stringValue: identity.localId },
        deviceId: { stringValue: env.DOOR_DEVICE_ID },
        status: { stringValue: "pending" },
        createdAt: { timestampValue: createdAt.toISOString() },
        expiresAt: { timestampValue: expiresAt.toISOString() },
      },
    };
    const commandName = firestoreDocumentName(
      `puertas/${encodeURIComponent(env.DOOR_ID)}/comandos/${encodeURIComponent(commandId)}`,
      env,
    );
    const response = await firestoreFetch(`${firestoreUrl("", env)}:commit`, env, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [
        { update: { name: commandName, ...command }, currentDocument: { exists: false } },
        {
          update: {
            name: profileDocument.name,
            fields: { lastDoorCommandAt: { timestampValue: createdAt.toISOString() } },
          },
          updateMask: { fieldPaths: ["lastDoorCommandAt"] },
          currentDocument: { updateTime: profileDocument.updateTime },
        },
      ] }),
    });
    if (response.status === 400 || response.status === 409) throw httpError(429, "door_request_rate_limited");
    if (!response.ok) throw new Error(`door_command_create_${response.status}`);
    return json({ commandId, status: "pending", expiresAt: expiresAt.toISOString() }, 202);
  } catch (error) {
    if (error.status) return json({ error: error.code || "request_failed" }, error.status);
    console.error("Door command request failed", error.message);
    return json({ error: "door_command_failed" }, 500);
  }
}

async function handleDoorCommandStatus(request, env, commandId) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!doorControlEnabled(env)) return json({ error: "door_control_disabled" }, 503);
  const idToken = bearerToken(request);
  if (!idToken) return json({ error: "unauthorized" }, 401);
  try {
    const identity = await verifyFirebaseIdToken(idToken, env);
    const command = await getDocument(
      `puertas/${encodeURIComponent(env.DOOR_ID)}/comandos/${encodeURIComponent(commandId)}`,
      env,
    );
    if (!command) throw httpError(404, "command_not_found");
    const fields = decodeFields(command.fields || {});
    if (fields.requestedByUid !== identity.localId) throw httpError(403, "command_owner_required");
    if (fields.status === "pending" && Date.parse(fields.expiresAt || "") <= Date.now()) {
      await updateDoorCommand(command, { status: { stringValue: "expired" } }, env);
      fields.status = "expired";
    }
    return json({
      commandId,
      status: fields.status,
      reportedState: fields.reportedState || "unknown",
      expiresAt: fields.expiresAt,
    });
  } catch (error) {
    if (error.status) return json({ error: error.code || "request_failed" }, error.status);
    console.error("Door command status lookup failed", error.message);
    return json({ error: "door_status_failed" }, 500);
  }
}

async function handleDoorDeviceRequest(request, env, deviceId, operation) {
  if (!doorDeviceEnabled(env)) return json({ error: "door_device_disabled" }, 503);
  if (deviceId !== env.DOOR_DEVICE_ID || !await verifyDeviceSignature(request, env)) {
    return json({ error: "device_unauthorized" }, 401);
  }

  try {
    if (operation === "next") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return await deliverNextDoorCommand(env);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    return await acknowledgeDoorCommand(request, env);
  } catch (error) {
    console.error("Door device request failed", error.message);
    return json({ error: "device_request_failed" }, 500);
  }
}

async function handleDoorDeviceWebSocket(request, env, deviceId) {
  if (!doorDeviceEnabled(env)) return json({ error: "door_device_disabled" }, 503);
  if (deviceId !== env.DOOR_DEVICE_ID || !await verifyDeviceSignature(request, env)) {
    return json({ error: "device_unauthorized" }, 401);
  }
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return json({ error: "websocket_upgrade_required" }, 426);
  }
  if (!env.DOOR_DEVICE_HUB) return json({ error: "websocket_not_configured" }, 503);

  try {
    return await env.DOOR_DEVICE_HUB.get(env.DOOR_DEVICE_HUB.idFromName(env.DOOR_ID)).fetch(request);
  } catch (error) {
    console.error("Door WebSocket connection failed", error.message);
    return json({ error: "websocket_connection_failed" }, 503);
  }
}

async function notifyDoorDeviceAvailable(env) {
  if (!env.DOOR_DEVICE_HUB) return;
  try {
    const stub = env.DOOR_DEVICE_HUB.get(env.DOOR_DEVICE_HUB.idFromName(env.DOOR_ID));
    const response = await stub.fetch("https://door-device-hub/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) console.warn("Door WebSocket notification failed", response.status);
  } catch (error) {
    console.warn("Door WebSocket unavailable; device polling remains active", error.message);
  }
}

async function deliverNextDoorCommand(env) {
  const parentUrl = firestoreUrl(
    `puertas/${encodeURIComponent(env.DOOR_ID)}`,
    env,
  );
  const response = await firestoreFetch(`${parentUrl}:runQuery`, env, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "comandos" }],
        where: { fieldFilter: {
          field: { fieldPath: "status" },
          op: "IN",
          value: { arrayValue: { values: [
            { stringValue: "pending" },
            { stringValue: "delivered" },
          ] } },
        } },
        limit: 10,
      },
    }),
  });
  if (!response.ok) throw new Error(`door_command_query_${response.status}`);
  const rows = await response.json();
  const documents = rows.map((row) => row.document).filter(Boolean);
  const queueStatuses = documents.map((document) => document.fields?.status?.stringValue || "missing");
  console.info("Door receiver queue query", JSON.stringify(queueStatuses));
  const now = Date.now();
  const command = documents.find((document) => {
    const fields = decodeFields(document.fields || {});
    if (fields.status === "pending") return true;
    return fields.status === "delivered" && now - Date.parse(fields.deliveredAt || "") >= 15_000;
  });
  if (!command) {
    console.info("Door receiver poll: no command ready for delivery");
    return json({ command: null });
  }

  const fields = decodeFields(command.fields || {});
  console.info("Door receiver poll: pending command found", fields.action || "unknown", fields.status || "unknown");
  if (Date.parse(fields.expiresAt || "") <= Date.now()) {
    await updateDoorCommand(command, {
      status: { stringValue: "expired" },
    }, env);
    return json({ command: null });
  }

  const deliveredAt = new Date().toISOString();
  const claimed = await updateDoorCommand(command, {
    status: { stringValue: "delivered" },
    deliveredAt: { timestampValue: deliveredAt },
  }, env);
  if (!claimed) {
    console.warn("Door receiver poll: command claim conflict");
    return json({ command: null });
  }
  console.info("Door receiver poll: command delivered", fields.action || "unknown");
  return json({
    command: {
      id: command.name.split("/").at(-1),
      action: fields.action,
      accessId: fields.accessId,
      personName: fields.personName,
      occurredAt: fields.occurredAt,
      expiresAt: fields.expiresAt,
    },
  });
}

async function acknowledgeDoorCommand(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || !/^[A-Za-z0-9_-]{1,150}$/.test(body.commandId || "") ||
      !["executed", "failed", "received"].includes(body.outcome) ||
      !["open", "closed", "unknown"].includes(body.reportedState)) {
    return json({ error: "invalid_device_result" }, 400);
  }

  const path = `puertas/${encodeURIComponent(env.DOOR_ID)}/comandos/${encodeURIComponent(body.commandId)}`;
  const command = await getDocument(path, env);
  if (!command) return json({ error: "command_not_found" }, 404);
  const fields = decodeFields(command.fields || {});
  if (fields.deviceId !== env.DOOR_DEVICE_ID || fields.status !== "delivered") {
    return json({ error: "command_not_acknowledgeable" }, 409);
  }
  if ((fields.action === "entry-recorded" && (body.outcome !== "received" || body.reportedState !== "unknown")) ||
      (fields.action !== "entry-recorded" && body.outcome === "received")) {
    return json({ error: "invalid_device_result_for_action" }, 400);
  }
  if (Date.parse(fields.expiresAt || "") <= Date.now()) {
    await updateDoorCommand(command, { status: { stringValue: "expired" } }, env);
    return json({ error: "command_expired" }, 410);
  }

  const resultAt = new Date().toISOString();
  const doorPath = `puertas/${encodeURIComponent(env.DOOR_ID)}`;
  const door = await getDocument(doorPath, env);
  if (!door) return json({ error: "door_not_provisioned" }, 503);
  const doorFields = decodeFields(door.fields || {});
  const entryOnly = fields.action === "entry-recorded";
  if ((entryOnly && doorFields.entryTestEnabled !== true) ||
      (!entryOnly && (!doorControlEnabled(env) || doorFields.enabled !== true))) {
    return json({ error: "door_action_disabled" }, 503);
  }
  const commandStatus = entryOnly ? "received" : body.outcome;
  const commit = await firestoreFetch(`${firestoreUrl("", env)}:commit`, env, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: command.name,
            fields: entryOnly
              ? { status: { stringValue: commandStatus }, receivedAt: { timestampValue: resultAt } }
              : { status: { stringValue: commandStatus }, reportedState: { stringValue: body.reportedState }, resultAt: { timestampValue: resultAt } },
          },
          updateMask: { fieldPaths: entryOnly ? ["status", "receivedAt"] : ["status", "reportedState", "resultAt"] },
          currentDocument: { updateTime: command.updateTime },
        },
        {
          update: {
            name: door.name,
            fields: entryOnly ? { lastSeenAt: { timestampValue: resultAt } } : {
              reportedState: { stringValue: body.reportedState },
              reportedAt: { timestampValue: resultAt },
              lastSeenAt: { timestampValue: resultAt },
            },
          },
          updateMask: { fieldPaths: entryOnly ? ["lastSeenAt"] : ["reportedState", "reportedAt", "lastSeenAt"] },
          currentDocument: { updateTime: door.updateTime },
        },
      ],
    }),
  });
  if (commit.status === 409 || commit.status === 400) return json({ error: "command_already_updated" }, 409);
  if (!commit.ok) throw new Error(`door_result_commit_${commit.status}`);
  console.info("Door receiver acknowledgement stored", commandStatus);
  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function updateDoorCommand(document, fields, env) {
  const masks = Object.keys(fields).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  const url = `${firestoreUrlFromName(document.name, env)}?${masks}&currentDocument.updateTime=${encodeURIComponent(document.updateTime)}`;
  const response = await firestoreFetch(url, env, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (response.status === 409 || response.status === 400) return false;
  if (!response.ok) throw new Error(`door_command_update_${response.status}`);
  return true;
}

async function verifyDeviceSignature(request, env) {
  const secret = env.DOOR_DEVICE_SECRET || "";
  const timestamp = request.headers.get("X-Device-Timestamp") || "";
  const nonce = request.headers.get("X-Device-Nonce") || "";
  const signature = request.headers.get("X-Device-Signature") || "";
  if (!/^[a-fA-F0-9]{64}$/.test(secret) || !/^\d{10}$/.test(timestamp) ||
      !/^[A-Fa-f0-9]{32,64}$/.test(nonce) || !/^[A-Fa-f0-9]{64}$/.test(signature) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 30) return false;

  const body = request.method === "GET" ? "" : await request.clone().text();
  const message = `${timestamp}\n${nonce}\n${request.method}\n${new URL(request.url).pathname}\n${body}`;
  const keyBytes = Uint8Array.from(secret.match(/.{2}/g), (byte) => parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(signature.toLowerCase(), expected);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function bearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function doorControlEnabled(env) {
  return env.DOOR_CONTROL_ENABLED === "true" && Boolean(env.DOOR_ID) && Boolean(env.DOOR_DEVICE_ID) &&
    /^[a-fA-F0-9]{64}$/.test(env.DOOR_DEVICE_SECRET || "");
}

function doorEntryTestEnabled(env) {
  return env.DOOR_ENTRY_TEST_ENABLED === "true" && Boolean(env.DOOR_ID) && Boolean(env.DOOR_DEVICE_ID) &&
    /^[a-fA-F0-9]{64}$/.test(env.DOOR_DEVICE_SECRET || "");
}

function doorDeviceEnabled(env) {
  return doorControlEnabled(env) || doorEntryTestEnabled(env);
}

export class DoorDeviceHub {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (request.method !== "GET") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: "door-device" });
      server.send(JSON.stringify({ type: "connected" }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
        return json({ error: "invalid_notification" }, 400);
      }
      let notified = 0;
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(JSON.stringify({ type: "entry-available" }));
          notified += 1;
        } catch {
          try { socket.close(1011, "send failed"); } catch { /* already closed */ }
        }
      }
      return json({ notified });
    }
    return json({ error: "not_found" }, 404);
  }

  async webSocketMessage(socket, message) {
    if (typeof message !== "string" || message.length > 128) {
      socket.close(1008, "unsupported message");
      return;
    }
    let body;
    try {
      body = JSON.parse(message);
    } catch {
      socket.close(1008, "invalid message");
      return;
    }
    if (body?.type !== "ping" || Object.keys(body).length !== 1) {
      socket.close(1008, "unsupported message");
      return;
    }
    socket.send(JSON.stringify({ type: "pong" }));
  }

  async webSocketClose() {}
  async webSocketError() {}
}

async function processPendingEvents(env) {
  try {
    const events = await listPendingEvents(env);
    for (const item of events) {
      const type = item.fields?.tipo?.stringValue;
      if (!EVENT_TYPES.has(type)) continue;
      try {
        await processEvent(item.name.split("/").at(-1), type, null, env, true, item);
      } catch (error) {
        console.error("Pending push event failed", item.name, error.message);
      }
    }
  } catch (error) {
    console.error("Could not poll pending push events", error.message);
  }
}

async function processEvent(eventId, routeType, callerUid, env, fromCron, knownEvent) {
  const event = knownEvent || await getDocument(`notificationOutbox/${eventId}`, env);
  if (!event) throw httpError(404, "event_not_found");
  const fields = decodeFields(event.fields || {});
  if (fields.tipo !== routeType || !EVENT_TYPES.has(fields.tipo)) throw httpError(400, "event_type_mismatch");
  if (callerUid && fields.actorUid !== callerUid) throw httpError(403, "event_actor_mismatch");
  if (fields.status !== "pending") return "already_processed";
  const claimedAt = Date.parse(fields.claimedAt || "");
  if (Number.isFinite(claimedAt) && claimedAt > Date.now() - 5 * 60_000) return "already_processing";

  const projectId = requiredString(fields.proyectoId);
  const project = await getDocument(`proyectos/${encodeURIComponent(projectId)}`, env);
  if (!project) return finishEvent(event, "stale", env);
  const projectData = decodeFields(project.fields || {});
  const actor = requiredString(fields.actorUid);
  const projectLead = projectData.responsableUid || projectData.creadoPorUid;

  let targets = [];
  let notification;
  let taskId = "";
  if (fields.tipo === "task-created" || fields.tipo === "task-reassigned") {
    const taskIdValue = requiredString(fields.tareaId);
    const task = await getDocument(`proyectos/${encodeURIComponent(projectId)}/tareas/${encodeURIComponent(taskIdValue)}`, env);
    if (!task) return finishEvent(event, "stale", env);
    const taskData = decodeFields(task.fields || {});
    if (taskData.notificationEventId !== eventId || taskData.assignmentVersion !== fields.assignmentVersion) {
      return finishEvent(event, "stale", env);
    }
    await assertProjectManager(actor, projectLead, env);
    targets = [...new Set([...(taskData.responsableUids || []), taskData.responsableUid].filter((uid) => typeof uid === "string" && uid && uid !== actor))];
    taskId = taskIdValue;
    notification = fields.tipo === "task-created"
      ? { title: "Nueva tarea asignada", body: `Te asignaron: ${taskData.titulo || "una tarea"}` }
      : { title: "Tarea reasignada", body: `Ahora tienes asignada: ${taskData.titulo || "una tarea"}` };
  } else {
    const applicantUid = requiredString(fields.solicitudUid);
    const application = await getDocument(`proyectos/${encodeURIComponent(projectId)}/solicitudes/${encodeURIComponent(applicantUid)}`, env);
    if (!application) return finishEvent(event, "stale", env);
    const applicationData = decodeFields(application.fields || {});
    if (applicationData.notificationEventId !== eventId) return finishEvent(event, "stale", env);

    if (fields.tipo === "join-requested") {
      const actorProfile = await getDocument(`usuarios/${encodeURIComponent(actor)}`, env);
      const profile = decodeFields(actorProfile?.fields || {});
      if (actor !== applicantUid || applicationData.estado !== "pendiente" || profile.autorizado !== true || profile.rol !== "estudiante") {
        return finishEvent(event, "stale", env);
      }
      targets = [projectLead].filter((uid) => uid && uid !== actor);
      notification = { title: "Nueva solicitud de proyecto", body: `${profile.nombreCompleto || "Un estudiante"} quiere unirse a ${projectData.nombre || "tu proyecto"}` };
    } else {
      await assertProjectManager(actor, projectLead, env);
      if (applicationData.estado !== fields.decision || !["aceptada", "rechazada"].includes(fields.decision)) {
        return finishEvent(event, "stale", env);
      }
      targets = [applicantUid];
      notification = fields.decision === "aceptada"
        ? { title: "Solicitud aceptada", body: `Tu solicitud para ${projectData.nombre || "el proyecto"} fue aceptada` }
        : { title: "Solicitud rechazada", body: `Tu solicitud para ${projectData.nombre || "el proyecto"} fue rechazada` };
    }
  }

  if (!fromCron && callerUid !== actor) throw httpError(403, "event_actor_mismatch");

  const claimed = await claimEvent(event, env);
  if (!claimed) return "already_processing";
  try {
    if (!targets.length) {
      await markEvent(event, {
        status: "no_recipients",
        targetCount: 0,
        deviceCount: 0,
        sentAt: new Date().toISOString(),
      }, env);
      console.warn("Push event has no eligible recipients", eventId);
      return "no_recipients";
    }

    const tokens = [];
    for (const uid of targets) tokens.push(...await listTokens(uid, env));
    const tokenDocuments = new Map();
    for (const entry of tokens) {
      if (!entry.token) continue;
      const matches = tokenDocuments.get(entry.token) || [];
      matches.push(entry.name);
      tokenDocuments.set(entry.token, matches);
    }
    const uniqueTokens = [...tokenDocuments.keys()];
    if (!uniqueTokens.length) {
      await markEvent(event, {
        status: "no_tokens",
        targetCount: targets.length,
        deviceCount: 0,
        sentAt: new Date().toISOString(),
      }, env);
      console.warn("Push event recipients have no registered FCM tokens", eventId, targets.length);
      return "no_tokens";
    }

    const invalid = [];
    for (const token of uniqueTokens) {
      const outcome = await sendPush(token, notification, {
        type: fields.tipo,
        projectId,
        taskId,
        eventId,
      }, env);
      if (outcome === "invalid_token") invalid.push(...(tokenDocuments.get(token) || []));
    }
    if (invalid.length) await removeTokenDocuments(invalid, env);
    await markEvent(event, { status: "sent", sentAt: new Date().toISOString(), targetCount: targets.length, deviceCount: uniqueTokens.length }, env);
    return "sent";
  } catch (error) {
    const attempts = Number(fields.attempts || 0) + 1;
    await markEvent(event, {
      status: attempts >= 8 ? "failed" : "pending",
      attempts,
      claimedAt: new Date(0).toISOString(),
      lastError: safeErrorCode(error),
    }, env).catch(() => {});
    throw error;
  }
}

async function assertProjectManager(uid, projectLead, env) {
  const profileDocument = await getDocument(`usuarios/${encodeURIComponent(uid)}`, env);
  const profile = decodeFields(profileDocument?.fields || {});
  const isAdmin = profile.rol === "admin";
  const isModerator = profile.rol === "moderador";
  const isLead = uid === projectLead;
  if (!isAdmin && !isModerator && !isLead) throw httpError(403, "project_role_required");
  if (!isAdmin && profile.autorizado !== true) throw httpError(403, "user_not_authorized");
}

async function verifyFirebaseIdToken(idToken, env) {
  if (!env.FIREBASE_WEB_API_KEY || env.FIREBASE_WEB_API_KEY === "REPLACE_WITH_FIREBASE_WEB_API_KEY") {
    throw httpError(500, "worker_not_configured");
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw httpError(401, "invalid_firebase_token");
  const data = await response.json();
  const user = data.users?.[0];
  if (!user?.localId) throw httpError(401, "invalid_firebase_token");
  const institutionalDomain = String(env.INSTITUTIONAL_EMAIL_DOMAIN || "").trim().toLowerCase();
  const email = String(user.email || "").trim().toLowerCase();
  const bootstrapAdminEmail = String(env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  if (user.emailVerified !== true || (email !== bootstrapAdminEmail && (!institutionalDomain || !email.endsWith(`@${institutionalDomain}`)))) {
    throw httpError(403, "institutional_email_verification_required");
  }
  return user;
}

async function listPendingEvents(env) {
  const response = await firestoreFetch(`${firestoreUrl("", env)}:runQuery`, env, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "notificationOutbox" }],
        where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } } },
        limit: 1,
      },
    }),
  });
  if (!response.ok) throw new Error(`firestore_query_${response.status}`);
  const rows = await response.json();
  return rows.map((row) => row.document).filter((document) => document?.fields?.status?.stringValue === "pending");
}

async function getDocument(path, env) {
  const response = await firestoreFetch(firestoreUrl(path, env), env);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`firestore_read_${response.status}`);
  return response.json();
}

async function listTokens(uid, env) {
  const url = firestoreUrl(`usuarios/${encodeURIComponent(uid)}/fcmTokens`, env) + "?pageSize=100";
  const response = await firestoreFetch(url, env);
  if (!response.ok) throw new Error(`token_list_${response.status}`);
  const data = await response.json();
  return (data.documents || []).map((document) => ({
    name: document.name,
    token: document.fields?.token?.stringValue,
  })).filter((entry) => entry.token);
}

async function claimEvent(event, env) {
  const updateTime = event.updateTime;
  const body = {
    fields: { claimedAt: { timestampValue: new Date().toISOString() } },
  };
  const response = await firestoreFetch(firestoreUrlFromName(event.name, env) + "?updateMask.fieldPaths=claimedAt&currentDocument.updateTime=" + encodeURIComponent(updateTime), env, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409 || response.status === 400) return false;
  if (!response.ok) throw new Error(`event_claim_${response.status}`);
  event.updateTime = (await response.json()).updateTime;
  return true;
}

async function finishEvent(event, status, env) {
  await markEvent(event, { status, sentAt: new Date().toISOString() }, env);
  return status;
}

async function markEvent(event, values, env) {
  const fields = {};
  const masks = [];
  for (const [key, value] of Object.entries(values)) {
    masks.push(`updateMask.fieldPaths=${encodeURIComponent(key)}`);
    fields[key] = value instanceof Date || (typeof value === "string" && key.endsWith("At"))
      ? { timestampValue: value instanceof Date ? value.toISOString() : value }
      : typeof value === "number" ? { integerValue: String(value) } : { stringValue: String(value) };
  }
  const response = await firestoreFetch(`${firestoreUrlFromName(event.name, env)}?${masks.join("&")}`, env, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`event_update_${response.status}`);
  event.updateTime = (await response.json()).updateTime;
}

async function sendPush(token, notification, data, env) {
  const accessToken = await getServiceAccessToken(env);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      message: {
        token,
        notification,
        data,
        android: { priority: "HIGH", notification: { channel_id: channelFor(data.type) } },
      },
    }),
  });
  if (response.ok) return "sent";
  const payload = await response.json().catch(() => ({}));
  const details = JSON.stringify(payload);
  if (details.includes("UNREGISTERED") || details.includes("INVALID_ARGUMENT")) return "invalid_token";
  const fcmCode = payload.error?.details?.find((detail) => detail.errorCode)?.errorCode ||
    payload.error?.status || `http_${response.status}`;
  throw new Error(`fcm_send_${response.status}_${fcmCode}`);
}

async function removeTokenDocuments(names, env) {
  for (const name of [...new Set(names)]) {
    await firestoreFetch(firestoreUrlFromName(name, env), env, { method: "DELETE" });
  }
}

async function getServiceAccessToken(env) {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) return accessTokenCache.token;
  const email = env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey || !env.FIREBASE_PROJECT_ID) throw new Error("worker_secrets_not_configured");
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = base64Url(JSON.stringify({ iss: email, scope: FIRESTORE_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signingInput = `${jwtHeader}.${jwtClaim}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput));
  const assertion = `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("google_oauth_failed");
  accessTokenCache = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

async function importPrivateKey(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", bytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function firestoreFetch(url, env, options = {}) {
  const accessToken = await getServiceAccessToken(env);
  return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` } });
}

function firestoreUrl(path, env) {
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
  return path ? `${root}/${path}` : root;
}

function firestoreDocumentName(path, env) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
}

function firestoreUrlFromName(name, env) {
  const prefix = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
  if (!name.startsWith(prefix)) throw new Error("invalid_firestore_document_name");
  return firestoreUrl(name.slice(prefix.length).split("/").map(encodeURIComponent).join("/"), env);
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function channelFor(type) {
  return type.startsWith("task-") ? "cdr_tasks" : "cdr_projects";
}

function requiredString(value) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, "invalid_event_data");
  return value;
}

function safeErrorCode(error) {
  return (error.message || "processing_failed").slice(0, 80);
}

function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders() } });
}

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" };
}

function base64Url(value) {
  return base64UrlBytes(encoder.encode(value));
}

function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
