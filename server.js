const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('nedb');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Banco de dados local NeDB
const db = new Datastore({ filename: 'players.db', autoload: true });

db.ensureIndex({ fieldName: 'username', unique: true }, (err) => {
    if (err) console.log("Erro ao criar índice de usuário:", err);
});
db.ensureIndex({ fieldName: 'uid', unique: true }, (err) => {
    if (err) console.log("Erro ao criar índice de UID:", err);
});

// Rota de Cadastro
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Preencha usuário e senha." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const uniqueUid = 'WGS-' + Math.floor(100000 + Math.random() * 900000);

        const newPlayer = {
            uid: uniqueUid,
            username,
            password: hashedPassword,
            points: 0,
            seasonLevel: 1,
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + username,
            title: "Iniciante",
            verified: false,
            banned: false,
            socketId: null,
            createdAt: new Date()
        };

        db.insert(newPlayer, (err, doc) => {
            if (err) {
                return res.status(400).json({ success: false, message: "Nome de usuário já existe." });
            }
            res.status(201).json({ success: true, message: "Conta criada com sucesso!", uid: uniqueUid });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
});

// Rota de Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.findOne({ username }, async (err, player) => {
        if (err || !player) {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

        const match = await bcrypt.compare(password, player.password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

        if (player.banned) {
            return res.status(403).json({ success: false, message: "Esta conta está banida." });
        }

        res.json({
            success: true,
            player: {
                uid: player.uid,
                username: player.username,
                points: player.points,
                seasonLevel: player.seasonLevel,
                avatar: player.avatar,
                title: player.title,
                verified: player.verified
            }
        });
    });
});

// ==========================================
// WEBSOCKETS (Tempo Real, Ban e Pontos)
// ==========================================
io.on('connection', (socket) => {
    console.log(`Conectado: ${socket.id}`);

    // Jogador avisa que logou no socket
    socket.on('user_login', (uid) => {
        db.update({ uid: uid }, { $set: { socketId: socket.id } }, {}, () => {
            console.log(`Jogador ${uid} vinculado ao Socket ${socket.id}`);
        });
    });

    // 1. Lógica de Banimento Instantâneo (Admin aciona)
    socket.on('admin_ban_player', (data) => {
        // data.adminUid, data.targetUid, data.reason
        db.update({ uid: data.targetUid }, { $set: { banned: true } }, {}, (err, numReplaced) => {
            if (!err && numReplaced > 0) {
                db.findOne({ uid: data.targetUid }, (err, target) => {
                    if (target && target.socketId) {
                        // Desliga e avisa o jogador banido na hora
                        io.to(target.socketId).emit('voce_foi_banido', { motivo: data.reason || "Violação de regras" });
                    }
                });
            }
        });
    });

    // 2. Lógica de Pontos Online / Offline
    socket.on('add_points', (data) => {
        // data.uid, data.amount
        db.findOne({ uid: data.uid }, (err, player) => {
            if (!player || player.banned) return;

            const newPoints = player.points + data.amount;
            db.update({ uid: data.uid }, { $set: { points: newPoints } }, {}, () => {
                // Devolve os pontos atualizados para o cliente
                socket.emit('points_updated', { points: newPoints });
            });
        });
    });

    // Atualização de Perfil ao Vivo
    socket.on('update_profile_live', (data) => {
        db.update({ uid: data.uid }, { $set: { avatar: data.avatar, title: data.title } }, {}, (err) => {
            if (!err) {
                io.emit('player_profile_updated', data);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`Desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor unificado rodando na porta ${PORT}!`);
});
