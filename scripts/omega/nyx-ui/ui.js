"use strict";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
const incomingToken = params.get("session");
if (incomingToken) sessionStorage.setItem("nyx-local-session", incomingToken);
const sessionToken = incomingToken || sessionStorage.getItem("nyx-local-session") || "";
if (incomingToken) history.replaceState(null, "", location.pathname);

const state = {
  configured: false,
  busy: false,
  turns: 0,
  approvalId: null,
  approvalPoll: null,
  statusPoll: null,
  toastTimer: null,
};

async function api(path, method = "GET", data) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "omit",
    headers: {
      "X-Nyx-Session": sessionToken,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.add("hidden"), 5000);
}

function toolRow(label, enabled, detail) {
  const row = document.createElement("div");
  row.className = `tool${enabled ? "" : " dimmed"}`;
  const dot = document.createElement("span");
  dot.className = "tool-dot";
  const name = document.createElement("span");
  name.textContent = label;
  const tag = document.createElement("small");
  tag.textContent = detail;
  row.append(dot, name, tag);
  return row;
}

function renderStatus(status) {
  state.configured = status.configured;
  state.turns = status.turns;
  $("turn-counter").textContent = `${state.turns} / 30 turns`;
  $("capacity-state").textContent =
    status.capacityState === "WAITING_FOR_CAPACITY"
      ? "Provider waiting"
      : status.busy
        ? "Reasoning"
        : "Ready";
  if (!status.configured) return;
  const runtime = status.runtime;
  $("setup-overlay").classList.add("hidden");
  $("session-chip").textContent = "BOUNDARY ACTIVE";
  $("project-name").textContent = runtime.repositoryName;
  $("project-detail").textContent = runtime.scopes.join(", ");
  $("message").disabled = false;
  $("send").disabled = state.busy;
  $("composer-hint").textContent = runtime.editablePath
    ? `Isolated edit: ${runtime.editablePath}`
    : "Read and reason · source stays unchanged";
  const tools = $("tool-list");
  tools.replaceChildren(
    toolRow("Repository observation", true, "R1"),
    toolRow(
      "Isolated candidate",
      Boolean(runtime.editablePath),
      runtime.editablePath ? "READY" : "OFF",
    ),
    toolRow(
      "Fixed verification",
      Boolean(runtime.verifierPath),
      runtime.verifierPath ? "E3" : "OFF",
    ),
    toolRow(
      "Scoped terminal",
      runtime.terminalCheckPaths.length > 0,
      runtime.terminalCheckPaths.length ? "CHECK" : "OFF",
    ),
    toolRow(
      "Selected desktop",
      runtime.desktopAvailable,
      runtime.desktopAvailable ? "APP" : "OFF",
    ),
  );
}

function message(role, text, meta = "") {
  $("hero")?.remove();
  const row = document.createElement("article");
  row.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "↗" : "Ν";
  const body = document.createElement("div");
  body.className = "message-body";
  const head = document.createElement("div");
  head.className = "message-head";
  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = role === "user" ? "You" : "Νύξ";
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  head.append(name, time);
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;
  body.append(head, content);
  if (meta) {
    const foot = document.createElement("div");
    foot.className = "message-meta";
    foot.textContent = meta;
    body.append(foot);
  }
  row.append(avatar, body);
  $("conversation").append(row);
  row.scrollIntoView({ block: "end", behavior: "smooth" });
  return row;
}

