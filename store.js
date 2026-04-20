const db = require("./db");

const TOTAL_SHELVES = 48;

async function listManagers() {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      SELECT
        managers.id,
        managers.name,
        managers.email,
        COUNT(employees.id)::int AS "employeeCount"
      FROM managers
      LEFT JOIN employees ON employees.manager_id = managers.id
      GROUP BY managers.id
      ORDER BY managers.name
    `);
    return result.rows;
  }

  return db.prepare(`
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
}

async function createManager(name, email) {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      INSERT INTO managers (name, email)
      VALUES ($1, $2)
      RETURNING id, name, email, 0::int AS "employeeCount"
    `, [name, email]);
    return result.rows[0];
  }

  const result = db.prepare(`
    INSERT INTO managers (name, email)
    VALUES (?, ?)
  `).run(name, email);

  return db.prepare(`
    SELECT id, name, email, 0 AS employeeCount
    FROM managers
    WHERE id = ?
  `).get(result.lastInsertRowid);
}

async function updateManager(id, name, email) {
  if (db.getMode() === "postgres") {
    const update = await db.query(`
      UPDATE managers
      SET name = $1, email = $2
      WHERE id = $3
      RETURNING id
    `, [name, email, id]);

    if (!update.rowCount) {
      return null;
    }

    const result = await db.query(`
      SELECT
        managers.id,
        managers.name,
        managers.email,
        COUNT(employees.id)::int AS "employeeCount"
      FROM managers
      LEFT JOIN employees ON employees.manager_id = managers.id
      WHERE managers.id = $1
      GROUP BY managers.id
    `, [id]);
    return result.rows[0];
  }

  const update = db.prepare(`
    UPDATE managers
    SET name = ?, email = ?
    WHERE id = ?
  `).run(name, email, id);

  if (!update.changes) {
    return null;
  }

  return db.prepare(`
    SELECT
      managers.id,
      managers.name,
      managers.email,
      COUNT(employees.id) AS employeeCount
    FROM managers
    LEFT JOIN employees ON employees.manager_id = managers.id
    WHERE managers.id = ?
    GROUP BY managers.id
  `).get(id);
}

async function deleteManager(id) {
  if (db.getMode() === "postgres") {
    const result = await db.query("DELETE FROM managers WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  const result = db.prepare("DELETE FROM managers WHERE id = ?").run(id);
  return result.changes > 0;
}

async function managerExists(id) {
  if (db.getMode() === "postgres") {
    const result = await db.query("SELECT 1 FROM managers WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  return Boolean(db.prepare("SELECT 1 FROM managers WHERE id = ?").get(id));
}

async function listEmployees(managerId) {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      SELECT id, manager_id AS "managerId", name, email
      FROM employees
      WHERE manager_id = $1
      ORDER BY name
    `, [managerId]);
    return result.rows;
  }

  return db.prepare(`
    SELECT id, manager_id AS managerId, name, email
    FROM employees
    WHERE manager_id = ?
    ORDER BY name COLLATE NOCASE
  `).all(managerId);
}

async function createEmployee(managerId, name, email) {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      INSERT INTO employees (manager_id, name, email)
      VALUES ($1, $2, $3)
      RETURNING id, manager_id AS "managerId", name, email
    `, [managerId, name, email]);
    return result.rows[0];
  }

  const result = db.prepare(`
    INSERT INTO employees (manager_id, name, email)
    VALUES (?, ?, ?)
  `).run(managerId, name, email);

  return db.prepare(`
    SELECT id, manager_id AS managerId, name, email
    FROM employees
    WHERE id = ?
  `).get(result.lastInsertRowid);
}

async function updateEmployee(managerId, employeeId, name, email) {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      UPDATE employees
      SET name = $1, email = $2
      WHERE id = $3 AND manager_id = $4
      RETURNING id, manager_id AS "managerId", name, email
    `, [name, email, employeeId, managerId]);
    return result.rows[0] || null;
  }

  const update = db.prepare(`
    UPDATE employees
    SET name = ?, email = ?
    WHERE id = ? AND manager_id = ?
  `).run(name, email, employeeId, managerId);

  if (!update.changes) {
    return null;
  }

  return db.prepare(`
    SELECT id, manager_id AS managerId, name, email
    FROM employees
    WHERE id = ?
  `).get(employeeId);
}

