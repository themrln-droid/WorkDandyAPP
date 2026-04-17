const TOTAL_SHELVES = 48;

const state = {
  managers: [],
  activeManagerId: null,
  employees: [],
  presentEmployeeIds: [],
  assignments: [],
  shiftName: "Day Shift",
  auditDate: getTodayDateInputValue(),
  emailEnabled: false,
  databaseMode: "sqlite",
  loading: false,
};

const elements = {
  managerForm: document.getElementById("manager-form"),
  managerName: document.getElementById("manager-name"),
  managerEmail: document.getElementById("manager-email"),
  saveManagerBtn: document.getElementById("save-manager-btn"),
  cancelManagerBtn: document.getElementById("cancel-manager-btn"),
  managerSelect: document.getElementById("manager-select"),
  managerList: document.getElementById("manager-list"),
  managerEmpty: document.getElementById("manager-empty"),
  addManagerBtn: document.getElementById("add-manager-btn"),
  employeeForm: document.getElementById("employee-form"),
  employeeName: document.getElementById("employee-name"),
  employeeEmail: document.getElementById("employee-email"),
  saveEmployeeBtn: document.getElementById("save-employee-btn"),
  cancelEmployeeBtn: document.getElementById("cancel-employee-btn"),
  employeeList: document.getElementById("employee-list"),
  employeeEmpty: document.getElementById("employee-empty"),
  shiftName: document.getElementById("shift-name"),
  auditDate: document.getElementById("audit-date"),
  attendanceList: document.getElementById("attendance-list"),
  selectAllBtn: document.getElementById("select-all-btn"),
  assignBtn: document.getElementById("assign-btn"),
  assignmentSummary: document.getElementById("assignment-summary"),
  emailActions: document.getElementById("email-actions"),
  sendAllBtn: document.getElementById("send-all-btn"),
  managerItemTemplate: document.getElementById("manager-item-template"),
  employeeItemTemplate: document.getElementById("employee-item-template"),
};

const uiState = {
  editingManagerId: null,
  editingEmployeeId: null,
};

initialize().catch(handleUnexpectedError);

async function initialize() {
  bindEvents();
  elements.auditDate.value = state.auditDate;
  elements.shiftName.value = state.shiftName;
  const config = await requestJson("/api/config");
  state.emailEnabled = Boolean(config.emailEnabled);
  state.databaseMode = config.database;
  elements.sendAllBtn.textContent = state.emailEnabled ? "Send All Emails" : "Open All Email Drafts";
  await loadManagers();
}

function bindEvents() {
  elements.managerForm.addEventListener("submit", handleManagerSubmit);
  elements.employeeForm.addEventListener("submit", handleEmployeeSubmit);
  elements.managerSelect.addEventListener("change", handleManagerSelection);
  elements.cancelManagerBtn.addEventListener("click", resetManagerForm);
  elements.cancelEmployeeBtn.addEventListener("click", resetEmployeeForm);
  elements.addManagerBtn.addEventListener("click", resetManagerForm);
  elements.assignBtn.addEventListener("click", generateAssignments);
  elements.selectAllBtn.addEventListener("click", toggleAllAttendance);
  elements.sendAllBtn.addEventListener("click", openAllDrafts);
  elements.shiftName.addEventListener("input", persistShiftFields);
  elements.auditDate.addEventListener("change", persistShiftFields);
}

async function loadManagers(preferredManagerId) {
  setLoading(true);

  try {
    state.managers = await requestJson("/api/managers");

    if (!state.managers.length) {
      state.activeManagerId = null;
      state.employees = [];
      state.presentEmployeeIds = [];
      state.assignments = [];
      render();
      return;
    }

    const activeStillExists = state.managers.some((manager) => manager.id === state.activeManagerId);
    state.activeManagerId = preferredManagerId || (activeStillExists ? state.activeManagerId : state.managers[0].id);
    await loadActiveManagerData();
  } finally {
    setLoading(false);
  }
}

async function loadActiveManagerData() {
  if (!state.activeManagerId) {
    state.employees = [];
    state.presentEmployeeIds = [];
    state.assignments = [];
    render();
    return;
  }

  const [employees, assignments] = await Promise.all([
    requestJson(`/api/managers/${state.activeManagerId}/employees`),
    requestJson(`/api/managers/${state.activeManagerId}/assignments`),
  ]);

  state.employees = employees;
  state.assignments = assignments;
  state.presentEmployeeIds = assignments.map((assignment) => assignment.employeeId);

  if (assignments.length) {
    state.shiftName = assignments[0].shiftName;
    state.auditDate = assignments[0].auditDate;
  }

  render();
}

