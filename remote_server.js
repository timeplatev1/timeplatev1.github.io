// server.js — Socket.IO signaling server for Remote-plate
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// allow all origins or restrict to your domain(s)
const io = new Server(server, {
    cors: {
        origin: '*', // en producción pon tu dominio: 'https://tuusuario.github.io'
        methods: ['GET', 'POST']
    }
});

io.on('connection', socket => {
    console.log('socket connected', socket.id);

    // join a room (pair code) with a role: 'host' or 'client'
    socket.on('join', ({ code, role }) => {
        if (!code) return;
        socket.join(code);
        socket.data.role = role || 'client';
        socket.data.code = code;
        console.log(`${socket.id} joined ${code} as ${role}`);
        // notify others in room
        socket.to(code).emit('peer-joined', { id: socket.id, role });
    });

    // client sends selection -> forward to room (host)
    socket.on('select', ({ code, key }) => {
        if (!code) return;
        // broadcast to everyone in room except sender
        socket.to(code).emit('select', { key, from: socket.id });
    });

    // optional: host can remove session
    socket.on('end-session', ({ code }) => {
        if (!code) return;
        io.in(code).emit('session-ended', { code });
        // disconnect everyone in that room server-side could be forced but keep simple
    });

    socket.on('disconnect', () => {
        console.log('socket disconnected', socket.id);
        const code = socket.data.code;
        if (code) socket.to(code).emit('peer-left', { id: socket.id, role: socket.data.role });
    });
});

// optional static page for healthcheck
app.get('/', (req, res) => res.send('Remote-plate signaling server running'));

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('Server listening on', port));
