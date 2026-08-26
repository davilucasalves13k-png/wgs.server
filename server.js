const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const usuariosConectados = {};

io.on('connection', (socket) => {
  console.log('⚡ Um player se conectou. Socket ID:', socket.id);

  socket.on('registrar_usuario', (userId) => {
    usuariosConectados[userId] = socket.id;
    socket.join(`user_${userId}`);
    console.log(`👤 Usuário registrado na sala: user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Player desconectado:', socket.id);
  });
});

app.post('/api/punir', (req, res) => {
  const { userId, tipoPunicao, titulo, mensagem } = req.body;

  if (!userId || !tipoPunicao) {
    return res.status(400).json({ sucesso: false, erro: 'userId e tipoPunicao são obrigatórios!' });
  }

  io.to(`user_${userId}`).emit('receber_punicao', {
    tipo: tipoPunicao,
    titulo: titulo || 'Aviso do Administrador',
    msg: mensagem || 'Você recebeu uma atualização de status.'
  });

  console.log(`🚨 Punição [${tipoPunicao}] enviada para o usuário: ${userId}`);
  return res.json({ sucesso: true, mensagem: 'Aviso disparado em tempo real!' });
});

app.get('/', (req, res) => {
  res.send('Servidor WGS Hardcore Socket.io Rodando Perfeitamente!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
