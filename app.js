const STORAGE_KEY = "audit-organizer-state-v1";
const TOTAL_SHELVES = 48;

const state = loadState();

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

initialize();

function initialize() {
  if (!state.managers.length) {
    seedExampleData();
  }

  elements.auditDate.value = getTodayDateInputValue();

  bindEvents();
  render();
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

function loadState() {
  const fallback = {
    managers: [],
    activeManagerId: null,
    shiftName: "",
    auditDate: "",
    assignments: [],
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch (error) {
    console.error("Failed to load local state", error);
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedExampleData() {
  const managerId = crypto.randomUUID();

  state.managers = [
    {
      id: managerId,
      name: "Jamie Cruz",
      email: "jamie.cruz@warehouse.example",
      employees: [
        { id: crypto.randomUUID(), name: "Alex Kim", email: "alex.kim@warehouse.example" },
        { id: crypto.randomUUID(), name: "Riley Patel", email: "riley.patel@warehouse.example" },
        { id: crypto.randomUUID(), name: "Jordan Lee", email: "jordan.lee@warehouse.example" },
      ],
      presentEmployeeIds: [],
    },
  ];

  state.activeManagerId = managerId;
  state.shiftName = "Day Shift";
  state.auditDate = getTodayDateInputValue();
  saveState();
}

function getActiveManager() {
  return state.managers.find((manager) => manager.id === state.activeManagerId) || null;
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
      option.value = manager.id;
      option.textContent = `${manager.name} (${manager.employees.length} employees)`;
      if (manager.id === state.activeManagerId) {
        option.selected = true;
      }
      elements.managerSelect.appendChild(option);
    }
  }

  elements.managerList.innerHTML = "";

  for (const manager of state.managers) {
    const fragment = elements.managerItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".entity-card");

    fragment.querySelector(".entity-name").textContent = manager.name;
    fragment.querySelector(".entity-subtitle").textContent = `${manager.email} | ${manager.employees.length} employees saved`;

    fragment.querySelector(".edit-manager-btn").addEventListener("click", () => {
      uiState.editingManagerId = manager.id;
      elements.managerName.value = manager.name;
      elements.managerEmail.value = manager.email;
      elements.saveManagerBtn.textContent = "Update Manager";
      elements.cancelManagerBtn.classList.remove("hidden");
      elements.managerName.focus();
    });

    fragment.querySelector(".delete-manager-btn").addEventListener("click", () => deleteManager(manager.id));

    if (manager.id === state.activeManagerId) {
      item.style.borderColor = "rgba(15, 122, 107, 0.4)";
    }

    elements.managerList.appendChild(fragment);
  }
}

function renderEmployees() {
  const manager = getActiveManager();
  const hasManager = Boolean(manager);

  elements.employeeForm.classList.toggle("hidden", !hasManager);
  elements.employeeEmpty.classList.toggle("hidden", hasManager);
  elements.employeeList.innerHTML = "";

  if (!manager) {
    return;
  }

  for (const employee of manager.employees) {
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

    fragment.querySelector(".delete-employee-btn").addEventListener("click", () => deleteEmployee(employee.id));

    elements.employeeList.appendChild(fragment);
  }
}

function renderAttendance() {
  const manager = getActiveManager();
  elements.attendanceList.innerHTML = "";

  if (!manager || !manager.employees.length) {
    elements.attendanceList.innerHTML = `
      <div class="empty-state">Add employees to the active manager profile to start a shift assignment.</div>
    `;
    return;
  }

  const savedIds = new Set(manager.presentEmployeeIds || []);

  for (const employee of manager.employees) {
    const wrapper = document.createElement("div");
    wrapper.className = "attendance-item";
    wrapper.innerHTML = `
      <label>
        <input type="checkbox" ${savedIds.has(employee.id) ? "checked" : ""}>
        <span>
          <strong>${employee.name}</strong><br>
          <span class="entity-subtitle">${employee.email}</span>
        </span>
      </label>
      <span class="chip">Ready for assignment</span>
    `;

    wrapper.querySelector("input").addEventListener("change", (event) => {
      updateAttendance(employee.id, event.target.checked);
    });

    elements.attendanceList.appendChild(wrapper);
  }
}

function renderAssignments() {
  const manager = getActiveManager();
  const assignments = state.assignments.filter((item) => item.managerId === state.activeManagerId);

  if (!manager || !assignments.length) {
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
    <p><strong>${shiftLabel}</strong> on <strong>${dateLabel}</strong>. ${assignments.length} employees are covering all ${TOTAL_SHELVES} shelves.</p>
    <div class="summary-table"></div>
  `;

  const table = elements.assignmentSummary.querySelector(".summary-table");

  for (const assignment of assignments) {
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

  for (const assignment of assignments) {
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
    sendBtn.textContent = "Open Email Draft";
    sendBtn.addEventListener("click", () => openMailDraft(assignment));

    card.appendChild(sendBtn);
    elements.emailActions.appendChild(card);
  }
}

function handleManagerSubmit(event) {
  event.preventDefault();

  const name = elements.managerName.value.trim();
  const email = elements.managerEmail.value.trim().toLowerCase();

  if (!name || !email) {
    return;
  }

  const duplicate = state.managers.find((manager) => {
    return manager.email === email && manager.id !== uiState.editingManagerId;
  });

  if (duplicate) {
    alert("That manager email is already saved.");
    return;
  }

  if (uiState.editingManagerId) {
    const manager = state.managers.find((item) => item.id === uiState.editingManagerId);
    if (!manager) {
      return;
    }

    manager.name = name;
    manager.email = email;
  } else {
    const manager = {
      id: crypto.randomUUID(),
      name,
      email,
      employees: [],
      presentEmployeeIds: [],
    };

    state.managers.push(manager);
    state.activeManagerId = manager.id;
  }

  clearAssignments(uiState.editingManagerId || state.activeManagerId);
  saveState();
  resetManagerForm();
  render();
}

function handleEmployeeSubmit(event) {
  event.preventDefault();

  const manager = getActiveManager();
  if (!manager) {
    return;
  }

  const name = elements.employeeName.value.trim();
  const email = elements.employeeEmail.value.trim().toLowerCase();

  if (!name || !email) {
    return;
  }

  const duplicate = manager.employees.find((employee) => {
    return employee.email === email && employee.id !== uiState.editingEmployeeId;
  });

  if (duplicate) {
    alert("That employee email is already saved for this manager.");
    return;
  }

  if (uiState.editingEmployeeId) {
    const employee = manager.employees.find((item) => item.id === uiState.editingEmployeeId);
    if (!employee) {
      return;
    }

    employee.name = name;
    employee.email = email;
  } else {
    manager.employees.push({
      id: crypto.randomUUID(),
      name,
      email,
    });
  }

  clearAssignments(state.activeManagerId);
  saveState();
  resetEmployeeForm();
  render();
}

function handleManagerSelection(event) {
  state.activeManagerId = event.target.value || null;
  resetManagerForm();
  resetEmployeeForm();
  saveState();
  render();
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

function deleteManager(managerId) {
  const manager = state.managers.find((item) => item.id === managerId);
  if (!manager) {
    return;
  }

  const confirmed = confirm(`Delete manager ${manager.name} and all saved employees?`);
  if (!confirmed) {
    return;
  }

  state.managers = state.managers.filter((item) => item.id !== managerId);

  if (state.activeManagerId === managerId) {
    state.activeManagerId = state.managers[0]?.id || null;
  }

  clearAssignments(managerId);
  saveState();
  resetManagerForm();
  render();
}

function deleteEmployee(employeeId) {
  const manager = getActiveManager();
  if (!manager) {
    return;
  }

  const employee = manager.employees.find((item) => item.id === employeeId);
  if (!employee) {
    return;
  }

  const confirmed = confirm(`Delete employee ${employee.name}?`);
  if (!confirmed) {
    return;
  }

  manager.employees = manager.employees.filter((item) => item.id !== employeeId);
  manager.presentEmployeeIds = (manager.presentEmployeeIds || []).filter((id) => id !== employeeId);
  clearAssignments(state.activeManagerId);
  saveState();
  resetEmployeeForm();
  render();
}

function updateAttendance(employeeId, isPresent) {
  const manager = getActiveManager();
  if (!manager) {
    return;
  }

  const presentSet = new Set(manager.presentEmployeeIds || []);

  if (isPresent) {
    presentSet.add(employeeId);
  } else {
    presentSet.delete(employeeId);
  }

  manager.presentEmployeeIds = Array.from(presentSet);
  clearAssignments(state.activeManagerId);
  saveState();
}

function toggleAllAttendance() {
  const manager = getActiveManager();
  if (!manager || !manager.employees.length) {
    return;
  }

  const allSelected = manager.presentEmployeeIds?.length === manager.employees.length;
  manager.presentEmployeeIds = allSelected ? [] : manager.employees.map((employee) => employee.id);
  clearAssignments(state.activeManagerId);
  saveState();
  renderAttendance();
  renderAssignments();
}

function persistShiftFields() {
  state.shiftName = elements.shiftName.value.trim();
  state.auditDate = elements.auditDate.value;
  saveState();
}

function generateAssignments() {
  const manager = getActiveManager();
  if (!manager) {
    alert("Create or choose a manager first.");
    return;
  }

  const presentIds = manager.presentEmployeeIds || [];
  const presentEmployees = manager.employees.filter((employee) => presentIds.includes(employee.id));

  if (!presentEmployees.length) {
    alert("Select at least one employee who is present for this shift.");
    return;
  }

  persistShiftFields();

  const baseCount = Math.floor(TOTAL_SHELVES / presentEmployees.length);
  const remainder = TOTAL_SHELVES % presentEmployees.length;
  let nextShelf = 1;

  state.assignments = presentEmployees.map((employee, index) => {
    const shelfCount = baseCount + (index < remainder ? 1 : 0);
    const startShelf = nextShelf;
    const endShelf = nextShelf + shelfCount - 1;
    nextShelf = endShelf + 1;

    return {
      managerId: manager.id,
      managerName: manager.name,
      managerEmail: manager.email,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeEmail: employee.email,
      shelfCount,
      shelves: shelfCount ? createShelfRange(startShelf, endShelf) : [],
      shelfLabel: shelfCount ? `${startShelf}-${endShelf}` : "No shelves assigned",
      shiftName: state.shiftName || "Current Shift",
      auditDate: state.auditDate || getTodayDateInputValue(),
    };
  });

  saveState();
  renderAssignments();
}

function createShelfRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
  const assignments = state.assignments.filter((item) => item.managerId === state.activeManagerId);

  if (!assignments.length) {
    alert("Generate assignments first.");
    return;
  }

  for (const assignment of assignments) {
    openMailDraft(assignment);
  }
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

function clearAssignments(managerId) {
  if (!managerId) {
    state.assignments = [];
    return;
  }

  state.assignments = state.assignments.filter((assignment) => assignment.managerId !== managerId);
}

function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
