const path = require("path");
const express = require("express");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const TOTAL_SHELVES = 48;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/managers", (_request, response) => {
  const managers = db.prepare(`
    SELECT
      managers.id,
      managers.name,
      managers.email,
      COUNT(employees.id) AS employeeCount
    FROM managers
    LEFT JOIN employees ON employees.manager_id = managers.id
    GROUP BY managers.id
    ORDER BY managers.name COLLATE NOCASE
  `).all();

  response.json(managers);
});

app.post("/api/managers", (request, response) => {
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!name || !email) {
    return response.status(400).json({ error: "Manager name and email are required." });
  }

  try {
    const result = db.prepare(`
      INSERT INTO managers (name, email)
      VALUES (?, ?)
    `).run(name, email);

    const manager = db.prepare(`
      SELECT id, name, email, 0 AS employeeCount
      FROM managers
      WHERE id = ?
    `).get(result.lastInsertRowid);

    return response.status(201).json(manager);
  } catch (error) {
    return handleDatabaseError(error, response, "manager");
  }
});

app.put("/api/managers/:managerId", (request, response) => {
  const managerId = Number(request.params.managerId);
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!managerId || !name || !email) {
    return response.status(400).json({ error: "Valid manager details are required." });
  }

  try {
    const result = db.prepare(`
      UPDATE managers
      SET name = ?, email = ?
      WHERE id = ?
    `).run(name, email, managerId);

    if (!result.changes) {
      return response.status(404).json({ error: "Manager not found." });
    }

    const manager = db.prepare(`
      SELECT
        managers.id,
        managers.name,
        managers.email,
        COUNT(employees.id) AS employeeCount
      FROM managers
      LEFT JOIN employees ON employees.manager_id = managers.id
      WHERE managers.id = ?
      GROUP BY managers.id
    `).get(managerId);

    return response.json(manager);
  } catch (error) {
    return handleDatabaseError(error, response, "manager");
  }
});

app.delete("/api/managers/:managerId", (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  const result = db.prepare("DELETE FROM managers WHERE id = ?").run(managerId);

  if (!result.changes) {
    return response.status(404).json({ error: "Manager not found." });
  }

  return response.status(204).send();
});

app.get("/api/managers/:managerId/employees", (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  const employees = db.prepare(`
    SELECT id, manager_id AS managerId, name, email
    FROM employees
    WHERE manager_id = ?
    ORDER BY name COLLATE NOCASE
  `).all(managerId);

  response.json(employees);
});

app.post("/api/managers/:managerId/employees", (request, response) => {
  const managerId = Number(request.params.managerId);
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!managerId || !name || !email) {
    return response.status(400).json({ error: "Valid employee details are required." });
  }

  if (!managerExists(managerId)) {
    return response.status(404).json({ error: "Manager not found." });
  }

  try {
    const result = db.prepare(`
      INSERT INTO employees (manager_id, name, email)
      VALUES (?, ?, ?)
    `).run(managerId, name, email);

    const employee = db.prepare(`
      SELECT id, manager_id AS managerId, name, email
      FROM employees
      WHERE id = ?
    `).get(result.lastInsertRowid);

    return response.status(201).json(employee);
  } catch (error) {
    return handleDatabaseError(error, response, "employee");
  }
});

app.put("/api/managers/:managerId/employees/:employeeId", (request, response) => {
  const managerId = Number(request.params.managerId);
  const employeeId = Number(request.params.employeeId);
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!managerId || !employeeId || !name || !email) {
    return response.status(400).json({ error: "Valid employee details are required." });
  }

  try {
    const result = db.prepare(`
      UPDATE employees
      SET name = ?, email = ?
      WHERE id = ? AND manager_id = ?
    `).run(name, email, employeeId, managerId);

    if (!result.changes) {
      return response.status(404).json({ error: "Employee not found." });
    }

    const employee = db.prepare(`
      SELECT id, manager_id AS managerId, name, email
      FROM employees
      WHERE id = ?
    `).get(employeeId);

    return response.json(employee);
  } catch (error) {
    return handleDatabaseError(error, response, "employee");
  }
});

app.delete("/api/managers/:managerId/employees/:employeeId", (request, response) => {
  const managerId = Number(request.params.managerId);
  const employeeId = Number(request.params.employeeId);

  if (!managerId || !employeeId) {
    return response.status(400).json({ error: "Valid employee id is required." });
  }

  const result = db.prepare(`
    DELETE FROM employees
    WHERE id = ? AND manager_id = ?
  `).run(employeeId, managerId);

  if (!result.changes) {
    return response.status(404).json({ error: "Employee not found." });
  }

  return response.status(204).send();
});

