# CampusCare — Campus Issue & Complaint Management System

A beginner-friendly full-stack project where students can submit campus complaints and track their status. Admins can view all complaints and update their status.

## Features
- Student registration and login
- Password hashing with bcrypt
- JWT-based authentication
- Submit and view complaints
- Students can see only their own complaints
- Admin dashboard with complaint counts
- Admin can update complaint status
- Status filtering
- MySQL database and REST APIs

## Requirements
- Node.js (LTS recommended)
- MySQL Server and MySQL Workbench (or MySQL CLI)
- VS Code

## Run locally on Windows

### 1. Create the database
1. Open MySQL Workbench.
2. Open `database.sql`.
3. Execute the script.

### 2. Configure environment
1. In the project root, copy `.env.example` and rename the copy to `.env`.
2. Set `DB_PASSWORD` to your MySQL password.
3. Change `JWT_SECRET` to a long random value.

Example:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=campus_complaints
JWT_SECRET=use_a_long_random_secret_here
```

### 3. Install packages
Open a terminal in the project folder:
```bash
npm install
```

### 4. Start the server
```bash
npm run dev
```
Or:
```bash
npm start
```

Open `http://localhost:3000`.

## Create an admin account
1. Register through the website using an email such as `admin@college.edu`.
2. In MySQL Workbench, run:
```sql
USE campus_complaints;
UPDATE users SET role = 'admin' WHERE email = 'admin@college.edu';
```
3. Log out and log in again. The new JWT will contain the admin role.

Do not expose admin role changes in a public registration form.

## API overview

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register student |
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/me` | Logged in | Current session |
| POST | `/api/complaints` | Logged in | Submit complaint |
| GET | `/api/complaints` | Logged in | List own complaints; admins see all |
| PATCH | `/api/complaints/:id/status` | Admin | Update complaint status |
| GET | `/api/admin/stats` | Admin | Dashboard statistics |
| GET | `/api/health` | Public | Check server |

For protected endpoints, send:
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

## Notes
- This is an educational starter project, not a production-ready deployment.
- For a real deployment, use HTTPS, stronger session/token storage, rate limiting, input-size limits, secure admin provisioning, and proper operational logging.
- The app uses `localStorage` for a simple local demo. For production, prefer secure, HttpOnly cookies and a more robust session design.
