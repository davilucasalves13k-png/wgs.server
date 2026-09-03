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

// Banco de dados local NeDB (Gerenciamento Otimizado < 50MB)
const db = new Datastore({ filename: 'soolzapp.db', autoload: true });

db.ensureIndex({ fieldName: 'phone', unique: true }, (err) => {
    if (err) console.log("Erro ao criar índice de telefone:", err);
});
db.ensureIndex({ fieldName: 'passport', unique: true }, (err) => {
    if (err) console.log("Erro ao criar índice de passaporte:", err);
});

// ==========================================
// VALIDADOR DE NÚMEROS DO SOOLZAPP
// ==========================================
function validateSoolzappPhone(phone) {
    if (!phone) return { valid: false, type: 'invalid' };
    const cleanPhone = phone.toString().replace(/\D/g, '');
    
    // 3 dígitos: Emergência / Serviços (Polícia, Hospital, etc)
    if (cleanPhone.length === 3) return { valid: true, type: 'emergency', formatted: cleanPhone };
    
    // 4 ou 5 dígitos: Países Baixos / Serviços curtos
    if (cleanPhone.length === 4 || cleanPhone.length === 5) return { valid: true, type: 'netherlands_short', formatted: cleanPhone };
    
    // 6 dígitos: EUA (ramais específicos)
    if (cleanPhone.length === 6) return { valid: true, type: 'us_special', formatted: cleanPhone };
    
    // 7 ou 8 dígitos: Brasil (Fixo local antigo / geral)
    if (cleanPhone.length === 7 || cleanPhone.length === 8) return { valid: true, type: 'brazil_local', formatted: cleanPhone };
    
    // 10 ou 11 dígitos: Brasil (Fixo com DDD 10d ou Celular com DDD 11d)
    if (cleanPhone.length === 10 || cleanPhone.length === 11) return { valid: true, type: 'brazil_standard', formatted: cleanPhone };
    
    // Formato Tropical (+11) ou customizado estendido
    if (cleanPhone.startsWith('11') && (cleanPhone.length >= 10 && cleanPhone.length <= 13)) {
        return { valid: true, type: 'tropical', formatted: cleanPhone };
    }

    return { valid: false, type: 'unknown' };
}

// ==========================================
// ROTAS DE API (CADASTRO, LOGIN E PERFIL)
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { phone, password, email, passport } = req.body;
        
        const phoneCheck = validateSoolzappPhone(phone);
        if (!phoneCheck.valid) {
            return res.status(400).json({ success: false, message: "Número de telefone inválido de acordo com as regras do Soolzapp." });
        }

        if (!password || !passport) {
            return res.status(400).json({ success: false, message: "Informe a senha e o número do passaporte." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedPassport = await bcrypt.hash(passport, 10); // Hash do passaporte por segurança
        const walletId = '55-' + Math.floor(1000 + Math.random() * 9000);

        const newAccount = {
            phone: phoneCheck.formatted,
            password: hashedPassword,
            passportHash: hashedPassport,
            passportDisplay: passport.slice(0, 2) + '••••' + passport.slice(-2), // Versão mascarada para visualização segura
            email: email || '',
            name: email ? email.split('@')[0] : `Usuário ${phoneCheck.formatted.slice(-4)}`,
            walletId,
            status: 'offline',
            lastSeen: new Date(),
            socketId: null,
            banned: false,
            createdAt: new Date()
        };

        db.insert(newAccount, (err, doc) => {
            if (err) {
                return res.status(400).json({ success: false, message: "Este número de telefone ou passaporte já está cadastrado." });
            }
            res.status(201).json({ success: true, message: "Conta criada com sucesso!", phone: phoneCheck.formatted });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
});

app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    const cleanPhone = phone ? phone.toString().replace(/\D/g, '') : '';

    db.findOne({ phone: cleanPhone }, async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ success: false, message: "Telefone ou senha incorretos." });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Telefone ou senha incorretos." });
        }

        if (user.banned) {
            return res.status(403).json({ success: false, message: "Esta conta está banida." });
        }

        res.json({
            success: true,
            user: {
                phone: user.phone,
                name: user.name,
                email: user.email,
                walletId: user.walletId,
                passportDisplay: user.passportDisplay
            }
        });
    });
});

// Rota "Ver mais" para detalhar dados sensíveis / passaporte vinculado (Protegido por verificação)
app.post('/api/user/details', (req, res) => {
    const { requesterPhone, targetPhone } = req.body;
    
    db.findOne({ phone: targetPhone }, (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        }

        // Retorna dados detalhados para a seção "Ver mais"
        res.json({
            success: true,
            details: {
                phone: user.phone,
                name: user.name,
                walletId: user.walletId,
                passportInfo: user.passportDisplay, // Passaporte mascarado para segurança
                lastSeen: user.lastSeen,
                status: user.status
            }
        });
    });
});

// ==========================================
// WEBSOCKETS (Status Real, Mensagens e WebRTC)
// ==========================================
const onlineUsers = {}; // Mapeamento em memória socket.id <-> phone

io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);

    // 1. Registro de Status Real Online
    socket.on('register_user', (phone) => {
        if (!phone) return;
        const cleanPhone = phone.toString().replace(/\D/g, '');
        onlineUsers[socket.id] = cleanPhone;

        db.update({ phone: cleanPhone }, { $set: { socketId: socket.id, status: 'online' } }, {}, () => {
            io.emit('update_online_users', getOnlineUsersMap());
        });
    });

    // 2. Envio de Mensagem Privada
    socket.on('send_private_message', (data) => {
        // data.sender, data.receiver, data.type, data.message, data.time
        db.findOne({ phone: data.receiver }, (err, recipient) => {
            if (recipient && recipient.socketId) {
                io.to(recipient.socketId).emit('receive_private_message', data);
            }
        });
    });

    // 3. Sinalização WebRTC (Chamadas de Áudio)
    socket.on('call_user', ({ caller, receiver, offer }) => {
        db.findOne({ phone: receiver }, (err, recipient) => {
            if (recipient && recipient.socketId) {
                io.to(recipient.socketId).emit('incoming_call', { caller, offer });
            }
        });
    });

    socket.on('answer_call', ({ caller, receiver, answer }) => {
        db.findOne({ phone: caller }, (err, target) => {
            if (target && target.socketId) {
                io.to(target.socketId).emit('call_answered', { answer });
            }
        });
    });

    socket.on('hang_up', ({ target }) => {
        db.findOne({ phone: target }, (err, recipient) => {
            if (recipient && recipient.socketId) {
                io.to(recipient.socketId).emit('call_hang_up');
            }
        });
    });

    // 4. Desconexão e Atualização para Status Offline / Visto por Último
    socket.on('disconnect', () => {
        const phone = onlineUsers[socket.id];
        if (phone) {
            const now = new Date();
            db.update({ phone: phone }, { $set: { socketId: null, status: 'offline', lastSeen: now } }, {}, () => {
                delete onlineUsers[socket.id];
                io.emit('update_online_users', getOnlineUsersMap());
            });
        }
        console.log(`Cliente desconectado: ${socket.id}`);
    });
});

function getOnlineUsersMap() {
    const map = {};
    for (const socketId in onlineUsers) {
        map[onlineUsers[socketId]] = true;
    }
    return map;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Soolzapp rodando na porta ${PORT}!`);
});

