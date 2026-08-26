const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Permite conexões de qualquer origem (útil para testes mobile)
});

io.on('connection', (socket) => {
  console.log(`Um player se conectou: ${socket.id}`);

  // O app mobile vai se "identificar" assim que conectar enviando o ID dele
  socket.on('registrar_usuario', (userId) => {
    socket.join(`user_${userId}`); // Cria uma "sala" exclusiva para esse usuário
    console.log(`Usuário ${userId} vinculado ao socket.`);
  });

  socket.on('disconnect', () => {
    console.log(`Player desconectado: ${socket.id}`);
  });
});

server.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
