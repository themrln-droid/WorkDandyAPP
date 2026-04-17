# Audit Organizer

A lightweight web app for warehouse audit planning.

## What it does

- Saves separate manager profiles.
- Stores each manager's employee roster and work emails.
- Lets the manager choose which employees are present for the shift.
- Splits 48 shelves as evenly as possible across the selected employees.
- Opens prefilled email drafts for each employee in the default mail app.

## How to test locally

1. Open [index.html](C:/Users/Marlo/OneDrive/Desktop/WebAPP/index.html) in a browser.
2. Use the sample manager and employees, or replace them with your own.
3. Select the employees present for the shift.
4. Click `Assign 48 Shelves`.
5. Review the assignment summary and use `Open Email Draft` or `Open All Email Drafts`.

## Notes

- Data is stored in the browser with `localStorage`, so each browser keeps its own saved lists.
- The email flow uses `mailto:` for testing, which opens the installed email client with the message already filled in.
- Sending real emails automatically from the app would require a mail service or SMTP backend with credentials.
