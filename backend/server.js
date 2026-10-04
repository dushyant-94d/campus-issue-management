require("dotenv").config({
    path: require("path").join(__dirname, ".env")
});
const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});


console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("Password loaded:", Boolean(process.env.DB_PASSWORD));

const pool = mysql.createPool({
host: process.env.DB_HOST || "localhost",
user: process.env.DB_USER || "root",
password: process.env.DB_PASSWORD || "",
database: process.env.DB_NAME || "campus_complaints",
waitForConnections: true,
connectionLimit: 10
});


const JWT_SECRET = process.env.JWT_SECRET || "development_only_change_me";

function createToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Please log in first." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session. Please log in again." });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

const allowedCategories = ["Wi-Fi", "Electricity", "Classroom", "Cleanliness", "Water", "Other"];
const allowedStatuses = ["Pending", "In Progress", "Resolved"];

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ message: "Email is already registered." });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name.trim(), normalizedEmail, hash]
    );
    const user = { id: result.insertId, name: name.trim(), email: normalizedEmail, role: "student" };
    res.status(201).json({ message: "Account created successfully.", token: createToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
    const [rows] = await pool.execute(
      "SELECT id, name, email, password, role FROM users WHERE email = ?",
      [email.trim().toLowerCase()]
    );
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password))) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }
    const { password: ignored, ...user } = rows[0];
    res.json({ message: "Login successful.", token: createToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not log in." });
  }
});

app.get("/api/me", authenticate, async (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/complaints", authenticate, async (req, res) => {
  try {
    const { title, description, category } = req.body;
    if (!title?.trim() || !description?.trim() || !category) {
      return res.status(400).json({ message: "Title, description and category are required." });
    }
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ message: "Invalid complaint category." });
    }
    const [result] = await pool.execute(
      "INSERT INTO complaints (user_id, title, description, category) VALUES (?, ?, ?, ?)",
      [req.user.id, title.trim(), description.trim(), category]
    );
    res.status(201).json({ message: "Complaint submitted.", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not submit complaint." });
  }
});

app.get("/api/complaints", authenticate, async (req, res) => {
  try {
    let sql = `
      SELECT c.id, c.title, c.description, c.category, c.status,
             c.created_at, c.updated_at, u.name AS student_name, u.email AS student_email
      FROM complaints c JOIN users u ON c.user_id = u.id`;
    const params = [];
    if (req.user.role !== "admin") {
      sql += " WHERE c.user_id = ?";
      params.push(req.user.id);
    }
    sql += " ORDER BY c.created_at DESC";
    const [rows] = await pool.execute(sql, params);
    res.json({ complaints: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not fetch complaints." });
  }
});

app.patch("/api/complaints/:id/status", authenticate, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid complaint ID." });
    if (!allowedStatuses.includes(status)) return res.status(400).json({ message: "Invalid status." });

    const [result] = await pool.execute("UPDATE complaints SET status = ? WHERE id = ?", [status, id]);
    if (!result.affectedRows) return res.status(404).json({ message: "Complaint not found." });
    res.json({ message: "Complaint status updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update complaint." });
  }
});

app.get("/api/admin/stats", authenticate, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT COUNT(*) AS total,
        SUM(status = 'Pending') AS pending,
        SUM(status = 'In Progress') AS in_progress,
        SUM(status = 'Resolved') AS resolved
      FROM complaints`);
    res.json({ stats: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load dashboard stats." });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", message: "Server is running." }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Campus Complaint System running at http://localhost:${port}`));
