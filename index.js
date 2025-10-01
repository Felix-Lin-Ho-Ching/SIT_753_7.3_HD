const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));
app.use(session({
    secret: 'mySecret123',
    resave: false,
    saveUninitialized: true
}));

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)`);

function renderPageWithWelcome(filePath, username, res, role = 'user') {
    let html = fs.readFileSync(filePath, 'utf-8');

    let navHTML = '';
    if (username) {
        navHTML += `<li class="nav-item"><span class="nav-link text-success">Welcome, ${username}</span></li>`;
        if (role === 'admin') {
            navHTML += `<li class="nav-item"><a class="nav-link text-warning" href="/feedback-summary">Feedback Summary</a></li>`;
        }
        navHTML += `<li class="nav-item"><a class="nav-link text-danger" href="/logout">Logout</a></li>`;
    } else {
        navHTML += `
      <li class="nav-item"><a class="nav-link text-primary" href="/login">Login</a></li>
      <li class="nav-item"><a class="nav-link text-secondary" href="/register">Register</a></li>
    `;
    }

    html = html.replace('<!--WELCOME_PLACEHOLDER-->', navHTML);
    res.send(html);
}


app.get('/', (req, res) => {
    renderPageWithWelcome(path.join(__dirname, 'home.html'), req.session.username, res, req.session.role);
});


app.get('/feedback', (req, res) => {
    renderPageWithWelcome(path.join(__dirname, 'feedback.html'), req.session.username, res, req.session.role);
});

app.get('/products', (req, res) => {
    renderPageWithWelcome(path.join(__dirname, 'products.html'), req.session.username, res, req.session.role);
});

app.get('/register', (req, res) => {
    renderPageWithWelcome(path.join(__dirname, 'register.html'), req.session.username, res, req.session.role);
});

app.get('/login', (req, res) => {
    renderPageWithWelcome(path.join(__dirname, 'login.html'), req.session.username, res);
});

app.get('/feedback-summary', (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).send('Access denied');
    }

    db.all(`SELECT * FROM feedback`, [], (err, rows) => {
        if (err) {
            console.error("DB error:", err.message);
            return res.send('Error retrieving feedback');
        }

        let html = `
        <html><head>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <title>Feedback Summary</title>
        </head><body class="container mt-5">
        <h2>Feedback Summary</h2>`;

        if (rows.length === 0) {
            html += `<p>No feedback submitted yet.</p>`;
        } else {
            html += `<table class="table table-bordered">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Query</th></tr></thead><tbody>`;
            rows.forEach(row => {
                html += `<tr>
                  <td>${row.name}</td>
                  <td>${row.email}</td>
                  <td>${row.phone}</td>
                  <td>${row.query}</td>
                </tr>`;
            });
            html += `</tbody></table>`;
        }

        html += `<a href="/" class="btn btn-secondary">Back to Home</a></body></html>`;
        res.send(html);
    });
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, SALT_ROUNDS, (err, hashedPassword) => {
        if (err) return res.send('Error hashing password.');

        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
            if (err) {
                return res.send('<p style="color:red;">Username taken or error occurred.</p><a href="/register">Try Again</a>');
            }
            res.send('<p>Registration successful!</p><a href="/login">Go to Login</a>');
        });
    });
});


app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) return res.send('Database error.');
        if (!row) return res.send('<p>User not found.</p><a href="/login">Try Again</a>');


        bcrypt.compare(password, row.password, (err, result) => {
            if (err) return res.send('Error comparing passwords.');
            if (result) {
                req.session.username = row.username;
                req.session.role = row.role;
                res.redirect('/');
            } else {
                res.send('<p style="color:red;">Invalid credentials.</p><a href="/login">Try Again</a>');
            }
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});
app.post('/feedback', (req, res) => {
    const { name, email, phone, query } = req.body;

    if (!name || !email || !phone || !query) {
        return res.send('<p style="color:red;">All fields are required.</p><a href="/feedback">Go back</a>');
    }

    db.run(
        `INSERT INTO feedback (name, email, phone, query) VALUES (?, ?, ?, ?)`,
        [name, email, phone, query],
        (err) => {
            if (err) {
                console.error('Error inserting feedback:', err.message);
                return res.send('An error occurred while saving your feedback.');
            }
            res.send('<p>Thank you for your feedback!</p><a href="/">Return Home</a>');
        }
    );
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));


module.exports = app;
if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server running on :${port}`));
}