function render() {
  elements.shiftName.value = state.shiftName || "";
  elements.auditDate.value = state.auditDate || getTodayDateInputValue();
  renderManagers();
  renderEmployees();
  renderAttendance();
  renderAssignments();
}

function renderManagers() {
  const hasManagers = state.managers.length > 0;
  elements.managerEmpty.classList.toggle("hidden", hasManagers);
  elements.managerSelect.innerHTML = "";

  if (!hasManagers) {
    const option = document.createElement("option");
    option.textContent = "No managers saved";
    option.value = "";
    elements.managerSelect.appendChild(option);
  } else {
    for (const manager of state.managers) {
      const option = document.createElement("option");
      option.value = String(manager.id);
      option.textContent = `${manager.name} (${manager.employeeCount} employees)`;
      option.selected = manager.id === state.activeManagerId;
      elements.managerSelect.appendChild(option);
    }
  }

  elements.managerList.innerHTML = "";

  for (const manager of state.managers) {
    const fragment = elements.managerItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".entity-card");

    fragment.querySelector(".entity-name").textContent = manager.name;
    fragment.querySelector(".entity-subtitle").textContent = `${manager.email} | ${manager.employeeCount} employees saved`;

    fragment.querySelector(".edit-manager-btn").addEventListener("click", () => {
      uiState.editingManagerId = manager.id;
      elements.managerName.value = manager.name;
      elements.managerEmail.value = manager.email;
      elements.saveManagerBtn.textContent = "Update Manager";
      elements.cancelManagerBtn.classList.remove("hidden");
      elements.managerName.focus();
    });

    fragment.querySelector(".delete-manager-btn").addEventListener("click", async () => {
      const confirmed = confirm(`Delete manager ${manager.name} and all saved employees?`);
      if (!confirmed) {
        return;
      }

      await requestJson(`/api/managers/${manager.id}`, { method: "DELETE" });
      resetManagerForm();
      resetEmployeeForm();
      await loadManagers();
    });

    if (manager.id === state.activeManagerId) {
      item.style.borderColor = "rgba(15, 122, 107, 0.4)";
    }

    elements.managerList.appendChild(fragment);
  }
}

function renderEmployees() {
  const hasManager = Boolean(state.activeManagerId);
  elements.employeeForm.classList.toggle("hidden", !hasManager);
  elements.employeeEmpty.classList.toggle("hidden", hasManager);
  elements.employeeList.innerHTML = "";

  if (!hasManager) {
    return;
  }

  for (const employee of state.employees) {
    const fragment = elements.employeeItemTemplate.content.cloneNode(true);
    fragment.querySelector(".entity-name").textContent = employee.name;
    fragment.querySelector(".entity-subtitle").textContent = employee.email;

    fragment.querySelector(".edit-employee-btn").addEventListener("click", () => {
      uiState.editingEmployeeId = employee.id;
      elements.employeeName.value = employee.name;
      elements.employeeEmail.value = employee.email;
      elements.saveEmployeeBtn.textContent = "Update Employee";
      elements.cancelEmployeeBtn.classList.remove("hidden");
      elements.employeeName.focus();
    });

    fragment.querySelector(".delete-employee-btn").addEventListener("click", async () => {
      const confirmed = confirm(`Delete employee ${employee.name}?`);
      if (!confirmed) {
        return;
      }

      await requestJson(`/api/managers/${state.activeManagerId}/employees/${employee.id}`, { method: "DELETE" });
      await clearAssignments();
      resetEmployeeForm();
      await loadManagers(state.activeManagerId);
    });

    elements.employeeList.appendChild(fragment);
  }
}

function renderAttendance() {
  elements.attendanceList.innerHTML = "";

  if (!state.activeManagerId || !state.employees.length) {
    elements.attendanceList.innerHTML = `
      <div class="empty-state">Add employees to the active manager profile to start a shift assignment.</div>
    `;
    return;
  }

  const selectedIds = new Set(state.presentEmployeeIds);

  for (const employee of state.employees) {
    const wrapper = document.createElement("div");
    wrapper.className = "attendance-item";
    wrapper.innerHTML = `
      <label>
        <input type="checkbox" ${selectedIds.has(employee.id) ? "checked" : ""}>
        <span>
          <strong>${employee.name}</strong><br>
          <span class="entity-subtitle">${employee.email}</span>
        </span>
      </label>
      <span class="chip">Ready for assignment</span>
    `;

    wrapper.querySelector("input").addEventListener("change", async (event) => {
      await updateAttendance(employee.id, event.target.checked);
    });

    elements.attendanceList.appendChild(wrapper);
  }
}