app.get("/api/managers/:managerId/assignments", (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  const assignments = db.prepare(`
    SELECT
      assignments.id,
      assignments.manager_id AS managerId,
      assignments.employee_id AS employeeId,
      employees.name AS employeeName,
      employees.email AS employeeEmail,
      managers.name AS managerName,
      managers.email AS managerEmail,
      assignments.shift_name AS shiftName,
      assignments.audit_date AS auditDate,
      assignments.shelf_start AS shelfStart,
      assignments.shelf_end AS shelfEnd,
      assignments.shelf_count AS shelfCount
    FROM assignments
    INNER JOIN employees ON employees.id = assignments.employee_id
    INNER JOIN managers ON managers.id = assignments.manager_id
    WHERE assignments.manager_id = ?
    ORDER BY assignments.shelf_start ASC
  `).all(managerId).map((assignment) => ({
    ...assignment,
    shelfLabel: `${assignment.shelfStart}-${assignment.shelfEnd}`,
  }));

  response.json(assignments);
});

app.delete("/api/managers/:managerId/assignments", (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  db.prepare("DELETE FROM assignments WHERE manager_id = ?").run(managerId);
  return response.status(204).send();
});

app.post("/api/managers/:managerId/assignments", (request, response) => {
  const managerId = Number(request.params.managerId);
  const presentEmployeeIds = Array.isArray(request.body?.presentEmployeeIds)
    ? request.body.presentEmployeeIds.map(Number).filter(Boolean)
    : [];
  const shiftName = sanitizeName(request.body?.shiftName) || "Current Shift";
  const auditDate = sanitizeDate(request.body?.auditDate);

  if (!managerId || !auditDate) {
    return response.status(400).json({ error: "Valid manager and audit date are required." });
  }

  if (!presentEmployeeIds.length) {
    return response.status(400).json({ error: "Select at least one employee who is present for the shift." });
  }

  const placeholders = presentEmployeeIds.map(() => "?").join(", ");
  const employees = db.prepare(`
    SELECT id, name, email
    FROM employees
    WHERE manager_id = ? AND id IN (${placeholders})
    ORDER BY name COLLATE NOCASE
  `).all(managerId, ...presentEmployeeIds);

  if (!employees.length) {
    return response.status(400).json({ error: "No valid employees were found for this manager." });
  }

  const manager = db.prepare("SELECT id, name, email FROM managers WHERE id = ?").get(managerId);

  if (!manager) {
    return response.status(404).json({ error: "Manager not found." });
  }

  const removeAssignments = db.prepare("DELETE FROM assignments WHERE manager_id = ?");
  const insertAssignment = db.prepare(`
    INSERT INTO assignments (
      manager_id, employee_id, shift_name, audit_date, shelf_start, shelf_end, shelf_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const saveAssignments = db.transaction(() => {
    removeAssignments.run(managerId);

    const baseCount = Math.floor(TOTAL_SHELVES / employees.length);
    const remainder = TOTAL_SHELVES % employees.length;
    let nextShelf = 1;

    for (const [index, employee] of employees.entries()) {
      const shelfCount = baseCount + (index < remainder ? 1 : 0);
      const shelfStart = nextShelf;
      const shelfEnd = nextShelf + shelfCount - 1;
      nextShelf = shelfEnd + 1;

      insertAssignment.run(
        managerId,
        employee.id,
        shiftName,
        auditDate,
        shelfStart,
        shelfEnd,
        shelfCount
      );
    }
  });

  saveAssignments();

  const assignments = db.prepare(`
    SELECT
      assignments.id,
      assignments.manager_id AS managerId,
      assignments.employee_id AS employeeId,
      employees.name AS employeeName,
      employees.email AS employeeEmail,
      managers.name AS managerName,
      managers.email AS managerEmail,
      assignments.shift_name AS shiftName,
      assignments.audit_date AS auditDate,
      assignments.shelf_start AS shelfStart,
      assignments.shelf_end AS shelfEnd,
      assignments.shelf_count AS shelfCount
    FROM assignments
    INNER JOIN employees ON employees.id = assignments.employee_id
    INNER JOIN managers ON managers.id = assignments.manager_id
    WHERE assignments.manager_id = ?
    ORDER BY assignments.shelf_start ASC
  `).all(managerId).map((assignment) => ({
    ...assignment,
    shelfLabel: `${assignment.shelfStart}-${assignment.shelfEnd}`,
  }));

  response.status(201).json(assignments);
});

app.use((_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Audit Organizer running on http://localhost:${PORT}`);
});

function sanitizeName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeDate(value) {
  if (typeof value !== "string") {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";
}

function managerExists(managerId) {
  return Boolean(db.prepare("SELECT 1 FROM managers WHERE id = ?").get(managerId));
}

function handleDatabaseError(error, response, entityName) {
  if (String(error.message).includes("UNIQUE")) {
    return response.status(409).json({ error: `That ${entityName} email is already saved.` });
  }

  console.error(error);
  return response.status(500).json({ error: `Unable to save ${entityName}.` });
}
