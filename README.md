# Audit Organizer

A small release-ready web app for warehouse audit planning with manager profiles, employee rosters, 48-shelf balancing, SQLite-backed persistence, and email draft generation.

## Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite

## Run locally

1. Use Node.js 22 or newer
2. Install dependencies with `npm install`
3. Start the server with `npm start`
4. Open [http://localhost:3000](http://localhost:3000)

## What changed from the first version

- Data is no longer stored in browser `localStorage`.
- Managers, employees, and generated assignments are stored in `data/audit-organizer.db`.
- Managers, employees, and generated assignments are stored in a SQLite file under the app data directory by default.
- The frontend now loads and saves everything through backend API routes.
- The app can now be deployed as a web service instead of only as a static site.

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

## Release notes

- SQLite is a good simple setup for one deployed app instance.
- You can override the database location with the `AUDIT_DATA_DIR` environment variable.
- If you host on a platform with temporary disk storage, the database file may reset between deploys or restarts.
- On Render, true persistent SQLite storage usually requires a persistent disk, which is not typically part of the free path.
- If you later want easier cloud persistence or scaling, Postgres is the better upgrade.

## Email behavior

- The app currently opens prefilled email drafts using `mailto:`.
- That works well for release testing and manager-driven sending.
- Fully automatic email sending would require SMTP or an email API backend.
