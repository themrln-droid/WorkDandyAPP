const path = require("path");
const express = require("express");
const { Resend } = require("resend");
const db = require("./db");
const store = require("./store");

const app = express();
const PORT = process.env.PORT || 3000;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, database: db.getMode() });
});

app.get("/api/config", (_request, response) => {
  response.json({
    emailEnabled: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    database: db.getMode(),
  });
});

app.get("/api/managers", async (_request, response) => {
  response.json(await store.listManagers());
});

app.post("/api/managers", async (request, response) => {
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!name || !email) {
    return response.status(400).json({ error: "Manager name and email are required." });
  }

  try {
    const manager = await store.createManager(name, email);
    return response.status(201).json(manager);
  } catch (error) {
    return handleDatabaseError(error, response, "manager");
  }
});

app.put("/api/managers/:managerId", async (request, response) => {
  const managerId = Number(request.params.managerId);
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!managerId || !name || !email) {
    return response.status(400).json({ error: "Valid manager details are required." });
  }

  try {
    const manager = await store.updateManager(managerId, name, email);

    if (!manager) {
      return response.status(404).json({ error: "Manager not found." });
    }

    return response.json(manager);
  } catch (error) {
    return handleDatabaseError(error, response, "manager");
  }
});

app.delete("/api/managers/:managerId", async (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  const deleted = await store.deleteManager(managerId);

  if (!deleted) {
    return response.status(404).json({ error: "Manager not found." });
  }

  return response.status(204).send();
});

app.get("/api/managers/:managerId/employees", async (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  response.json(await store.listEmployees(managerId));
});

app.post("/api/managers/:managerId/employees", async (request, response) => {
  const managerId = Number(request.params.managerId);
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!managerId || !name || !email) {
    return response.status(400).json({ error: "Valid employee details are required." });
  }

  if (!(await store.managerExists(managerId))) {
    return response.status(404).json({ error: "Manager not found." });
  }

  try {
    const employee = await store.createEmployee(managerId, name, email);
    return response.status(201).json(employee);
  } catch (error) {
    return handleDatabaseError(error, response, "employee");
  }
});

app.put("/api/managers/:managerId/employees/:employeeId", async (request, response) => {
  const managerId = Number(request.params.managerId);
  const employeeId = Number(request.params.employeeId);
  const name = sanitizeName(request.body?.name);
  const email = sanitizeEmail(request.body?.email);

  if (!managerId || !employeeId || !name || !email) {
    return response.status(400).json({ error: "Valid employee details are required." });
  }

  try {
    const employee = await store.updateEmployee(managerId, employeeId, name, email);

    if (!employee) {
      return response.status(404).json({ error: "Employee not found." });
    }

    return response.json(employee);
  } catch (error) {
    return handleDatabaseError(error, response, "employee");
  }
});

app.delete("/api/managers/:managerId/employees/:employeeId", async (request, response) => {
  const managerId = Number(request.params.managerId);
  const employeeId = Number(request.params.employeeId);

  if (!managerId || !employeeId) {
    return response.status(400).json({ error: "Valid employee id is required." });
  }

  const deleted = await store.deleteEmployee(managerId, employeeId);

  if (!deleted) {
    return response.status(404).json({ error: "Employee not found." });
  }

  return response.status(204).send();
});

app.get("/api/managers/:managerId/assignments", async (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  response.json(await store.listAssignments(managerId));
});

app.delete("/api/managers/:managerId/assignments", async (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  await store.clearAssignments(managerId);
  return response.status(204).send();
});

app.post("/api/managers/:managerId/assignments", async (request, response) => {
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

  const assignments = await store.createAssignments(managerId, presentEmployeeIds, shiftName, auditDate);

  if (assignments === null) {
    return response.status(404).json({ error: "Manager not found." });
  }

  response.status(201).json(assignments);
});

app.post("/api/managers/:managerId/send-emails", async (request, response) => {
  const managerId = Number(request.params.managerId);

  if (!managerId) {
    return response.status(400).json({ error: "Valid manager id is required." });
  }

  if (!resend || !process.env.EMAIL_FROM) {
    return response.status(400).json({ error: "Automatic email sending is not configured yet." });
  }

  const assignments = await store.listAssignments(managerId);

  if (!assignments.length) {
    return response.status(400).json({ error: "Generate assignments before sending emails." });
  }

  const sent = [];

  for (const assignment of assignments) {
    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: [assignment.employeeEmail],
        subject: buildEmailSubject(assignment),
        html: buildEmailHtml(assignment),
        text: buildEmailText(assignment),
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
      });

      if (result.error) {
        console.error("Resend API Error for", assignment.employeeEmail, ":", result.error);
        return response.status(500).json({ error: `Failed to send email to ${assignment.employeeEmail}: ${result.error.message || "Unknown error"}` });
      }

      sent.push({
        employeeEmail: assignment.employeeEmail,
        id: result.data?.id || null,
      });
    } catch (err) {
      console.error("Exception sending email to", assignment.employeeEmail, ":", err);
      return response.status(500).json({ error: `Exception sending email to ${assignment.employeeEmail}: ${err.message || "Unknown error"}` });
    }
  }

  response.json({ sentCount: sent.length, sent });
});

app.post("/api/managers/:managerId/assignments/:assignmentId/send-email", async (request, response) => {
  const managerId = Number(request.params.managerId);
  const assignmentId = Number(request.params.assignmentId);

  if (!managerId || !assignmentId) {
    return response.status(400).json({ error: "Valid manager and assignment ids are required." });
  }

  if (!resend || !process.env.EMAIL_FROM) {
    return response.status(400).json({ error: "Automatic email sending is not configured yet." });
  }

  const assignments = await store.listAssignments(managerId);
  const assignment = assignments.find((item) => item.id === assignmentId);

  if (!assignment) {
    return response.status(404).json({ error: "Assignment not found." });
  }

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [assignment.employeeEmail],
      subject: buildEmailSubject(assignment),
      html: buildEmailHtml(assignment),
      text: buildEmailText(assignment),
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });

    if (result.error) {
      console.error("Resend API Error for", assignment.employeeEmail, ":", result.error);
      return response.status(500).json({ error: `Failed to send email: ${result.error.message || "Unknown error"}` });
    }

    response.json({ id: result.data?.id || null });
  } catch (err) {
    console.error("Exception sending email to", assignment.employeeEmail, ":", err);
    return response.status(500).json({ error: `Exception sending email: ${err.message || "Unknown error"}` });
  }
});

app.use((_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

start();

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`Audit Organizer running on http://localhost:${PORT}`);
  });
}

function buildEmailSubject(assignment) {
  return `${assignment.shiftName} audit assignment for ${formatDate(assignment.auditDate)}`;
}

function buildEmailText(assignment) {
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

function buildEmailHtml(assignment) {
  return `
    <p>Hi ${escapeHtml(assignment.employeeName)},</p>
    <p>Please complete today's shelf audit for shelves <strong>${escapeHtml(assignment.shelfLabel)}</strong>.</p>
    <p>Total shelves assigned: <strong>${assignment.shelfCount}</strong>.</p>
    <p>Shift: ${escapeHtml(assignment.shiftName)}<br>Date: ${escapeHtml(formatDate(assignment.auditDate))}</p>
    <p>Thank you,<br>${escapeHtml(assignment.managerName)}</p>
  `;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function handleDatabaseError(error, response, entityName) {
  if (String(error.message).includes("UNIQUE") || String(error.code) === "23505") {
    return response.status(409).json({ error: `That ${entityName} email is already saved.` });
  }

  console.error(error);
  return response.status(500).json({ error: `Unable to save ${entityName}.` });
}