function renderAssignments() {
  if (!state.activeManagerId || !state.assignments.length) {
    elements.assignmentSummary.innerHTML = `
      <p>No assignments yet. Choose employees present today, then click <strong>Assign 48 Shelves</strong>.</p>
    `;
    elements.emailActions.className = "email-actions empty-state";
    elements.emailActions.innerHTML = "Generate assignments first to prepare email drafts for the selected employees.";
    return;
  }

  const shiftLabel = state.shiftName || "Current Shift";
  const dateLabel = formatDate(state.auditDate);

  elements.assignmentSummary.innerHTML = `
    <p><strong>${shiftLabel}</strong> on <strong>${dateLabel}</strong>. ${state.assignments.length} employees are covering all ${TOTAL_SHELVES} shelves.</p>
    <div class="summary-table"></div>
  `;

  const table = elements.assignmentSummary.querySelector(".summary-table");

  for (const assignment of state.assignments) {
    const row = document.createElement("div");
    row.className = "summary-table-row";
    row.innerHTML = `
      <div>
        <strong>${assignment.employeeName}</strong>
        <p class="entity-subtitle">${assignment.employeeEmail}</p>
      </div>
      <div><strong>Shelves</strong><br>${assignment.shelfLabel}</div>
      <div><strong>Total</strong><br>${assignment.shelfCount}</div>
    `;
    table.appendChild(row);
  }

  elements.emailActions.className = "email-actions";
  elements.emailActions.innerHTML = "";

  for (const assignment of state.assignments) {
    const card = document.createElement("div");
    card.className = "email-card";
    card.innerHTML = `
      <div>
        <h3>${assignment.employeeName}</h3>
        <p class="entity-subtitle">${assignment.employeeEmail}</p>
      </div>
      <p>${buildEmailBody(assignment).replaceAll("\n", "<br>")}</p>
    `;

    const sendBtn = document.createElement("button");
    sendBtn.className = "primary-btn";
    sendBtn.type = "button";
    sendBtn.textContent = state.emailEnabled ? "Send Email" : "Open Email Draft";
    sendBtn.addEventListener("click", async () => {
      if (state.emailEnabled) {
        await sendOneEmail(assignment.id);
        return;
      }

      openMailDraft(assignment);
    });

    card.appendChild(sendBtn);
    elements.emailActions.appendChild(card);
  }
}