function renderEvidence(events) {
  const list = $("evidence-list");
  list.querySelector(".empty-evidence")?.remove();
  for (const event of events) {
    const item = document.createElement("div");
    item.className = "evidence-item";
    const line = document.createElement("div");
    line.className = "evidence-line";
    const name = document.createElement("span");
    name.className = "evidence-type";
    name.textContent = `${String(event.sequence).padStart(2, "0")} · ${event.eventType}`;
    const clazz = document.createElement("span");
    clazz.className = "evidence-class";
    clazz.textContent = event.evidenceClass;
    line.append(name, clazz);
    const outcome = document.createElement("div");
    outcome.className = "evidence-outcome";
    outcome.textContent = event.outcome;
    const id = document.createElement("div");
    id.className = "evidence-id";
    id.textContent = event.evidenceId;
    id.title = event.evidenceId;
    item.append(line, outcome, id);
    list.append(item);
  }
  list.scrollTop = list.scrollHeight;
}

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function configure(event) {
  event.preventDefault();
  const button = $("configure");
  button.disabled = true;
  $("setup-error").textContent = "";
  const desktopRaw = $("setup-desktop").value.trim();
  if (desktopRaw && !$("desktop-consent").checked) {
    $("setup-error").textContent =
      "Desktop use requires explicit consent to share selected UI labels with Νύξ.";
    button.disabled = false;
    return;
  }
  try {
    const result = await api("/api/configure", "POST", {
      repository: $("setup-repo").value.trim(),
      scopes: parseCsv($("setup-scopes").value),
      editablePath: $("setup-edit").value.trim() || null,
      verifierPath: $("setup-verify").value.trim() || null,
      terminalCheckPaths: parseCsv($("setup-terminal").value),
      desktopPid: desktopRaw ? Number(desktopRaw) : null,
    });
    renderStatus({
      configured: true,
      runtime: result.runtime,
      turns: 0,
      busy: false,
      capacityState: null,
    });
    $("message").focus();
  } catch (error) {
    $("setup-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function renderApproval(pending) {
  if (!pending || state.approvalId === pending.id) return;
  state.approvalId = pending.id;
  const detail = $("approval-details");
  detail.replaceChildren();
  const fields = [
    ["Action", pending.action.kind],
    ["Application", `PID ${pending.action.pid} · HWND ${pending.action.hwnd}`],
    [
      "Control",
      `${pending.action.selector} · ${pending.action.elementName} (${pending.action.controlType})`,
    ],
    [
      "Exact text",
      pending.action.value === null
        ? "—"
        : JSON.stringify(pending.action.value),
    ],
  ];
  for (const [label, value] of fields) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    detail.append(term, description);
  }
  $("approval-overlay").classList.remove("hidden");
}

async function decideApproval(approved) {
  const id = state.approvalId;
  if (!id) return;
  state.approvalId = null;
  $("approval-overlay").classList.add("hidden");
  try {
    await api("/api/approval", "POST", { id, approved });
  } catch (error) {
    toast(error.message);
  }
}

async function pollApproval() {
  try {
    const result = await api("/api/approval");
    if (result.pending) renderApproval(result.pending);
    else if (state.approvalId) {
      state.approvalId = null;
      $("approval-overlay").classList.add("hidden");
    }
  } catch {
    /* turn request remains authoritative; polling failure is not approval */
  }
}

async function send(event) {
  event.preventDefault();
  if (!state.configured || state.busy) return;
  const text = $("message").value.trim();
  if (!text) return;
  state.busy = true;
  $("message").value = "";
  $("message").disabled = true;
  $("send").disabled = true;
  message("user", text);
  const waiting = message("nyx", "Investigating…");
  waiting.querySelector(".message-content").classList.add("thinking");
  state.approvalPoll = setInterval(pollApproval, 450);
  state.statusPoll = setInterval(async () => {
    try {
      renderStatus(await api("/api/status"));
    } catch {
      /* keep chat response path authoritative */
    }
  }, 2500);
  try {
    const result = await api("/api/turn", "POST", { message: text });
    waiting.remove();
    message(
      "nyx",
      result.message,
      `${result.outcome} · ${result.modelCalls} model calls · ${result.modelTokens ?? "?"} tokens · source unchanged`,
    );
    renderEvidence(result.events);
    if (
      [
        "MODEL_FAILURE",
        "REJECTED",
        "CANDIDATE_UNVERIFIED",
        "BUDGET_EXHAUSTED",
      ].includes(result.outcome)
    ) {
      toast(`${result.outcome}: no unverified candidate was accepted.`);
    }
  } catch (error) {
    waiting.remove();
    message("nyx", `The turn could not finish: ${error.message}`);
  } finally {
    clearInterval(state.approvalPoll);
    clearInterval(state.statusPoll);
    state.busy = false;
    state.approvalId = null;
    $("approval-overlay").classList.add("hidden");
    $("message").disabled = false;
    $("send").disabled = false;
    $("message").focus();
    try {
      renderStatus(await api("/api/status"));
    } catch {
      /* session may have closed */
    }
  }
}

async function init() {
  if (!sessionToken) {
    $("setup-error").textContent =
      "Open the one-time local URL printed by the CLI launcher.";
    return;
  }
  try {
    const status = await api("/api/status");
    $("setup-repo").value = status.defaultRepository;
    renderStatus(status);
    if (!status.modelCredentialAvailable)
      $("setup-error").textContent =
        "NVIDIA_API_KEY is not injected into this process. Restart the launcher after setting it privately.";
  } catch (error) {
    $("setup-error").textContent = error.message;
  }
}

$("setup-form").addEventListener("submit", configure);
$("composer").addEventListener("submit", send);
$("message").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
});
$("deny-action").addEventListener("click", () => decideApproval(false));
$("approve-action").addEventListener("click", () => decideApproval(true));
void init();
