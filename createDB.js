const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./users.db');

const SALT_ROUNDS = 10;
const adminUsername = 'admin';
const adminPassword = 'admin123';

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user'
);`, (err) => {
  if (err) {
    console.error("Error creating users table:", err.message);
  } else {
    console.log("Table 'users' created or already exists.");
  }
});

db.run(`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  query TEXT NOT NULL
);`, (err) => {
  if (err) {
    console.error("Error creating feedback table:", err.message);
  } else {
    console.log("Table 'feedback' created or already exists.");
  }
});


bcrypt.hash(adminPassword, SALT_ROUNDS, (err, hashedPassword) => {
  if (err) {
    console.error("Error hashing password:", err.message);
    db.close();
    return;
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [adminUsername], (err, row) => {
    if (err) {
      console.error("Error checking admin user:", err.message);
    } else if (!row) {
      db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
        [adminUsername, hashedPassword, 'admin'],
        (err) => {
          if (err) {
            console.error("Error inserting admin user:", err.message);
          } else {
            console.log("Admin user created successfully.");
          }
        });
    } else {
      console.log("Admin user already exists.");
    }

    db.close();
  });
});
