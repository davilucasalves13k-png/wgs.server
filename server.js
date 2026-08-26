const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Banco de dados em memória simples para testes (ou substitua por um banco real depois)
const usuariosConectados = {};

io.on('connection', (socket) => {
  console.log('Player conectado:', socket.id);

  // Cadastro / Identificação do player ao abrir o app
  socket.on('registrar_usuario', (userId) => {
    usuariosConectados[userId] = socket.id;
    socket.join(`user_${userId}`);
    console.log(`Usuário ${userId} registrado na sala user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Player desconectado:', socket.id);
  });
});

// Rota para o Dono aplicar a punição (chamada pelo painel ou API)
app.post('/api/punir', (req, res) => {
  const { userId, tipoPunicao, mensagem } = req.body;

  // Dispara instantaneamente via Socket.io para quem está online
  io.to(`user_${userId}`).emit('receber_punicao', {
    tipo: tipoPunicao, // 'BAN_GLOBAL', 'SUSPENSAO_SERVIDOR', 'SUSPENSAO_TEMPORADA'
    msg: mensagem
  });

  return res.json({ sucesso: true, mensagem: "Punição enviada em tempo real!" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
