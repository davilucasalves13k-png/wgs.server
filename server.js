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

// ==========================================
// NOVAS ROTAS ADICIONADAS PARA LOGIN E BANIMENTO OFFLINE
// ==========================================

// URL do seu Web App do Google Apps Script (substitua pela sua URL real)
const URL_GOOGLE_SCRIPT = "COLE_AQUI_A_URL_DO_SEU_WEB_APP_DO_APPS_SCRIPT";

app.post('/api/login', async (req, res) => {
  const { userId, senha } = req.body;

  if (!userId || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
  }

  try {
    // Faz a requisição para a sua planilha via Google Apps Script
    const respostaGoogle = await fetch(`${URL_GOOGLE_SCRIPT}?acao=login&user=${encodeURIComponent(userId)}&senha=${encodeURIComponent(senha)}`);
    const dados = await respostaGoogle.json();

    if (!dados.sucesso) {
      return res.json({ sucesso: false, mensagem: dados.mensagem || "Usuário ou senha incorretos." });
    }

    // Se o Apps Script retornou que o usuário está banido
    if (dados.banido) {
      return res.json({ 
        banido: true, 
        motivo: dados.motivo || "Sua conta foi banida." 
      });
    }

    // Login bem-sucedido
    return res.json({ 
      sucesso: true, 
      pontosPendentes: dados.pontos || 0 
    });

  } catch (erro) {
    console.error("Erro ao validar login na planilha:", erro);
    return res.status(500).json({ sucesso: false, mensagem: "Erro ao conectar com o banco de dados." });
  }
});

app.get('/api/verificar-status/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const respostaGoogle = await fetch(`${URL_GOOGLE_SCRIPT}?acao=verificar&user=${encodeURIComponent(userId)}`);
    const dados = await respostaGoogle.json();

    if (dados.banido) {
      return res.json({ banido: true, motivo: dados.motivo });
    }

    return res.json({ banido: false });
  } catch (erro) {
    return res.status(500).json({ banido: false });
  }
});

// ==========================================
// ROTA DE PUNIÇÃO EM TEMPO REAL (JÁ EXISTIA)
// ==========================================
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
