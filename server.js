// server.js
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(bodyParser.json());
// Servir archivos estáticos (index.html, login.html, tools.html) desde la raíz del proyecto
app.use(express.static(path.join(__dirname, '/')));

// Cargar usuarios desde users.json
const usersPath = path.join(__dirname, 'users.json');
let users = [];
try {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
} catch (err) {
    console.error('No se pudo leer users.json. Crea users.json en la raíz.', err);
    users = [];
}

// Endpoint de login
// Recibe { username, password } (tu login.html manda username y password)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales.' });
    }

    // buscamos por email (acepta que el usuario ingrese el correo)
    const user = users.find(u => u.email.toLowerCase() === String(username).toLowerCase());

    if (!user) {
        // Para no filtrar si el email existe, enviar mensaje genérico
        return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
    }

    const match = bcrypt.compareSync(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
    }

    // Autenticado
    // Nota: aquí devolvemos success=true. Para producción deberías emitir sesión o JWT.
    return res.json({ success: true, message: 'Autenticado correctamente.' });
});

// Fallback: si piden rutas no encontradas, servir index (opcional)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