async function deleteEmployee(managerId, employeeId) {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      DELETE FROM employees
      WHERE id = $1 AND manager_id = $2
    `, [employeeId, managerId]);
    return result.rowCount > 0;
  }

  const result = db.prepare(`
    DELETE FROM employees
    WHERE id = ? AND manager_id = ?
  `).run(employeeId, managerId);
  return result.changes > 0;
}

async function listAssignments(managerId) {
  if (db.getMode() === "postgres") {
    const result = await db.query(`
      SELECT
        assignments.id,
        assignments.manager_id AS "managerId",
        assignments.employee_id AS "employeeId",
        employees.name AS "employeeName",
        employees.email AS "employeeEmail",
        managers.name AS "managerName",
        managers.email AS "managerEmail",
        assignments.shift_name AS "shiftName",
        TO_CHAR(assignments.audit_date, 'YYYY-MM-DD') AS "auditDate",
        assignments.shelf_start AS "shelfStart",
        assignments.shelf_end AS "shelfEnd",
        assignments.shelf_count AS "shelfCount"
      FROM assignments
      INNER JOIN employees ON employees.id = assignments.employee_id
      INNER JOIN managers ON managers.id = assignments.manager_id
      WHERE assignments.manager_id = $1
      ORDER BY assignments.shelf_start ASC
    `, [managerId]);
    return addShelfLabels(result.rows);
  }

  const rows = db.prepare(`
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
  `).all(managerId);
  return addShelfLabels(rows);
}

async function clearAssignments(managerId) {
  if (db.getMode() === "postgres") {
    await db.query("DELETE FROM assignments WHERE manager_id = $1", [managerId]);
    return;
  }

  db.prepare("DELETE FROM assignments WHERE manager_id = ?").run(managerId);
}

async function createAssignments(managerId, presentEmployeeIds, shiftName, auditDate) {
  if (db.getMode() === "postgres") {
    const managerResult = await db.query("SELECT id, name, email FROM managers WHERE id = $1", [managerId]);
    const manager = managerResult.rows[0];

    if (!manager) {
      return null;
    }

    const employeeResult = await db.query(`
      SELECT id, name, email
      FROM employees
      WHERE manager_id = $1 AND id = ANY($2::int[])
    `, [managerId, presentEmployeeIds]);

    const employees = employeeResult.rows;
    employees.sort((a, b) => presentEmployeeIds.indexOf(a.id) - presentEmployeeIds.indexOf(b.id));
    if (!employees.length) {
      return [];
    }

    await db.query("BEGIN");
    try {
      await db.query("DELETE FROM assignments WHERE manager_id = $1", [managerId]);
      let nextShelf = 1;
      const baseCount = Math.floor(TOTAL_SHELVES / employees.length);
      const remainder = TOTAL_SHELVES % employees.length;

      for (const [index, employee] of employees.entries()) {
        const shelfCount = baseCount + (index < remainder ? 1 : 0);
        const shelfStart = nextShelf;
        const shelfEnd = nextShelf + shelfCount - 1;
        nextShelf = shelfEnd + 1;

        await db.query(`
          INSERT INTO assignments (
            manager_id, employee_id, shift_name, audit_date, shelf_start, shelf_end, shelf_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [managerId, employee.id, shiftName, auditDate, shelfStart, shelfEnd, shelfCount]);
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    return listAssignments(managerId);
  }

  const manager = db.prepare("SELECT id, name, email FROM managers WHERE id = ?").get(managerId);
  if (!manager) {
    return null;
  }

  const placeholders = presentEmployeeIds.map(() => "?").join(", ");
  const employees = db.prepare(`
    SELECT id, name, email
    FROM employees
    WHERE manager_id = ? AND id IN (${placeholders})
  `).all(managerId, ...presentEmployeeIds);

  employees.sort((a, b) => presentEmployeeIds.indexOf(a.id) - presentEmployeeIds.indexOf(b.id));

  if (!employees.length) {
    return [];
  }

  const removeAssignments = db.prepare("DELETE FROM assignments WHERE manager_id = ?");
  const insertAssignment = db.prepare(`
    INSERT INTO assignments (
      manager_id, employee_id, shift_name, audit_date, shelf_start, shelf_end, shelf_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    removeAssignments.run(managerId);
    let nextShelf = 1;
    const baseCount = Math.floor(TOTAL_SHELVES / employees.length);
    const remainder = TOTAL_SHELVES % employees.length;

    for (const [index, employee] of employees.entries()) {
      const shelfCount = baseCount + (index < remainder ? 1 : 0);
      const shelfStart = nextShelf;
      const shelfEnd = nextShelf + shelfCount - 1;
      nextShelf = shelfEnd + 1;

      insertAssignment.run(managerId, employee.id, shiftName, auditDate, shelfStart, shelfEnd, shelfCount);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return listAssignments(managerId);
}

function addShelfLabels(rows) {
  return rows.map((row) => ({
    ...row,
    shelfLabel: `${row.shelfStart}-${row.shelfEnd}`,
  }));
}

module.exports = {
  listManagers,
  createManager,
  updateManager,
  deleteManager,
  managerExists,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listAssignments,
  clearAssignments,
  createAssignments,
};
