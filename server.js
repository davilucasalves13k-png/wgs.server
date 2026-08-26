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

// Mapeamento de usuários conectados: { userId: socketId }
const usuariosConectados = {};

io.on('connection', (socket) => {
    console.log(`🔌 Novo usuário conectado: ${socket.id}`);

    // Registro do usuário na sala/socket dele
    socket.on('registrar_usuario', (userId) => {
        if (userId) {
            usuariosConectados[userId] = socket.id;
            socket.join(userId); // Sala exclusiva do usuário
            console.log(`✅ Usuário registrado: ${userId} (Socket ID: ${socket.id})`);
        }
    });

    socket.on('disconnect', () => {
        // Remove da lista ao desconectar
        for (let [userId, socketId] of Object.entries(usuariosConectados)) {
            if (socketId === socket.id) {
                delete usuariosConectados[userId];
                console.log(`❌ Usuário desconectado: ${userId}`);
                break;
            }
        }
    });
});

// ================= ROTAS DA API ================= //

// Rota para verificar se o usuário ainda existe (evita login de banidos offline)
app.get('/api/verificar-usuario', (req, res) => {
    const { userId } = req.query;
    // Aqui você pode colocar sua lógica real checando a planilha, 
    // por padrão simulamos que se passou o ID, ele existe (a menos que você remova)
    if (!userId) return res.json({ existe: false });
    
    // Retorna true (se quiser integrar com a planilha no futuro, ajusta aqui)
    return res.json({ existe: true });
});

// Rota central de Punições, Avisos e Distribuição de Pontos
app.post('/api/punir', (req, res) => {
    const { userId, tipoPunicao, quantidade, titulo, mensagem } = req.body;

    console.log(`⚡ Comando recebido -> Tipo: ${tipoPunicao} | Alvo: ${userId} | Qtd: ${quantidade || 0}`);

    if (tipoPunicao === "ADICIONAR_PONTOS") {
        if (userId === "TODOS") {
            // Envia os pontos para TODOS os clientes conectados
            io.emit("receber_punicao", { 
                tipo: tipoPunicao, 
                quantidade: quantidade, 
                titulo: titulo, 
                msg: mensagem 
            });
            console.log(`🎁 Pontos globais enviados para TODOS: +${quantidade}`);
        } else {
            // Envia para um usuário específico pelo ID
            const socketIdAlvo = usuariosConectados[userId];
            if (socketIdAlvo) {
                io.to(socketIdAlvo).emit("receber_punicao", { 
                    tipo: tipoPunicao, 
                    quantidade: quantidade, 
                    titulo: titulo, 
                    msg: mensagem 
                });
                console.log(`🎁 Pontos enviados para o usuário ${userId}: +${quantidade}`);
            } else {
                console.log(`⚠️ Tentou dar pontos para ${userId}, mas ele está offline/não conectado.`);
            }
        }
        return res.json({ sucesso: true, mensagem: "Pontos processados com sucesso!" });
    } 
    
    // Demais ações (Remoção de conta, suspensão, etc) que já funcionavam perfeitamente
    if (userId === "TODOS") {
        io.emit("receber_punicao", { tipo: tipoPunicao, titulo, msg: mensagem });
    } else {
        const socketIdAlvo = usuariosConectados[userId];
        if (socketIdAlvo) {
            io.to(socketIdAlvo).emit("receber_punicao", { tipo: tipoPunicao, titulo, msg: mensagem });
        }
    }

    return res.json({ sucesso: true, mensagem: "Comando executado com sucesso!" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