async function handleManagerSubmit(event) {
  event.preventDefault();

  const payload = {
    name: elements.managerName.value.trim(),
    email: elements.managerEmail.value.trim().toLowerCase(),
  };

  if (!payload.name || !payload.email) {
    return;
  }

  if (uiState.editingManagerId) {
    await requestJson(`/api/managers/${uiState.editingManagerId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    resetManagerForm();
    await loadManagers(uiState.editingManagerId);
    return;
  }

  const manager = await requestJson("/api/managers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  resetManagerForm();
  await loadManagers(manager.id);
}

async function handleEmployeeSubmit(event) {
  event.preventDefault();

  if (!state.activeManagerId) {
    return;
  }

  const payload = {
    name: elements.employeeName.value.trim(),
    email: elements.employeeEmail.value.trim().toLowerCase(),
  };

  if (!payload.name || !payload.email) {
    return;
  }

  if (uiState.editingEmployeeId) {
    await requestJson(`/api/managers/${state.activeManagerId}/employees/${uiState.editingEmployeeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  } else {
    await requestJson(`/api/managers/${state.activeManagerId}/employees`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  await clearAssignments();
  resetEmployeeForm();
  await loadManagers(state.activeManagerId);
}

async function handleManagerSelection(event) {
  state.activeManagerId = Number(event.target.value) || null;
  state.presentEmployeeIds = [];
  resetManagerForm();
  resetEmployeeForm();
  await loadActiveManagerData();
}

function resetManagerForm() {
  uiState.editingManagerId = null;
  elements.managerForm.reset();
  elements.saveManagerBtn.textContent = "Save Manager";
  elements.cancelManagerBtn.classList.add("hidden");
}

function resetEmployeeForm() {
  uiState.editingEmployeeId = null;
  elements.employeeForm.reset();
  elements.saveEmployeeBtn.textContent = "Save Employee";
  elements.cancelEmployeeBtn.classList.add("hidden");
}

async function updateAttendance(employeeId, isPresent) {
  const selected = new Set(state.presentEmployeeIds);

  if (isPresent) {
    selected.add(employeeId);
  } else {
    selected.delete(employeeId);
  }

  state.presentEmployeeIds = Array.from(selected);
  await clearAssignments();
  renderAssignments();
}

async function toggleAllAttendance() {
  if (!state.employees.length) {
    return;
  }

  const allSelected = state.presentEmployeeIds.length === state.employees.length;
  state.presentEmployeeIds = allSelected ? [] : state.employees.map((employee) => employee.id);
  await clearAssignments();
  renderAttendance();
  renderAssignments();
}

function persistShiftFields() {
  state.shiftName = elements.shiftName.value.trim();
  state.auditDate = elements.auditDate.value || getTodayDateInputValue();
}

async function generateAssignments() {
  if (!state.activeManagerId) {
    alert("Create or choose a manager first.");
    return;
  }

  persistShiftFields();

  if (!state.presentEmployeeIds.length) {
    alert("Select at least one employee who is present for this shift.");
    return;
  }

  state.assignments = await requestJson(`/api/managers/${state.activeManagerId}/assignments`, {
    method: "POST",
    body: JSON.stringify({
      presentEmployeeIds: state.presentEmployeeIds,
      shiftName: state.shiftName || "Current Shift",
      auditDate: state.auditDate,
    }),
  });

  renderAssignments();
}

async function clearAssignments() {
  if (!state.activeManagerId) {
    state.assignments = [];
    return;
  }

  await requestJson(`/api/managers/${state.activeManagerId}/assignments`, { method: "DELETE" });
  state.assignments = [];
}

function buildEmailSubject(assignment) {
  return `${assignment.shiftName} audit assignment for ${formatDate(assignment.auditDate)}`;
}

function buildEmailBody(assignment) {
  return [
    `Hi ${assignment.employeeName},`,
    "",
    `Please complete today's shelf audit for shelves ${assignment.shelfLabel}.`,
    `Total shelves assigned: ${assignment.shelfCount}.`,
    "",
    `Shift: ${assignment.shiftName}`,
    `Date: ${formatDate(assignment.auditDate)}`,
    "",
    `Thank you,`,
    assignment.managerName,
  ].join("\n");
}

function openMailDraft(assignment) {
  const subject = encodeURIComponent(buildEmailSubject(assignment));
  const body = encodeURIComponent(buildEmailBody(assignment));
  window.open(`mailto:${assignment.employeeEmail}?subject=${subject}&body=${body}`, "_blank");
}

function openAllDrafts() {
  if (!state.assignments.length) {
    alert("Generate assignments first.");
    return;
  }

  if (state.emailEnabled) {
    sendAllEmails().catch(handleUnexpectedError);
    return;
  }

  for (const assignment of state.assignments) {
    openMailDraft(assignment);
  }
}

async function sendAllEmails() {
  if (!state.activeManagerId) {
    return;
  }

  const result = await requestJson(`/api/managers/${state.activeManagerId}/send-emails`, {
    method: "POST",
  });

  alert(`Sent ${result.sentCount} email(s).`);
}

async function sendOneEmail(assignmentId) {
  if (!state.activeManagerId) {
    return;
  }

  await requestJson(`/api/managers/${state.activeManagerId}/assignments/${assignmentId}/send-email`, {
    method: "POST",
  });

  alert("Email sent.");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      throw new Error("The app expected JSON from the API but received HTML. Start the app with `npm start` and open it through the server URL, not by opening index.html directly.");
    }

    throw new Error("The server returned an unexpected response.");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  elements.assignBtn.disabled = isLoading;
  elements.saveManagerBtn.disabled = isLoading;
  elements.saveEmployeeBtn.disabled = isLoading;
}

function formatDate(dateString) {
  if (!dateString) {
    return "today";
  }

  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function handleUnexpectedError(error) {
  console.error(error);
  alert(error.message || "Something went wrong.");
}

window.addEventListener("error", (event) => {
  handleUnexpectedError(event.error || new Error("Unexpected error."));
});

window.addEventListener("unhandledrejection", (event) => {
  handleUnexpectedError(event.reason instanceof Error ? event.reason : new Error("Request failed."));
});

