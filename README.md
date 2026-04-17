# Audit Organizer

A small release-ready web app for warehouse audit planning with manager profiles, employee rosters, 48-shelf balancing, database-backed persistence, and automatic email sending.

## Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite locally, Render Postgres in deployment

## Run locally

1. Use Node.js 22 or newer
2. Install dependencies with `npm install`
3. Start the server with `npm start`
4. Open [http://localhost:3000](http://localhost:3000)

## What changed from the first version

- Data is no longer stored in browser `localStorage`.
- Managers, employees, and generated assignments are stored in a real backend database.
- The frontend now loads and saves everything through backend API routes.
- The app can now be deployed as a web service instead of only as a static site.
- Automatic email sending is supported through Resend.

## Main API routes

- `GET /api/managers`
- `POST /api/managers`
- `PUT /api/managers/:managerId`
- `DELETE /api/managers/:managerId`
- `GET /api/managers/:managerId/employees`
- `POST /api/managers/:managerId/employees`
- `PUT /api/managers/:managerId/employees/:employeeId`
- `DELETE /api/managers/:managerId/employees/:employeeId`
- `GET /api/managers/:managerId/assignments`
- `POST /api/managers/:managerId/assignments`
- `DELETE /api/managers/:managerId/assignments`
- `POST /api/managers/:managerId/send-emails`
- `POST /api/managers/:managerId/assignments/:assignmentId/send-email`

## Local database

- Local development uses SQLite by default.
- You can override the database location with the `AUDIT_DATA_DIR` environment variable.
- If `DATABASE_URL` is set, the app uses Postgres instead.

## Automatic email setup

- The app uses [Resend](https://resend.com/docs/api-reference/emails/send-email) for automatic email sending.
- Required environment variables:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
- Optional:
  - `EMAIL_REPLY_TO`
- If those variables are not set, the app falls back to opening `mailto:` drafts.

## Render deploy

- A starter [render.yaml](C:/Users/Marlo/OneDrive/Desktop/WebAPP/render.yaml) is included.
- It creates one Node web service and one Render Postgres database.
- Useful docs:
  - [Deploying on Render](https://render.com/docs/deploys)
  - [Create and Connect to Render Postgres](https://render.com/docs/databases)
  - [Render free tier limitations](https://render.com/docs/free)

## Important Render note

- Render free web services spin down after 15 minutes of inactivity.
- Render free Postgres databases expire 30 days after creation.
- Those limits are okay for testing, but not ideal for a long-term production release.
