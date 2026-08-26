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

// BANCO DE DADOS EM MEMÓRIA DO SERVIDOR (Guarda os pontos 24h por dia)
const baseDeDadosPontos = {};

// Mapeamento de conexões ativas: userId -> socketId
const usuariosConectados = {};

io.on('connection', (socket) => {
    console.log(`🔌 Nova conexão Socket: ${socket.id}`);

    // Registro do usuário online
    socket.on('registrar_usuario', (userId) => {
        if (userId) {
            usuariosConectados[userId] = socket.id;
            socket.join(userId);
            
            // Inicializa os pontos do usuário se não existirem
            if (baseDeDadosPontos[userId] === undefined) {
                baseDeDadosPontos[userId] = 0;
            }

            console.log(`✅ Usuário registrado: ${userId} | Pontos no servidor: ${baseDeDadosPontos[userId]}`);
        }
    });

    // Limpeza ao desconectar
    socket.on('disconnect', () => {
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

// Rota para o app buscar os pontos e verificar o status assim que o player faz login
app.get('/api/verificar-usuario', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ existe: false });

    if (baseDeDadosPontos[userId] === undefined) {
        baseDeDadosPontos[userId] = 0;
    }

    return res.json({
        existe: true,
        pontos: baseDeDadosPontos[userId]
    });
});

// Rota central: Gerencia Punições, Bans e Distribuição de Pontos
app.post('/api/punir', (req, res) => {
    const { userId, tipoPunicao, quantidade, titulo, mensagem } = req.body;

    console.log(`⚡ Ação: ${tipoPunicao} | Alvo: ${userId} | Qtd: ${quantidade || 0}`);

    // LÓGICA DE PONTOS
    if (tipoPunicao === "ADICIONAR_PONTOS") {
        const qtdAdicionar = parseInt(quantidade || 0);

        if (userId === "TODOS") {
            // Soma pontos para TODOS os usuários registrados no servidor (online e offline)
            for (let idUser in baseDeDadosPontos) {
                baseDeDadosPontos[idUser] += qtdAdicionar;
            }
            io.emit("receber_punicao", { tipo: tipoPunicao, quantidade: qtdAdicionar, titulo, msg: mensagem });
            console.log(`🎁 +${qtdAdicionar} pontos somados globalmente para TODOS.`);
        } else {
            // Soma pontos para um usuário específico (mesmo offline)
            if (baseDeDadosPontos[userId] === undefined) {
                baseDeDadosPontos[userId] = 0;
            }
            baseDeDadosPontos[userId] += qtdAdicionar;

            // Se estiver online, envia o sinal na hora via Socket
            const socketIdAlvo = usuariosConectados[userId];
            if (socketIdAlvo) {
                io.to(socketIdAlvo).emit("receber_punicao", { tipo: tipoPunicao, quantidade: qtdAdicionar, titulo, msg: mensagem });
                console.log(`🎁 +${qtdAdicionar} pontos entregues online para ${userId}. Total: ${baseDeDadosPontos[userId]}`);
            } else {
                console.log(`💤 Usuário ${userId} está offline, mas os pontos foram salvos (${baseDeDadosPontos[userId]} pts).`);
            }
        }
        return res.json({ sucesso: true });
    } 

    // LÓGICA DE BANIMENTO / REMOÇÃO DE CONTA (Inviolável e funcionando)
    if (userId === "TODOS") {
        io.emit("receber_punicao", { tipo: tipoPunicao, titulo, msg: mensagem });
        console.log(`🚨 Comando de banimento global enviado para TODOS.`);
    } else {
        const socketIdAlvo = usuariosConectados[userId];
        if (socketIdAlvo) {
            io.to(socketIdAlvo).emit("receber_punicao", { tipo: tipoPunicao, titulo, msg: mensagem });
            console.log(`🚨 Comando de remoção enviado exatamente para o usuário: ${userId}`);
        } else {
            console.log(`⚠️ Tentou banir ${userId}, mas ele não está conectado no momento.`);
        }
    }

    return res.json({ sucesso: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
